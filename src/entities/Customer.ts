import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import type { ShopCounter } from './ShopCounter'
import type { CashRegister } from './CashRegister'

type CustomerState =
  | 'queueing_counter'    // walking to / waiting in counter queue
  | 'queueing_register'   // walking to / waiting in register queue
  | 'leaving'
  | 'done'

const ARRIVE_DIST = 6  // px — customer counts as "in slot" when this close

/**
 * Customer NPC — walks to a counter, queues, buys, queues at the register,
 * pays (only if a cashier is present), leaves.
 *
 * Queues are managed on ShopCounter / CashRegister: the customer calls
 * `joinQueue(this)` on state entry and reads `indexOfInQueue(this)` every
 * tick to compute the slot position it should walk to. When the head of the
 * queue leaves, all other customers' indexes shift and they naturally step
 * forward on the next tick.
 *
 * Patience was removed — customers wait indefinitely. The game-side pressure
 * comes from production throughput, not impatient NPCs walking away.
 */
export class Customer extends Phaser.GameObjects.Container {
  /** Call tick() — returns true when this customer can be destroyed */
  get isDone(): boolean { return this._state === 'done' }

  private _state:    CustomerState
  private counter:   ShopCounter
  private register:  CashRegister
  private exitX:     number
  private exitY:     number

  private pricePaid   = 0
  private facingAngle = 0

  // Visuals
  private shadowObj!:  Phaser.GameObjects.Ellipse
  private shadowSoft!: Phaser.GameObjects.Ellipse
  private dirDot!:     Phaser.GameObjects.Arc
  private legL!:       Phaser.GameObjects.Ellipse
  private legR!:       Phaser.GameObjects.Ellipse
  private walkPhase   = 0

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

    // Immediately claim a slot in the counter's queue — position is
    // recomputed each tick from the live index so the customer walks in
    // smoothly from the spawn point.
    this.counter.joinQueue(this)
    this._state = 'queueing_counter'

    // Spawn pop-in
    this.setScale(0.2)
    scene.tweens.add({ targets: this, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out' })
  }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  tick(delta: number): void {
    if (this._state === 'done') return
    const dt = delta / 1000

    switch (this._state) {
      case 'queueing_counter': {
        const idx = this.counter.indexOfInQueue(this)
        const slot = this.counter.getQueueSlotPos(Math.max(idx, 0))
        this._moveTo(slot.x, slot.y, dt)

        // Only the head of the queue can try to buy, and only when in slot.
        if (idx === 0 && this._distTo(slot.x, slot.y) < ARRIVE_DIST && !this.counter.isEmpty) {
          const earned = this.counter.sellOne()
          if (earned !== null) {
            this.pricePaid = earned
            this.counter.leaveQueue(this)
            this.register.joinQueue(this)
            this._state = 'queueing_register'
          }
        }
        break
      }

      case 'queueing_register': {
        const idx = this.register.indexOfInQueue(this)
        const slot = this.register.getQueueSlotPos(Math.max(idx, 0))
        this._moveTo(slot.x, slot.y, dt)

        // Head of the register queue pays — but only while a cashier is present.
        if (
          idx === 0 &&
          this._distTo(slot.x, slot.y) < ARRIVE_DIST &&
          this.register.hasCashier
        ) {
          this.register.addMoney(this.pricePaid)
          this.register.leaveQueue(this)
          this._state = 'leaving'
        }
        break
      }

      case 'leaving':
        this._moveTo(this.exitX, this.exitY, dt)
        if (this._distTo(this.exitX, this.exitY) < 32) {
          this._vanish()
        }
        break
    }

    this._syncVisuals()
  }

  override destroy(fromScene?: boolean): void {
    // Defensive: make sure we aren't left in a queue if destroyed mid-flight.
    this.counter.leaveQueue(this)
    this.register.leaveQueue(this)
    this.shadowObj.destroy()
    this.shadowSoft.destroy()
    super.destroy(fromScene)
  }

  // ── Private — movement ────────────────────────────────────────────────────

  private _moveTo(tx: number, ty: number, dt: number): void {
    const dx   = tx - this.x
    const dy   = ty - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 2) {
      this.legL.setPosition(-4, 12)
      this.legR.setPosition( 4, 12)
      return
    }

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

    // Walk-cycle leg bob
    this.walkPhase += dt * 11
    const bob = Math.sin(this.walkPhase) * 2
    this.legL.setPosition(-4, 12 + bob)
    this.legR.setPosition( 4, 12 - bob)
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
    // Two-layer shadow (sun top-left)
    this.shadowSoft = this.scene.add.ellipse(this.x + 2, this.y + 13, 36, 11, 0x000000, 0.13)
    this.shadowObj  = this.scene.add.ellipse(this.x + 1, this.y + 12, 26, 8,  0x000000, 0.30)

    // Legs
    this.legL = this.scene.add.ellipse(0, 0, 5, 7, 0x3e2723) as Phaser.GameObjects.Ellipse
    this.legR = this.scene.add.ellipse(0, 0, 5, 7, 0x3e2723) as Phaser.GameObjects.Ellipse
    this.add(this.legL); this.add(this.legR)
    this.legL.setPosition(-4, 12)
    this.legR.setPosition( 4, 12)

    // Torso with sun-lit top + shaded right
    const torso = new Phaser.GameObjects.Graphics(this.scene)
    torso.fillStyle(0x311b92)                           // shaded side (deeper purple)
    torso.fillRoundedRect(-7, 4, 18, 10, 3)
    torso.fillStyle(0x4527a0)                           // front
    torso.fillRoundedRect(-9, 4, 16, 10, 3)
    torso.fillStyle(0x7e57c2)                           // top face
    torso.fillEllipse(0, 4, 22, 12)
    torso.fillStyle(0xb39ddb, 0.85)                     // top-left highlight
    torso.fillEllipse(-5, 2, 10, 5)
    this.add(torso)

    // Head
    const head = new Phaser.GameObjects.Arc(this.scene, 0, -11, 9, 0, 360, false, 0xffcc80)
    this.add(head)
    const headHi = new Phaser.GameObjects.Arc(this.scene, -2, -13, 4, 0, 360, false, 0xffe0b2, 0.85)
    this.add(headHi)

    // Eyes
    const eyeL = new Phaser.GameObjects.Arc(this.scene, -3, -11, 1.2, 0, 360, false, 0x1a1a1a)
    const eyeR = new Phaser.GameObjects.Arc(this.scene,  3, -11, 1.2, 0, 360, false, 0x1a1a1a)
    this.add(eyeL); this.add(eyeR)

    // Hair
    const hair = new Phaser.GameObjects.Graphics(this.scene)
    hair.fillStyle(0x5d4037)
    hair.fillEllipse(0, -18, 16, 5)
    this.add(hair)

    // Direction dot
    this.dirDot = new Phaser.GameObjects.Arc(this.scene, 0, -16, 1.8, 0, 360, false, 0xff5252, 0.9)
    this.add(this.dirDot)
  }

  private _syncVisuals(): void {
    this.setDepth(this.y)
    this.shadowObj.setPosition(this.x + 1, this.y + 12).setDepth(this.y - 1)
    this.shadowSoft.setPosition(this.x + 2, this.y + 13).setDepth(this.y - 2)
  }
}
