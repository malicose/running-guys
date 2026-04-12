import Phaser from 'phaser'
import { UPGRADES } from '../config/upgrades'
import { EconomySystem } from '../systems/EconomySystem'
import { EventBus } from '../systems/EventBus'
import type { UpgradeDef } from '../types'

const PANEL_W  = 230
const CARD_H   = 68
const CARD_PAD = 10

/**
 * UpgradeMenu — UI-scene panel that slides in from the right when the player
 * is near an UpgradeBoard, and lists purchasable upgrades as cards.
 *
 * Each card: stat label → new value, cost, buy button.
 * Clicking buy calls EconomySystem.tryPurchase(). On success we rebuild.
 *
 * Rendered inside the UI scene so it's always on top and never scrolls.
 */
export class UpgradeMenu {
  private scene:   Phaser.Scene
  private root:    Phaser.GameObjects.Container
  private cardsRoot: Phaser.GameObjects.Container
  private visible = false

  private hiddenX: number
  private shownX:  number

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    const { height, width } = scene.scale

    this.hiddenX = width
    this.shownX  = width - PANEL_W

    this.root = scene.add.container(this.hiddenX, 0)
    this.root.setDepth(10000)

    // Panel background
    const bg = scene.add
      .rectangle(0, 0, PANEL_W, height, 0x1a1a1a, 0.88)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffd54f, 0.5)
    this.root.add(bg)

    // Header
    const title = scene.add
      .text(PANEL_W / 2, 22, 'UPGRADES', {
        fontSize: '18px', fontStyle: 'bold', color: '#ffd54f',
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5)
    this.root.add(title)

    const rule = scene.add
      .rectangle(CARD_PAD, 44, PANEL_W - CARD_PAD * 2, 1, 0xffd54f, 0.4)
      .setOrigin(0, 0)
    this.root.add(rule)

    // Cards root — rebuilt when state changes
    this.cardsRoot = scene.add.container(0, 56)
    this.root.add(this.cardsRoot)

    this._rebuildCards()

    // Listen for proximity from UpgradeBoard
    EventBus.on('upgradeboard:proximity', ({ near }) => {
      if (near) this.show()
      else      this.hide()
    })

    // Refresh on balance / purchase changes
    EventBus.on('economy:changed', () => this._rebuildCards())
    EventBus.on('upgrade:bought',  () => this._rebuildCards())

    // Re-layout on resize
    scene.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.hiddenX = gameSize.width
      this.shownX  = gameSize.width - PANEL_W
      this.root.x  = this.visible ? this.shownX : this.hiddenX
      // Resize backdrop height
      ;(bg as Phaser.GameObjects.Rectangle).height = gameSize.height
    })
  }

  show(): void {
    if (this.visible) return
    this.visible = true
    this._rebuildCards()
    this.scene.tweens.add({
      targets: this.root, x: this.shownX,
      duration: 220, ease: 'Quad.Out',
    })
  }

  hide(): void {
    if (!this.visible) return
    this.visible = false
    this.scene.tweens.add({
      targets: this.root, x: this.hiddenX,
      duration: 180, ease: 'Quad.In',
    })
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _rebuildCards(): void {
    // Clear existing cards
    this.cardsRoot.removeAll(true)

    // Show upgrades whose prerequisite is satisfied AND that are not yet
    // owned. Hiding owned ones keeps the panel from overflowing as the
    // upgrade tree grows.
    const visible = UPGRADES.filter((u) => {
      if (EconomySystem.purchased.has(u.id)) return false
      if (u.prerequisite && !EconomySystem.purchased.has(u.prerequisite)) return false
      return true
    })

    visible.forEach((u, idx) => {
      this.cardsRoot.add(this._buildCard(u, idx))
    })
  }

  private _buildCard(u: UpgradeDef, index: number): Phaser.GameObjects.Container {
    const y = index * (CARD_H + 8) + CARD_PAD
    const card = this.scene.add.container(CARD_PAD, y)

    const affordable = EconomySystem.canAfford(u.id)

    // Card bg
    const bgColor = affordable ? 0x2e7d32 : 0x263238
    const bg = this.scene.add
      .rectangle(0, 0, PANEL_W - CARD_PAD * 2, CARD_H, bgColor, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffd54f, 0.4)
    card.add(bg)

    // Title — stat: value
    const title = this._formatTitle(u)
    card.add(
      this.scene.add
        .text(8, 6, title, {
          fontSize: '13px', fontStyle: 'bold', color: '#ffffff',
        } as Phaser.Types.GameObjects.Text.TextStyle),
    )

    // Subtitle — id (small, for debug/flavor)
    card.add(
      this.scene.add
        .text(8, 24, u.id, {
          fontSize: '9px', color: '#b0bec5',
        } as Phaser.Types.GameObjects.Text.TextStyle),
    )

    // Cost
    card.add(
      this.scene.add
        .text(8, 42, `$${u.cost}`, {
          fontSize: '14px', fontStyle: 'bold',
          color: affordable ? '#ffd54f' : '#ef9a9a',
        } as Phaser.Types.GameObjects.Text.TextStyle),
    )

    // BUY button
    const btnW = 66
    const btnH = 26
    const btnX = PANEL_W - CARD_PAD * 2 - btnW - 8
    const btnY = CARD_H / 2 - btnH / 2

    const btnColor = affordable ? 0xffd54f : 0x546e7a
    const btn = this.scene.add
      .rectangle(btnX, btnY, btnW, btnH, btnColor, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x000000, 0.4)
    card.add(btn)

    card.add(
      this.scene.add
        .text(btnX + btnW / 2, btnY + btnH / 2, 'BUY', {
          fontSize: '13px', fontStyle: 'bold',
          color: affordable ? '#1b5e20' : '#90a4ae',
        } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(0.5),
    )

    if (affordable) {
      btn.setInteractive({ useHandCursor: true })
      btn.on('pointerdown', () => {
        if (EconomySystem.tryPurchase(u.id)) {
          this._flashPurchase(card)
        }
      })
    }

    return card
  }

  private _formatTitle(u: UpgradeDef): string {
    const who = u.target === 'worker' ? 'Worker' : 'Player'
    switch (u.stat) {
      case 'maxStack': return `${who} stack → ${u.value}`
      case 'speed':    return `${who} speed → ${u.value}`
      case 'unlock':   return u.target === 'worker' ? 'Hire Worker' : 'Unlock'
      default:         return `${u.stat} → ${u.value}`
    }
  }

  private _flashPurchase(card: Phaser.GameObjects.Container): void {
    this.scene.tweens.add({
      targets: card, scaleX: 1.05, scaleY: 1.05,
      duration: 120, yoyo: true, ease: 'Back.Out',
    })
  }
}
