import Phaser from 'phaser'

/**
 * Virtual joystick wrapper around Rex VirtualJoystick Plugin.
 *
 * Lives in the UI scene (separate camera, never scrolls) so it always
 * appears fixed in the bottom-left regardless of the game camera.
 *
 * Touch zone: an invisible rectangle covering the left 40 % of the screen.
 * Touching anywhere in that zone activates the joystick and repositions
 * the base to the touch point (dynamic / "floating" joystick).
 */
export class Joystick {
  private stick: any   // Rex VirtualJoystick instance

  // Normalised direction cached each frame by Rex
  get x(): number {
    const f: number = this.stick.force as number
    return f > 0 ? (this.stick.forceX as number) / (this.stick.radius as number) : 0
  }

  get y(): number {
    const f: number = this.stick.force as number
    return f > 0 ? (this.stick.forceY as number) / (this.stick.radius as number) : 0
  }

  get active(): boolean {
    return (this.stick.force as number) > 0
  }

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.scale

    // ── Visual parts (created in UI scene — fixed camera, no scrollFactor needed)
    const base = scene.add
      .circle(0, 0, 58, 0xffffff, 0.10)
      .setStrokeStyle(2, 0xffffff, 0.25)

    const thumb = scene.add
      .circle(0, 0, 26, 0xffffff, 0.45)
      .setStrokeStyle(2, 0xffffff, 0.6)

    // Default resting position
    const DEFAULT_X = 110
    const DEFAULT_Y = height - 140

    // ── Rex joystick
    const plugin = scene.plugins.get('rexVirtualJoystick') as any
    this.stick = plugin.add(scene, {
      x:        DEFAULT_X,
      y:        DEFAULT_Y,
      radius:   58,
      base,
      thumb,
      dir:      '8dir',
      forceMin: 10,
      enable:   true,
    })

    // ── Expand touch zone to left 40 % of screen
    // An invisible interactive rectangle; on pointerdown we move the joystick
    // base to the touch position before Rex picks it up.
    const zone = scene.add
      .rectangle(0, 0, width * 0.4, height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setInteractive()

    scene.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer) => {
        if (pointer.x < width * 0.4) {
          this.stick.setPosition(pointer.x, pointer.y)
        }
      },
    )

    // Reset base to default position after the finger lifts
    scene.input.on('pointerup', () => {
      scene.time.delayedCall(120, () => {
        this.stick.setPosition(DEFAULT_X, DEFAULT_Y)
      })
    })

    // Suppress pointer events leaking to game scene via the zone
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
    })
  }
}
