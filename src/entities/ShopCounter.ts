import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { ITEMS } from '../config/items'
import { EventBus } from '../systems/EventBus'
import type { ItemId } from '../types'
import type { StackSystem } from '../systems/StackSystem'
import type { Player } from './Player'

const STOCK_ICON_W  = 14
const STOCK_ICON_H  = 10
const STOCK_ICON_GAP = 3

/**
 * ShopCounter — accepts products from player, sells them to Customers.
 *
 * Interaction (automatic, proximity-based):
 *   • Player walks into zone with matching item → auto-transfer every TRANSFER_INTERVAL
 *   • Counter shows stock as a mini-stack of colored boxes on its surface
 *   • When full → subtle shake to signal "no more needed"
 *
 * Customer-facing API: sellOne() — removes one item and returns the price.
 */
export class ShopCounter extends Phaser.GameObjects.Container {
  readonly productType: ItemId
  readonly price: number

  private stock: ItemId[] = []
  private transferCd = 0

  // Visuals
  private shadowObj!:    Phaser.GameObjects.Ellipse
  private counterGfx!:   Phaser.GameObjects.Graphics
  private stockIcons:    Phaser.GameObjects.Container[] = []

  // ── Construction ──────────────────────────────────────────────────────────

  constructor(
    scene:   Phaser.Scene,
    x:       number,
    y:       number,
    product: ItemId,
    price:   number,
  ) {
    super(scene, x, y)
    this.productType = product
    this.price       = price

    this._buildVisual()
    scene.add.existing(this)
  }

  // ── Public query API (used by CustomerSystem / Customer) ──────────────────

  get stockCount(): number { return this.stock.length }
  get isFull():     boolean { return this.stock.length >= BALANCE.COUNTER_MAX_STOCK }
  get isEmpty():    boolean { return this.stock.length === 0 }

  /** Customer buys one item — returns price, or null if empty. */
  sellOne(): number | null {
    if (this.isEmpty) return null
    this.stock.pop()
    this._refreshStockIcons()
    EventBus.emit('item:sold', {
      item: this.productType, price: this.price, counterId: `counter_${this.productType}`,
    })
    // Mini bounce on counter
    this.scene.tweens.add({
      targets: this, scaleX: 1.06, scaleY: 0.94,
      duration: 70, yoyo: true, ease: 'Quad.Out',
    })
    return this.price
  }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  tick(delta: number, player: Player, stack: StackSystem): void {
    const dt = delta / 1000
    this.transferCd = Math.max(0, this.transferCd - dt)

    if (this.transferCd > 0 || this.isFull) {
      this._syncDepth()
      return
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
    if (dist > BALANCE.PLAYER_INTERACT_RADIUS + 28) {
      this._syncDepth()
      return
    }

    const top = stack.peekTop()
    if (!top || top !== this.productType) {
      this._syncDepth()
      return
    }

    stack.removeTopItem()
    this.stock.push(this.productType)
    this.transferCd = BALANCE.TRANSFER_INTERVAL

    this._refreshStockIcons()
    EventBus.emit('item:stocked', { item: this.productType, counterId: `counter_${this.productType}` })

    if (this.isFull) {
      // Shake to indicate full
      this.scene.tweens.add({
        targets: this, x: this.x + 3,
        duration: 40, yoyo: true, repeat: 3, ease: 'Sine.InOut',
        onComplete: () => { this.x = this.x },
      })
    }

    this._syncDepth()
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    for (const ic of this.stockIcons) ic.destroy()
    super.destroy(fromScene)
  }

  // ── Private — visuals ──────────────────────────────────────────────────────

  private _buildVisual(): void {
    // Shadow
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 18, 68, 18, 0x000000, 0.22)

    // Counter body
    this.counterGfx = new Phaser.GameObjects.Graphics(this.scene)
    this._drawCounter()
    this.add(this.counterGfx)

    // Product label
    const def    = ITEMS[this.productType]
    const name   = def?.label ?? this.productType
    const label  = new Phaser.GameObjects.Text(
      this.scene, 0, 26,
      `${name}  $${this.price}`,
      { fontSize: '9px', color: '#ffffff', align: 'center' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    label.setOrigin(0.5).setAlpha(0.85)
    this.add(label)
  }

  private _drawCounter(): void {
    const g = this.counterGfx
    g.clear()

    // Side face
    g.fillStyle(0x01579b)
    g.fillRect(24, 2, 8, 20)

    // Front face
    g.fillStyle(0x0277bd)
    g.fillRect(-26, 2, 52, 20)

    // Top surface (where items sit)
    g.fillStyle(0x29b6f6)
    g.fillEllipse(0, 2, 58, 20)

    // Counter edge highlight
    g.lineStyle(1.5, 0x4fc3f7, 0.4)
    g.strokeEllipse(0, 2, 58, 20)
  }

  private _refreshStockIcons(): void {
    const count = this.stock.length
    const def   = ITEMS[this.productType]
    const color = def?.color ?? 0xffffff

    // Grow pool
    while (this.stockIcons.length < BALANCE.COUNTER_MAX_STOCK) {
      const lighter = Phaser.Display.Color.IntegerToColor(color)
      lighter.brighten(20)

      const g = new Phaser.GameObjects.Graphics(this.scene)
      g.fillStyle(lighter.color)
      g.fillRect(-STOCK_ICON_W / 2, -STOCK_ICON_H / 2, STOCK_ICON_W, STOCK_ICON_H)
      g.fillStyle(color)
      g.fillRect(-STOCK_ICON_W / 2, 0, STOCK_ICON_W, STOCK_ICON_H / 2)
      g.lineStyle(1, 0x000000, 0.2)
      g.strokeRect(-STOCK_ICON_W / 2, -STOCK_ICON_H / 2, STOCK_ICON_W, STOCK_ICON_H)

      const c = this.scene.add.container(0, 0, [g])
      this.stockIcons.push(c)
      this.add(c)
    }

    // Layout: stacked items centred on counter surface, grow upward
    const totalW = BALANCE.COUNTER_MAX_STOCK * (STOCK_ICON_W + STOCK_ICON_GAP) - STOCK_ICON_GAP
    const startX = -totalW / 2 + STOCK_ICON_W / 2

    for (let i = 0; i < this.stockIcons.length; i++) {
      const visible = i < count
      this.stockIcons[i].setVisible(visible)
      if (!visible) continue

      // Each subsequent item slightly higher (mini-stack illusion)
      this.stockIcons[i].setPosition(
        startX + i * (STOCK_ICON_W + STOCK_ICON_GAP),
        -8 - Math.floor(i / BALANCE.COUNTER_MAX_STOCK) * (STOCK_ICON_H + 2),
      )
      this.stockIcons[i].setDepth(this.y + i * 0.1)
    }
  }

  private _syncDepth(): void {
    this.setDepth(this.y + 5)
    this.shadowObj.setDepth(this.y - 1)
  }
}
