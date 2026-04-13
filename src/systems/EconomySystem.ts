import { UPGRADES } from '../config/upgrades'
import { BALANCE } from '../config/balance'
import { EventBus } from './EventBus'
import type { Player } from '../entities/Player'
import type { UpgradeDef } from '../types'

/**
 * EconomySystem — central source of truth for money and purchased upgrades.
 *
 * Listens to `money:collected` from CashRegister, exposes `tryPurchase()` used by
 * the upgrade menu, and mutates the Player directly when a 'player'-target
 * upgrade is applied. Emits `economy:changed` whenever the balance changes,
 * so UI / menu can redraw.
 *
 * It is a module-level singleton (like EventBus) so UI scenes can import it
 * without the cross-scene plumbing required by Phaser's registry.
 *
 * Game scene must call init(player) once on scene create, and reset() when
 * restarting the scene.
 */
class EconomySystemClass {
  private _balance = 0
  private _purchased = new Set<string>()
  private _unlockedZones = new Set<string>()
  private _unlockedSlots = new Set<string>()
  private _player: Player | null = null
  private _listenerAttached = false

  get balance(): number { return this._balance }
  get purchased(): ReadonlySet<string> { return this._purchased }
  get unlockedZones(): ReadonlySet<string> { return this._unlockedZones }
  get unlockedSlots(): ReadonlySet<string> { return this._unlockedSlots }

  isZoneUnlocked(zoneId: string): boolean { return this._unlockedZones.has(zoneId) }
  isSlotUnlocked(slotId: string): boolean { return this._unlockedSlots.has(slotId) }

  /**
   * Attempt to purchase an in-world entity slot (extra palm, extra press, …).
   * Returns true on success. Fires `slot:purchased` so the Game scene can
   * materialize the real entity in place of the PurchaseSlot marker.
   */
  tryPurchaseSlot(slotId: string, cost: number): boolean {
    if (this._unlockedSlots.has(slotId)) return false
    if (this._balance < cost) return false

    this._balance -= cost
    this._unlockedSlots.add(slotId)

    EventBus.emit('slot:purchased',  { slotId })
    EventBus.emit('economy:changed', { balance: this._balance })
    return true
  }

  /** Restore a slot unlock without paying — used during save restore. */
  forceUnlockSlot(slotId: string): void {
    this._unlockedSlots.add(slotId)
  }

  /**
   * Attempt to unlock a zone for `cost`. Returns true on success. Deducts
   * money, marks the zone unlocked, and emits `zone:unlocked` so the Game
   * scene can build the zone in-place.
   */
  tryUnlockZone(zoneId: string, cost: number): boolean {
    if (this._unlockedZones.has(zoneId)) return false
    if (this._balance < cost) return false

    this._balance -= cost
    this._unlockedZones.add(zoneId)

    EventBus.emit('zone:unlocked',   { zoneId })
    EventBus.emit('economy:changed', { balance: this._balance })
    return true
  }

  /** Mark a zone unlocked without paying — used during save restore. */
  forceUnlockZone(zoneId: string): void {
    if (this._unlockedZones.has(zoneId)) return
    this._unlockedZones.add(zoneId)
    EventBus.emit('zone:unlocked', { zoneId })
  }

  /**
   * Called once from Game scene when the player is ready.
   * @param creditDevMoney  if true, adds BALANCE.DEV_STARTING_MONEY.
   *                        Should be false when a save is about to be loaded,
   *                        so the dev credit doesn't stack onto the save.
   */
  init(player: Player, creditDevMoney = true): void {
    this._player = player

    if (!this._listenerAttached) {
      EventBus.on('money:collected', ({ amount }) => this._add(amount))
      this._listenerAttached = true
    }

    if (creditDevMoney && BALANCE.DEV_STARTING_MONEY > 0) {
      this._add(BALANCE.DEV_STARTING_MONEY)
    }
  }

  /**
   * Restore state from a save. Called after _buildZones() in Game scene so
   * that WorkerAI is already listening for `upgrade:applied` events and can
   * respawn workers that were unlocked in the previous session.
   */
  loadFromSave(state: {
    balance:       number
    purchased:     string[]
    unlockedZones: string[]
    unlockedSlots: string[]
  }): void {
    this._balance = state.balance

    // Restore slot unlocks silently — Game._buildZone reads the set on build
    // and skips spawning the PurchaseSlot marker for already-bought slots.
    for (const slotId of state.unlockedSlots) {
      this.forceUnlockSlot(slotId)
    }

    // Restore unlocked zones first so the Game scene can build them before
    // upgrade re-emits trigger WorkerAI spawns inside those zones.
    for (const zoneId of state.unlockedZones) {
      this.forceUnlockZone(zoneId)
    }

    for (const id of state.purchased) {
      const u = UPGRADES.find((x) => x.id === id)
      if (!u) continue
      this._purchased.add(id)
      this._applyUpgrade(u)
      // Re-emit so subscribers (e.g. WorkerAI) react as if purchased fresh.
      EventBus.emit('upgrade:applied', {
        upgradeId: u.id,
        target:    u.target,
        stat:      u.stat,
        value:     u.value,
      })
    }

    EventBus.emit('economy:changed', { balance: this._balance })
  }

  /** Dev-only cheat — grants money outside the normal pay flow. */
  devAddMoney(amount: number): void {
    this._add(amount)
  }

  /** Fully reset state (used on scene restart). */
  reset(): void {
    this._balance = 0
    this._purchased.clear()
    this._unlockedZones.clear()
    this._unlockedSlots.clear()
    this._player = null
    // NOTE: do NOT flip _listenerAttached. The `money:collected` handler
    // closes over `this` (the singleton), and `this._balance` was just
    // reset to 0 — leaving the handler attached across restarts is correct.
    // Flipping the flag here would cause init() to add a SECOND listener on
    // the next scene start, double-counting all money.
  }

  /** Upgrades whose prerequisite is satisfied and which are not yet purchased. */
  getAvailableUpgrades(): UpgradeDef[] {
    return UPGRADES.filter((u) => this._isAvailable(u))
  }

  /** Is this upgrade currently unlocked and not yet purchased? */
  isAvailable(upgradeId: string): boolean {
    const u = UPGRADES.find((x) => x.id === upgradeId)
    return u ? this._isAvailable(u) : false
  }

  canAfford(upgradeId: string): boolean {
    const u = UPGRADES.find((x) => x.id === upgradeId)
    return !!u && this._balance >= u.cost
  }

  /**
   * Attempt to buy an upgrade. Returns true on success.
   * Deducts money, marks purchased, applies effect to player, fires events.
   */
  tryPurchase(upgradeId: string): boolean {
    const u = UPGRADES.find((x) => x.id === upgradeId)
    if (!u) return false
    if (!this._isAvailable(u)) return false
    if (this._balance < u.cost) return false

    this._balance -= u.cost
    this._purchased.add(u.id)

    this._applyUpgrade(u)

    EventBus.emit('upgrade:bought',  { upgradeId: u.id })
    EventBus.emit('upgrade:applied', {
      upgradeId: u.id,
      target:    u.target,
      stat:      u.stat,
      value:     u.value,
    })
    EventBus.emit('economy:changed', { balance: this._balance })
    return true
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _add(amount: number): void {
    this._balance += amount
    EventBus.emit('economy:changed', { balance: this._balance })
  }

  private _isAvailable(u: UpgradeDef): boolean {
    if (this._purchased.has(u.id)) return false
    if (u.prerequisite && !this._purchased.has(u.prerequisite)) return false
    return true
  }

  private _applyUpgrade(u: UpgradeDef): void {
    if (u.target !== 'player' || !this._player) return

    switch (u.stat) {
      case 'maxStack':
        this._player.maxStack = u.value
        break
      case 'speed':
        this._player.speed = u.value
        break
      // 'unlock' (worker_1) has no immediate effect yet —
      // WorkerAI will check purchased set when implemented.
    }
  }
}

export const EconomySystem = new EconomySystemClass()
