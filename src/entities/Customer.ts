import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import type { ShopCounter } from './ShopCounter'
import type { CashRegister } from './CashRegister'

type CustomerState =
  | 'walking_to_counter'
  | 'at_counter'
  | 'walking_to_register'
  | 'at_register'
  | 'leaving'
  | 'done'

const ARRIVE_DIST  = 32    // px — close enough to target
const PAY_PAUSE    = 0.45  // seconds customer stands at register before leaving

/**
 * Customer NPC — autonomous agent that drives the economy loop:
 *   spawn → counter → register → exit
 *
 * No Phaser physics — position is updated manually for simplicity.
 * Y-sort depth updated every frame.
 *
 * Visual: same pseudo-3D style as Player but purple/smaller.
 */
export class Customer extends Phaser.GameObjects.Container {
  /** Call tick() — returns true when this customer can be destroyed */
  get isDone(): boolean { return this._state === 'done' }

  private _state:    CustomerState = 'walking_to_counter'
  private counter:   ShopCounter
  private register:  CashRegister
  private exitX:     number
  private exitY:     number

  private patience   = BALANCE.CUSTOMER_PATIENCE
  private payTimer   = 0
  private pricePaid  = 0
  private facingAngle = 0

  // Visuals
  private shadowObj!:  Phaser.GameObjects.Ellipse
  private dirDot!:     Phaser.GameObjects.Arc
  private patienceBar!: Phaser.GameObjects.Rectangle
  private patienceBg!:  Phaser.GameObjects.Rectangle

  // ── Construction ──────────────────────────────────────────────────────────

  constructor(
    scene:    Phaser.Scene,
    x:        number,
    y:        number,
    counter:  ShopCounter,
    register: CashRegister,
    exitX:    number,
    exitY:    number,
  ) {
    super(scene, x, y)
    this.counter  = counter
    this.register = register
    this.exitX    = exitX
    this.exitY    = exitY

    this._buildVisual()
    scene.add.existing(this)

    // Spawn pop-in
    this.setScale(0.2)
    scene.tweens.add({ targets: this, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out' })
  }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  tick(delta: number): void {
    if (this._state === 'done') return
    const dt = delta / 1000

    switch (this._state) {
      case 'walking_to_counter':
        this._moveTo(this.counter.x, this.counter.y - 36, dt)
        if (this._distTo(this.counter.x, this.counter.y - 36) < ARRIVE_DIST) {
          this._state = 'at_counter'
        }
        break

      case 'at_counter': {
        this._patienceBar(true)
        if (!this.counter.isEmpty) {
          const earned = this.counter.sellOne()
          if (earned !== null) {
            this.pricePaid = earned
            this._patienceBar(false)
            this._state = 'walking_to_register'
          }
        } else {
          this.patience -= dt
          this._updatePatienceBar()
          if (this.patience <= 0) {
            this._patienceBar(false)
            this._state = 'leaving'
          }
        }
        break
      }

      case 'walking_to_register':
        this._moveTo(this.register.x, this.register.y - 30, dt)
        if (this._distTo(this.register.x, this.register.y - 30) < ARRIVE_DIST) {
          this._state = 'at_register'
          this.payTimer = PAY_PAUSE
        }
        break

      case 'at_register':
        this.payTimer -= dt
        if (this.payTimer <= 0) {
          this.register.addMoney(this.pricePaid)
          this._state = 'leaving'
        }
        break

      case 'leaving':
        this._moveTo(this.exitX, this.exitY, dt)
        if (this._distTo(this.exitX, this.exitY) < ARRIVE_DIST) {
          this._vanish()
        }
        break
    }

    this._syncVisuals()
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    this.patienceBg.destroy()
    this.patienceBar.destroy()
    super.destroy(fromScene)
  }

  // ── Private — movement ────────────────────────────────────────────────────

  private _moveTo(tx: number, ty: number, dt: number): void {
    const dx   = tx - this.x
    const dy   = ty - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 2) return

    const speed = BALANCE.CUSTOMER_SPEED
    this.x += (dx / dist) * speed * dt
    this.y += (dy / dist) * speed * dt

    // Smooth facing
    const target = Math.atan2(dy, dx)
    let diff = target - this.facingAngle
    if (diff >  Math.PI) diff -= Math.PI * 2
    if (diff < -Math.PI) diff += Math.PI * 2
    this.facingAngle += diff * 0.2

    this.dirDot.setPosition(
      Math.cos(this.facingAngle) * 7,
      -12 + Math.sin(this.facingAngle) * 7,
    )
    this.setRotation(dx / dist * 0.1)
  }

  private _distTo(tx: number, ty: number): number {
    return Phaser.Math.Distance.Between(this.x, this.y, tx, ty)
  }

  private _vanish(): void {
    this.scene.tweens.add({
      targets: this, scaleX: 0, scaleY: 0, alpha: 0,
      duration: 200, ease: 'Quad.In',
      onComplete: () => { this._state = 'done' },
    })
  }

  // ── Private — visuals ──────────────────────────────────────────────────────

  private _buildVisual(): void {
    // Shadow (world-space for independent depth)
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 12, 28, 9, 0x000000, 0.25)

    // Torso side face
    const torso = new Phaser.GameObjects.Graphics(this.scene)
    torso.fillStyle(0x4527a0)                          // darker purple side
    torso.fillRoundedRect(-9, 4, 18, 10, 3)
    torso.fillStyle(0x7e57c2)                          // main purple top face
    torso.fillEllipse(0, 4, 22, 12)
    this.add(torso)

    // Head
    const head = new Phaser.GameObjects.Arc(this.scene, 0, -11, 9, 0, 360, false, 0xffcc80)
    this.add(head)

    // Direction dot
    this.dirDot = new Phaser.GameObjects.Arc(this.scene, 0, -16, 2.5, 0, 360, false, 0x4e342e)
    this.add(this.dirDot)

    // Patience bar (world-space, shown only while waiting)
    this.patienceBg = this.scene.add
      .rectangle(this.x, this.y - 26, 26, 5, 0x333333, 0.7)
      .setVisible(false).setDepth(9995)

    this.patienceBar = this.scene.add
      .rectangle(this.x - 12, this.y - 26, 24, 3, 0x4caf50)
      .setOrigin(0, 0.5).setVisible(false).setDepth(9996)
  }

  private _patienceBar(visible: boolean): void {
    this.patienceBg.setVisible(visible)
    this.patienceBar.setVisible(visible)
  }

  private _updatePatienceBar(): void {
    const pct = this.patience / BALANCE.CUSTOMER_PATIENCE
    this.patienceBar.setDisplaySize(24 * pct, 3)

    // Colour shifts green → red as patience depletes
    const r = Math.round(255 * (1 - pct))
    const g = Math.round(200 * pct)
    this.patienceBar.setFillStyle(Phaser.Display.Color.GetColor(r, g, 50))
  }

  private _syncVisuals(): void {
    this.setDepth(this.y)
    this.shadowObj.setPosition(this.x, this.y + 12).setDepth(this.y - 1)
    this.patienceBg.setPosition(this.x, this.y - 28)
    this.patienceBar.setPosition(this.x - 12, this.y - 28)
  }
}
