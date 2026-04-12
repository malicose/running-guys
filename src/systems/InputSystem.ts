import Phaser from 'phaser'
import type { Joystick } from '../ui/Joystick'

export interface Direction {
  x: number   // -1 … 1
  y: number   // -1 … 1
}

/**
 * InputSystem — single source of truth for the player movement vector.
 *
 * Priority (highest → lowest):
 *   1. Virtual joystick (if active)
 *   2. WASD keys
 *   3. Arrow keys
 *
 * Output is always a normalised vector so diagonal speed equals cardinal speed.
 */
export class InputSystem {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd: {
    up:    Phaser.Input.Keyboard.Key
    down:  Phaser.Input.Keyboard.Key
    left:  Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }

  // Injected lazily — may be null until UI scene initialises
  joystick: Joystick | null = null

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!
    this.cursors = kb.createCursorKeys()
    this.wasd = {
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
  }

  /** Returns a normalised direction vector for the current frame. */
  getDirection(): Direction {
    // ── Virtual joystick (takes priority when touched) ────────────────────
    if (this.joystick?.active) {
      return { x: this.joystick.x, y: this.joystick.y }
    }

    // ── Keyboard ──────────────────────────────────────────────────────────
    let x = 0
    let y = 0

    if (this.cursors.left.isDown  || this.wasd.left.isDown)  x -= 1
    if (this.cursors.right.isDown || this.wasd.right.isDown) x += 1
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    y -= 1
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  y += 1

    // Normalise diagonal
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2
      x *= inv
      y *= inv
    }

    return { x, y }
  }
}
