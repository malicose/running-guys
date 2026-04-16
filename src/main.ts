import Phaser from 'phaser'
import { Boot } from './scenes/Boot'
import { Game } from './scenes/Game'
import { UI } from './scenes/UI'

/**
 * Entry point.
 * Portrait 9:16 — matches mobile-first casual genre target.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,          // WebGL → Canvas fallback
  // 2× the logical viewport so the canvas has enough pixels to render
  // crisply on retina / HiDPI displays.  All scene cameras use setZoom(2)
  // so the visible world area stays identical to the original 480 × 854.
  width: 960,
  height: 1708,
  backgroundColor: '#1565c0',
  parent: 'game',

  input: {
    activePointers: 3,   // multi-touch: joystick + tap elsewhere
  },

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,           // flip to true to see hitboxes
    },
  },

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  render: {
    antialias: true,
    pixelArt: false,
  },

  // Boot → Game (world) + UI (HUD, joystick)
  scene: [Boot, Game, UI],
}

new Phaser.Game(config)
