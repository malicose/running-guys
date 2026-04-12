import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { EventBus } from '../systems/EventBus'
import type { ResourceNodeType, ItemId } from '../types'
import type { StackSystem } from '../systems/StackSystem'
import type { Player } from './Player'

/** Which item each node type yields */
const NODE_YIELDS: Record<ResourceNodeType, ItemId> = {
  palm_tree:       'coconut',
  fishing_spot:    'fish',
  sugarcane_field: 'sugarcane',
  pineapple_bush:  'pineapple',
}

/**
 * ResourceNode — a harvestable world object (palm tree, fishing spot, …).
 *
 * Behaviour (all automatic, no button press):
 *  • Player enters interact radius → harvest timer starts
 *  • Every HARVEST_INTERVAL seconds → one item added to StackSystem
 *  • After NODE_MAX_ITEMS harvested → node depletes (wilted visual + timer)
 *  • After NODE_RESPAWN_TIME → node regrows (pop animation)
 *
 * Pseudo-3D: drop shadow + layered canopy graphics + Y-sort depth.
 *
 * The progress bar (separate scene rects, world space) shows above the node
 * only while actively harvesting, always rendered on top.
 */
export class ResourceNode extends Phaser.GameObjects.Container {
  readonly nodeType: ResourceNodeType
  readonly yieldsItem: ItemId

  private shadowObj!:  Phaser.GameObjects.Ellipse
  private treeGfx!:    Phaser.GameObjects.Graphics
  private pBarBg!:     Phaser.GameObjects.Rectangle   // progress bar background
  private pBarFill!:   Phaser.GameObjects.Rectangle   // progress bar fill

  private depleted     = false
  private remaining    = BALANCE.NODE_MAX_ITEMS
  private respawnTimer = 0
  private harvestTimer = 0
  private inRangePrev  = false

  // ── Construction ──────────────────────────────────────────────────────────

  constructor(scene: Phaser.Scene, x: number, y: number, type: ResourceNodeType) {
    super(scene, x, y)
    this.nodeType   = type
    this.yieldsItem = NODE_YIELDS[type]

    this._buildShadow()
    this._buildTree()
    this._buildProgressBar()

    scene.add.existing(this)
  }

  // ── Per-frame tick (called from Game.update) ───────────────────────────────

  tick(delta: number, player: Player, stack: StackSystem): void {
    const dt = delta / 1000

    if (this.depleted) {
      this.respawnTimer -= dt
      if (this.respawnTimer <= 0) this._respawn()
      this._hideProgressBar()
      this._syncDepth()
      return
    }

    const dist    = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
    const inRange = dist < BALANCE.PLAYER_INTERACT_RADIUS + 30
    const canAdd  = stack.canAccept(player.maxStack)

    if (inRange && canAdd) {
      // Reset timer if player just entered the zone
      if (!this.inRangePrev) this.harvestTimer = BALANCE.HARVEST_INTERVAL * 0.3  // short grace

      this.harvestTimer += dt
      const progress = Math.min(this.harvestTimer / BALANCE.HARVEST_INTERVAL, 1)
      this._showProgressBar(progress)

      if (this.harvestTimer >= BALANCE.HARVEST_INTERVAL) {
        this.harvestTimer = 0
        stack.addItem(this.yieldsItem)
        EventBus.emit('item:harvested', {
          item:   this.yieldsItem,
          nodeId: `${this.nodeType}_${Math.round(this.x)}`,
        })
        this._popHarvestFeedback()

        this.remaining--
        if (this.remaining <= 0) this._deplete()
      }
    } else {
      if (!inRange) this.harvestTimer = 0
      this._hideProgressBar()
    }

    this.inRangePrev = inRange && canAdd
    this._syncDepth()
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    this.pBarBg.destroy()
    this.pBarFill.destroy()
    super.destroy(fromScene)
  }

  // ── Private — visuals ──────────────────────────────────────────────────────

  private _buildShadow(): void {
    // Shadow in world space (not container child) so depth is independent
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 22, 58, 18, 0x000000, 0.2)
  }

  private _buildTree(): void {
    this.treeGfx = new Phaser.GameObjects.Graphics(this.scene)
    this._drawFull()
    this.add(this.treeGfx)
  }

  /** Dispatch healthy visual by node type */
  private _drawFull(): void {
    switch (this.nodeType) {
      case 'fishing_spot':    this._drawFishingSpotFull(); return
      case 'sugarcane_field': this._drawSugarcaneFull(); return
      case 'pineapple_bush':
      case 'palm_tree':
      default:                this._drawPalmFull(); return
    }
  }

  /** Dispatch depleted visual by node type */
  private _drawDepleted(): void {
    switch (this.nodeType) {
      case 'fishing_spot':    this._drawFishingSpotDepleted(); return
      case 'sugarcane_field': this._drawSugarcaneDepleted(); return
      case 'pineapple_bush':
      case 'palm_tree':
      default:                this._drawPalmDepleted(); return
    }
  }

  /** Full healthy palm tree */
  private _drawPalmFull(): void {
    const g = this.treeGfx
    g.clear()

    // Trunk shadow (offset right-back)
    g.fillStyle(0x4e342e, 0.45)
    g.fillRect(4, -12, 10, 42)

    // Trunk
    g.fillStyle(0x8d6e63)
    g.fillRect(-5, -12, 10, 42)

    // Trunk highlight stripe
    g.fillStyle(0xa1887f, 0.5)
    g.fillRect(-3, -10, 3, 36)

    // Canopy: back shadow layer
    g.fillStyle(0x1a5216, 0.65)
    g.fillEllipse(8, -46, 56, 30)

    // Canopy: main
    g.fillStyle(0x2e7d32)
    g.fillEllipse(0, -54, 52, 32)

    // Canopy: mid highlight
    g.fillStyle(0x388e3c)
    g.fillEllipse(-4, -60, 36, 22)

    // Canopy: top bright spot
    g.fillStyle(0x43a047)
    g.fillEllipse(-6, -64, 22, 14)

    // Coconuts (3) nestled under canopy
    g.fillStyle(0x4e342e)
    g.fillCircle(-10, -38, 6)
    g.fillCircle(8,   -36, 6)
    g.fillCircle(0,   -33, 5)

    // Coconut specular highlight
    g.fillStyle(0x795548)
    g.fillCircle(-12, -41, 2.5)
    g.fillCircle(6,   -39, 2.5)
  }

  /** Wilted palm tree — depleted state */
  private _drawPalmDepleted(): void {
    const g = this.treeGfx
    g.clear()

    // Pale trunk
    g.fillStyle(0x9e9e9e)
    g.fillRect(-5, -12, 10, 42)

    // Stump top
    g.fillStyle(0x757575)
    g.fillEllipse(0, -12, 16, 8)

    // Drooping dead leaves
    g.fillStyle(0x795548, 0.55)
    g.fillEllipse(-14, -26, 28, 12)
    g.fillEllipse(14,  -22, 28, 12)
    g.fillEllipse(0,   -18, 24, 10)
  }

  /** Fishing spot — pond with a dock, a fish, and ripples */
  private _drawFishingSpotFull(): void {
    const g = this.treeGfx
    g.clear()

    // Pond back (outer rim)
    g.fillStyle(0x0d47a1, 0.9)
    g.fillEllipse(0, 0, 68, 44)

    // Water body
    g.fillStyle(0x1976d2)
    g.fillEllipse(0, -2, 60, 36)

    // Ripple highlights
    g.lineStyle(2, 0x64b5f6, 0.85)
    g.strokeEllipse(0, -4, 38, 20)
    g.lineStyle(1.5, 0xbbdefb, 0.7)
    g.strokeEllipse(4, -2, 22, 12)

    // Fish silhouette — body
    g.fillStyle(0xff8a65)
    g.fillEllipse(-6, -4, 14, 6)
    // Fish tail
    g.fillTriangle(-14, -4, -18, -7, -18, -1)
    // Fish eye
    g.fillStyle(0x212121)
    g.fillCircle(-2, -5, 1)

    // Wooden dock — shadow side
    g.fillStyle(0x4e342e, 0.55)
    g.fillRect(15, -3, 16, 5)
    // Dock top
    g.fillStyle(0x8d6e63)
    g.fillRect(14, -6, 16, 5)
    // Dock planks
    g.lineStyle(1, 0x5d4037, 0.8)
    g.beginPath(); g.moveTo(18, -6); g.lineTo(18, -1); g.strokePath()
    g.beginPath(); g.moveTo(22, -6); g.lineTo(22, -1); g.strokePath()
    g.beginPath(); g.moveTo(26, -6); g.lineTo(26, -1); g.strokePath()
    // Dock post poking out
    g.fillStyle(0x5d4037)
    g.fillRect(28, -6, 3, 10)
  }

  /** Sugarcane field — cluster of tall segmented green stalks */
  private _drawSugarcaneFull(): void {
    const g = this.treeGfx
    g.clear()

    // Dirt patch under the cluster
    g.fillStyle(0x5d4037, 0.5)
    g.fillEllipse(0, 18, 52, 14)

    // Stalks: [x, baseY, height]
    const stalks: [number, number, number][] = [
      [-14, 18, 58],
      [ -4, 20, 66],
      [  8, 18, 62],
      [ 18, 22, 52],
    ]

    for (const [sx, sy, sh] of stalks) {
      // Stalk shadow (back layer, offset right)
      g.fillStyle(0x1b5e20, 0.45)
      g.fillRect(sx - 1, sy - sh, 5, sh)

      // Stalk body
      g.fillStyle(0x66bb6a)
      g.fillRect(sx - 2, sy - sh, 4, sh)

      // Stalk segments (darker bands every ~10 px)
      g.fillStyle(0x2e7d32)
      for (let yy = sy - 6; yy > sy - sh; yy -= 10) {
        g.fillRect(sx - 2, yy, 4, 1.5)
      }

      // Top leaves — two diagonal strokes
      g.fillStyle(0x8bc34a)
      g.fillTriangle(sx,     sy - sh,     sx - 8, sy - sh - 10, sx - 2, sy - sh - 2)
      g.fillTriangle(sx,     sy - sh,     sx + 8, sy - sh - 10, sx + 2, sy - sh - 2)
      g.fillStyle(0xaed581)
      g.fillTriangle(sx - 1, sy - sh - 1, sx - 5, sy - sh - 8,  sx,     sy - sh - 3)
    }
  }

  /** Depleted sugarcane — stubs cut at the base */
  private _drawSugarcaneDepleted(): void {
    const g = this.treeGfx
    g.clear()

    // Dirt patch
    g.fillStyle(0x4e342e, 0.6)
    g.fillEllipse(0, 18, 52, 14)

    // Stubs
    const stubs: [number, number][] = [[-14, 18], [-4, 20], [8, 18], [18, 22]]
    for (const [sx, sy] of stubs) {
      g.fillStyle(0x795548)
      g.fillRect(sx - 2, sy - 6, 4, 6)
      g.fillStyle(0xa1887f)
      g.fillEllipse(sx, sy - 6, 5, 2)
    }
  }

  /** Depleted fishing spot — murky water, no fish */
  private _drawFishingSpotDepleted(): void {
    const g = this.treeGfx
    g.clear()

    // Murky pond
    g.fillStyle(0x37474f, 0.9)
    g.fillEllipse(0, 0, 66, 42)
    g.fillStyle(0x546e7a)
    g.fillEllipse(0, -2, 58, 34)

    // Few bubbles / grime
    g.fillStyle(0x78909c, 0.6)
    g.fillCircle(-8, -2, 2)
    g.fillCircle(6,  -6, 1.5)

    // Dock (still there)
    g.fillStyle(0x6d4c41)
    g.fillRect(14, -6, 16, 5)
    g.fillStyle(0x5d4037)
    g.fillRect(28, -6, 3, 10)
  }

  // ── Private — progress bar ─────────────────────────────────────────────────

  private _buildProgressBar(): void {
    const BAR_W = 48
    const BAR_H = 7
    const ABOVE = 82   // px above node origin

    this.pBarBg = this.scene.add
      .rectangle(this.x, this.y - ABOVE, BAR_W, BAR_H, 0x222222, 0.7)
      .setOrigin(0.5)
      .setDepth(9998)
      .setVisible(false)

    this.pBarFill = this.scene.add
      .rectangle(this.x - BAR_W / 2 + 2, this.y - ABOVE, BAR_W - 4, BAR_H - 2, 0x66bb6a)
      .setOrigin(0, 0.5)
      .setDepth(9999)
      .setVisible(false)
  }

  private _showProgressBar(progress: number): void {
    const ABOVE = 82
    const MAX_W = 44

    this.pBarBg.setPosition(this.x, this.y - ABOVE).setVisible(true)

    // Grow fill from left edge
    const fillW = Math.max(2, MAX_W * progress)
    this.pBarFill
      .setPosition(this.x - MAX_W / 2, this.y - ABOVE)
      .setDisplaySize(fillW, 5)
      .setVisible(true)

    // Colour shifts green → yellow as last item approaches
    const r = Math.round(102 + 153 * progress)
    const g2 = Math.round(187 - 10  * progress)
    this.pBarFill.setFillStyle(Phaser.Display.Color.GetColor(r, g2, 106))
  }

  private _hideProgressBar(): void {
    this.pBarBg.setVisible(false)
    this.pBarFill.setVisible(false)
  }

  // ── Private — state transitions ────────────────────────────────────────────

  private _deplete(): void {
    this.depleted     = true
    this.respawnTimer = BALANCE.NODE_RESPAWN_TIME
    this.harvestTimer = 0
    this._drawDepleted()

    // Shudder + shrink
    this.scene.tweens.add({
      targets: this, scaleX: 0.85, scaleY: 0.85,
      duration: 200, ease: 'Quad.Out',
    })
  }

  private _respawn(): void {
    this.depleted  = false
    this.remaining = BALANCE.NODE_MAX_ITEMS
    this._drawFull()

    // Grow back in
    this.setScale(0.5)
    this.scene.tweens.add({
      targets:  this,
      scaleX: 1, scaleY: 1,
      duration: 400,
      ease:     'Back.Out',
    })
  }

  /** Small bounce on the tree when a coconut is taken */
  private _popHarvestFeedback(): void {
    this.scene.tweens.add({
      targets:  this,
      scaleX:   1.08, scaleY: 0.94,
      duration: 60,
      yoyo:     true,
      ease:     'Quad.Out',
    })
  }

  private _syncDepth(): void {
    // Tree root is at y, canopy extends up — use y + small offset so
    // the base of the trunk competes correctly with other objects at same y.
    this.setDepth(this.y + 5)
    this.shadowObj.setDepth(this.y - 1)
  }
}
