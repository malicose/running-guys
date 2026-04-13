import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { EventBus } from '../systems/EventBus'
import type { Player } from './Player'
import type { Customer } from './Customer'

const COIN_COUNT = 8   // coins spawned per collection

/** Anything that can act as a cashier — player or worker, both have (x, y). */
export interface CashierCandidate { x: number; y: number }

/**
 * CashRegister — money accumulates here as customers pay.
 *
 * Step 7: addMoney() + visual pending display.
 * Step 8 (here): player walks up → coin arc animation → money credited.
 */
export class CashRegister extends Phaser.GameObjects.Container {
  private pendingMoney = 0
  private collectCd    = 0   // brief cooldown after collection

  /** Ordered queue of customers at this register — head (index 0) is being served. */
  private queue: Customer[] = []

  /**
   * Callback that returns the current list of things that can act as a
   * cashier (player + any workers in the zone). Checked every frame against
   * CASHIER_RADIUS to decide whether head-of-queue customers may pay.
   */
  private cashierCandidates: () => CashierCandidate[] = () => []

  private _hasCashier = false

  // Visuals
  private shadowObj!:   Phaser.GameObjects.Ellipse
  private boxGfx!:      Phaser.GameObjects.Graphics
  private moneyLabel!:  Phaser.GameObjects.Text
  private coinBag!:     Phaser.GameObjects.Arc     // pulsing bag icon
  private cashierIcon!: Phaser.GameObjects.Text    // green ✔ / red ✖ above register

  // ── Construction ──────────────────────────────────────────────────────────

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)
    this._buildVisual()
    scene.add.existing(this)
  }

  // ── Cashier wiring ────────────────────────────────────────────────────────

  /** Called by Game after the zone is built so the register can see its
   *  player + zone workers. The callback is re-evaluated each frame so new
   *  workers spawned by upgrades are picked up automatically. */
  setCashierCandidates(fn: () => CashierCandidate[]): void {
    this.cashierCandidates = fn
  }

  /** True if any cashier candidate is within CASHIER_RADIUS of the register. */
  get hasCashier(): boolean { return this._hasCashier }

  // ── Queue API (used by Customer) ─────────────────────────────────────────

  get queueLength(): number { return this.queue.length }

  joinQueue(c: Customer): number {
    const idx = this.queue.indexOf(c)
    if (idx !== -1) return idx
    this.queue.push(c)
    return this.queue.length - 1
  }

  leaveQueue(c: Customer): void {
    const idx = this.queue.indexOf(c)
    if (idx !== -1) this.queue.splice(idx, 1)
  }

  indexOfInQueue(c: Customer): number { return this.queue.indexOf(c) }

  getQueueSlotPos(index: number): { x: number; y: number } {
    const clamped = Math.min(index, BALANCE.REGISTER_QUEUE_CAP_SLOTS - 1)
    return {
      x: this.x,
      y: this.y + BALANCE.QUEUE_FRONT_OFFSET + clamped * BALANCE.QUEUE_SLOT_SPACING,
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Called by Customer when paying. */
  addMoney(amount: number): void {
    this.pendingMoney += amount
    this._refreshLabel()

    // Brief pulse on coin bag
    this.scene.tweens.add({
      targets: this.coinBag, scaleX: 1.4, scaleY: 1.4,
      duration: 100, yoyo: true, ease: 'Quad.Out',
    })
  }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  tick(delta: number, player: Player): void {
    const dt = delta / 1000
    this.collectCd = Math.max(0, this.collectCd - dt)

    // Cashier presence check — any candidate within CASHIER_RADIUS counts.
    this._hasCashier = false
    const candidates = this.cashierCandidates()
    for (const cand of candidates) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, cand.x, cand.y)
      if (d < BALANCE.CASHIER_RADIUS) { this._hasCashier = true; break }
    }
    this.cashierIcon.setText(this._hasCashier ? '✓' : '✗')
    this.cashierIcon.setColor(this._hasCashier ? '#a5d6a7' : '#ef9a9a')

    if (this.pendingMoney > 0 && this.collectCd === 0) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
      if (dist < BALANCE.REGISTER_COLLECT_RADIUS) {
        this._collectMoney(player)
      }
    }

    // Idle pulse on bag when money is waiting
    if (this.pendingMoney > 0) {
      const t = this.scene.time.now * 0.003
      this.coinBag.setScale(1 + Math.sin(t) * 0.08)
    } else {
      this.coinBag.setScale(1)
    }

    this._syncDepth()
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    super.destroy(fromScene)
  }

  // ── Private — collection ──────────────────────────────────────────────────

  private _collectMoney(player: Player): void {
    const amount = this.pendingMoney
    this.pendingMoney = 0
    this.collectCd    = 1.2   // prevent re-trigger for 1.2s
    this._refreshLabel()

    // Emit to UI (updates money counter)
    EventBus.emit('money:collected', { amount })

    // ── Coin arc animation: N coins fly from register to player ──────────────
    for (let i = 0; i < COIN_COUNT; i++) {
      this._spawnCoin(player, i)
    }

    // Floating "+$X" text
    const popup = this.scene.add
      .text(this.x, this.y - 40, `+$${amount}`, {
        fontSize: '16px', fontStyle: 'bold', color: '#FFD600',
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5)
      .setDepth(99999)

    this.scene.tweens.add({
      targets: popup, y: popup.y - 50, alpha: 0,
      duration: 900, ease: 'Quad.Out',
      onComplete: () => popup.destroy(),
    })
  }

  private _spawnCoin(player: Player, index: number): void {
    const delay = index * 55

    const coin = this.scene.add
      .circle(this.x, this.y - 10, 6, 0xffd600)
      .setStrokeStyle(1.5, 0xe65100)
      .setDepth(99998)

    // Arc toward player with slight spread
    const spread = (index - COIN_COUNT / 2) * 14
    const midX   = (this.x + player.x) / 2 + spread
    const midY   = Math.min(this.y, player.y) - 60 - Math.random() * 30

    this.scene.tweens.add({
      targets: coin,
      delay,
      x: { value: player.x, ease: 'Quad.InOut' },
      y: [
        { value: midY,    ease: 'Quad.Out', duration: 250 },
        { value: player.y - 20, ease: 'Quad.In',  duration: 200 },
      ],
      duration: 450,
      onComplete: () => coin.destroy(),
    })
  }

  // ── Private — visuals ──────────────────────────────────────────────────────

  private _buildVisual(): void {
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 16, 50, 14, 0x000000, 0.22)

    this.boxGfx = new Phaser.GameObjects.Graphics(this.scene)
    this._drawBox()
    this.add(this.boxGfx)

    // Coin bag circle (top of register)
    this.coinBag = new Phaser.GameObjects.Arc(this.scene, 0, -14, 11, 0, 360, false, 0xffd600)
    this.coinBag.setStrokeStyle(2, 0xe65100)
    this.add(this.coinBag)

    // $ symbol inside bag
    const dollar = new Phaser.GameObjects.Text(
      this.scene, 0, -14, '$',
      { fontSize: '11px', fontStyle: 'bold', color: '#e65100' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    dollar.setOrigin(0.5)
    this.add(dollar)

    // Pending money label
    this.moneyLabel = new Phaser.GameObjects.Text(
      this.scene, 0, -38, '',
      { fontSize: '11px', fontStyle: 'bold', color: '#ffd600', align: 'center' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    this.moneyLabel.setOrigin(0.5)
    this.add(this.moneyLabel)

    // Cashier indicator — small ✓/✗ next to the coin bag
    this.cashierIcon = new Phaser.GameObjects.Text(
      this.scene, 16, -18, '✗',
      { fontSize: '12px', fontStyle: 'bold', color: '#ef9a9a' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    this.cashierIcon.setOrigin(0.5)
    this.add(this.cashierIcon)

    // "REGISTER" label
    const reg = new Phaser.GameObjects.Text(
      this.scene, 0, 26,
      'REGISTER',
      { fontSize: '8px', color: '#a5d6a7' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    reg.setOrigin(0.5).setAlpha(0.7)
    this.add(reg)
  }

  private _drawBox(): void {
    const g = this.boxGfx
    g.clear()

    // Side face
    g.fillStyle(0x1b5e20)
    g.fillRect(18, -4, 7, 20)

    // Front face
    g.fillStyle(0x2e7d32)
    g.fillRect(-20, -4, 40, 20)

    // Top face
    g.fillStyle(0x43a047)
    g.fillEllipse(0, -4, 44, 18)

    // Screen / detail
    g.fillStyle(0x1b5e20)
    g.fillRect(-10, 2, 18, 8)
    g.fillStyle(0x66bb6a, 0.4)
    g.fillRect(-9, 3, 16, 6)
  }

  private _refreshLabel(): void {
    this.moneyLabel.setText(this.pendingMoney > 0 ? `$${this.pendingMoney}` : '')
  }

  private _syncDepth(): void {
    this.setDepth(this.y + 5)
    this.shadowObj.setDepth(this.y - 1)
  }
}
