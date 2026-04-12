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
  private dirDot!: Phaser.GameObjects.Arc

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
    // Shadow is NOT inside the container — needs its own depth below the player.
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 14, 36, 12, 0x000000, 0.28)
  }

  private _buildBody(): void {
    // ── Torso: pseudo-3D box (front face darker, top face lighter)
    const torso = new Phaser.GameObjects.Graphics(this.scene)

    // Front face (side you see, darker)
    torso.fillStyle(0xd84315)
    torso.fillRoundedRect(-11, 4, 22, 12, 3)

    // Top face (roof of box, lighter)
    torso.fillStyle(0xff7043)
    torso.fillEllipse(0, 4, 26, 14)

    this.add(torso)

    // ── Head
    const head = new Phaser.GameObjects.Arc(this.scene, 0, -14, 11, 0, 360, false, 0xffcc80)
    this.add(head)

    // ── Direction indicator — small dark dot offset from head center
    // Positioned at facingAngle each frame in update()
    this.dirDot = new Phaser.GameObjects.Arc(this.scene, 0, -19, 3, 0, 360, false, 0x4e342e)
    this.add(this.dirDot)
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /**
   * Called from Game.update() with a pre-normalised direction vector.
   * @param dx  normalised X component (-1 … 1)
   * @param dy  normalised Y component (-1 … 1)
   * @param delta  frame delta in ms
   */
  update(dx: number, dy: number, _delta: number): void {
    // Velocity
    this.body.setVelocity(dx * this.speed, dy * this.speed)

    this.isMoving = dx !== 0 || dy !== 0

    // Facing angle — smoothly approach target angle
    if (this.isMoving) {
      const target = Math.atan2(dy, dx)
      // Shortest-path lerp for angles
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
    } else {
      this.setRotation(0)
    }

    // Y-sort depth
    this.setDepth(this.y)
    this.shadowObj.setDepth(this.y - 1)

    // Shadow follows player (slightly below feet)
    this.shadowObj.setPosition(this.x, this.y + 14)

    // Squash/stretch shadow while moving
    this.shadowObj.setScale(this.isMoving ? 1 : 1.1, this.isMoving ? 0.8 : 1)
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    super.destroy(fromScene)
  }
}
