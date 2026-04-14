import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { ResourceNode } from '../entities/ResourceNode'
import { ProcessingStation } from '../entities/ProcessingStation'
import { ShopCounter } from '../entities/ShopCounter'
import { CashRegister } from '../entities/CashRegister'
import { UpgradeBoard } from '../entities/UpgradeBoard'
import { ZoneUnlockPortal } from '../entities/ZoneUnlockPortal'
import { PurchaseSlot } from '../entities/PurchaseSlot'
import { InputSystem } from '../systems/InputSystem'
import { StackSystem } from '../systems/StackSystem'
import { CustomerSystem } from '../systems/CustomerSystem'
import { WorkerAI } from '../systems/WorkerAI'
import { EconomySystem } from '../systems/EconomySystem'
import { SaveSystem } from '../systems/SaveSystem'
import { EventBus } from '../systems/EventBus'
import { RECIPE_BY_ID } from '../config/recipes'
import { ITEMS } from '../config/items'
import { ZONES } from '../config/zones'
import { BALANCE } from '../config/balance'
import type { UI } from './UI'
import type { ResourceNodeType, ZoneDef, NodeSpawnDef, StationSpawnDef } from '../types'

/**
 * Record used to materialize a real entity when a purchase slot is bought.
 * The `build` closure captures everything needed — position, zone arrays,
 * WorkerAI planner — so the event handler only needs the slotId to dispatch.
 */
interface PendingSlot {
  slot:  PurchaseSlot
  build: () => void
}

export class Game extends Phaser.Scene {
  private player!:          Player
  private inputSystem!:     InputSystem
  private stack!:           StackSystem
  private nodes:            ResourceNode[]      = []
  private stations:         ProcessingStation[] = []
  private counters:         ShopCounter[]       = []
  private registers:        CashRegister[]      = []
  private upgradeBoards:    UpgradeBoard[]      = []
  private customerSystems:  CustomerSystem[]    = []
  private workerAIs:        WorkerAI[]          = []
  private unlockPortals:    ZoneUnlockPortal[]  = []
  private purchaseSlots:    PurchaseSlot[]      = []

  /** slotId → pending build closure; fired when `slot:purchased` arrives. */
  private pendingSlots: Map<string, PendingSlot> = new Map()

  private joystickLinked = false

  // Bound EventBus handlers stored so the matching `off()` works on shutdown.
  private _onZoneUnlockedBound  = (p: { zoneId: string }): void => this._onZoneUnlocked(p.zoneId)
  private _onSlotPurchasedBound = (p: { slotId: string }): void => this._onSlotPurchased(p.slotId)
  private _onUpgradeAppliedBound = (p: { target: string; stat: string; value: number }): void => {
    if (p.target !== 'worker') return
    switch (p.stat) {
      case 'unlock':   this._assignWorkerToZone(); break
      case 'speed':    for (const ai of this.workerAIs) ai.applyWorkerSpeed(p.value);    break
      case 'maxStack': for (const ai of this.workerAIs) ai.applyWorkerMaxStack(p.value); break
    }
  }

  constructor() {
    super({ key: 'Game' })
  }

  create(): void {
    // NOTE: do NOT call `EventBus.clear()` here. The UI scene is created once
    // and never restarts; its UpgradeMenu / money-HUD listeners live on the
    // shared EventBus, and `clear()` would silently nuke them on every
    // `scene.restart()`. Instead, Game-side listeners are scoped to this
    // scene's lifetime via the shutdown hook below.
    EconomySystem.reset()

    // Phaser reuses the Scene instance across `scene.restart()`, so class
    // field initializers don't re-run — wipe the entity arrays here or stale
    // (destroyed) refs from the previous run will get tick()'d and crash.
    this.nodes           = []
    this.stations        = []
    this.counters        = []
    this.registers       = []
    this.upgradeBoards   = []
    this.customerSystems = []
    this.workerAIs       = []
    this.unlockPortals   = []
    this.purchaseSlots   = []
    this.pendingSlots    = new Map()
    this.joystickLinked  = false

    const W = 1900, H = 1000
    this.physics.world.setBounds(0, 0, W, H)
    this._buildBackground(W, H)

    this.player      = new Player(this, 500, H / 2)
    this.stack       = new StackSystem(this, this.player)
    this.inputSystem = new InputSystem(this)

    // Peek save first so we can skip the dev starting-money credit if a save
    // is about to overwrite balance anyway.
    const saved = SaveSystem.load()
    EconomySystem.init(this.player, saved === null)

    // Autosave wiring — SaveSystem listens to `economy:changed` via EventBus.
    SaveSystem.init(() => ({
      balance:       EconomySystem.balance,
      purchased:     [...EconomySystem.purchased],
      unlockedZones: [...EconomySystem.unlockedZones],
      unlockedSlots: [...EconomySystem.unlockedSlots],
    }))

    // Pre-seed unlocked zones + slots from the save BEFORE building so
    // portals / purchase markers don't spawn for things the player already
    // paid for. We do this *before* subscribing to the EventBus so the build
    // happens once via _buildZones, not twice via the event handler.
    const preUnlocked = saved?.unlockedZones ?? []
    for (const zoneId of preUnlocked) EconomySystem.forceUnlockZone(zoneId)
    const preSlots = saved?.unlockedSlots ?? []
    for (const slotId of preSlots) EconomySystem.forceUnlockSlot(slotId)

    // Listen for runtime unlock purchases (player walking up to a portal or
    // purchase slot). Bound handlers so we can `off()` them on shutdown —
    // without this, every scene.restart() would leave stale handlers on the
    // bus and trigger duplicate builds next time someone purchases.
    EventBus.on('zone:unlocked',   this._onZoneUnlockedBound)
    EventBus.on('slot:purchased',  this._onSlotPurchasedBound)
    EventBus.on('upgrade:applied', this._onUpgradeAppliedBound)
    this.events.once('shutdown', () => {
      EventBus.off('zone:unlocked',   this._onZoneUnlockedBound)
      EventBus.off('slot:purchased',  this._onSlotPurchasedBound)
      EventBus.off('upgrade:applied', this._onUpgradeAppliedBound)
      for (const w of this.workerAIs) w.destroy()
    })

    this._buildZones()

    // Load AFTER zones so WorkerAI is already listening for `upgrade:applied`
    // events — that's how purchased worker unlocks respawn their workers.
    if (saved) {
      EconomySystem.loadFromSave(saved)
    }

    // Dev hotkey: press M → +$1000. Handy for testing upgrades without grinding.
    this.input.keyboard?.on('keydown-M', () => {
      EconomySystem.devAddMoney(1000)
    })

    // Dev hotkey: press C → wipe save + restart scene for a clean state.
    this.input.keyboard?.on('keydown-C', () => {
      SaveSystem.clear()
      this.scene.restart()
    })

    this.cameras.main
      .setBounds(0, 0, W, H)
      .startFollow(this.player, true)
      .setLerp(0.1, 0.1)
  }

  update(_time: number, delta: number): void {
    // Lazy-link joystick
    if (!this.joystickLinked) {
      const ui = this.scene.get('UI') as UI
      if (ui?.joystick) { this.inputSystem.joystick = ui.joystick; this.joystickLinked = true }
    }

    const dir = this.inputSystem.getDirection()
    this.player.update(dir.x, dir.y, delta)
    this.stack.update(delta)

    for (const n of this.nodes)            n.tick(delta, this.player, this.stack)
    for (const s of this.stations)         s.tick(delta, this.player, this.stack)
    for (const c of this.counters)         c.tick(delta, this.player, this.stack)
    for (const r of this.registers)        r.tick(delta, this.player)
    for (const b of this.upgradeBoards)    b.tick(delta, this.player)
    for (const p of this.unlockPortals)    p.tick(delta, this.player)
    for (const ps of this.purchaseSlots)   ps.tick(delta, this.player)
    for (const w of this.workerAIs)        w.tick(delta)
    for (const cs of this.customerSystems) cs.tick(delta)
  }

  // ── Worker assignment ─────────────────────────────────────────────────────

  /**
   * Assign the next worker (regular or cashier) to the zone with the fewest
   * workers. This ensures that buying worker_1/2/3 distributes one worker per
   * zone instead of broadcasting to every zone planner simultaneously.
   */
  private _assignWorkerToZone(): void {
    if (this.workerAIs.length === 0) return
    let target = this.workerAIs[0]
    for (const ai of this.workerAIs) {
      if (ai.workerCount < target.workerCount) target = ai
    }
    target.spawnWorker()
  }

  // ── Zone builder ──────────────────────────────────────────────────────────

  /**
   * On scene create, build any zone that's free or already unlocked in the
   * save. Locked zones get an unlock portal in their place.
   */
  private _buildZones(): void {
    for (const zone of ZONES) {
      const alreadyUnlocked =
        zone.unlockCost === 0 || EconomySystem.isZoneUnlocked(zone.id)

      if (alreadyUnlocked) {
        this._buildZone(zone)
      } else if (zone.unlockPortalPos) {
        this._spawnUnlockPortal(zone)
      }
    }
  }

  private _buildZone(zone: ZoneDef): void {
    // Zone-scoped arrays so the WorkerAI planner only sees this zone's
    // slice of the world. Initial (already-unlocked) entities are built
    // into these arrays *before* the WorkerAI is constructed so its
    // producer maps are populated; purchase slots hold deferred build
    // closures that call registerNode/registerStation after the fact.
    const zoneNodes: ResourceNode[] = []
    const zoneStations: ProcessingStation[] = []
    const zoneCounters: ShopCounter[] = []

    // Split purchasable defs out so we can wire them up after the planner
    // exists (the build closure captures the planner ref).
    const pendingNodeDefs:    NodeSpawnDef[]    = []
    const pendingStationDefs: StationSpawnDef[] = []

    for (const def of zone.nodes) {
      if (def.purchase && !EconomySystem.isSlotUnlocked(def.purchase.slotId)) {
        pendingNodeDefs.push(def)
      } else {
        const n = new ResourceNode(this, def.x, def.y, def.type as ResourceNodeType)
        this.nodes.push(n)
        zoneNodes.push(n)
      }
    }

    for (const def of zone.stations) {
      if (def.purchase && !EconomySystem.isSlotUnlocked(def.purchase.slotId)) {
        pendingStationDefs.push(def)
      } else {
        const s = new ProcessingStation(this, def.x, def.y, def.recipeId)
        this.stations.push(s)
        zoneStations.push(s)
      }
    }

    for (const def of zone.counters) {
      const counter = new ShopCounter(this, def.x, def.y, def.itemType, def.price)
      this.counters.push(counter)
      zoneCounters.push(counter)
    }

    // Now that initial entities are in place, build the planner so its
    // producer maps and zone-center calculation see a populated world.
    const worker = new WorkerAI(this, zoneNodes, zoneStations, zoneCounters)
    this.workerAIs.push(worker)

    // Spawn deferred purchase-slot markers (closures register their entity
    // into `worker` when bought).
    for (const def of pendingNodeDefs)    this._spawnPurchaseSlotForNode(def, zone.id, worker, zoneNodes)
    for (const def of pendingStationDefs) this._spawnPurchaseSlotForStation(def, zone.id, worker, zoneStations)

    const register = new CashRegister(this, zone.cashRegisterPos.x, zone.cashRegisterPos.y)
    this.registers.push(register)

    // Tell the planner where the register is so it knows where to stand.
    worker.setRegisterPos(register.x, register.y)

    // Cashier hire — physical sign to the right of the register.
    // Uses the same PurchaseSlot / unlockedSlots save mechanism as nodes and
    // stations, so the hired cashier persists across reloads automatically.
    const cashierSlotId = `cashier_${zone.id}`
    if (EconomySystem.isSlotUnlocked(cashierSlotId)) {
      worker.spawnCashierWorker()
    } else {
      const hireSlot = new PurchaseSlot(
        this, register.x + 70, register.y,
        cashierSlotId, BALANCE.CASHIER_HIRE_COST, 'HIRE CASHIER',
      )
      this.purchaseSlots.push(hireSlot)
      this.pendingSlots.set(cashierSlotId, {
        slot:  hireSlot,
        build: () => worker.spawnCashierWorker(),
      })
    }

    // A cashier is "anyone standing near the register" — the player OR any
    // of this zone's workers. The closure is evaluated every frame by the
    // register so freshly-spawned workers are picked up automatically.
    register.setCashierCandidates(() => {
      const list: { x: number; y: number }[] = [this.player]
      for (const w of worker.workerList) list.push(w)
      return list
    })

    if (zone.upgradeBoardPos) {
      this.upgradeBoards.push(
        new UpgradeBoard(this, zone.upgradeBoardPos.x, zone.upgradeBoardPos.y),
      )
    }

    this.customerSystems.push(new CustomerSystem(
      this,
      zoneCounters,
      register,
      zone.customerSpawnPos.x,
      zone.customerSpawnPos.y,
    ))

    // Faint spawn marker (visual hint where customers come from).
    this.add
      .triangle(
        zone.customerSpawnPos.x, zone.customerSpawnPos.y,
        0, -14, -10, 6, 10, 6,
        0xffffff, 0.15,
      )
      .setDepth(-95)
  }

  private _spawnUnlockPortal(zone: ZoneDef): void {
    if (!zone.unlockPortalPos) return
    const portal = new ZoneUnlockPortal(
      this, zone.unlockPortalPos.x, zone.unlockPortalPos.y, zone.id, zone.unlockCost,
    )
    this.unlockPortals.push(portal)
  }

  // ── Purchase slots (in-world "buy extra palm / press / …") ──────────────

  private _spawnPurchaseSlotForNode(
    def:      NodeSpawnDef,
    zoneId:   string,
    worker:   WorkerAI,
    zoneArr:  ResourceNode[],
  ): void {
    if (!def.purchase) return
    const { slotId, cost } = def.purchase
    const hint = def.type.replace(/_/g, ' ').toUpperCase()
    const slot = new PurchaseSlot(this, def.x, def.y, slotId, cost, hint)
    this.purchaseSlots.push(slot)

    this.pendingSlots.set(slotId, {
      slot,
      build: () => {
        const n = new ResourceNode(this, def.x, def.y, def.type as ResourceNodeType)
        this.nodes.push(n)
        zoneArr.push(n)
        worker.registerNode(n)
        // Small pop-in
        n.setScale(0.2)
        this.tweens.add({ targets: n, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' })
      },
    })
    void zoneId
  }

  private _spawnPurchaseSlotForStation(
    def:      StationSpawnDef,
    zoneId:   string,
    worker:   WorkerAI,
    zoneArr:  ProcessingStation[],
  ): void {
    if (!def.purchase) return
    const { slotId, cost } = def.purchase
    const recipe = RECIPE_BY_ID[def.recipeId]
    const hint   = recipe ? (ITEMS[recipe.output]?.label ?? def.recipeId).toUpperCase() : def.recipeId
    const slot   = new PurchaseSlot(this, def.x, def.y, slotId, cost, hint)
    this.purchaseSlots.push(slot)

    this.pendingSlots.set(slotId, {
      slot,
      build: () => {
        const s = new ProcessingStation(this, def.x, def.y, def.recipeId)
        this.stations.push(s)
        zoneArr.push(s)
        worker.registerStation(s)
        s.setScale(0.2)
        this.tweens.add({ targets: s, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' })
      },
    })
    void zoneId
  }

  private _onSlotPurchased(slotId: string): void {
    const pending = this.pendingSlots.get(slotId)
    if (!pending) return
    this.pendingSlots.delete(slotId)

    // PurchaseSlot handles its own destroy-tween; we just drop the ref.
    const idx = this.purchaseSlots.indexOf(pending.slot)
    if (idx >= 0) this.purchaseSlots.splice(idx, 1)

    pending.build()
  }

  /**
   * Triggered for both live unlock purchases and save-restored unlocks.
   * Removes the matching portal (if any — restore happens before portals
   * are spawned, so there may be none) and builds the zone.
   */
  private _onZoneUnlocked(zoneId: string): void {
    const zone = ZONES.find((z) => z.id === zoneId)
    if (!zone) return

    const idx = this.unlockPortals.findIndex((p) => p.zoneId === zoneId)
    if (idx >= 0) {
      // The portal handles its own destroy tween on success; just drop the ref.
      this.unlockPortals.splice(idx, 1)
    }

    this._buildZone(zone)
  }

  // ── Background ────────────────────────────────────────────────────────────

  private _buildBackground(w: number, h: number): void {
    // ── Palette ────────────────────────────────────────────────────────────
    // Tropical-cartoon scheme: vivid sea, warm sand, saturated grass.
    const C = {
      seaDeep:    0x0d4f7a,
      sea:        0x1a86c2,
      seaShimmer: 0x4dd0e1,
      foam:       0xe8f5fa,
      sandDark:   0xd9a86b,
      sand:       0xf2cf86,
      sandLight:  0xffe6a8,
      grassDark:  0x35863a,
      grass:      0x55b249,
      grassLight: 0x84d36a,
      path:       0xc69356,
    }

    // Layer 0 — deep ocean
    this.add.rectangle(0, 0, w, h, C.seaDeep).setOrigin(0).setDepth(-100)

    // Layer 1 — shallow water ring (slightly inset, brighter)
    this.add.rectangle(20, 20, w - 40, h - 40, C.sea).setOrigin(0).setDepth(-99)

    // Layer 2 — animated water shimmer streaks
    const shimmerGfx = this.add.graphics().setDepth(-98.5)
    shimmerGfx.lineStyle(2, C.seaShimmer, 0.35)
    for (let i = 0; i < 14; i++) {
      const sx = 30 + Math.random() * (w - 60)
      const sy = 30 + Math.random() * (h - 60)
      // Skip streaks that would land on the sand (rough island bbox)
      if (sx > 60 && sx < w - 60 && sy > 60 && sy < h - 60) continue
      shimmerGfx.beginPath()
      shimmerGfx.moveTo(sx - 10, sy)
      shimmerGfx.lineTo(sx + 10, sy)
      shimmerGfx.strokePath()
    }
    this.tweens.add({
      targets: shimmerGfx, alpha: { from: 0.5, to: 1 },
      duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Layer 3 — sand (rounded outer beach)
    const sandGfx = this.add.graphics().setDepth(-98)
    sandGfx.fillStyle(C.sandDark)
    sandGfx.fillRoundedRect(36, 36, w - 72, h - 72, 60)
    sandGfx.fillStyle(C.sand)
    sandGfx.fillRoundedRect(44, 44, w - 88, h - 88, 56)

    // Layer 4 — foam ring at the sand/water boundary
    const foamGfx = this.add.graphics().setDepth(-97.5)
    foamGfx.lineStyle(4, C.foam, 0.7)
    foamGfx.strokeRoundedRect(38, 38, w - 76, h - 76, 60)
    foamGfx.lineStyle(2, C.foam, 0.4)
    foamGfx.strokeRoundedRect(32, 32, w - 64, h - 64, 64)
    this.tweens.add({
      targets: foamGfx, alpha: { from: 0.7, to: 1 },
      duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Layer 5 — main grass plateau (rounded, inset from sand)
    const grassGfx = this.add.graphics().setDepth(-97)
    grassGfx.fillStyle(C.grassDark)
    grassGfx.fillRoundedRect(72, 72, w - 144, h - 144, 48)
    grassGfx.fillStyle(C.grass)
    grassGfx.fillRoundedRect(76, 76, w - 152, h - 152, 46)

    // Layer 6 — subtle path between the two zones
    const pathGfx = this.add.graphics().setDepth(-96.5)
    pathGfx.fillStyle(C.path, 0.55)
    pathGfx.fillRoundedRect(900, 90, 80, h - 180, 30)

    // Layer 7 — grass tufts and dirt patches (deterministic; seeded by index)
    this._scatterGrassDetail(w, h, C)

    // Layer 8 — decorative palms around the perimeter, with sway
    for (const [px, py] of [
      [110, 110], [880, 100], [95, 920], [900, 910],
      [1060, 110], [1320, 120], [1050, 920], [1330, 920],
      [60, 480], [60, 240], [60, 720],
    ] as [number, number][]) {
      this._addDecoPalm(px, py)
    }
  }

  /** Sprinkle small grass tufts and darker shadow patches to break up the
   *  flat grass plateau. Deterministic — uses a hash so the layout doesn't
   *  shimmer between runs. */
  private _scatterGrassDetail(w: number, h: number, C: { grassDark: number; grassLight: number }): void {
    const tufts = this.add.graphics().setDepth(-96)

    // Pseudo-random with a fixed seed for stable layout
    let seed = 12345
    const rand = (): number => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }

    // ~220 small light grass tufts inside the grass area
    tufts.fillStyle(C.grassLight, 0.55)
    for (let i = 0; i < 220; i++) {
      const x = 90 + rand() * (w - 180)
      const y = 90 + rand() * (h - 180)
      // Avoid path
      if (x > 895 && x < 985) continue
      const r = 1 + rand() * 1.6
      tufts.fillCircle(x, y, r)
    }

    // ~80 darker speckles for shadow detail
    tufts.fillStyle(C.grassDark, 0.45)
    for (let i = 0; i < 80; i++) {
      const x = 90 + rand() * (w - 180)
      const y = 90 + rand() * (h - 180)
      if (x > 895 && x < 985) continue
      const r = 1 + rand() * 2
      tufts.fillCircle(x, y, r)
    }
  }

  /**
   * Decorative palm — trunk + canopy of individual fronds + coconuts + ground
   * shadow. The canopy lives in its own container so we can sway just the
   * top without rotating the trunk roots.
   */
  private _addDecoPalm(x: number, y: number): void {
    // Soft elongated ground shadow (sun top-left → shadow lower-right)
    this.add.ellipse(x + 14, y + 18, 64, 18, 0x000000, 0.22).setDepth(y - 6)
    this.add.ellipse(x + 18, y + 20, 78, 12, 0x000000, 0.12).setDepth(y - 7)

    // Trunk — segmented for texture
    const trunkGfx = this.add.graphics().setDepth(y - 4)
    // Side shadow (right of trunk)
    trunkGfx.fillStyle(0x4e2c10, 0.7)
    trunkGfx.fillRect(x + 1, y - 36, 7, 48)
    // Trunk body
    trunkGfx.fillStyle(0x7a4f2a)
    trunkGfx.fillRect(x - 5, y - 36, 9, 48)
    // Highlight
    trunkGfx.fillStyle(0xa67244, 0.9)
    trunkGfx.fillRect(x - 4, y - 36, 2, 48)
    // Trunk segment lines
    trunkGfx.fillStyle(0x4e2c10, 0.6)
    for (let i = 0; i < 5; i++) {
      trunkGfx.fillRect(x - 5, y - 32 + i * 9, 9, 1.5)
    }

    // Canopy container so the whole crown can sway as one
    const canopy = this.add.container(x, y - 36)
    canopy.setDepth(y - 3)

    const fronds = new Phaser.GameObjects.Graphics(this)

    // Fronds — 7 around the top, alternating shades for depth
    // Each frond: a triangle with a thicker base, swept outward
    const drawFrond = (angle: number, len: number, width: number, color: number, alpha = 1): void => {
      const tipX = Math.cos(angle) * len
      const tipY = Math.sin(angle) * len * 0.65            // squash for top-down feel
      const perpX = -Math.sin(angle) * width
      const perpY = Math.cos(angle) * width * 0.65
      fronds.fillStyle(color, alpha)
      fronds.fillTriangle(0, 0, tipX + perpX, tipY + perpY, tipX - perpX, tipY - perpY)
      // Center vein
      fronds.lineStyle(1, 0x1c5212, 0.6)
      fronds.beginPath(); fronds.moveTo(0, 0); fronds.lineTo(tipX, tipY); fronds.strokePath()
    }

    // Back row (darker, slightly behind)
    drawFrond(-Math.PI * 0.95, 32, 7, 0x1f6b1a)
    drawFrond(-Math.PI * 0.05, 32, 7, 0x1f6b1a)
    drawFrond(-Math.PI * 0.5,  30, 7, 0x1f6b1a)

    // Mid row (main green)
    drawFrond(-Math.PI * 0.85, 36, 8, 0x2e9c2a)
    drawFrond(-Math.PI * 0.15, 36, 8, 0x2e9c2a)
    drawFrond(-Math.PI * 0.65, 34, 8, 0x2e9c2a)
    drawFrond(-Math.PI * 0.35, 34, 8, 0x2e9c2a)

    // Front bright row
    drawFrond(-Math.PI * 0.5,  28, 6, 0x55c25b, 0.95)
    drawFrond(-Math.PI * 0.75, 26, 6, 0x55c25b, 0.95)
    drawFrond(-Math.PI * 0.25, 26, 6, 0x55c25b, 0.95)

    canopy.add(fronds)

    // Coconut cluster at base of fronds
    const coconuts = new Phaser.GameObjects.Graphics(this)
    coconuts.fillStyle(0x4e2c10)
    coconuts.fillCircle(-6, 2, 4)
    coconuts.fillCircle( 5, 3, 4)
    coconuts.fillCircle( 0, 6, 4)
    coconuts.fillStyle(0x6f4421, 0.9)
    coconuts.fillCircle(-7, 1, 1.5)
    coconuts.fillCircle( 4, 2, 1.5)
    canopy.add(coconuts)

    // Idle sway — gentle rotation of canopy only, randomised so palms aren't
    // synchronised. Period ~3.4-4.4s.
    const period = 3400 + Math.random() * 1000
    const phase  = Math.random() * 1000
    this.tweens.add({
      targets: canopy,
      angle:   { from: -2.5, to: 2.5 },
      duration: period,
      yoyo:    true,
      repeat:  -1,
      ease:    'Sine.InOut',
      delay:   phase,
    })
  }
}
