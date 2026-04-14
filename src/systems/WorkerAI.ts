import Phaser from 'phaser'
import { Worker } from '../entities/Worker'
import { BALANCE } from '../config/balance'
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

  // ── Claim tracking ────────────────────────────────────────────────────────
  // Prevents multiple workers from being assigned the same node/station at
  // the same time. Claims are released when a worker's task is cleared.
  private claimedNodes    = new Set<ResourceNode>()
  private claimedStations = new Set<ProcessingStation>()   // fetchOutput only
  private workerClaims    = new Map<Worker, { node?: ResourceNode; station?: ProcessingStation }>()

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

  }

  tick(delta: number): void {
    for (const w of this.workers) w.tick(delta)
  }

  destroy(): void {
    for (const w of this.workers) w.destroy()
    this.workers = []
  }

  /** Live list of workers in this zone — used by CashRegister to know which
   *  nearby NPCs count as a cashier. */
  get workerList(): readonly Worker[] { return this.workers }

  /** Number of workers currently in this zone. Used by Game.ts for round-robin assignment. */
  get workerCount(): number { return this.workers.length }

  // ── Called by Game.ts (not EventBus) so workers go to the right zone ──────

  /** Spawn a regular roaming worker in this zone. */
  spawnWorker(): void {
    this._spawnWorker()
  }

  /** Spawn a stationary cashier worker next to this zone's register. */
  spawnCashierWorker(): void {
    this._spawnCashierWorker()
  }

  /** Apply a speed upgrade to all current and future workers in this zone. */
  applyWorkerSpeed(speed: number): void {
    this.workerSpeed = speed
    for (const w of this.workers) w.speed = speed
  }

  /** Apply a maxStack upgrade to all current and future workers in this zone. */
  applyWorkerMaxStack(maxStack: number): void {
    this.workerMaxStack = maxStack
    for (const w of this.workers) w.maxStack = maxStack
  }

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
    // Release any resource this worker previously claimed so the search
    // below can consider it for reassignment.
    this.releaseWorkerClaim(worker)

    // 1. Carrying something → find a place for the top item.
    const top = worker.peekTop()
    if (top) {
      const t = this._findDropTask(top)
      if (t) { this._applyClaim(worker, t); return t }
      // No place to drop — orphan item, do nothing useful with it for now.
      return null
    }

    // 2. Empty hands → walk the production graph from the most-needy counter.
    const sorted = [...this.counters]
      .filter((c) => !c.isFull)
      .sort((a, b) => this._fillRatio(a) - this._fillRatio(b))

    for (const counter of sorted) {
      const t = this._findChainTask(counter.productType, 2)
      if (t) { this._applyClaim(worker, t); return t }
    }

    return null
  }

  /** Spawn position used by the Worker for idle wandering. */
  get zoneCenter(): { x: number; y: number } {
    return { x: this.centerX, y: this.centerY }
  }

  /**
   * Release the claim held by this worker. Called by the worker itself when
   * its task is cleared (bailed, completed, or depleted), so the freed
   * resource is immediately available to the next idle worker.
   */
  releaseWorkerClaim(worker: Worker): void {
    const claim = this.workerClaims.get(worker)
    if (!claim) return
    if (claim.node)    this.claimedNodes.delete(claim.node)
    if (claim.station) this.claimedStations.delete(claim.station)
    this.workerClaims.delete(worker)
  }

  // ── Private — claim helpers ───────────────────────────────────────────────

  /** Find the first unclaimed node that yields `itemId`. Falls back to any
   *  node in `this.nodes` so purchased secondary nodes (palm #2, etc.) are
   *  used once the primary is already claimed. */
  private _findUnclaimedNode(itemId: ItemId): ResourceNode | undefined {
    const primary = this.producerNode.get(itemId)
    if (primary && !this.claimedNodes.has(primary)) return primary
    return this.nodes.find(n => n.yieldsItem === itemId && !this.claimedNodes.has(n))
  }

  /** Find the first unclaimed station that outputs `itemId` and has items
   *  ready in its output buffer. */
  private _findUnclaimedStationWithOutput(itemId: ItemId): ProcessingStation | undefined {
    const primary = this.producerStation.get(itemId)
    if (primary && primary.outputBuffer.length > 0 && !this.claimedStations.has(primary)) {
      return primary
    }
    return this.stations.find(
      s => s.recipe.output === itemId && s.outputBuffer.length > 0 && !this.claimedStations.has(s),
    )
  }

  private _applyClaim(worker: Worker, task: WorkerTask): void {
    const claim: { node?: ResourceNode; station?: ProcessingStation } = {}
    if (task.kind === 'harvest' && task.node) {
      claim.node = task.node
      this.claimedNodes.add(task.node)
    } else if (task.kind === 'fetchOutput' && task.station) {
      claim.station = task.station
      this.claimedStations.add(task.station)
    }
    this.workerClaims.set(worker, claim)
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
   *
   * Claimed nodes and stations are skipped so workers spread across
   * different resources instead of piling onto the same one.
   */
  private _findChainTask(targetItem: ItemId, depth: number): WorkerTask | null {
    // (a) Output already sitting in the tray → grab it (if unclaimed).
    const stationWithOutput = this._findUnclaimedStationWithOutput(targetItem)
    if (stationWithOutput) {
      return {
        kind:    'fetchOutput',
        targetX: stationWithOutput.outputTrayX,
        targetY: stationWithOutput.outputTrayY + 10,
        station: stationWithOutput,
      }
    }

    // (b) Station exists but isn't producing yet — find a missing input.
    const station = this.producerStation.get(targetItem)
    if (station && station.inputQueue.length < BALANCE.STATION_QUEUE_MAX) {
      const queueCounts = new Map<ItemId, number>()
      for (const id of station.inputQueue) {
        queueCounts.set(id, (queueCounts.get(id) ?? 0) + 1)
      }
      // Iterate inputs in order, prefer ones we don't already have queued.
      const inputs = [...station.recipe.input].sort((a, b) =>
        (queueCounts.get(a) ?? 0) - (queueCounts.get(b) ?? 0))

      for (const inp of inputs) {
        const node = this._findUnclaimedNode(inp)
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
    const directNode = this._findUnclaimedNode(targetItem)
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
