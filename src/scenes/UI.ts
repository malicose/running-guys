import Phaser from 'phaser'
import { Joystick } from '../ui/Joystick'
import { UpgradeMenu } from '../ui/UpgradeMenu'
import { InfoPanel } from '../ui/InfoPanel'
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
  private infoPanel!:   InfoPanel

  constructor() {
    super({ key: 'UI' })
  }

  create(): void {
    // UI camera uses the full canvas coordinate space (960×1708).
    // No zoom — elements are positioned in 0–960 × 0–1708 scene space.
    const width  = this.scale.width    // 960
    const height = this.scale.height   // 1708
    void height   // used by future layout code

    // ── Money display ────────────────────────────────────────────────────────
    // All sizes are 2× the original 480×854 design (canvas is now 960×1708).
    this.add
      .rectangle(width - 16, 16, 256, 72, 0x000000, 0.45)
      .setOrigin(1, 0)
      .setStrokeStyle(2, 0xffd600, 0.3)

    this.moneyText = this.add
      .text(width - 36, 52, '$0', {
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#FFD600',
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(1, 0.5)

    // ── Virtual joystick ─────────────────────────────────────────────────────
    this.joystick = new Joystick(this)

    // ── Upgrade menu (slide-in panel on the right) ───────────────────────────
    this.upgradeMenu = new UpgradeMenu(this)

    // ── Info panel (slide-in from left, toggled by ⓘ button) ─────────────
    this.infoPanel = new InfoPanel(this)

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
