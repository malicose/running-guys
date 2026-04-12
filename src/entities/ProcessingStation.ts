import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { RECIPE_BY_ID } from '../config/recipes'
import { ITEMS } from '../config/items'
import { EventBus } from '../systems/EventBus'
import { drawItemIcon } from '../ui/itemIcons'
import type { RecipeDef, ItemId } from '../types'
import type { StackSystem } from '../systems/StackSystem'
import type { Player } from './Player'

const OUTPUT_TRAY_OFFSET_X = 68   // px to the right of station centre
const ICON_SIZE            = 14   // queue/output item icons
const MAX_QUEUE_DISPLAY    = 5

/**
 * ProcessingStation — a machine that converts one item type to another.
 *
 * Two interaction zones (both distance-based, no buttons):
 *   INPUT ZONE  (station position)   → player drops required items from stack
 *   OUTPUT ZONE (station.x + 68, y)  → player picks up processed items
 *
 * State machine:
 *   idle → accepting input → processing → outputting → idle
 *
 * Pseudo-3D visuals: box body + separate output tray, both with shadows.
 */
export class ProcessingStation extends Phaser.GameObjects.Container {
  readonly recipe: RecipeDef

  /** Items received from player, waiting to be processed */
  readonly inputQueue: ItemId[] = []
  /** Processed items ready for player to pick up */
  readonly outputBuffer: ItemId[] = []

  // Positions
  readonly outputTrayX: number
  readonly outputTrayY: number

  // Processing state
  private processing    = false
  private processTimer  = 0

  // Transfer cooldowns (so items don't teleport all at once)
  private inTransferCd  = 0
  private outTransferCd = 0

  // Ambient bubble spawn cadence (only ticks while processing)
  private bubbleTimer   = 0

  // Visuals — station body
  private shadowObj!:      Phaser.GameObjects.Ellipse
  private machineGfx!:     Phaser.GameObjects.Graphics
  private gearObj!:        Phaser.GameObjects.Arc
  private pBarBg!:         Phaser.GameObjects.Rectangle
  private pBarFill!:       Phaser.GameObjects.Rectangle

  // Visuals — output tray (world-space, not container children)
  private trayShadow!:     Phaser.GameObjects.Ellipse
  private trayGfx!:        Phaser.GameObjects.Graphics

  // Item icon pools (Graphics so we can render rich per-item shapes)
  private queueIcons:  Phaser.GameObjects.Graphics[] = []
  private outputIcons: Phaser.GameObjects.Graphics[] = []
  // Cache the last item id drawn into each pool slot so we don't redraw
  // the (potentially complex) icon every frame.
  private queueIconIds:  (ItemId | null)[] = []
  private outputIconIds: (ItemId | null)[] = []

  // ── Construction ──────────────────────────────────────────────────────────

  constructor(scene: Phaser.Scene, x: number, y: number, recipeId: string) {
    super(scene, x, y)

    const recipe = RECIPE_BY_ID[recipeId]
    if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`)
    this.recipe = recipe

    this.outputTrayX = x + OUTPUT_TRAY_OFFSET_X
    this.outputTrayY = y

    this._buildStation()
    this._buildOutputTray()
    this._buildProgressBar()

    scene.add.existing(this)
  }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  tick(delta: number, player: Player, stack: StackSystem): void {
    const dt = delta / 1000
    this.inTransferCd  = Math.max(0, this.inTransferCd  - dt)
    this.outTransferCd = Math.max(0, this.outTransferCd - dt)

    this._handleInputTransfer(player, stack)
    this._handleProcessing(dt)
    this._handleOutputPickup(player, stack)

    this._updateVisuals(dt)
    this._syncDepth()
  }

  // ── Worker-facing API (no proximity checks) ──────────────────────────────

  /** Push one item into the input queue. Returns false if rejected. */
  tryDepositInput(itemId: ItemId): boolean {
    if (this.inputQueue.length >= BALANCE.STATION_QUEUE_MAX) return false
    if (!this.recipe.input.includes(itemId)) return false

    this.inputQueue.push(itemId)
    EventBus.emit('item:deposited', { item: itemId, stationId: this.recipe.id })
    this._popInputFeedback()
    return true
  }

  /** Pop one item from the output buffer, or null if empty. */
  tryTakeOutput(): ItemId | null {
    return this.outputBuffer.pop() ?? null
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    this.trayShadow.destroy()
    this.trayGfx.destroy()
    this.pBarBg.destroy()
    this.pBarFill.destroy()
    for (const ic of this.queueIcons)  ic.destroy()
    for (const ic of this.outputIcons) ic.destroy()
    super.destroy(fromScene)
  }

  // ── Private — game logic ──────────────────────────────────────────────────

  private _handleInputTransfer(player: Player, stack: StackSystem): void {
    if (this.inTransferCd > 0) return
    if (this.inputQueue.length >= BALANCE.STATION_QUEUE_MAX) return

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
    if (dist > BALANCE.PLAYER_INTERACT_RADIUS + 20) return

    // Pull the top-most matching item out of the stack — items don't have to
    // be in the right order, the player just walks up and the stack drains
    // any item this recipe accepts.
    const taken = stack.removeFirstMatching((id) => this.recipe.input.includes(id))
    if (!taken) return

    this.inputQueue.push(taken)
    this.inTransferCd = BALANCE.TRANSFER_INTERVAL

    EventBus.emit('item:deposited', { item: taken, stationId: this.recipe.id })
    this._popInputFeedback()
  }

  private _handleProcessing(dt: number): void {
    if (this.processing) {
      this.processTimer -= dt
      if (this.processTimer <= 0) {
        this.processing = false
        // Remove one full set of recipe inputs and produce one output
        for (const needed of this.recipe.input) {
          const idx = this.inputQueue.indexOf(needed)
          if (idx !== -1) this.inputQueue.splice(idx, 1)
        }
        this.outputBuffer.push(this.recipe.output)
        EventBus.emit('item:processed', {
          input:     this.recipe.input,
          output:    this.recipe.output,
          stationId: this.recipe.id,
        })
        this._popOutputFeedback()
      }
      return
    }

    // Start processing if we have all needed inputs
    if (this.outputBuffer.length >= BALANCE.STATION_OUTPUT_MAX) return
    if (!this._hasRequiredInputs()) return

    this.processing   = true
    this.processTimer = this.recipe.time
  }

  private _handleOutputPickup(player: Player, stack: StackSystem): void {
    if (this.outTransferCd > 0) return
    if (!this.outputBuffer.length) return
    if (!stack.canAccept(player.maxStack)) return

    const dist = Phaser.Math.Distance.Between(
      this.outputTrayX, this.outputTrayY,
      player.x, player.y,
    )
    if (dist > BALANCE.PLAYER_INTERACT_RADIUS + 24) return

    const item = this.outputBuffer.pop()!
    stack.addItem(item)
    this.outTransferCd = BALANCE.TRANSFER_INTERVAL
  }

  /** Spawn one ambient bubble drifting up from the machine top — visual
   *  cue that something is brewing. Tinted by the recipe's output item. */
  private _spawnBubble(): void {
    const outDef = ITEMS[this.recipe.output]
    const tint   = outDef?.color ?? 0xffffff

    const offX = (Math.random() - 0.5) * 16
    const sx   = this.x + offX
    const sy   = this.y - 14

    const bubble = this.scene.add.circle(sx, sy, 2 + Math.random() * 1.5, tint, 0.85)
    bubble.setStrokeStyle(1, 0xffffff, 0.6)
    bubble.setDepth(this.y + 20)

    this.scene.tweens.add({
      targets:  bubble,
      x:        sx + (Math.random() - 0.5) * 18,
      y:        sy - 28 - Math.random() * 12,
      alpha:    0,
      scaleX:   1.6,
      scaleY:   1.6,
      duration: 1100,
      ease:     'Sine.Out',
      onComplete: () => bubble.destroy(),
    })
  }

  private _hasRequiredInputs(): boolean {
    const available = [...this.inputQueue]
    for (const needed of this.recipe.input) {
      const idx = available.indexOf(needed)
      if (idx === -1) return false
      available.splice(idx, 1)
    }
    return true
  }

  // ── Private — visuals ──────────────────────────────────────────────────────

  private _buildStation(): void {
    // Shadow (world-space for independent depth)
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 16, 52, 16, 0x000000, 0.22)

    // Machine body (container child, relative coords)
    this.machineGfx = new Phaser.GameObjects.Graphics(this.scene)
    this._drawMachine()
    this.add(this.machineGfx)

    // Spinning gear (centre of machine top)
    this.gearObj = new Phaser.GameObjects.Arc(this.scene, 0, -10, 10, 0, 360, false, 0x546e7a)
    this.gearObj.setStrokeStyle(3, 0xb0bec5)
    this.add(this.gearObj)

    // Small inner gear hole
    const hole = new Phaser.GameObjects.Arc(this.scene, 0, -10, 4, 0, 360, false, 0x37474f)
    this.add(hole)

    // Recipe label
    const inLabel  = this.recipe.input[0] ? (ITEMS[this.recipe.input[0]]?.label ?? '') : ''
    const outLabel = ITEMS[this.recipe.output]?.label ?? ''
    const label    = new Phaser.GameObjects.Text(
      this.scene, 0, 28,
      `${inLabel} → ${outLabel}`,
      { fontSize: '8px', color: '#eeeeee', align: 'center' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    label.setOrigin(0.5).setAlpha(0.75)
    this.add(label)
  }

  private _drawMachine(): void {
    const g = this.machineGfx
    g.clear()

    // Side face (depth)
    g.fillStyle(0x37474f)
    g.fillRect(20, -4, 6, 22)

    // Front face
    g.fillStyle(0x546e7a)
    g.fillRect(-22, -4, 44, 22)

    // Top face (lighter)
    g.fillStyle(0x607d8b)
    g.fillEllipse(0, -4, 48, 18)

    // Front panel screws / details
    g.fillStyle(0x455a64)
    g.fillCircle(-16, 8, 3)
    g.fillCircle(16, 8, 3)
  }

  private _buildOutputTray(): void {
    const tx = this.outputTrayX
    const ty = this.outputTrayY

    this.trayShadow = this.scene.add.ellipse(tx, ty + 12, 36, 10, 0x000000, 0.18)

    this.trayGfx = this.scene.add.graphics()
    this._drawTray()

    const label = this.scene.add
      .text(tx, ty - 26, 'OUTPUT', { fontSize: '8px', color: '#b0bec5' } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5)
      .setAlpha(0.6)
    label.setDepth(ty + 20)
  }

  private _drawTray(): void {
    const g   = this.trayGfx
    const tx  = this.outputTrayX
    const ty  = this.outputTrayY
    g.clear()

    g.fillStyle(0x455a64)
    g.fillRect(tx - 16, ty - 2, 32, 12)

    g.fillStyle(0x546e7a)
    g.fillEllipse(tx, ty - 2, 34, 12)
  }

  private _buildProgressBar(): void {
    const BAR_W = 46
    const ABOVE = 50

    this.pBarBg = this.scene.add
      .rectangle(this.x, this.y - ABOVE, BAR_W, 7, 0x222222, 0.7)
      .setOrigin(0.5)
      .setDepth(9998)
      .setVisible(false)

    this.pBarFill = this.scene.add
      .rectangle(this.x - BAR_W / 2 + 2, this.y - ABOVE, BAR_W - 4, 5, 0xff7043)
      .setOrigin(0, 0.5)
      .setDepth(9999)
      .setVisible(false)
  }

  // ── Private — visual updates (each frame) ─────────────────────────────────

  private _updateVisuals(dt: number): void {
    // Progress bar
    if (this.processing) {
      const progress = 1 - this.processTimer / this.recipe.time
      const MAX_W = 42
      this.pBarBg.setVisible(true)
      this.pBarFill
        .setVisible(true)
        .setDisplaySize(Math.max(2, MAX_W * progress), 5)

      // Spin gear proportional to processing speed
      this.gearObj.angle += 4

      // Ambient bubbles drifting up out of the machine top
      this.bubbleTimer += dt
      if (this.bubbleTimer >= 0.18) {
        this.bubbleTimer = 0
        this._spawnBubble()
      }
    } else {
      this.pBarBg.setVisible(false)
      this.pBarFill.setVisible(false)
      this.bubbleTimer = 0
    }

    // Queue icons (left of station)
    this._refreshIcons(
      this.inputQueue,
      this.queueIcons,
      this.queueIconIds,
      this.x - 34,
      this.y,
      -ICON_SIZE - 2,
    )

    // Output icons (on output tray)
    this._refreshIcons(
      this.outputBuffer,
      this.outputIcons,
      this.outputIconIds,
      this.outputTrayX,
      this.outputTrayY - 8,
      0,
      true,
    )

    // Tray depth
    this.trayGfx.setDepth(this.outputTrayY + 5)
    this.trayShadow.setDepth(this.outputTrayY - 1)
  }

  /** Sync or create icon graphics for an array of items */
  private _refreshIcons(
    items:   ItemId[],
    pool:    Phaser.GameObjects.Graphics[],
    cache:   (ItemId | null)[],
    startX:  number,
    startY:  number,
    stepX:   number,
    stacked  = false,
  ): void {
    const visible = Math.min(items.length, MAX_QUEUE_DISPLAY)

    // Grow pool
    while (pool.length < visible) {
      const g = this.scene.add.graphics()
      g.setDepth(9990)
      pool.push(g)
      cache.push(null)
    }

    // Update positions and per-slot icon (only redraw on item-id change)
    for (let i = 0; i < pool.length; i++) {
      const show = i < visible
      pool[i].setVisible(show)
      if (!show) {
        cache[i] = null
        continue
      }

      const id = items[i]
      if (cache[i] !== id) {
        drawItemIcon(pool[i], id, ICON_SIZE)
        cache[i] = id
      }

      if (stacked) {
        pool[i].setPosition(startX, startY - i * (ICON_SIZE - 2))
      } else {
        pool[i].setPosition(startX + i * stepX, startY)
      }
    }
  }

  private _popInputFeedback(): void {
    // Brief squeeze on machine body
    this.scene.tweens.add({
      targets: this, scaleX: 0.94, scaleY: 1.06,
      duration: 60, yoyo: true, ease: 'Quad.Out',
    })
  }

  private _popOutputFeedback(): void {
    // Brief "launch" bounce on machine
    this.scene.tweens.add({
      targets: this, scaleY: 1.1, scaleX: 0.92,
      duration: 80, yoyo: true, ease: 'Back.Out',
    })
  }

  private _syncDepth(): void {
    this.setDepth(this.y + 5)
    this.shadowObj.setDepth(this.y - 1)
  }
}
