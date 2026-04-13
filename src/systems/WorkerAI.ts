import Phaser from 'phaser'
import { Worker } from '../entities/Worker'
import { BALANCE } from '../config/balance'
import { EventBus } from './EventBus'
import type { ResourceNode } from '../entities/ResourceNode'
import type { ProcessingStation } from '../entities/ProcessingStation'
import type { ShopCounter } from '../entities/ShopCounter'
import type { ItemId } from '../types'

/**
 * WorkerAI — zone-scoped planner. Owns one zone's nodes/stations/counters
 * and hands out tasks to its workers on demand.
 *
 * Workers are NOT bound to a fixed route. Instead, every time a worker is
 * idle it asks `pickTask(worker)` and the planner picks the most useful
 * next action by looking at the world state — primarily "which counter is
 * the most empty" and walking the production chain backward from there.
 *
 * Workers are unlocked one-by-one via `worker_1` / `worker_2` / … upgrades.
 * The system listens to `upgrade:applied` and spawns a new worker per
 * `target: 'worker', stat: 'unlock'` event. The Game scene just calls
 * `tick(delta)` once per frame.
 */

export type WorkerTaskKind =
  | 'harvest'
  | 'deliverInput'
  | 'fetchOutput'
  | 'deliverProduct'
  | 'idle'

export interface WorkerTask {
  kind:    WorkerTaskKind
  /** Where the worker should stand to perform the action */
  targetX: number
  targetY: number
  node?:    ResourceNode
  station?: ProcessingStation
  counter?: ShopCounter
}

export class WorkerAI {
  private scene:    Phaser.Scene
  private nodes:    ResourceNode[]
  private stations: ProcessingStation[]
  private counters: ShopCounter[]

  /** itemId → station that produces this item (one zone, first match) */
  private producerStation = new Map<ItemId, ProcessingStation>()
  /** itemId → node that yields this item (one zone, first match) */
  private producerNode    = new Map<ItemId, ResourceNode>()

  private workers: Worker[] = []

  private centerX: number
  private centerY: number

  /** Position of this zone's register, set after construction. Used to
   *  station a cashier worker nearby when cashier_1 is purchased. */
  private registerPos: { x: number; y: number } | null = null

  // Latest upgraded worker stats — applied to live workers when an upgrade
  // event arrives, and used as the spawn defaults so a worker bought after
  // its stat upgrades inherits the upgraded values.
  private workerSpeed:    number | null = null
  private workerMaxStack: number | null = null

  private onUpgrade = (p: { upgradeId: string; target: 'player' | 'worker'; stat: string; value: number }): void => {
    if (p.target !== 'worker') return

    switch (p.stat) {
      case 'unlock':
        this._spawnWorker()
        break
      case 'cashier':
        this._spawnCashierWorker()
        break
      case 'speed':
        this.workerSpeed = p.value
        for (const w of this.workers) w.speed = p.value
        break
      case 'maxStack':
        this.workerMaxStack = p.value
        for (const w of this.workers) w.maxStack = p.value
        break
    }
  }

  constructor(
    scene:    Phaser.Scene,
    nodes:    ResourceNode[],
    stations: ProcessingStation[],
    counters: ShopCounter[],
  ) {
    this.scene    = scene
    this.nodes    = nodes
    this.stations = stations
    this.counters = counters

    for (const s of stations) this.producerStation.set(s.recipe.output, s)
    for (const n of nodes)    this.producerNode.set(n.yieldsItem, n)

    // Zone center for spawn / idle wander — average of all entity positions
    let sx = 0, sy = 0, count = 0
    for (const arr of [nodes, stations, counters] as { x: number; y: number }[][]) {
      for (const e of arr) { sx += e.x; sy += e.y; count++ }
    }
    this.centerX = count ? sx / count : scene.cameras.main.centerX
    this.centerY = count ? sy / count : scene.cameras.main.centerY

    EventBus.on('upgrade:applied', this.onUpgrade)
  }

  tick(delta: number): void {
    for (const w of this.workers) w.tick(delta)
  }

  destroy(): void {
    EventBus.off('upgrade:applied', this.onUpgrade)
    for (const w of this.workers) w.destroy()
    this.workers = []
  }

  /** Live list of workers in this zone — used by CashRegister to know which
   *  nearby NPCs count as a cashier. */
  get workerList(): readonly Worker[] { return this.workers }

  // ── Dynamic zone growth (purchase slots) ─────────────────────────────────

  /** Plug a newly-materialized node into the planner after its PurchaseSlot
   *  was bought. Existing producer mapping is preserved if another source
   *  of the same item already exists. */
  registerNode(node: ResourceNode): void {
    this.nodes.push(node)
    if (!this.producerNode.has(node.yieldsItem)) {
      this.producerNode.set(node.yieldsItem, node)
    }
  }

  /** Same as registerNode, but for a purchased processing station. */
  registerStation(station: ProcessingStation): void {
    this.stations.push(station)
    if (!this.producerStation.has(station.recipe.output)) {
      this.producerStation.set(station.recipe.output, station)
    }
  }

  // ── Planner ───────────────────────────────────────────────────────────────

  /**
   * Pick the next task for a worker that just went idle. Returns null if
   * there's nothing useful to do — the worker should wander idly and re-ask
   * later.
   */
  pickTask(worker: Worker): WorkerTask | null {
    // 1. Carrying something → find a place for the top item.
    const top = worker.peekTop()
    if (top) {
      const t = this._findDropTask(top)
      if (t) return t
      // No place to drop — orphan item, do nothing useful with it for now.
      return null
    }

    // 2. Empty hands → walk the production graph from the most-needy counter.
    const sorted = [...this.counters]
      .filter((c) => !c.isFull)
      .sort((a, b) => this._fillRatio(a) - this._fillRatio(b))

    for (const counter of sorted) {
      const t = this._findChainTask(counter.productType, 2)
      if (t) return t
    }

    return null
  }

  /** Spawn position used by the Worker for idle wandering. */
  get zoneCenter(): { x: number; y: number } {
    return { x: this.centerX, y: this.centerY }
  }

  // ── Private — task search ─────────────────────────────────────────────────

  private _findDropTask(item: ItemId): WorkerTask | null {
    // Prefer a matching counter if it has room
    for (const c of this.counters) {
      if (c.productType === item && !c.isFull) {
        return { kind: 'deliverProduct', targetX: c.x, targetY: c.y + 10, counter: c }
      }
    }
    // Otherwise feed any station that takes this item as input
    for (const s of this.stations) {
      if (!s.recipe.input.includes(item)) continue
      if (s.inputQueue.length >= BALANCE.STATION_QUEUE_MAX) continue
      return { kind: 'deliverInput', targetX: s.x, targetY: s.y + 10, station: s }
    }
    return null
  }

  /**
   * Greedy backward chain search. Try to make progress toward `targetItem`:
   *  • If a station produces it and has output ready → go pick that up.
   *  • Else find an ingredient the station is missing and recurse one level
   *    deeper to fetch it (harvest a node, or pull from another station).
   */
  private _findChainTask(targetItem: ItemId, depth: number): WorkerTask | null {
    const station = this.producerStation.get(targetItem)

    // (a) Output already sitting in the tray → grab it.
    if (station && station.outputBuffer.length > 0) {
      return {
        kind:    'fetchOutput',
        targetX: station.outputTrayX,
        targetY: station.outputTrayY + 10,
        station,
      }
    }

    // (b) Station exists but isn't producing yet — find a missing input.
    if (station && station.inputQueue.length < BALANCE.STATION_QUEUE_MAX) {
      const queueCounts = new Map<ItemId, number>()
      for (const id of station.inputQueue) {
        queueCounts.set(id, (queueCounts.get(id) ?? 0) + 1)
      }
      // Iterate inputs in order, prefer ones we don't already have queued.
      const inputs = [...station.recipe.input].sort((a, b) =>
        (queueCounts.get(a) ?? 0) - (queueCounts.get(b) ?? 0))

      for (const inp of inputs) {
        const node = this.producerNode.get(inp)
        if (node) {
          return { kind: 'harvest', targetX: node.x - 30, targetY: node.y + 20, node }
        }
        if (depth > 0) {
          const sub = this._findChainTask(inp, depth - 1)
          if (sub) return sub
        }
      }
    }

    // (c) Last resort — if a raw node yields targetItem directly, harvest it.
    const directNode = this.producerNode.get(targetItem)
    if (directNode) {
      return { kind: 'harvest', targetX: directNode.x - 30, targetY: directNode.y + 20, node: directNode }
    }

    return null
  }

  private _fillRatio(c: ShopCounter): number {
    return c.stockCount / BALANCE.COUNTER_MAX_STOCK
  }

  // ── Register wiring ───────────────────────────────────────────────────────

  /** Called by Game._buildZone after the CashRegister is constructed so the
   *  planner knows where to post a cashier worker. */
  setRegisterPos(x: number, y: number): void {
    this.registerPos = { x, y }
  }

  // ── Private — spawn ───────────────────────────────────────────────────────

  private _spawnWorker(): void {
    const w = new Worker(this.scene, this.centerX - 30, this.centerY + 20, this)
    if (this.workerSpeed    !== null) w.speed    = this.workerSpeed
    if (this.workerMaxStack !== null) w.maxStack = this.workerMaxStack
    this.workers.push(w)
  }

  private _spawnCashierWorker(): void {
    if (!this.registerPos) return
    // Stand 40px to the right of the register so it's within CASHIER_RADIUS
    // but not obscuring the coin bag.
    const postX = this.registerPos.x + 40
    const postY = this.registerPos.y
    const w = new Worker(this.scene, postX, postY, this, true)
    w.stationaryTarget = { x: postX, y: postY }
    this.workers.push(w)
  }
}
