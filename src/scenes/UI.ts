import Phaser from 'phaser'
import { Joystick } from '../ui/Joystick'
import { UpgradeMenu } from '../ui/UpgradeMenu'
import { EventBus } from '../systems/EventBus'

/**
 * UI scene — always on top, separate camera (never scrolls).
 * Renders HUD: money counter, virtual joystick, upgrade menu.
 *
 * Game scene accesses this.joystick to inject it into InputSystem.
 */
export class UI extends Phaser.Scene {
  /** Exposed so Game scene can inject it into InputSystem */
  joystick!: Joystick

  private moneyText!: Phaser.GameObjects.Text
  private money = 0

  /** Kept as a field so the menu's event subscriptions stay alive for the scene lifetime. */
  private upgradeMenu!: UpgradeMenu

  constructor() {
    super({ key: 'UI' })
  }

  create(): void {
    const { width } = this.scale

    // ── Money display ────────────────────────────────────────────────────────
    this.add
      .rectangle(width - 8, 8, 128, 36, 0x000000, 0.45)
      .setOrigin(1, 0)
      .setStrokeStyle(1, 0xffd600, 0.3)

    this.moneyText = this.add
      .text(width - 18, 26, '$0', {
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#FFD600',
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(1, 0.5)

    // ── Virtual joystick ─────────────────────────────────────────────────────
    this.joystick = new Joystick(this)

    // ── Upgrade menu (slide-in panel on the right) ───────────────────────────
    this.upgradeMenu = new UpgradeMenu(this)

    // ── EventBus listeners ───────────────────────────────────────────────────
    // Money HUD now reads from the authoritative EconomySystem balance.
    EventBus.on('economy:changed', ({ balance }) => {
      this.money = balance
      this._refreshMoney()
    })
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _refreshMoney(): void {
    this.moneyText.setText(`$${this.money}`)

    // Brief scale pop on collect
    this.tweens.add({
      targets: this.moneyText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 80,
      yoyo: true,
      ease: 'Back.Out',
    })
  }
}
