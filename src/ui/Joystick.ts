import Phaser from 'phaser'

/**
 * Custom floating virtual joystick — no Rex dependency.
 *
 * Touch anywhere in the right 40 % of the screen to activate.
 * The base snaps to the touch point; the thumb follows the finger
 * and is clamped within `radius` pixels of the base.
 *
 * Output (x, y) is always in [-1, 1] — magnitude matches keyboard
 * (partial deflection gives < 1, full deflection gives 1).
 */
export class Joystick {
  private scene: Phaser.Scene
  private baseGfx: Phaser.GameObjects.Arc
  private thumbGfx: Phaser.GameObjects.Arc

  private readonly radius = 58
  private readonly deadZone = 6   // pixels — below this = no input

  private centerX = 0
  private centerY = 0
  private _dx = 0
  private _dy = 0
  private _active = false
  private activePointerId = -1

  private readonly DEFAULT_X: number
  private readonly DEFAULT_Y: number

  get x(): number  { return this._dx }
  get y(): number  { return this._dy }
  get active(): boolean { return this._active }

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    const { width, height } = scene.scale

    this.DEFAULT_X = width - 110
    this.DEFAULT_Y = height - 140

    // ── Visuals ──────────────────────────────────────────────────────────────
    this.baseGfx = scene.add
      .circle(this.DEFAULT_X, this.DEFAULT_Y, this.radius, 0xffffff, 0.10)
      .setStrokeStyle(2, 0xffffff, 0.25)
      .setScrollFactor(0)
      .setDepth(1000)

    this.thumbGfx = scene.add
      .circle(this.DEFAULT_X, this.DEFAULT_Y, 26, 0xffffff, 0.45)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setScrollFactor(0)
      .setDepth(1001)

    // ── Touch zone — invisible rect covering right 40 % ───────────────────
    const zone = scene.add
      .rectangle(width * 0.6, 0, width * 0.4, height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(999)
      .setInteractive()

    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.activePointerId === -1) {
        this._activate(pointer.x, pointer.y, pointer.id)
      }
    })

    // pointermove / pointerup fire on the scene (finger may slide outside zone)
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.activePointerId) {
        this._move(pointer.x, pointer.y)
      }
    })

    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.activePointerId) {
        this._deactivate()
      }
    })
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _activate(px: number, py: number, id: number): void {
    this.activePointerId = id
    this.centerX = px
    this.centerY = py
    this._dx = 0
    this._dy = 0
    this._active = true
    this.baseGfx.setPosition(px, py)
    this.thumbGfx.setPosition(px, py)
  }

  private _move(px: number, py: number): void {
    const dx   = px - this.centerX
    const dy   = py - this.centerY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < this.deadZone) {
      this._dx = 0
      this._dy = 0
      this.thumbGfx.setPosition(this.centerX, this.centerY)
      return
    }

    // Normalised direction
    const nx = dx / dist
    const ny = dy / dist

    // Clamp thumb within radius; scale output to [0, 1]
    const clamped = Math.min(dist, this.radius)
    this._dx = nx * (clamped / this.radius)
    this._dy = ny * (clamped / this.radius)

    this.thumbGfx.setPosition(
      this.centerX + nx * clamped,
      this.centerY + ny * clamped,
    )
  }

  private _deactivate(): void {
    this.activePointerId = -1
    this._active = false
    this._dx = 0
    this._dy = 0

    this.thumbGfx.setPosition(this.DEFAULT_X, this.DEFAULT_Y)
    this.scene.time.delayedCall(120, () => {
      this.baseGfx.setPosition(this.DEFAULT_X, this.DEFAULT_Y)
    })
  }
}
