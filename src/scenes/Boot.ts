import Phaser from 'phaser'

/**
 * Boot scene — loads all assets, then launches Game + UI.
 *
 * In the prototype we use programmatically-drawn shapes instead of
 * sprite sheets, so this scene is minimal. Swap in real assets here
 * when art is ready.
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  preload(): void {
    // ── Loading bar ──────────────────────────────────────────────────────────
    const { width, height } = this.scale

    const barBg = this.add.rectangle(width / 2, height / 2, 300, 20, 0x333333)
    const bar   = this.add.rectangle(width / 2 - 150, height / 2, 0, 16, 0x4caf50)
    bar.setOrigin(0, 0.5)

    this.load.on('progress', (value: number) => {
      bar.width = 300 * value
    })

    // No external assets in prototype — programmatic graphics only.
    // Future: load tilemaps, sprite sheets, audio here.
  }

  create(): void {
    this.scene.start('Game')
    this.scene.launch('UI')
  }
}
