import Phaser from 'phaser'
import { ITEMS } from '../config/items'
import { BALANCE } from '../config/balance'
import type { ItemId } from '../types'
import type { WorkerAI, WorkerTask } from '../systems/WorkerAI'

/**
 * Worker NPC — autonomous helper. Each tick the worker is in one of three
 * macro states: idle (no task), moving (heading to a task target), or
 * acting (performing the task at the target).
 *
 * Tasks are not assigned at construction. The worker pulls them from its
 * `WorkerAI` planner whenever it goes idle, so it can react to whichever
 * counter is currently the most empty in the zone.
 *
 * Mini-stack (3 items) is rendered as stacked colored squares behind the
 * head — same visual as before, no chain physics.
 */

type MacroState = 'idle' | 'moving' | 'acting'

const ARRIVE_DIST      = 24
const MINI_STACK_MAX   = 3
const STACK_ITEM_SIZE  = 12
const STACK_ANCHOR_Y   = 22
const STACK_SPACING    = 14
const IDLE_REPLAN_TIME = 0.6   // seconds between re-asks while idling

export class Worker extends Phaser.GameObjects.Container {
  // Mutable stats (upgradeable later)
  speed    = 70
  maxStack = MINI_STACK_MAX

  private ai:           WorkerAI
  private macroState:   MacroState = 'idle'
  private task:         WorkerTask | null = null
  private actionTimer   = 0
  private idleTimer     = 0
  private facingAngle   = 0

  /** Own stack (runtime) */
  private stack: { id: ItemId; gfx: Phaser.GameObjects.Graphics }[] = []

  // Visuals
  private shadowObj!:  Phaser.GameObjects.Ellipse
  private dirDot!:     Phaser.GameObjects.Arc
  private stateLabel!: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, x: number, y: number, ai: WorkerAI) {
    super(scene, x, y)
    this.ai = ai

    this._buildVisual()
    scene.add.existing(this)

    // Spawn pop-in
    this.setScale(0.1)
    scene.tweens.add({ targets: this, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' })
  }

  // ── Public — used by WorkerAI planner ─────────────────────────────────────

  /** Top item id, or null if stack empty. */
  peekTop(): ItemId | null {
    return this.stack.length ? this.stack[this.stack.length - 1].id : null
  }

  get stackSize(): number { return this.stack.length }
  get isFull():    boolean { return this.stack.length >= this.maxStack }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  tick(delta: number): void {
    const dt = delta / 1000
    this.actionTimer = Math.max(0, this.actionTimer - dt)

    if (this.macroState === 'idle') this._tickIdle(dt)
    if (this.macroState === 'moving') this._tickMoving(dt)
    if (this.macroState === 'acting') this._tickActing()

    this._syncVisual()
  }

  override destroy(fromScene?: boolean): void {
    this.shadowObj.destroy()
    for (const s of this.stack) s.gfx.destroy()
    super.destroy(fromScene)
  }

  // ── State handlers ────────────────────────────────────────────────────────

  private _tickIdle(dt: number): void {
    this.idleTimer += dt
    if (this.idleTimer < IDLE_REPLAN_TIME) {
      // Drift toward zone center while waiting so we don't pile up at edges.
      const c = this.ai.zoneCenter
      this._stepToward(c.x, c.y, dt, 0.35)
      return
    }
    this.idleTimer = 0

    const next = this.ai.pickTask(this)
    if (next) {
      this.task  = next
      this.macroState = 'moving'
    }
  }

  private _tickMoving(dt: number): void {
    if (!this.task) { this._clearTask(); return }
    const { targetX, targetY } = this.task
    this._stepToward(targetX, targetY, dt, 1)
    if (this._dist(targetX, targetY) < ARRIVE_DIST) {
      this.macroState       = 'acting'
      this.actionTimer = 0
    }
  }

  private _tickActing(): void {
    if (!this.task) { this._clearTask(); return }
    if (this.actionTimer > 0) return

    switch (this.task.kind) {
      case 'harvest': {
        const node = this.task.node
        if (!node) return this._clearTask()
        if (this.isFull) return this._clearTask()
        const item = node.tryTakeItem()
        if (item) {
          this._pushStack(item)
          this.actionTimer = BALANCE.HARVEST_INTERVAL
          if (this.isFull) this._clearTask()
        } else {
          // Depleted or busy — bail and let the planner reroute.
          this._clearTask()
        }
        break
      }

      case 'deliverInput': {
        const station = this.task.station
        if (!station) return this._clearTask()
        const top = this.peekTop()
        if (!top || !station.recipe.input.includes(top)) return this._clearTask()
        if (station.tryDepositInput(top)) {
          this._popStack()
          this.actionTimer = BALANCE.TRANSFER_INTERVAL
          if (this.stack.length === 0) this._clearTask()
        } else {
          // Queue full or wrong type — bail.
          this._clearTask()
        }
        break
      }

      case 'fetchOutput': {
        const station = this.task.station
        if (!station) return this._clearTask()
        if (this.isFull) return this._clearTask()
        const out = station.tryTakeOutput()
        if (out) {
          this._pushStack(out)
          this.actionTimer = BALANCE.TRANSFER_INTERVAL
          if (this.isFull) this._clearTask()
        } else {
          this._clearTask()
        }
        break
      }

      case 'deliverProduct': {
        const counter = this.task.counter
        if (!counter) return this._clearTask()
        const top = this.peekTop()
        if (!top || top !== counter.productType) return this._clearTask()
        if (counter.tryDepositProduct(top)) {
          this._popStack()
          this.actionTimer = BALANCE.TRANSFER_INTERVAL
          if (this.stack.length === 0) this._clearTask()
        } else {
          // Counter full — bail.
          this._clearTask()
        }
        break
      }

      case 'idle':
      default:
        this._clearTask()
        break
    }
  }

  private _clearTask(): void {
    this.task      = null
    this.macroState     = 'idle'
    this.idleTimer = IDLE_REPLAN_TIME    // re-ask immediately on next tick
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  private _stepToward(tx: number, ty: number, dt: number, speedMul = 1): void {
    const dx = tx - this.x
    const dy = ty - this.y
    const d  = Math.sqrt(dx * dx + dy * dy)
    if (d < 2) return

    this.x += (dx / d) * this.speed * speedMul * dt
    this.y += (dy / d) * this.speed * speedMul * dt

    const target = Math.atan2(dy, dx)
    let diff = target - this.facingAngle
    if (diff >  Math.PI) diff -= Math.PI * 2
    if (diff < -Math.PI) diff += Math.PI * 2
    this.facingAngle += diff * 0.22

    this.dirDot.setPosition(
      Math.cos(this.facingAngle) * 7,
      -12 + Math.sin(this.facingAngle) * 7,
    )
    this.setRotation((dx / d) * 0.1)
  }

  private _dist(tx: number, ty: number): number {
    return Phaser.Math.Distance.Between(this.x, this.y, tx, ty)
  }

  // ── Stack management ──────────────────────────────────────────────────────

  private _pushStack(id: ItemId): void {
    const def   = ITEMS[id]
    const color = def?.color ?? 0xffffff

    const g = new Phaser.GameObjects.Graphics(this.scene)
    const lighter = Phaser.Display.Color.IntegerToColor(color); lighter.brighten(25)
    g.fillStyle(lighter.color)
    g.fillRect(-STACK_ITEM_SIZE / 2, -STACK_ITEM_SIZE / 2, STACK_ITEM_SIZE - 1, 4)
    g.fillStyle(color)
    g.fillRect(-STACK_ITEM_SIZE / 2, -STACK_ITEM_SIZE / 2 + 3, STACK_ITEM_SIZE, STACK_ITEM_SIZE - 3)
    g.lineStyle(1, 0x000000, 0.3)
    g.strokeRect(-STACK_ITEM_SIZE / 2, -STACK_ITEM_SIZE / 2, STACK_ITEM_SIZE, STACK_ITEM_SIZE)

    this.scene.add.existing(g)
    g.setScale(0.1)
    this.scene.tweens.add({ targets: g, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.Out' })

    this.stack.push({ id, gfx: g })
  }

  private _popStack(): void {
    const top = this.stack.pop()
    if (!top) return
    this.scene.tweens.add({
      targets: top.gfx, scaleX: 0, scaleY: 0, alpha: 0,
      duration: 120, ease: 'Quad.In',
      onComplete: () => top.gfx.destroy(),
    })
  }

  private _positionStackSprites(): void {
    for (let i = 0; i < this.stack.length; i++) {
      const gfx = this.stack[i].gfx
      gfx.setPosition(this.x, this.y - STACK_ANCHOR_Y - i * STACK_SPACING)
      gfx.setDepth(this.y - 1 - i * 0.01)
    }
  }

  // ── Visuals ───────────────────────────────────────────────────────────────

  private _buildVisual(): void {
    this.shadowObj = this.scene.add.ellipse(this.x, this.y + 12, 28, 9, 0x000000, 0.25)

    const torso = new Phaser.GameObjects.Graphics(this.scene)
    torso.fillStyle(0x00796b)
    torso.fillRoundedRect(-9, 4, 18, 10, 3)
    torso.fillStyle(0x26a69a)
    torso.fillEllipse(0, 4, 22, 12)
    this.add(torso)

    const head = new Phaser.GameObjects.Arc(this.scene, 0, -11, 9, 0, 360, false, 0xffcc80)
    this.add(head)

    const hat = new Phaser.GameObjects.Graphics(this.scene)
    hat.fillStyle(0xfbc02d)
    hat.fillEllipse(0, -16, 18, 8)
    hat.fillStyle(0xfff176)
    hat.fillEllipse(0, -18, 14, 4)
    this.add(hat)

    this.dirDot = new Phaser.GameObjects.Arc(this.scene, 0, -16, 2.2, 0, 360, false, 0x4e342e)
    this.add(this.dirDot)

    this.stateLabel = new Phaser.GameObjects.Text(
      this.scene, 0, 18, '',
      { fontSize: '8px', color: '#b2dfdb' } as Phaser.Types.GameObjects.Text.TextStyle,
    )
    this.stateLabel.setOrigin(0.5).setAlpha(0.6)
    this.add(this.stateLabel)
  }

  private _syncVisual(): void {
    this.setDepth(this.y)
    this.shadowObj.setPosition(this.x, this.y + 12).setDepth(this.y - 1)
    this.stateLabel.setText(this.task?.kind ?? this.macroState)
    this._positionStackSprites()
  }
}
