import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { ResourceNode } from '../entities/ResourceNode'
import { ProcessingStation } from '../entities/ProcessingStation'
import { ShopCounter } from '../entities/ShopCounter'
import { CashRegister } from '../entities/CashRegister'
import { UpgradeBoard } from '../entities/UpgradeBoard'
import { ZoneUnlockPortal } from '../entities/ZoneUnlockPortal'
import { InputSystem } from '../systems/InputSystem'
import { StackSystem } from '../systems/StackSystem'
import { CustomerSystem } from '../systems/CustomerSystem'
import { WorkerAI } from '../systems/WorkerAI'
import { EconomySystem } from '../systems/EconomySystem'
import { SaveSystem } from '../systems/SaveSystem'
import { EventBus } from '../systems/EventBus'
import { ZONES } from '../config/zones'
import type { UI } from './UI'
import type { ResourceNodeType, ZoneDef } from '../types'

export class Game extends Phaser.Scene {
  private player!:          Player
  private inputSystem!:     InputSystem
  private stack!:           StackSystem
  private nodes:            ResourceNode[]      = []
  private stations:         ProcessingStation[] = []
  private counters:         ShopCounter[]       = []
  private registers:        CashRegister[]      = []
  private upgradeBoards:    UpgradeBoard[]      = []
  private customerSystems:  CustomerSystem[]    = []
  private workerAIs:        WorkerAI[]          = []
  private unlockPortals:    ZoneUnlockPortal[]  = []

  private joystickLinked = false

  // Bound EventBus handler stored so the matching `off()` works on shutdown.
  private _onZoneUnlockedBound = (p: { zoneId: string }): void => this._onZoneUnlocked(p.zoneId)

  constructor() {
    super({ key: 'Game' })
  }

  create(): void {
    // NOTE: do NOT call `EventBus.clear()` here. The UI scene is created once
    // and never restarts; its UpgradeMenu / money-HUD listeners live on the
    // shared EventBus, and `clear()` would silently nuke them on every
    // `scene.restart()`. Instead, Game-side listeners are scoped to this
    // scene's lifetime via the shutdown hook below.
    EconomySystem.reset()

    // Phaser reuses the Scene instance across `scene.restart()`, so class
    // field initializers don't re-run — wipe the entity arrays here or stale
    // (destroyed) refs from the previous run will get tick()'d and crash.
    this.nodes           = []
    this.stations        = []
    this.counters        = []
    this.registers       = []
    this.upgradeBoards   = []
    this.customerSystems = []
    this.workerAIs       = []
    this.unlockPortals   = []
    this.joystickLinked  = false

    const W = 1400, H = 1000
    this.physics.world.setBounds(0, 0, W, H)
    this._buildBackground(W, H)

    this.player      = new Player(this, 500, H / 2)
    this.stack       = new StackSystem(this, this.player)
    this.inputSystem = new InputSystem(this)

    // Peek save first so we can skip the dev starting-money credit if a save
    // is about to overwrite balance anyway.
    const saved = SaveSystem.load()
    EconomySystem.init(this.player, saved === null)

    // Autosave wiring — SaveSystem listens to `economy:changed` via EventBus.
    SaveSystem.init(() => ({
      balance:       EconomySystem.balance,
      purchased:     [...EconomySystem.purchased],
      unlockedZones: [...EconomySystem.unlockedZones],
    }))

    // Pre-seed unlocked zones from the save BEFORE building so portals don't
    // spawn for zones the player already paid to open. We do this *before*
    // subscribing to `zone:unlocked` so the build happens once via _buildZones,
    // not twice via the event handler.
    const preUnlocked = saved?.unlockedZones ?? []
    for (const zoneId of preUnlocked) EconomySystem.forceUnlockZone(zoneId)

    // Listen for runtime unlock purchases (player walking up to a portal).
    // Bound handler so we can `off()` it on shutdown — without this, every
    // scene.restart() would leave a stale handler on the bus and trigger
    // duplicate zone builds next time someone unlocks a zone.
    EventBus.on('zone:unlocked', this._onZoneUnlockedBound)
    this.events.once('shutdown', () => {
      EventBus.off('zone:unlocked', this._onZoneUnlockedBound)
      // WorkerAI subscribes to `upgrade:applied` in its constructor — without
      // an explicit destroy() the old planners stay on the bus across
      // restarts and would each spawn a duplicate worker on the next purchase.
      for (const w of this.workerAIs) w.destroy()
    })

    this._buildZones()

    // Load AFTER zones so WorkerAI is already listening for `upgrade:applied`
    // events — that's how purchased worker unlocks respawn their workers.
    if (saved) {
      EconomySystem.loadFromSave(saved)
    }

    // Dev hotkey: press M → +$1000. Handy for testing upgrades without grinding.
    this.input.keyboard?.on('keydown-M', () => {
      EconomySystem.devAddMoney(1000)
    })

    // Dev hotkey: press C → wipe save + restart scene for a clean state.
    this.input.keyboard?.on('keydown-C', () => {
      SaveSystem.clear()
      this.scene.restart()
    })

    this.cameras.main
      .setBounds(0, 0, W, H)
      .startFollow(this.player, true)
      .setLerp(0.1, 0.1)
  }

  update(_time: number, delta: number): void {
    // Lazy-link joystick
    if (!this.joystickLinked) {
      const ui = this.scene.get('UI') as UI
      if (ui?.joystick) { this.inputSystem.joystick = ui.joystick; this.joystickLinked = true }
    }

    const dir = this.inputSystem.getDirection()
    this.player.update(dir.x, dir.y, delta)
    this.stack.update(delta)

    for (const n of this.nodes)            n.tick(delta, this.player, this.stack)
    for (const s of this.stations)         s.tick(delta, this.player, this.stack)
    for (const c of this.counters)         c.tick(delta, this.player, this.stack)
    for (const r of this.registers)        r.tick(delta, this.player)
    for (const b of this.upgradeBoards)    b.tick(delta, this.player)
    for (const p of this.unlockPortals)    p.tick(delta, this.player)
    for (const w of this.workerAIs)        w.tick(delta)
    for (const cs of this.customerSystems) cs.tick(delta)
  }

  // ── Zone builder ──────────────────────────────────────────────────────────

  /**
   * On scene create, build any zone that's free or already unlocked in the
   * save. Locked zones get an unlock portal in their place.
   */
  private _buildZones(): void {
    for (const zone of ZONES) {
      const alreadyUnlocked =
        zone.unlockCost === 0 || EconomySystem.isZoneUnlocked(zone.id)

      if (alreadyUnlocked) {
        this._buildZone(zone)
      } else if (zone.unlockPortalPos) {
        this._spawnUnlockPortal(zone)
      }
    }
  }

  private _buildZone(zone: ZoneDef): void {
    // Zone-scoped arrays so WorkerRouteDef indices resolve correctly
    // when a zone has its own slice of nodes/stations/counters.
    const zoneNodes: ResourceNode[] = []
    for (const def of zone.nodes) {
      const n = new ResourceNode(this, def.x, def.y, def.type as ResourceNodeType)
      this.nodes.push(n)
      zoneNodes.push(n)
    }

    const zoneStations: ProcessingStation[] = []
    for (const def of zone.stations) {
      const s = new ProcessingStation(this, def.x, def.y, def.recipeId)
      this.stations.push(s)
      zoneStations.push(s)
    }

    const zoneCounters: ShopCounter[] = []
    for (const def of zone.counters) {
      const counter = new ShopCounter(this, def.x, def.y, def.itemType, def.price)
      this.counters.push(counter)
      zoneCounters.push(counter)
    }

    const register = new CashRegister(this, zone.cashRegisterPos.x, zone.cashRegisterPos.y)
    this.registers.push(register)

    if (zone.upgradeBoardPos) {
      this.upgradeBoards.push(
        new UpgradeBoard(this, zone.upgradeBoardPos.x, zone.upgradeBoardPos.y),
      )
    }

    // Always create a planner per zone — it stays dormant until a `worker_N`
    // upgrade fires, then spawns + manages workers in this zone.
    this.workerAIs.push(new WorkerAI(this, zoneNodes, zoneStations, zoneCounters))

    this.customerSystems.push(new CustomerSystem(
      this,
      zoneCounters,
      register,
      zone.customerSpawnPos.x,
      zone.customerSpawnPos.y,
    ))

    // Faint spawn marker (visual hint where customers come from).
    this.add
      .triangle(
        zone.customerSpawnPos.x, zone.customerSpawnPos.y,
        0, -14, -10, 6, 10, 6,
        0xffffff, 0.15,
      )
      .setDepth(-95)
  }

  private _spawnUnlockPortal(zone: ZoneDef): void {
    if (!zone.unlockPortalPos) return
    const portal = new ZoneUnlockPortal(
      this, zone.unlockPortalPos.x, zone.unlockPortalPos.y, zone.id, zone.unlockCost,
    )
    this.unlockPortals.push(portal)
  }

  /**
   * Triggered for both live unlock purchases and save-restored unlocks.
   * Removes the matching portal (if any — restore happens before portals
   * are spawned, so there may be none) and builds the zone.
   */
  private _onZoneUnlocked(zoneId: string): void {
    const zone = ZONES.find((z) => z.id === zoneId)
    if (!zone) return

    const idx = this.unlockPortals.findIndex((p) => p.zoneId === zoneId)
    if (idx >= 0) {
      // The portal handles its own destroy tween on success; just drop the ref.
      this.unlockPortals.splice(idx, 1)
    }

    this._buildZone(zone)
  }

  // ── Background ────────────────────────────────────────────────────────────

  private _buildBackground(w: number, h: number): void {
    this.add.rectangle(0, 0, w, h, 0x1565c0).setOrigin(0).setDepth(-100)
    this.add.rectangle(40, 40, w - 80, h - 80, 0xf4c56a).setOrigin(0).setDepth(-99)
    this.add.rectangle(80, 80, w - 160, h - 160, 0x4caf50).setOrigin(0).setDepth(-98)

    // Subtle path between zones
    this.add.rectangle(900, 80, 80, h - 160, 0xc0a060, 0.35).setOrigin(0).setDepth(-97)

    for (const [px, py, pw, ph] of [
      [120, 120, 60, 50], [320, 240, 80, 40], [760, 420, 70, 55],
      [120, 560, 90, 45], [780, 620, 65, 50], [340, 780, 75, 40],
      [1040, 140, 70, 50], [1240, 280, 80, 45], [1060, 700, 75, 50],
      [1240, 820, 65, 45],
    ] as [number, number, number, number][]) {
      this.add.rectangle(px, py, pw, ph, 0x43a047, 0.3).setOrigin(0).setDepth(-97)
    }

    for (const [px, py] of [
      [110, 100], [880, 100], [95, 920], [900, 910],
      [1060, 100], [1320, 110], [1050, 920], [1330, 920],
    ] as [number, number][]) {
      this._addDecoPalm(px, py)
    }

  }

  private _addDecoPalm(x: number, y: number): void {
    this.add.rectangle(x, y + 8, 7, 40, 0x795548).setOrigin(0.5, 1).setDepth(y - 5)
    this.add.ellipse(x, y - 10, 48, 20, 0x1b5e20, 0.3).setDepth(y - 6)
    this.add.ellipse(x, y - 18, 44, 30, 0x2e7d32, 0.85).setDepth(y - 5)
    this.add.ellipse(x + 12, y - 10, 32, 20, 0x388e3c, 0.75).setDepth(y - 5)
    this.add.ellipse(x - 12, y - 10, 32, 20, 0x388e3c, 0.75).setDepth(y - 5)
  }
}
