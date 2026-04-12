import Phaser from 'phaser'
import { ITEMS } from '../config/items'
import { EventBus } from './EventBus'
import type { ItemId } from '../types'
import type { Player } from '../entities/Player'

const ITEM_SIZE    = 18   // px, square face
const ITEM_SPACING = 20   // px between item centres
const STACK_ANCHOR_Y = 28 // px above player centre (pseudo-3D "back")
const SWAY_FACTOR  = 0.0018  // velocity → angle (radians)
const SWAY_MAX     = 0.42    // cap ±radians
const CHAIN_SPEED  = 9       // lerp speed per second for chain propagation

/** Runtime data for one item in the stack */
interface StackItemView {
  id:    ItemId
  gfx:   Phaser.GameObjects.Container
  angle: number   // current chain angle (radians, 0 = straight up)
}

/**
 * StackSystem — the most important visual in the game.
 *
 * Items are colored squares that form a vertical tower behind the player.
 * Chain physics: each item follows the one below it with a spring-like lag,
 * creating a satisfying swaying motion when the player moves.
 *
 * Pseudo-3D box appearance: lighter "top face" + main "front face" per item.
 */
export class StackSystem {
  private scene: Phaser.Scene
  private player: Player
  private items: StackItemView[] = []

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene  = scene
    this.player = player
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get size(): number { return this.items.length }

  canAccept(maxStack: number): boolean { return this.items.length < maxStack }

  peekTop(): ItemId | null {
    return this.items.length ? this.items[this.items.length - 1].id : null
  }

  addItem(itemId: ItemId): void {
    const def = ITEMS[itemId]
    if (!def) return

    const gfx = this._buildItemGfx(def.color)
    // Inherit the current bottom angle so new items don't teleport
    const inheritAngle = this.items.length ? this.items[this.items.length - 1].angle : 0
    this.items.push({ id: itemId, gfx, angle: inheritAngle })

    // Pop-in from below
    gfx.setScale(0.1)
    this.scene.tweens.add({
      targets: gfx,
      scaleX: 1, scaleY: 1,
      duration: 180,
      ease: 'Back.Out',
    })

    EventBus.emit('stack:changed', { size: this.items.length, max: this.player.maxStack })
  }

  /** Remove & return the top item id. Returns null if empty. */
  removeTopItem(): ItemId | null {
    if (!this.items.length) return null
    const item = this.items.pop()!

    this.scene.tweens.add({
      targets:    item.gfx,
      scaleX:     0,
      scaleY:     0,
      alpha:      0,
      duration:   120,
      ease:       'Quad.In',
      onComplete: () => item.gfx.destroy(),
    })

    EventBus.emit('stack:changed', { size: this.items.length, max: this.player.maxStack })
    return item.id
  }

  /** Flash the top item red (stack-full warning) */
  flashFull(): void {
    if (!this.items.length) return
    const top = this.items[this.items.length - 1].gfx
    this.scene.tweens.add({
      targets:  top,
      alpha:    0.2,
      duration: 60,
      yoyo:     true,
      repeat:   2,
    })
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(delta: number): void {
    if (!this.items.length) return

    const dt  = delta / 1000
    const vel = this.player.body.velocity

    // Target sway for the bottom link (driven by horizontal velocity)
    const swayTarget = Phaser.Math.Clamp(vel.x * SWAY_FACTOR, -SWAY_MAX, SWAY_MAX)

    // Propagate chain angles: bottom link follows player, each link follows the one below
    for (let i = 0; i < this.items.length; i++) {
      const upstream = i === 0 ? swayTarget : this.items[i - 1].angle
      this.items[i].angle += (upstream - this.items[i].angle) * CHAIN_SPEED * dt
    }

    // Position items: each link hangs from the previous one
    let px = this.player.x
    let py = this.player.y - STACK_ANCHOR_Y   // anchor = player's upper back

    for (let i = 0; i < this.items.length; i++) {
      const a = this.items[i].angle
      px = px + Math.sin(a) * ITEM_SPACING
      py = py - Math.cos(a) * ITEM_SPACING

      this.items[i].gfx.setPosition(px, py)
      this.items[i].gfx.setRotation(a)

      // Render behind player — depth is slightly below player's own depth
      this.items[i].gfx.setDepth(this.player.y - 1 - i * 0.01)
    }
  }

  destroy(): void {
    for (const item of this.items) item.gfx.destroy()
    this.items = []
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Builds a pseudo-3D box graphic for one stack item.
   * Top face: lighter, slightly narrower.
   * Front face: main color, full width.
   */
  private _buildItemGfx(color: number): Phaser.GameObjects.Container {
    const lighter = Phaser.Display.Color.IntegerToColor(color)
    lighter.brighten(25)
    const topColor = lighter.color

    const darker = Phaser.Display.Color.IntegerToColor(color)
    darker.darken(20)
    const sideColor = darker.color

    const g = new Phaser.GameObjects.Graphics(this.scene)

    // Right side face (depth illusion)
    g.fillStyle(sideColor)
    g.fillRect(ITEM_SIZE / 2 - 1, -ITEM_SIZE / 2 + 3, 4, ITEM_SIZE - 3)

    // Front face
    g.fillStyle(color)
    g.fillRect(-ITEM_SIZE / 2, -ITEM_SIZE / 2 + 4, ITEM_SIZE, ITEM_SIZE - 4)

    // Top face (slightly narrower, lighter)
    g.fillStyle(topColor)
    g.fillRect(-ITEM_SIZE / 2, -ITEM_SIZE / 2, ITEM_SIZE - 1, 6)

    // Outline
    g.lineStyle(1, 0x000000, 0.25)
    g.strokeRect(-ITEM_SIZE / 2, -ITEM_SIZE / 2, ITEM_SIZE, ITEM_SIZE)

    const container = this.scene.add.container(0, 0, [g])
    return container
  }
}
