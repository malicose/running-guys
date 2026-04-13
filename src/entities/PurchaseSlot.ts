import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { EconomySystem } from '../systems/EconomySystem'
import type { Player } from './Player'

/**
 * PurchaseSlot — an in-world "buy this spot" marker. Sits where a locked
 * node or station would be; the player walks onto it and, if they can
 * afford it, the slot self-consumes and the Game scene spawns the real
 * entity at the same position.
 *
 * Lighter visual than ZoneUnlockPortal (which gates an entire zone) —
 * just a dashed footprint on the ground, a price tag, and a faint glow.
 */
export class PurchaseSlot extends Phaser.GameObjects.Container {
  readonly slotId: string
  readonly cost:   number

  private shadowObj!: Phaser.GameObjects.Ellipse
  private gfx!:       Phaser.GameObjects.Graphics
  private priceText!: Phaser.GameObjects.Text
  private hintText!:  Phaser.GameObjects.Text
  private glow!:      Phaser.GameObjects.Arc

  private flashTimer     = 0
  private consumed       = false
  private prevAffordable = true

  constructor(
    scene: Phaser.Scene,
    x:     number,
    y:     number,
    slotId: string,
    cost:   number,
    hint:   string,
  ) {
    super(scene, x, y)
    this.slotId = slotId
    this.cost   = cost
    this._build(hint)
    scene.add.existing(this)
  }

  tick(delta: number, player: Player): void {
    if (this.consumed) return

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
    const near = dist < BALANCE.PLAYER_INTERACT_RADIUS + 8

    const affordable = EconomySystem.balance >= this.cost
    if (affordable !== this.prevAffordable) {
      this.priceText.setColor(affordable ? '#fff59d' : '#ef9a9a')
      this.prevAffordable = affordable
    }

    if (near && affordable) {
      const ok = EconomySystem.tryPurchaseSlot(this.slotId, this.cost)
      if (ok) {
        this._playBurst()
        this.consumed = true
        return
      }
    }

    if (near && !affordable) {
      this.flashTimer += delta
      if (this.flashTimer > 220) {
        this.flashTimer = 0
        this.scene.tweens.add({
          targets: this, x: this.x + 2, duration: 50, yoyo: true, repeat: 1,
        })
      }
    }

    // Idle pulse
    const t = this.scene.time.now * 0.004
    this.glow.setScale(1 + Math.sin(t) * 0.12)
    this.glow.setAlpha(near ? 0.85 : 0.45)

    this._syncDepth()
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    super.destroy(fromScene)
  }

  // ── Visuals ────────────────────────────────────────────────────────────────

  private _build(hint: string): void {
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 6, 58, 14, 0x000000, 0.18)

    // Faint footprint glow
    this.glow = new Phaser.GameObjects.Arc(this.scene, 0, 0, 30, 0, 360, false, 0xfff59d, 0.45)
    this.add(this.glow)

    this.gfx = new Phaser.GameObjects.Graphics(this.scene)
    this._draw()
    this.add(this.gfx)

    this.hintText = new Phaser.GameObjects.Text(
      this.scene, 0, -34, hint,
      { fontSize: '9px', fontStyle: 'bold', color: '#e0f7fa' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    this.hintText.setOrigin(0.5)
    this.add(this.hintText)

    this.priceText = new Phaser.GameObjects.Text(
      this.scene, 0, -18, `$${this.cost}`,
      { fontSize: '13px', fontStyle: 'bold', color: '#fff59d' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    this.priceText.setOrigin(0.5)
    this.add(this.priceText)
  }

  private _draw(): void {
    const g = this.gfx
    g.clear()

    // Dashed footprint circle (8 dashes)
    g.lineStyle(2, 0xffd54f, 0.9)
    const radius = 26
    const dashes = 12
    for (let i = 0; i < dashes; i++) {
      const a0 = (i / dashes) * Math.PI * 2
      const a1 = a0 + (Math.PI * 2) / dashes * 0.55
      g.beginPath()
      g.arc(0, 0, radius, a0, a1, false)
      g.strokePath()
    }

    // Inner "+" plus sign as a buy indicator
    g.fillStyle(0xfff176, 0.95)
    g.fillRect(-1.5, -8, 3, 16)
    g.fillRect(-8, -1.5, 16, 3)
  }

  private _playBurst(): void {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const dot = this.scene.add
        .circle(this.x + Math.cos(ang) * 4, this.y + Math.sin(ang) * 4, 3, 0xfff59d, 1)
        .setDepth(this.y + 50)
      this.scene.tweens.add({
        targets:  dot,
        x:        this.x + Math.cos(ang) * 50,
        y:        this.y + Math.sin(ang) * 50,
        alpha:    0,
        duration: 500,
        ease:     'Quad.Out',
        onComplete: () => dot.destroy(),
      })
    }

    this.scene.tweens.add({
      targets:  this,
      scaleX:   1.2, scaleY: 1.2,
      alpha:    0,
      duration: 240,
      ease:     'Quad.In',
      onComplete: () => this.destroy(),
    })
  }

  private _syncDepth(): void {
    this.setDepth(this.y + 2)
    this.shadowObj.setDepth(this.y - 1)
  }
}
