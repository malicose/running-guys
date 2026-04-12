import Phaser from 'phaser'
import { ITEMS } from '../config/items'
import type { ItemId } from '../types'

/**
 * Item icon registry — per-item drawing functions used wherever an item is
 * rendered as a small icon (player stack, worker mini-stack, station
 * input/output trays, shop counter stock display).
 *
 * All drawers render into the local frame of the passed `Graphics`,
 * centered at (0,0) and (loosely) bounded by `size × size`. Use the same
 * drawer everywhere so a coconut always looks like a coconut, not a beige
 * box on the player and a brown circle on the tree.
 *
 * Drawers are intentionally tiny — the icons are 12-20 px on screen so
 * detail beyond a few shapes gets lost.
 */

type Drawer = (g: Phaser.GameObjects.Graphics, size: number) => void

const drawers: Partial<Record<ItemId, Drawer>> = {
  // ── Raw materials ────────────────────────────────────────────────────────

  coconut: (g, s) => {
    const r = s * 0.42
    // Ground shadow side
    g.fillStyle(0x3e1f08)
    g.fillCircle(0, r * 0.15, r)
    // Body
    g.fillStyle(0x6f4421)
    g.fillCircle(0, 0, r)
    // Top-left highlight (sun)
    g.fillStyle(0xa6764a, 0.95)
    g.fillCircle(-r * 0.35, -r * 0.35, r * 0.45)
    // Three dark "eyes"
    g.fillStyle(0x2b1505)
    g.fillCircle(-r * 0.18, -r * 0.05, r * 0.12)
    g.fillCircle( r * 0.20, -r * 0.10, r * 0.12)
    g.fillCircle( 0,         r * 0.20, r * 0.10)
  },

  fish: (g, s) => {
    const w = s * 0.55
    const h = s * 0.32
    // Body shadow
    g.fillStyle(0x0277bd)
    g.fillEllipse(2, 2, w * 2, h * 2)
    // Body
    g.fillStyle(0x4fc3f7)
    g.fillEllipse(0, 0, w * 2, h * 2)
    // Belly highlight
    g.fillStyle(0xb3e5fc, 0.9)
    g.fillEllipse(-w * 0.2, -h * 0.4, w * 1.0, h * 0.7)
    // Tail
    g.fillStyle(0x0288d1)
    g.fillTriangle(-w, 0, -w * 1.6, -h * 0.9, -w * 1.6, h * 0.9)
    // Eye
    g.fillStyle(0xffffff)
    g.fillCircle(w * 0.45, -h * 0.15, h * 0.28)
    g.fillStyle(0x111111)
    g.fillCircle(w * 0.50, -h * 0.15, h * 0.15)
  },

  sugarcane: (g, s) => {
    // Vertical green stalk with darker bands
    const w = s * 0.28
    const h = s * 0.85
    // Side shadow
    g.fillStyle(0x1b5e20)
    g.fillRect(-w / 2 + 1, -h / 2, w, h)
    // Body
    g.fillStyle(0x66bb6a)
    g.fillRect(-w / 2, -h / 2, w, h)
    // Highlight
    g.fillStyle(0x9ccc65, 0.9)
    g.fillRect(-w / 2, -h / 2, 1.5, h)
    // Bands
    g.fillStyle(0x2e7d32)
    for (let y = -h / 2 + 3; y < h / 2; y += 4) {
      g.fillRect(-w / 2, y, w, 1)
    }
    // Tiny top leaves
    g.fillStyle(0x8bc34a)
    g.fillTriangle(-w * 0.5, -h / 2, -w * 1.4, -h / 2 - 3, -w * 0.1, -h / 2 - 1)
    g.fillTriangle( w * 0.5, -h / 2,  w * 1.4, -h / 2 - 3,  w * 0.1, -h / 2 - 1)
  },

  pineapple: (g, s) => {
    const w = s * 0.42
    const h = s * 0.46
    // Side shadow
    g.fillStyle(0xc56000)
    g.fillEllipse(1, 2, w * 2, h * 2)
    // Body
    g.fillStyle(0xff9800)
    g.fillEllipse(0, 1, w * 2, h * 2)
    // Highlight
    g.fillStyle(0xffcc80, 0.85)
    g.fillEllipse(-w * 0.3, -h * 0.2, w * 0.8, h * 0.6)
    // Diamond cross-hatch (suggestion of texture)
    g.lineStyle(0.8, 0x6d3500, 0.7)
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo(-w * 0.7, i * h * 0.35)
      g.lineTo( w * 0.7, i * h * 0.35); g.strokePath()
    }
    // Crown leaves
    g.fillStyle(0x2e7d32)
    g.fillTriangle(-w * 0.4, -h, -w * 0.1, -h * 1.7,  0,        -h * 0.85)
    g.fillTriangle(-w * 0.1, -h * 0.85,   w * 0.2, -h * 1.85,  w * 0.4, -h * 0.85)
    g.fillStyle(0x4caf50)
    g.fillTriangle( 0, -h * 0.85, w * 0.1, -h * 1.5, w * 0.25, -h * 0.85)
  },

  // ── Processed goods ──────────────────────────────────────────────────────

  coconut_milk: (g, s) => {
    // Glass / tumbler with cream liquid
    const w = s * 0.42
    const h = s * 0.55
    // Shadow side
    g.fillStyle(0x9e9e9e, 0.6)
    g.fillRoundedRect(-w + 1, -h + 1, w * 2, h * 2, 3)
    // Glass body
    g.fillStyle(0xeceff1)
    g.fillRoundedRect(-w, -h, w * 2, h * 2, 3)
    // Liquid inside
    g.fillStyle(0xfff8dc)
    g.fillRoundedRect(-w + 1.5, -h * 0.4, w * 2 - 3, h * 1.4, 2)
    // Foam top
    g.fillStyle(0xffffff)
    g.fillEllipse(0, -h * 0.4, w * 1.7, 4)
    // Glass highlight
    g.fillStyle(0xffffff, 0.6)
    g.fillRect(-w + 2, -h * 0.6, 2, h * 1.2)
  },

  grilled_fish: (g, s) => {
    const w = s * 0.55
    const h = s * 0.32
    // Body shadow
    g.fillStyle(0xb33000)
    g.fillEllipse(2, 2, w * 2, h * 2)
    // Body
    g.fillStyle(0xff8c42)
    g.fillEllipse(0, 0, w * 2, h * 2)
    // Belly
    g.fillStyle(0xffb74d, 0.9)
    g.fillEllipse(-w * 0.2, -h * 0.3, w * 1.0, h * 0.6)
    // Grill marks (dark stripes)
    g.lineStyle(1, 0x4e2c00, 0.8)
    g.beginPath(); g.moveTo(-w * 0.5, -h * 0.8); g.lineTo(-w * 0.2, h * 0.8); g.strokePath()
    g.beginPath(); g.moveTo( w * 0.0, -h * 0.8); g.lineTo( w * 0.3, h * 0.8); g.strokePath()
    // Tail
    g.fillStyle(0xc04200)
    g.fillTriangle(-w, 0, -w * 1.6, -h * 0.9, -w * 1.6, h * 0.9)
    // Eye
    g.fillStyle(0xffffff)
    g.fillCircle(w * 0.45, -h * 0.15, h * 0.28)
    g.fillStyle(0x111111)
    g.fillCircle(w * 0.50, -h * 0.15, h * 0.15)
  },

  sugar: (g, s) => {
    // Cube of sugar with highlight (top-left lit)
    const half = s * 0.34
    // Shadow
    g.fillStyle(0xbdbdbd)
    g.fillRect(-half + 1, -half + 1, half * 2, half * 2)
    // Top face
    g.fillStyle(0xffffff)
    g.fillRect(-half, -half, half * 2, half * 2)
    // Right side shading
    g.fillStyle(0xeeeeee)
    g.fillRect(half - 3, -half, 3, half * 2)
    // Top edge highlight
    g.fillStyle(0xffffff, 0.95)
    g.fillRect(-half, -half, half * 2, 2)
    // Crystal facet lines
    g.lineStyle(0.7, 0xb0bec5, 0.8)
    g.strokeRect(-half, -half, half * 2, half * 2)
    g.beginPath(); g.moveTo(-half, 0); g.lineTo(half, 0); g.strokePath()
  },

  pineapple_juice: (g, s) => {
    // Tall yellow drink
    const w = s * 0.38
    const h = s * 0.55
    // Shadow side
    g.fillStyle(0x9e9e9e, 0.6)
    g.fillRoundedRect(-w + 1, -h + 1, w * 2, h * 2, 3)
    // Glass
    g.fillStyle(0xeceff1)
    g.fillRoundedRect(-w, -h, w * 2, h * 2, 3)
    // Juice
    g.fillStyle(0xffd54f)
    g.fillRoundedRect(-w + 1.5, -h * 0.45, w * 2 - 3, h * 1.45, 2)
    // Foam
    g.fillStyle(0xfff59d)
    g.fillEllipse(0, -h * 0.45, w * 1.6, 3)
    // Highlight
    g.fillStyle(0xffffff, 0.55)
    g.fillRect(-w + 2, -h * 0.55, 1.5, h * 1.1)
    // Tiny straw
    g.fillStyle(0xff5252)
    g.fillRect(w * 0.3, -h * 1.1, 1.5, h * 0.7)
  },

  cocktail: (g, s) => {
    // Martini glass with pink drink, olive, straw
    const r = s * 0.5
    // Bowl outline
    g.fillStyle(0xeceff1)
    g.fillTriangle(-r, -r * 0.5, r, -r * 0.5, 0, r * 0.4)
    // Pink liquid (slightly inset)
    g.fillStyle(0xff4081)
    g.fillTriangle(-r * 0.85, -r * 0.4, r * 0.85, -r * 0.4, 0, r * 0.3)
    // Pink highlight
    g.fillStyle(0xff80ab, 0.85)
    g.fillTriangle(-r * 0.6, -r * 0.35, -r * 0.1, -r * 0.35, -r * 0.35, 0)
    // Stem
    g.fillStyle(0xeceff1)
    g.fillRect(-1, r * 0.3, 2, r * 0.55)
    // Base
    g.fillRect(-r * 0.4, r * 0.85, r * 0.8, 1.5)
    // Olive on a stick
    g.fillStyle(0xfff176)
    g.fillRect(r * 0.15, -r * 0.9, 1, r * 0.6)
    g.fillStyle(0x33691e)
    g.fillCircle(r * 0.18, -r * 0.95, 1.8)
  },
}

/**
 * Draws an item icon into a Graphics. If the item has no custom drawer it
 * falls back to a generic pseudo-3D box using the item's `color`.
 */
export function drawItemIcon(g: Phaser.GameObjects.Graphics, itemId: ItemId, size: number): void {
  g.clear()
  const drawer = drawers[itemId]
  if (drawer) {
    drawer(g, size)
    return
  }
  _drawDefaultBox(g, ITEMS[itemId]?.color ?? 0xffffff, size)
}

function _drawDefaultBox(g: Phaser.GameObjects.Graphics, color: number, size: number): void {
  const lighter = Phaser.Display.Color.IntegerToColor(color); lighter.brighten(25)
  const darker  = Phaser.Display.Color.IntegerToColor(color); darker.darken(20)
  // Side
  g.fillStyle(darker.color)
  g.fillRect(size / 2 - 1, -size / 2 + 3, 4, size - 3)
  // Front
  g.fillStyle(color)
  g.fillRect(-size / 2, -size / 2 + 4, size, size - 4)
  // Top
  g.fillStyle(lighter.color)
  g.fillRect(-size / 2, -size / 2, size - 1, 6)
  // Outline
  g.lineStyle(1, 0x000000, 0.25)
  g.strokeRect(-size / 2, -size / 2, size, size)
}
