import Phaser from 'phaser'
import { BALANCE } from '../config/balance'

/**
 * Player entity.
 *
 * Pseudo-3D rendering:
 *   - Drop shadow (separate scene object, depth = y - 1)
 *   - Body drawn as a top-face ellipse + front-face rectangle = box illusion
 *   - Head circle above body
 *   - Direction dot on head shows facing angle
 *   - setDepth(y) every frame → Y-sorting with other scene objects
 *
 * Physics: arcade body lives on the Container itself via
 * scene.physics.add.existing(this). Velocity set every frame in update().
 */
export class Player extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body

  // Visual parts
  private shadowObj!: Phaser.GameObjects.Ellipse
  private shadowSoft!: Phaser.GameObjects.Ellipse
  private dirDot!: Phaser.GameObjects.Arc
  private legL!: Phaser.GameObjects.Ellipse
  private legR!: Phaser.GameObjects.Ellipse
  private walkPhase = 0

  // Stats (upgraded by EconomySystem later)
  speed: number
  maxStack: number

  // Movement state
  private facingAngle = 0          // radians, 0 = right
  private isMoving = false

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)

    this._buildShadow()
    this._buildBody()

    scene.add.existing(this)
    scene.physics.add.existing(this)

    const ab = this.body
    ab.setSize(22, 22)
    ab.setOffset(-11, -6)
    ab.setCollideWorldBounds(true)

    this.speed    = BALANCE.PLAYER_SPEED
    this.maxStack = BALANCE.PLAYER_MAX_STACK
  }

  // ── Visual construction ────────────────────────────────────────────────────

  private _buildShadow(): void {
    // Two-layer shadow: tight dark core + soft outer halo, offset slightly
    // toward bottom-right to suggest a top-left sun direction.
    this.shadowSoft = this.scene.add.ellipse(this.x + 3, this.y + 16, 46, 14, 0x000000, 0.14)
    this.shadowObj  = this.scene.add.ellipse(this.x + 1, this.y + 14, 32, 10, 0x000000, 0.32)
  }

  private _buildBody(): void {
    // ── Legs (drawn first so the torso overlaps them)
    this.legL = this.scene.add.ellipse(0, 0, 6, 8, 0x3e2723) as Phaser.GameObjects.Ellipse
    this.legR = this.scene.add.ellipse(0, 0, 6, 8, 0x3e2723) as Phaser.GameObjects.Ellipse
    // Re-parent into the container
    this.add(this.legL)
    this.add(this.legR)
    this.legL.setPosition(-5, 14)
    this.legR.setPosition( 5, 14)

    // ── Torso: pseudo-3D box with stronger top-left lighting
    const torso = new Phaser.GameObjects.Graphics(this.scene)

    // Side shadow (right side, sun top-left)
    torso.fillStyle(0xa6300d)
    torso.fillRoundedRect(-9, 4, 22, 12, 3)
    // Front face
    torso.fillStyle(0xd84315)
    torso.fillRoundedRect(-11, 4, 20, 12, 3)
    // Top face (lighter — catches sun)
    torso.fillStyle(0xff7043)
    torso.fillEllipse(0, 4, 26, 14)
    // Top-left shoulder highlight
    torso.fillStyle(0xffab91, 0.85)
    torso.fillEllipse(-6, 2, 12, 6)

    this.add(torso)

    // ── Head
    const head = new Phaser.GameObjects.Arc(this.scene, 0, -14, 11, 0, 360, false, 0xffcc80)
    this.add(head)

    // Head highlight (top-left sun)
    const headHi = new Phaser.GameObjects.Arc(this.scene, -3, -17, 5, 0, 360, false, 0xffe0b2, 0.85)
    this.add(headHi)

    // Hair tuft (just to give the head a top edge)
    const hair = new Phaser.GameObjects.Graphics(this.scene)
    hair.fillStyle(0x4e342e)
    hair.fillEllipse(-1, -22, 18, 6)
    hair.fillEllipse(-4, -23, 8, 4)
    this.add(hair)

    // Eyes (two tiny dark dots)
    const eyeL = new Phaser.GameObjects.Arc(this.scene, -3, -13, 1.4, 0, 360, false, 0x1a1a1a)
    const eyeR = new Phaser.GameObjects.Arc(this.scene,  3, -13, 1.4, 0, 360, false, 0x1a1a1a)
    this.add(eyeL); this.add(eyeR)

    // ── Direction indicator — small dark dot offset from head center
    // Positioned at facingAngle each frame in update()
    this.dirDot = new Phaser.GameObjects.Arc(this.scene, 0, -19, 2.4, 0, 360, false, 0xff5252, 0.9)
    this.add(this.dirDot)
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /**
   * Called from Game.update() with a pre-normalised direction vector.
   * @param dx  normalised X component (-1 … 1)
   * @param dy  normalised Y component (-1 … 1)
   * @param delta  frame delta in ms
   */
  update(dx: number, dy: number, delta: number): void {
    // Velocity
    this.body.setVelocity(dx * this.speed, dy * this.speed)

    this.isMoving = dx !== 0 || dy !== 0

    // Facing angle — smoothly approach target angle
    if (this.isMoving) {
      const target = Math.atan2(dy, dx)
      let diff = target - this.facingAngle
      if (diff >  Math.PI) diff -= Math.PI * 2
      if (diff < -Math.PI) diff += Math.PI * 2
      this.facingAngle += diff * 0.25

      // Reposition direction dot around head center (radius 8)
      const DOT_R = 8
      this.dirDot.setPosition(
        Math.cos(this.facingAngle) * DOT_R,
        -14 + Math.sin(this.facingAngle) * DOT_R,
      )

      // Subtle lean in movement direction (max ±8°)
      this.setRotation(dx * 0.14)

      // Walk-cycle: alternate leg vertical bob
      this.walkPhase += delta * 0.012
      const bob = Math.sin(this.walkPhase) * 2.5
      this.legL.setPosition(-5, 14 + bob)
      this.legR.setPosition( 5, 14 - bob)
    } else {
      this.setRotation(0)
      this.walkPhase = 0
      this.legL.setPosition(-5, 14)
      this.legR.setPosition( 5, 14)
    }

    // Y-sort depth
    this.setDepth(this.y)
    this.shadowObj.setDepth(this.y - 1)
    this.shadowSoft.setDepth(this.y - 2)

    // Shadows follow player, slightly offset toward bottom-right
    this.shadowObj.setPosition(this.x + 1, this.y + 14)
    this.shadowSoft.setPosition(this.x + 3, this.y + 16)

    // Squash/stretch shadow while moving
    this.shadowObj.setScale(this.isMoving ? 1 : 1.1, this.isMoving ? 0.8 : 1)
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    this.shadowSoft.destroy()
    super.destroy(fromScene)
  }
}
