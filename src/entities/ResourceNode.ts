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
  mango_tree:      'mango',
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

    // Set depth once — resource nodes never move
    this.setDepth(y + 5)
    this.shadowObj.setDepth(y - 1)

    scene.add.existing(this)

    // Idle sway for tree-like nodes (palm + pineapple bush — they have a
    // canopy that should react to wind). Sugarcane and fishing spot are
    // ground-bound and stay still.
    if (type === 'palm_tree' || type === 'pineapple_bush' || type === 'mango_tree') {
      const period = 3200 + Math.random() * 1200
      const phase  = Math.random() * 1500
      scene.tweens.add({
        targets: this.treeGfx,
        angle:   { from: -2, to: 2 },
        duration: period,
        yoyo:    true,
        repeat:  -1,
        ease:    'Sine.InOut',
        delay:   phase,
      })
    }
  }

  // ── Per-frame tick (called from Game.update) ───────────────────────────────

  tick(delta: number, player: Player, stack: StackSystem): void {
    const dt = delta / 1000

    if (this.depleted) {
      this.respawnTimer -= dt
      if (this.respawnTimer <= 0) this._respawn()
      this._hideProgressBar()
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
  }

  /**
   * Worker-facing API — take one item without player proximity checks.
   * Same bookkeeping as player harvest (depletion, events) but the caller
   * throttles its own rate.
   * Returns the yielded item id, or null if depleted.
   */
  tryTakeItem(): ItemId | null {
    if (this.depleted) return null

    const item = this.yieldsItem
    this.remaining--
    EventBus.emit('item:harvested', {
      item,
      nodeId: `${this.nodeType}_${Math.round(this.x)}`,
    })
    this._popHarvestFeedback()

    if (this.remaining <= 0) this._deplete()
    return item
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
      case 'pineapple_bush':  this._drawPineappleBushFull(); return
      case 'mango_tree':      this._drawMangoTreeFull(); return
      case 'palm_tree':
      default:                this._drawPalmFull(); return
    }
  }

  /** Dispatch depleted visual by node type */
  private _drawDepleted(): void {
    switch (this.nodeType) {
      case 'fishing_spot':    this._drawFishingSpotDepleted(); return
      case 'sugarcane_field': this._drawSugarcaneDepleted(); return
      case 'pineapple_bush':  this._drawPineappleBushDepleted(); return
      case 'mango_tree':      this._drawMangoTreeDepleted(); return
      case 'palm_tree':
      default:                this._drawPalmDepleted(); return
    }
  }

  /** Full healthy palm tree — segmented trunk + 10 individual fronds */
  private _drawPalmFull(): void {
    const g = this.treeGfx
    g.clear()

    // Trunk side-shadow (right side, sun is top-left)
    g.fillStyle(0x4e2c10, 0.75)
    g.fillRect(2, -16, 8, 46)

    // Trunk body
    g.fillStyle(0x7a4f2a)
    g.fillRect(-5, -16, 9, 46)

    // Trunk left highlight
    g.fillStyle(0xa67244, 0.95)
    g.fillRect(-4, -16, 2, 46)

    // Segment ridges
    g.fillStyle(0x4e2c10, 0.55)
    for (let i = 0; i < 5; i++) {
      g.fillRect(-5, -12 + i * 9, 9, 1.5)
    }

    // Fronds — coordinates relative to trunk top (~y=-16). Drawn in 3 rows
    // (back / mid / front) for depth.
    const drawFrond = (angle: number, len: number, width: number, color: number, alpha = 1): void => {
      const tipX = Math.cos(angle) * len
      const tipY = -16 + Math.sin(angle) * len * 0.65
      const perpX = -Math.sin(angle) * width
      const perpY =  Math.cos(angle) * width * 0.65
      g.fillStyle(color, alpha)
      g.fillTriangle(0, -16, tipX + perpX, tipY + perpY, tipX - perpX, tipY - perpY)
      g.lineStyle(1, 0x1c5212, 0.55)
      g.beginPath(); g.moveTo(0, -16); g.lineTo(tipX, tipY); g.strokePath()
    }

    // Back row (darkest)
    drawFrond(-Math.PI * 0.95, 36, 8, 0x1f6b1a)
    drawFrond(-Math.PI * 0.05, 36, 8, 0x1f6b1a)
    drawFrond(-Math.PI * 0.50, 34, 8, 0x1f6b1a)

    // Mid row
    drawFrond(-Math.PI * 0.85, 40, 9, 0x2e9c2a)
    drawFrond(-Math.PI * 0.15, 40, 9, 0x2e9c2a)
    drawFrond(-Math.PI * 0.65, 38, 9, 0x2e9c2a)
    drawFrond(-Math.PI * 0.35, 38, 9, 0x2e9c2a)

    // Front bright row
    drawFrond(-Math.PI * 0.50, 32, 7, 0x55c25b, 0.95)
    drawFrond(-Math.PI * 0.75, 30, 7, 0x55c25b, 0.95)
    drawFrond(-Math.PI * 0.25, 30, 7, 0x55c25b, 0.95)

    // Coconut cluster nested under fronds
    g.fillStyle(0x4e2c10)
    g.fillCircle(-10, -14, 5)
    g.fillCircle(  9, -13, 5)
    g.fillCircle(  0, -10, 5)

    g.fillStyle(0x6f4421, 0.95)
    g.fillCircle(-11, -16, 1.6)
    g.fillCircle(  8, -15, 1.6)
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

  /** Pineapple bush — spiky-leaved bush with two ripe pineapples */
  private _drawPineappleBushFull(): void {
    const g = this.treeGfx
    g.clear()

    // Dirt patch
    g.fillStyle(0x5d4037, 0.55)
    g.fillEllipse(0, 18, 56, 14)

    // Back leaf fan (shadow layer)
    g.fillStyle(0x1b5e20, 0.6)
    g.fillTriangle(-22, 12, -8, -28,  -2, 14)
    g.fillTriangle(  4, 14,  10, -32,  22, 12)
    g.fillTriangle( -8, 14,   2, -36,  10, 14)

    // Front leaf fan
    g.fillStyle(0x388e3c)
    g.fillTriangle(-20, 14, -7, -22,   0, 14)
    g.fillTriangle(  2, 14,  9, -28,  20, 14)
    g.fillTriangle( -6, 14,  3, -32,  10, 14)

    // Leaf highlights
    g.fillStyle(0x66bb6a)
    g.fillTriangle(-14, 10, -6, -18, -2, 12)
    g.fillTriangle(  4, 12,  8, -22, 14, 10)

    // Pineapple #1 — body (cross-hatched look via two-tone rects)
    g.fillStyle(0xf57c00)
    g.fillEllipse(-7, 6, 14, 18)
    g.fillStyle(0xffb74d)
    g.fillEllipse(-9, 4, 6, 8)
    // crown
    g.fillStyle(0x2e7d32)
    g.fillTriangle(-12, -2, -7, -14, -2, -2)
    g.fillTriangle(-10, -3,  -5, -12,  0, -3)

    // Pineapple #2
    g.fillStyle(0xef6c00)
    g.fillEllipse(8, 8, 13, 17)
    g.fillStyle(0xffa726)
    g.fillEllipse(6, 6, 5, 7)
    g.fillStyle(0x388e3c)
    g.fillTriangle(3, 0, 8, -12, 13, 0)
    g.fillTriangle(5, -1, 9, -10, 12, -1)

    // Speckles on the pineapples
    g.fillStyle(0x4e342e, 0.55)
    g.fillCircle(-7, 4,  1)
    g.fillCircle(-5, 8,  1)
    g.fillCircle(-9, 10, 1)
    g.fillCircle( 8, 6,  1)
    g.fillCircle(10, 10, 1)
    g.fillCircle( 6, 12, 1)
  }

  /** Depleted pineapple bush — picked clean, drooping leaves */
  private _drawPineappleBushDepleted(): void {
    const g = this.treeGfx
    g.clear()

    // Dirt patch
    g.fillStyle(0x4e342e, 0.65)
    g.fillEllipse(0, 18, 56, 14)

    // Drooping faded leaves
    g.fillStyle(0x6d4c41, 0.65)
    g.fillTriangle(-18, 14, -10, -8, -2, 14)
    g.fillTriangle(  2, 14,   8, -10, 18, 14)
    g.fillTriangle( -6, 14,   2, -12, 10, 14)

    // Stubs where pineapples were
    g.fillStyle(0x795548)
    g.fillEllipse(-7, 12, 6, 4)
    g.fillEllipse( 8, 12, 6, 4)
  }

  /** Mango tree — short rounded canopy, orange fruits clustered in the crown */
  private _drawMangoTreeFull(): void {
    const g = this.treeGfx
    g.clear()

    // Trunk side-shadow
    g.fillStyle(0x4e2c10, 0.7)
    g.fillRect(2, -10, 8, 36)

    // Trunk body — shorter and stouter than palm
    g.fillStyle(0x795548)
    g.fillRect(-5, -10, 9, 36)

    // Trunk left highlight
    g.fillStyle(0xa1887f, 0.9)
    g.fillRect(-4, -10, 2, 36)

    // Trunk segments
    g.fillStyle(0x4e2c10, 0.45)
    for (let i = 0; i < 3; i++) {
      g.fillRect(-5, -6 + i * 10, 9, 1.5)
    }

    // Canopy back layer (darker, wider)
    g.fillStyle(0x1b5e20, 0.75)
    g.fillCircle(-10, -22, 22)
    g.fillCircle( 10, -22, 22)
    g.fillCircle(  0, -28, 22)

    // Canopy mid layer
    g.fillStyle(0x388e3c)
    g.fillCircle(-8,  -20, 20)
    g.fillCircle(  8, -20, 20)
    g.fillCircle(  0, -26, 20)

    // Canopy highlight layer
    g.fillStyle(0x66bb6a, 0.9)
    g.fillCircle(-6,  -24, 13)
    g.fillCircle(  5, -24, 13)

    // Mango fruits nestled under the canopy
    // Fruit shadow
    g.fillStyle(0xb36200, 0.7)
    g.fillEllipse(-11, -10, 10, 14)
    g.fillEllipse(  1, -8,  10, 14)
    g.fillEllipse( 11, -11, 9,  12)

    // Fruit bodies — orange with a reddish blush
    g.fillStyle(0xff8f00)
    g.fillEllipse(-12, -12, 10, 14)
    g.fillEllipse(  0, -10, 10, 14)
    g.fillEllipse( 10, -12, 9,  12)

    g.fillStyle(0xe65100, 0.55)
    g.fillEllipse(-10, -10, 5, 7)
    g.fillEllipse(  2,  -8, 5, 7)
    g.fillEllipse( 11, -10, 4, 6)
  }

  /** Mango tree depleted — bare canopy, no fruits */
  private _drawMangoTreeDepleted(): void {
    const g = this.treeGfx
    g.clear()

    // Pale trunk
    g.fillStyle(0x9e9e9e)
    g.fillRect(-5, -10, 9, 36)
    g.fillStyle(0x757575)
    g.fillEllipse(0, -10, 16, 7)

    // Drooping faded canopy blobs
    g.fillStyle(0x6d4c41, 0.55)
    g.fillCircle(-8,  -18, 16)
    g.fillCircle(  7, -18, 16)
    g.fillCircle(  0, -22, 15)
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

  // Depth is set once in constructor — resource nodes never move.
}
