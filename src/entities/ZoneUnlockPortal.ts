import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { EconomySystem } from '../systems/EconomySystem'
import type { Player } from './Player'

/**
 * ZoneUnlockPortal — a stone-arch sign in the world that gates a locked
 * zone. The player walks up; if their balance covers the cost the portal
 * auto-charges, fires `zone:unlocked`, and self-destructs. Otherwise the
 * price tag flashes red so the player knows to come back later.
 *
 * The Game scene listens for `zone:unlocked` to swap the portal out for
 * the actual zone (nodes / stations / counters / register / etc.).
 */
export class ZoneUnlockPortal extends Phaser.GameObjects.Container {
  readonly zoneId: string
  readonly cost:   number

  private shadowObj!: Phaser.GameObjects.Ellipse
  private gfx!:       Phaser.GameObjects.Graphics
  private priceText!: Phaser.GameObjects.Text
  private titleText!: Phaser.GameObjects.Text
  private glow!:      Phaser.GameObjects.Arc

  private flashTimer    = 0
  private consumed      = false
  private prevAffordable = true

  constructor(scene: Phaser.Scene, x: number, y: number, zoneId: string, cost: number) {
    super(scene, x, y)
    this.zoneId = zoneId
    this.cost   = cost
    this._build()
    scene.add.existing(this)
  }

  tick(delta: number, player: Player): void {
    if (this.consumed) return

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
    const near = dist < BALANCE.PLAYER_INTERACT_RADIUS + 20

    // Live affordability colour on the price tag
    const affordable = EconomySystem.balance >= this.cost
    if (affordable !== this.prevAffordable) {
      this.priceText.setColor(affordable ? '#fff59d' : '#ef9a9a')
      this.prevAffordable = affordable
    }

    if (near && affordable) {
      const ok = EconomySystem.tryUnlockZone(this.zoneId, this.cost)
      if (ok) {
        this._playUnlockBurst()
        this.consumed = true
        return
      }
    }

    if (near && !affordable) {
      // Brief shake to signal "not enough"
      this.flashTimer += delta
      if (this.flashTimer > 220) {
        this.flashTimer = 0
        this.scene.tweens.add({
          targets: this, x: this.x + 3, duration: 50, yoyo: true, repeat: 1,
          onComplete: () => { /* tween restores via yoyo+repeat */ },
        })
      }
    }

    // Idle pulse
    const t = this.scene.time.now * 0.003
    this.glow.setScale(1 + Math.sin(t) * 0.1)
    this.glow.setAlpha(near ? 0.95 : 0.55)

    this._syncDepth()
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    super.destroy(fromScene)
  }

  // ── Visuals ────────────────────────────────────────────────────────────────

  private _build(): void {
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 22, 70, 18, 0x000000, 0.25)

    this.glow = new Phaser.GameObjects.Arc(this.scene, 0, -28, 36, 0, 360, false, 0x80deea, 0.55)
    this.add(this.glow)

    this.gfx = new Phaser.GameObjects.Graphics(this.scene)
    this._draw()
    this.add(this.gfx)

    this.titleText = new Phaser.GameObjects.Text(
      this.scene, 0, -50, 'NEW ZONE',
      { fontSize: '10px', fontStyle: 'bold', color: '#e0f7fa' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    this.titleText.setOrigin(0.5)
    this.add(this.titleText)

    this.priceText = new Phaser.GameObjects.Text(
      this.scene, 0, -16, `$${this.cost}`,
      { fontSize: '14px', fontStyle: 'bold', color: '#fff59d' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    this.priceText.setOrigin(0.5)
    this.add(this.priceText)
  }

  private _draw(): void {
    const g = this.gfx
    g.clear()

    // Stone arch — back shadow (depth edge)
    g.fillStyle(0x37474f)
    g.fillRect(-30, -42, 60, 50)

    // Arch front
    g.fillStyle(0x607d8b)
    g.fillRect(-30, -44, 60, 50)

    // Arch top highlight
    g.fillStyle(0x90a4ae)
    g.fillRect(-28, -44, 56, 4)

    // Inner opening (the "portal")
    g.fillStyle(0x263238)
    g.fillRect(-20, -38, 40, 38)

    // Magical inner gradient hint
    g.fillStyle(0x4dd0e1, 0.55)
    g.fillRect(-18, -36, 36, 34)
    g.fillStyle(0x80deea, 0.35)
    g.fillRect(-14, -32, 28, 26)

    // Padlock on the front (sells the "locked" idea)
    g.fillStyle(0xffca28)
    g.fillRect(-5, -22, 10, 9)
    g.lineStyle(2, 0xffca28)
    g.beginPath(); g.arc(0, -23, 5, Math.PI, 0, false); g.strokePath()
    g.fillStyle(0x6d4c41)
    g.fillRect(-1, -19, 2, 4)

    // Stone speckles
    g.fillStyle(0x455a64, 0.6)
    g.fillCircle(-20, -30, 1.5)
    g.fillCircle( 18, -34, 1.5)
    g.fillCircle(-12, -10, 1.5)
    g.fillCircle( 22, -12, 1.5)
  }

  private _playUnlockBurst(): void {
    // Particle-ish burst via tweened circles
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2
      const sx  = this.x + Math.cos(ang) * 6
      const sy  = this.y - 24 + Math.sin(ang) * 6
      const dot = this.scene.add.circle(sx, sy, 3, 0xfff59d, 1).setDepth(this.y + 50)
      this.scene.tweens.add({
        targets:  dot,
        x:        sx + Math.cos(ang) * 60,
        y:        sy + Math.sin(ang) * 60,
        alpha:    0,
        duration: 600,
        ease:     'Quad.Out',
        onComplete: () => dot.destroy(),
      })
    }

    this.scene.tweens.add({
      targets:  this,
      scaleX:   1.15, scaleY: 1.15,
      alpha:    0,
      duration: 280,
      ease:     'Quad.In',
      onComplete: () => this.destroy(),
    })
  }

  private _syncDepth(): void {
    this.setDepth(this.y + 5)
    this.shadowObj.setDepth(this.y - 1)
  }
}
