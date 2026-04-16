import Phaser from 'phaser'
import { UPGRADES } from '../config/upgrades'
import { EconomySystem } from '../systems/EconomySystem'
import { EventBus } from '../systems/EventBus'

// All sizes are 2× the original 480×854 design (canvas is now 960×1708).
const PANEL_W  = 480
const ROW_H    = 56
const PAD      = 24

/**
 * InfoPanel — top-left overlay showing all purchased upgrades and worker count.
 * Toggled by clicking the ⓘ button in the top-left corner.
 */
export class InfoPanel {
  private scene:   Phaser.Scene
  private panel:   Phaser.GameObjects.Container
  private btn:     Phaser.GameObjects.Container
  private content: Phaser.GameObjects.Container
  private bg:      Phaser.GameObjects.Rectangle
  private visible  = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    // ── Info button (top-left) ─────────────────────────────────────────────
    this.btn = scene.add.container(16, 16).setDepth(10001)

    const btnBg = scene.add
      .circle(32, 32, 32, 0x000000, 0.55)
      .setStrokeStyle(3, 0xffd600, 0.5)
    this.btn.add(btnBg)

    const btnLabel = scene.add
      .text(32, 32, 'i', {
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#FFD600',
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5)
    this.btn.add(btnLabel)

    btnBg.setInteractive({ useHandCursor: true })
    btnBg.on('pointerdown', () => this._toggle())
    btnBg.on('pointerover', () => {
      scene.tweens.add({ targets: this.btn, scaleX: 1.15, scaleY: 1.15, duration: 80, ease: 'Back.Out' })
    })
    btnBg.on('pointerout', () => {
      scene.tweens.add({ targets: this.btn, scaleX: 1, scaleY: 1, duration: 80 })
    })

    // ── Panel ──────────────────────────────────────────────────────────────
    this.panel = scene.add.container(-PANEL_W, 0).setDepth(10000)

    this.bg = scene.add
      .rectangle(0, 0, PANEL_W, 400 /* resized in _rebuild */, 0x1a1a1a, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(4, 0xffd600, 0.4)
    this.panel.add(this.bg)

    // Header
    const headerBg = scene.add
      .rectangle(0, 0, PANEL_W, 80, 0x111111, 0.95)
      .setOrigin(0, 0)
    this.panel.add(headerBg)

    this.panel.add(
      scene.add
        .text(PANEL_W / 2, 40, 'STATS & UPGRADES', {
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#ffd600',
        } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(0.5),
    )

    const rule = scene.add
      .rectangle(PAD, 80, PANEL_W - PAD * 2, 2, 0xffd600, 0.3)
      .setOrigin(0, 0)
    this.panel.add(rule)

    // Scrollable content container
    this.content = scene.add.container(0, 96)
    this.panel.add(this.content)

    // Close on click outside
    scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.visible) return
      const px = ptr.x
      const py = ptr.y
      const panelX = this.panel.x
      const panelH = this.bg.height
      const inPanel = px >= panelX && px <= panelX + PANEL_W && py >= 0 && py <= panelH
      const inBtn   = px >= 16 && px <= 80 && py >= 16 && py <= 80
      if (!inPanel && !inBtn) this._close()
    })

    // Refresh when upgrades are purchased
    EventBus.on('economy:changed',  () => { if (this.visible) this._rebuild() })
    EventBus.on('upgrade:bought',   () => { if (this.visible) this._rebuild() })
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _toggle(): void {
    if (this.visible) this._close()
    else              this._open()
  }

  private _open(): void {
    if (this.visible) return
    this.visible = true
    this._rebuild()
    this.scene.tweens.add({
      targets: this.panel, x: 0,
      duration: 220, ease: 'Quad.Out',
    })
  }

  private _close(): void {
    if (!this.visible) return
    this.visible = false
    this.scene.tweens.add({
      targets: this.panel, x: -PANEL_W,
      duration: 180, ease: 'Quad.In',
    })
  }

  private _rebuild(): void {
    this.content.removeAll(true)

    const rows: { label: string; value: string; color: string }[] = []

    // ── Workers ──────────────────────────────────────────────────────────
    const workerCount = ['worker_1', 'worker_2', 'worker_3'].filter((id) =>
      EconomySystem.purchased.has(id),
    ).length

    rows.push({
      label: 'Workers hired',
      value: `${workerCount}`,
      color: workerCount > 0 ? '#80cbc4' : '#78909c',
    })

    // ── Purchased upgrades ────────────────────────────────────────────────
    const bought = UPGRADES.filter((u) => EconomySystem.purchased.has(u.id))

    if (bought.length === 0) {
      rows.push({ label: 'No upgrades yet', value: '', color: '#78909c' })
    } else {
      // Section divider label
      const divY = rows.length * ROW_H + 8
      this.content.add(
        this.scene.add
          .text(PAD, divY, 'PURCHASED UPGRADES', {
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#ffd600',
          } as Phaser.Types.GameObjects.Text.TextStyle),
      )

      for (const u of bought) {
        rows.push({
          label: this._formatLabel(u),
          value: `✓`,
          color: '#a5d6a7',
        })
      }
    }

    // Render rows
    rows.forEach((row, i) => {
      const y = i * ROW_H + (bought.length > 0 && i > 0 ? 36 : 0)

      // Alternating row bg
      if (i % 2 === 0) {
        this.content.add(
          this.scene.add
            .rectangle(0, y, PANEL_W, ROW_H, 0xffffff, 0.03)
            .setOrigin(0, 0),
        )
      }

      this.content.add(
        this.scene.add
          .text(PAD, y + ROW_H / 2, row.label, {
            fontSize: '24px',
            color: row.color,
          } as Phaser.Types.GameObjects.Text.TextStyle)
          .setOrigin(0, 0.5),
      )

      if (row.value) {
        this.content.add(
          this.scene.add
            .text(PANEL_W - PAD, y + ROW_H / 2, row.value, {
              fontSize: '24px',
              fontStyle: 'bold',
              color: row.color,
            } as Phaser.Types.GameObjects.Text.TextStyle)
            .setOrigin(1, 0.5),
        )
      }
    })

    // Resize panel bg to fit content
    const contentH = rows.length * ROW_H + (bought.length > 0 ? 36 : 0) + 32
    this.bg.height = 96 + contentH
  }

  private _formatLabel(u: (typeof UPGRADES)[0]): string {
    const who = u.target === 'worker' ? 'Worker' : 'Player'
    switch (u.stat) {
      case 'maxStack': return `${who} stack → ${u.value}`
      case 'speed':    return `${who} speed → ${u.value}`
      case 'unlock':   return 'Worker hired'
      default:         return `${u.stat} → ${u.value}`
    }
  }
}
