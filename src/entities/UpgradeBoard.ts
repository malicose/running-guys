import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { EventBus } from '../systems/EventBus'
import type { Player } from './Player'

/**
 * UpgradeBoard — a wooden sign in the world. When the player is within
 * proximity, emits `upgradeboard:proximity { near: true }` which the UI
 * scene listens to in order to slide the UpgradeMenu panel in/out.
 *
 * Purely a trigger — it holds no economy state itself (EconomySystem does).
 *
 * Pseudo-3D: two posts + slanted top face on the plank + drop shadow.
 */
export class UpgradeBoard extends Phaser.GameObjects.Container {
  private shadowObj!: Phaser.GameObjects.Ellipse
  private gfx!:       Phaser.GameObjects.Graphics
  private glow!:      Phaser.GameObjects.Arc
  private playerNearPrev = false

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)
    this._build()
    this.setDepth(y + 5)
    this.shadowObj.setDepth(y - 1)
    scene.add.existing(this)
  }

  tick(delta: number, player: Player): void {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
    const near = dist < BALANCE.PLAYER_INTERACT_RADIUS + 20

    if (near !== this.playerNearPrev) {
      EventBus.emit('upgradeboard:proximity', { near })
      this.playerNearPrev = near
    }

    // Idle pulse on glow ring
    const t = this.scene.time.now * 0.003
    this.glow.setScale(1 + Math.sin(t) * 0.12)
    this.glow.setAlpha(near ? 0.9 : 0.5)

    // delta unused but kept for API parity with other entities
    void delta
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    super.destroy(fromScene)
  }

  // ── Visuals ────────────────────────────────────────────────────────────────

  private _build(): void {
    // Shadow
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 18, 52, 14, 0x000000, 0.22)

    // Soft glow behind the sign (child — sorted with container)
    this.glow = new Phaser.GameObjects.Arc(this.scene, 0, -22, 28, 0, 360, false, 0xffd54f, 0.5)
    this.add(this.glow)

    this.gfx = new Phaser.GameObjects.Graphics(this.scene)
    this._draw()
    this.add(this.gfx)

    // Upgrade icon (wrench + arrow up) — hand-drawn via graphics
    const icon = new Phaser.GameObjects.Graphics(this.scene)
    // Up arrow
    icon.fillStyle(0xffeb3b)
    icon.fillTriangle(0, -34, -7, -24, 7, -24)
    icon.fillRect(-3, -24, 6, 8)
    // Bolt highlight
    icon.fillStyle(0xfff59d, 0.8)
    icon.fillTriangle(-2, -30, -5, -25, 0, -25)
    this.add(icon)

    // "UPGRADES" label
    const label = new Phaser.GameObjects.Text(
      this.scene, 0, -8, 'UPGRADES',
      { fontSize: '9px', fontStyle: 'bold', color: '#fff8e1' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    label.setOrigin(0.5)
    this.add(label)
  }

  private _draw(): void {
    const g = this.gfx
    g.clear()

    // Two posts (sunk into ground)
    g.fillStyle(0x4e342e)
    g.fillRect(-22, 0, 5, 18)
    g.fillRect( 17, 0, 5, 18)

    // Post highlights
    g.fillStyle(0x6d4c41)
    g.fillRect(-22, 0, 2, 18)
    g.fillRect( 17, 0, 2, 18)

    // Plank back shadow (depth edge)
    g.fillStyle(0x3e2723)
    g.fillRect(-28, -18, 56, 22)

    // Plank front
    g.fillStyle(0x8d6e63)
    g.fillRect(-28, -20, 56, 22)

    // Plank top face (lighter, slightly narrower — pseudo-3D)
    g.fillStyle(0xa1887f)
    g.fillRect(-26, -20, 52, 4)

    // Wood grain
    g.lineStyle(1, 0x5d4037, 0.5)
    g.beginPath(); g.moveTo(-24, -10); g.lineTo(24, -10); g.strokePath()
    g.beginPath(); g.moveTo(-24,  -2); g.lineTo(24,  -2); g.strokePath()
  }

  // Depth is set once in constructor — board never moves.
}
