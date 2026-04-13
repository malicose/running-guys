# Tropical Island Stack & Sell Game

## Concept

Mobile-style casual "stack & sell" simulator playable in browser (desktop + mobile).
The player controls a character with a virtual joystick, harvests resources, processes them
into products, stocks shop counters, and collects money at the cash register.
Resources visually stack in a swaying tower behind the player's back.
Over time the player can hire NPC workers to automate parts of the production chain.

Genre references: My Perfect Hotel, Farm Land, Gold Rush 3D (Voodoo/Supersonic style)

## Tech Stack

- **Phaser 3** — game engine (WebGL + Canvas fallback)
- **TypeScript** — language
- **Vite** — build tool
- **Rex Virtual Joystick Plugin** — on-screen joystick for mobile

## Visual Style: Pseudo-3D

The game uses a **pseudo-3D top-down** perspective — the same style as My Perfect Hotel, Farm Land, etc.
Rendering is 2D (Phaser 3 sprites), but depth is faked visually:

- Camera angle: top-down tilted slightly (sprites drawn as if viewed from ~60° above)
- **Depth sorting by Y**: objects lower on screen are rendered on top (Phaser `setDepth(y)`)
- Characters and objects have a soft drop shadow beneath them
- The item stack behind the player looks volumetric because each item sprite is slightly offset up and back
- Tiles: ground is drawn flat, walls/trees have height drawn into the sprite itself
- No true Z axis — all depth is an illusion from art + Y-sort

## Setting: Tropical Island

### Production Chains

```
Palm Tree      → Coconut      → Coconut Press  → Coconut Milk  ─┐
Sugar Cane     → Sugar        → Sugar Mill     → Sugar          ─┼─ Cocktail Station → Cocktail → Counter
Fishing Spot   → Fish         → Grill          → Grilled Fish    │
Pineapple Bush → Pineapple    → Juice Press    → Pineapple Juice ┘

Counter → Customers pick up → Cash Register → Player collects 💰
```

## Entities

### Player
```typescript
position: Vector2
speed: number               // upgradeable
stackItems: Item[]          // tower behind back
maxStack: number            // upgradeable
currentAction: 'idle' | 'harvesting' | 'depositing' | 'collecting'
interactRadius: number
```

### ResourceNode (palm, sugar cane, fishing spot, pineapple)
```typescript
type: ResourceType
harvestRate: number         // items per second
respawnTime: number         // seconds until regrows
available: boolean
```

### ProcessingStation (press, grill, cocktail station)
```typescript
inputType: ItemType
outputType: ItemType
processTime: number
inputQueue: Item[]
outputBuffer: Item[]
assignedWorker?: Worker
```

### ShopCounter
```typescript
productType: ItemType
maxStock: number
currentStock: number
pricePerItem: number
```

### Customer (NPC)
```typescript
desiredItem: ItemType
state: 'entering' | 'browsing' | 'waiting' | 'leaving'
patience: number
```

### Worker (NPC)
```typescript
assignedTask: Task
state: 'idle' | 'harvesting' | 'carrying' | 'depositing'
speed: number               // upgradeable
maxStack: number            // upgradeable
```

### CashRegister
```typescript
pendingMoney: number        // accumulates until player walks up
collectRadius: number
```

## Systems

| System | Responsibility |
|---|---|
| InputSystem | Virtual joystick + keyboard, normalize direction vector |
| InteractionSystem | Overlap triggers — player near node/station/counter |
| StackSystem | Visual tower behind player, sway animation, stack limit |
| CustomerSystem | NPC spawn, pathfinding to counter and register |
| WorkerAI | Finite state machine — where to go, what to carry |
| EconomySystem | Prices, balance, buying upgrades |
| SaveSystem | localStorage, auto-save on key events |

## Progression Phases

```
Phase 1 — Start
  1 palm tree, 1 coconut press, 1 counter — player only

Phase 2 — More resources
  + fishing spot, + sugar cane, + grill

Phase 3 — Complex recipes
  Cocktail station (requires 2 ingredient types)

Phase 4 — First worker
  NPC automates one link in the chain

Phase 5 — Island expansion
  New zone with pineapples, second shop area

Phase 6 — Full automation
  3+ workers, player manages and expands
```

## Scalability: Data-Driven Architecture

All content (items, recipes, stations, zones, upgrades) is defined as data in config files.
Adding new content = adding a new entry in a config. No changes to entity/system code.

### Item Registry
```typescript
// config/items.ts
export const ITEMS: Record<string, ItemDef> = {
  coconut:        { label: 'Coconut',       color: 0xc8a96e, stackable: true },
  coconut_milk:   { label: 'Coconut Milk',  color: 0xfff8dc, stackable: true },
  fish:           { label: 'Fish',          color: 0x4fc3f7, stackable: true },
  grilled_fish:   { label: 'Grilled Fish',  color: 0xff8c42, stackable: true },
  sugarcane:      { label: 'Sugar Cane',    color: 0xa5d6a7, stackable: true },
  sugar:          { label: 'Sugar',         color: 0xffffff, stackable: true },
  pineapple:      { label: 'Pineapple',     color: 0xffd54f, stackable: true },
  pineapple_juice:{ label: 'Pineapple Juice',color: 0xffeb3b, stackable: true },
  cocktail:       { label: 'Cocktail',      color: 0xff4081, stackable: true },
  // add new item = add one entry here
}
```

### Recipe Registry
```typescript
// config/recipes.ts
export const RECIPES: RecipeDef[] = [
  { id: 'coconut_press',    input: ['coconut'],              output: 'coconut_milk',    time: 1.5 },
  { id: 'grill',            input: ['fish'],                 output: 'grilled_fish',    time: 2.0 },
  { id: 'sugar_mill',       input: ['sugarcane'],            output: 'sugar',           time: 1.2 },
  { id: 'juice_press',      input: ['pineapple'],            output: 'pineapple_juice', time: 1.2 },
  { id: 'cocktail_station', input: ['coconut_milk', 'sugar'],output: 'cocktail',        time: 3.0 },
  // add new recipe = add one entry here
]
```

### Zone Registry
```typescript
// config/zones.ts
export const ZONES: ZoneDef[] = [
  {
    id: 'beach_bar',
    unlockCost: 0,
    nodes:    [{ type: 'palm_tree', ... }, { type: 'fishing_spot', ... }],
    stations: [{ recipeId: 'coconut_press', ... }, { recipeId: 'grill', ... }],
    counters: [{ itemType: 'coconut_milk', price: 10 }, { itemType: 'grilled_fish', price: 15 }],
  },
  {
    id: 'cocktail_corner',
    unlockCost: 500,
    nodes:    [{ type: 'sugarcane_field', ... }, { type: 'pineapple_bush', ... }],
    stations: [{ recipeId: 'sugar_mill', ... }, { recipeId: 'cocktail_station', ... }],
    counters: [{ itemType: 'cocktail', price: 30 }],
  },
  // new island zone = new entry here
]
```

### Upgrade Registry
```typescript
// config/upgrades.ts
export const UPGRADES: UpgradeDef[] = [
  { id: 'stack_1',   target: 'player',  stat: 'maxStack',  value: 10, cost: 100 },
  { id: 'stack_2',   target: 'player',  stat: 'maxStack',  value: 20, cost: 300 },
  { id: 'speed_1',   target: 'player',  stat: 'speed',     value: 180, cost: 150 },
  { id: 'worker_1',  target: 'worker',  stat: 'unlock',    value: 1,  cost: 500 },
  // new upgrade = new entry here
]
```

### Event Bus — decoupled system communication
```typescript
// systems/EventBus.ts
// Systems emit events instead of calling each other directly.
// New mechanics (quests, achievements, sounds) just subscribe — no existing code changes.

EventBus.emit('item:harvested',  { item: 'coconut', nodeId: 'palm_1' })
EventBus.emit('item:processed',  { input: 'coconut', output: 'coconut_milk' })
EventBus.emit('item:sold',       { item: 'coconut_milk', price: 10 })
EventBus.emit('money:collected', { amount: 10 })
EventBus.emit('zone:unlocked',   { zoneId: 'cocktail_corner' })
EventBus.emit('upgrade:bought',  { upgradeId: 'stack_1' })
```

## File Structure

```
src/
  scenes/
    Boot.ts          // asset loading
    Game.ts          // main scene, reads zone configs to build world
    UI.ts            // overlay (always on top)
  entities/
    Player.ts
    Worker.ts        // generic — behaviour driven by assigned task
    Customer.ts
    ResourceNode.ts  // generic — type driven by ItemRegistry
    ProcessingStation.ts  // generic — logic driven by RecipeRegistry
    ShopCounter.ts
    CashRegister.ts
  systems/
    InputSystem.ts
    StackSystem.ts
    InteractionSystem.ts
    CustomerSystem.ts
    WorkerAI.ts
    EconomySystem.ts
    SaveSystem.ts
    EventBus.ts      // central event bus
  config/
    items.ts         // ItemRegistry — all item definitions
    recipes.ts       // RecipeRegistry — all production recipes
    zones.ts         // ZoneRegistry — all island zones and their contents
    upgrades.ts      // UpgradeRegistry — all upgrade definitions
    balance.ts       // numeric constants (prices, timings, spawn rates)
  ui/
    Joystick.ts
    MoneyDisplay.ts
    UpgradeMenu.ts
  types/
    index.ts         // all shared interfaces (ItemDef, RecipeDef, ZoneDef, etc.)
```

## Item Types

```typescript
// Defined in config/items.ts — not as enums, as a registry
// so new items need zero code changes outside of items.ts

type ItemId = string  // 'coconut' | 'coconut_milk' | 'fish' | etc.
```

## Genre Mechanics Reference

This is a "stack & sell" casual simulator. The mechanics below are NON-NEGOTIABLE —
they define the genre feel. Implement them exactly as described.

### Camera & View
- Top-down view, slightly angled (not isometric — just top-down with mild perspective)
- Camera follows player smoothly (slight lag/lerp, not instant)
- World is always visible — no fog of war, no scrolling off-screen elements

### Controls
- **Virtual joystick** rendered in bottom-left area of screen (always visible on mobile)
- Joystick activates on touch anywhere in the left 40% of screen (not just on the thumb pad)
- On desktop: WASD or arrow keys
- **No action buttons** — everything happens automatically by proximity
- Player faces the direction of movement (8-directional or smooth rotation)

### The Stack — most important visual in the game
- Resources and products are carried as a **vertical tower of items behind the player's back**
- Each item in the stack is a distinct colored square/icon (not a number counter)
- Stack sways left/right as the player walks — items follow each other with slight delay (chain physics)
- When an item is added, it pops in from below with a small bounce animation
- When an item is removed, the stack shrinks from the top
- Stack has a hard limit (starts at 5). When full, player cannot pick up more items
- A subtle indicator (color change or shake) shows when stack is full

### Harvesting (ResourceNode interaction)
- Player walks into the overlap zone of a resource node (palm tree, fishing spot, etc.)
- Harvesting starts **automatically** — no button press
- Items are added to the player's stack one by one at a fixed rate (e.g. 1 per 0.8s)
- Harvesting stops when: stack is full OR player walks away OR node is depleted
- Node shows a visual depletion state (wilted, empty) and respawns after a timer
- A small progress ring or fill bar shows above the node while being harvested

### Processing Station interaction
- Player walks into the station's drop zone carrying the required input items
- Items are **automatically transferred** from player stack to station input queue, one by one
- Station processes items one at a time with a visible animation (spinning, bubbling, etc.)
- A progress bar above the station shows current item processing progress
- Output items appear in an output tray next to the station
- Player walks into the output tray zone → items auto-transfer to player stack
- Station queue is visible (small item icons showing what's waiting)

### Shop Counter interaction
- Player walks into the counter's drop zone carrying the matching product
- Products are **automatically placed** onto the counter from the player's stack
- Counter shows its stock visually — items displayed as a small stack on the counter surface
- Counter has a max stock limit (e.g. 5 items)
- A label shows the item name and price

### Customer NPC behavior
- Customers spawn from a fixed entrance point at regular intervals
- Customer walks to the counter that has the product they want
- Picks up one item, walks to the cash register, deposits money, then walks to exit
- Customer has a patience timer — if counter is empty too long, they leave unhappy
- Multiple customers can be present simultaneously, queuing at counters

### Cash Register
- Money **accumulates passively** at the register as customers pay
- A floating coin icon or money bag above the register shows pending amount
- Player walks up → coins fly from register to player with animation, number floats up
- Register does not block customers — they drop money and leave without waiting for player

### Visual Feedback — essential for game feel
Every action needs immediate visual + audio feedback:
- Item harvested: small pop/bounce on stack, satisfying sound
- Item processed: output item "launches" into the tray
- Item placed on counter: counter stack grows with bounce
- Money collected: coins arc toward player, "+$10" floats up and fades
- Stack full: brief red flash or shake on stack
- Worker assigned: worker walks to task with purposeful animation

### Workers (post-prototype)
- Workers are NPCs that follow the same proximity rules as the player
- Workers are autonomous: each zone has a planner that hands tasks to its
  workers based on world state. Workers do not need (and the player cannot
  set) per-worker routes — the planner picks the most useful next action
  every time a worker goes idle, prioritising the most-empty counter and
  walking the production chain backwards from there
- Workers have their own visible stack (smaller than player's)

### Upgrade Shop
- A physical board/sign in the world (not a pause menu)
- Player walks up to it → upgrade panel slides in from the side
- Upgrades listed with icon, description, cost, and buy button
- Buying an upgrade has a satisfying animation (sparkle, level-up effect)

## First Prototype Scope (start here)

Implement in this order:
1. Vite + Phaser 3 + TypeScript project setup
2. Tilemap — simple tropical island (beach, grass, water border)
3. Player — WASD + virtual joystick movement, top-down 8-direction
4. ResourceNode — one palm tree, player walks up and coconuts appear in stack
5. StackSystem — coconuts stack as colored squares behind player, sway animation
6. ProcessingStation — walk to press, dump coconuts, it outputs coconut milk after delay
7. ShopCounter — walk to counter, place coconut milk, NPC customer walks up and takes it
8. CashRegister — pending money counter, player walks up to collect with coin animation

Do NOT implement workers, upgrades, or save system until the prototype loop is complete and fun.

## Balance Notes

- Max stack starts at 5, upgrades to 10 / 20 / 50
- Processing time: 1.5s per item
- Customer spawn interval: 8s (decreases with upgrades)
- Base prices: coconut milk 10, grilled fish 15, cocktail 30, pineapple juice 12

## Implementation Status

### Prototype — DONE ✅

All 8 steps complete. Full loop works end-to-end:

```
palm tree → stack (chain physics) → coconut press → output tray
→ shop counter → customer NPC (state machine) → cash register → player collects coins
```

**Implementation notes (decisions made during build):**
- World size originally 800 × 900, expanded to **1000 × 1000** during Phase 2
  to fit three parallel production chains + cocktail station
- `ProcessingStation` has a separate output tray zone offset +68 px to the right —
  player must walk there to pick up processed items (creates natural movement)
- `ZoneDef` extended with `customerSpawnPos: { x, y }` (data-driven spawn point)
- Balance additions: `NODE_MAX_ITEMS: 6`, `TRANSFER_INTERVAL: 0.35 s`
- Y-sorting via `setDepth(y)` on every entity every frame
- Drop shadows are separate world-space objects (not container children) so their
  depth is independent of their parent entity

### Phase 2 — DONE ✅

All five steps complete. The `beach_bar` zone now runs three parallel chains
(coconut / fish / sugar) + a cocktail station that combines two inputs, with
worker automation and persistent saves.

1. ✅ **Fishing spot + Grill** — second chain. `fish` / `grilled_fish` items
   and `grill` recipe already existed; added `fishing_spot` node to
   `zones.ts` and a proper pond+dock visual in `ResourceNode._drawFishingSpotFull`
   (dispatched by `nodeType`, replacing the palm-tree-only hardcode).
2. ✅ **Sugar cane + Sugar mill + Cocktail station** — third chain plus the
   first multi-ingredient recipe. Activated the already-written
   `ProcessingStation._hasRequiredInputs()` which had no in-game user until now.
3. ✅ **Upgrade board** — new `UpgradeBoard` entity (wooden sign in world) +
   new `EconomySystem` singleton (balance + purchased set, authoritative source)
   + new `UpgradeMenu` slide-in panel in the UI scene. `UI.ts` money HUD now
   reads from `EconomySystem` via `economy:changed` instead of tracking its
   own counter.
4. ✅ **Workers** — new `Worker` entity with own mini-stack, plus a new
   `WorkerAI` system that spawns workers by listening to `upgrade:applied` on
   the EventBus. Originally shipped with an 8-state FSM and data-driven
   `zone.workerRoutes`; **rewritten in Phase 3** as autonomous workers
   driven by a per-zone planner — see Phase 3 notes below.
5. ✅ **SaveSystem** — new `SaveSystem` singleton. Persists `{balance, purchased[]}`
   to `localStorage` key `stackandsell.save` with 500 ms debounced autosave on
   `economy:changed`. On load, `EconomySystem.loadFromSave()` re-emits
   `upgrade:applied` for each restored upgrade, which causes `WorkerAI` to respawn
   previously unlocked workers without special-case code.

**Implementation notes & decisions from Phase 2:**
- **Entity worker-facing API**: `ResourceNode.tryTakeItem()`,
  `ProcessingStation.tryDepositInput() / tryTakeOutput()`,
  `ShopCounter.tryDepositProduct()`. These bypass the player-proximity checks
  used by the existing `tick()` flow so workers can interact directly.
  Player harvest still goes through `tick()`; worker harvest calls
  `tryTakeItem()` and throttles itself.
- **Shared node depletion**: player and worker share the same `remaining`
  counter on a node — they compete for coconuts off the same palm.
- **Zone-scoped builder arrays**: `_buildZones()` keeps zone-local
  `zoneNodes / zoneStations / zoneCounters` arrays so the per-zone
  `WorkerAI` planner only sees its own slice of the world (previously only
  `zoneCounters` was local).
- **Upgrade effects are applied directly via a Player reference**
  held by `EconomySystem._player`. `worker_1` has `stat: 'unlock'` which
  stores in `purchased` but has no direct player stat effect — `WorkerAI`
  is the actual consumer via the re-emitted `upgrade:applied` event.
- **What's NOT saved**: stack contents, node depletion, station queues,
  counter stocks, active customers, `CashRegister.pendingMoney`, player
  position. All ephemeral — regenerated in a blank-but-functional state on
  load. Saving only the economy snapshot keeps the save file tiny and
  avoids coupling the save format to entity internals.
- **Load ordering is critical**: `SaveSystem.load()` is called *before*
  `EconomySystem.init()` so the dev starting-money credit can be skipped,
  and `loadFromSave()` is called *after* `_buildZones()` so `WorkerAI` is
  already subscribed when upgrade events are re-emitted. Both ordering
  requirements are commented inline in `Game.create()`.
- **Pre-existing type bug fixed**: the `private input!: InputSystem` field
  on the Game scene was shadowing Phaser's built-in public
  `Phaser.Scene.input: InputPlugin`, cascading TS2416/TS2345 errors across
  every `new Entity(this, …)` call. Renamed the field to `inputSystem`.
- **Dev testing**: `BALANCE.DEV_STARTING_MONEY` (currently 2000) credits on
  fresh start (skipped when a save is loaded). Hotkeys: `M` → +$1000,
  `C` → wipe save + restart scene. Remove both when shipping.
- **Visuals are still procedural** via `Phaser.GameObjects.Graphics` — no
  sprite assets yet. Architecture is sprite-ready: entity classes
  encapsulate rendering, so a later pass can replace the `Graphics` calls
  with `Sprite`/`Image` without touching systems. `ITEMS[id].color` is the
  extension point for stack item icons when sprites arrive.

### Phase 3 — DONE ✅

1. ✅ **New zone — `cocktail_corner`** with the pineapple chain
   (`pineapple_bush → juice_press → pineapple_juice` counter at $12) and a
   real unlock mechanism. New `ZoneUnlockPortal` entity (stone arch sign with
   a price tag) is spawned in place of any zone whose `unlockCost > 0`.
   Walking up to the portal auto-charges the player when affordable, fires
   `zone:unlocked` on the EventBus, and the Game scene swaps the portal out
   for the actual zone in-place. World expanded to **1400 × 1000** to make
   room.
2. ✅ **Autonomous workers** — the original fixed-route worker system was
   replaced. `WorkerRouteDef` and `zone.workerRoutes` are gone. Each zone now
   instantiates exactly one `WorkerAI` planner regardless of upgrade state;
   when a `worker_N` upgrade fires, the planner spawns a new `Worker`
   pointed at itself. Workers run a tiny 3-state macro FSM
   (`idle → moving → acting`) and ask the planner for a fresh task every
   time they go idle.

**Implementation notes & decisions from Phase 3:**
- **SaveSystem v2**: payload now `{version: 2, balance, purchased[],
  unlockedZones[]}`. v1 saves still load via a one-line migration that
  treats `unlockedZones` as empty. Pre-seed of unlocked zones happens
  *before* subscribing to `zone:unlocked` in `Game.create()` so save-restored
  zones build exactly once via `_buildZones()`, not twice via the event
  handler.
- **Phaser scene reuse footgun**: `scene.restart()` reuses the Scene
  instance — class field initializers do NOT re-run, so stale entity refs
  from the previous run leak into the next tick and crash. `Game.create()`
  now wipes `nodes/stations/counters/registers/upgradeBoards/customerSystems/`
  `workerAIs/unlockPortals` arrays and `joystickLinked` at the top.
- **Worker planner algorithm** (`WorkerAI.pickTask`):
  1. If the worker is carrying something → find the first counter that
     accepts it (and isn't full), else any station whose recipe takes it.
     Never drop items.
  2. Otherwise sort the zone's counters by `stockCount / MAX` ascending
     (most empty first) and walk the production graph backwards from each:
     - Station that produces the target has output ready → `fetchOutput`
     - Else find a missing recipe input the station needs:
       - A node yielding that input → `harvest`
       - Or recurse one level deeper for an upstream station's output
     - Last resort — direct node yielding the target item.
  Recursion depth is capped at 2 (enough for the 2-step
  cocktail_station → coconut_press / sugar_mill chain).
- **Producer maps** (`producerStation: Map<itemId, station>`,
  `producerNode: Map<itemId, node>`) are built once in the WorkerAI
  constructor from the zone's slice — O(1) lookups during planning.
- **Zone-local planner**: `WorkerAI` is constructed unconditionally per zone
  in `_buildZone()` — even if no worker has been unlocked yet — so the
  `upgrade:applied` listener is in place when the player buys their first
  `worker_N`.
- **Worker.state name collision**: `Phaser.GameObjects.Container` already
  exposes a public `state` field, so the worker's macro state lives on
  `macroState` instead — TS2415 if you forget.

### Phase 5 — DONE ✅

1. ✅ **In-world purchase slots for extra nodes & stations** — new
   [PurchaseSlot](src/entities/PurchaseSlot.ts) entity. `NodeSpawnDef` /
   `StationSpawnDef` gained an optional `purchase?: { slotId; cost }` field
   in [types/index.ts](src/types/index.ts); any entry with it starts as a
   dashed-footprint marker in the world instead of a real entity, and
   materializes in place when the player walks onto it and pays. Unlike
   the upgrade-menu route, purchases are physical — you stand on the spot.
   [zones.ts](src/config/zones.ts) now ships 3 extra resource nodes + 3
   extra processing stations in `beach_bar`, plus a duplicate pineapple
   bush + juice press in `cocktail_corner`.

2. ✅ **Queue system (counter + register)** — every
   [ShopCounter](src/entities/ShopCounter.ts) and
   [CashRegister](src/entities/CashRegister.ts) now owns an ordered
   `queue: Customer[]` with `joinQueue / leaveQueue / indexOfInQueue /
   getQueueSlotPos` API. Customers walk to the slot position computed
   from their live index in the queue; when the head leaves, everyone's
   index shifts and they naturally step forward on the next tick. Queue
   geometry is config-driven via `BALANCE.QUEUE_FRONT_OFFSET` /
   `QUEUE_SLOT_SPACING`; past `COUNTER_QUEUE_CAP_SLOTS` /
   `REGISTER_QUEUE_CAP_SLOTS` extras pile onto the last slot (unbounded
   queue length, capped visible slots).

3. ✅ **Cashier gating on the register** — customers at the head of the
   register queue can only deposit money while a "cashier" is within
   `BALANCE.CASHIER_RADIUS`. A cashier is *any* entity with `{x, y}`:
   the player or any worker in the zone. `CashRegister` takes a
   `setCashierCandidates(fn)` hook and re-evaluates the list every frame,
   so workers unlocked mid-game are picked up automatically. A small
   ✓/✗ indicator above the register shows current cashier status.

4. ✅ **Customer patience removed** — `CUSTOMER_PATIENCE` and the
   patience-bar visuals are gone; customers wait indefinitely.
   [Customer](src/entities/Customer.ts) FSM simplified to three states
   (`queueing_counter / queueing_register / leaving`). Spawn interval
   dropped from 8 s → 2.2 s and a new `CUSTOMER_MAX_PER_ZONE` soft cap
   (24) prevents runaway queues if production stalls.
   [CustomerSystem](src/systems/CustomerSystem.ts) now always spawns —
   target counter is picked by shortest queue, tie-broken by most stock.

**Implementation notes & decisions from Phase 5:**
- **SaveSystem v3**: payload now
  `{version: 3, balance, purchased, unlockedZones, unlockedSlots}`. v1
  and v2 saves migrate by treating the missing fields as empty.
- **Purchase slot wiring** ([Game.ts](src/scenes/Game.ts)): zone build
  is a two-pass operation. Pass 1 constructs initial (already-unlocked)
  nodes/stations into zone-local arrays. Pass 2 constructs the
  `WorkerAI` planner from those arrays (so its `producerNode` /
  `producerStation` maps and zone-center calculation see a populated
  world). Pass 3 spawns `PurchaseSlot` markers for deferred entries;
  each marker's build closure captures the planner ref and calls
  `worker.registerNode / registerStation` on purchase so the planner
  learns about the new entity without having to rebuild.
- **`WorkerAI.workerList`**: new readonly getter exposing the live
  `workers[]`. Used by `CashRegister.setCashierCandidates` to build the
  cashier list each frame (player + zone workers).
- **`WorkerAI.registerNode / registerStation`**: append to internal
  arrays and add to producer maps *only if absent*. Buying a second
  palm tree does not override the first palm as the canonical producer
  of `coconut` — the planner happily routes through either.
- **Customer FSM**: patience removed entirely. The `ARRIVE_DIST` check
  is now 6 px (tight) so customers reach their exact slot before the
  "am I the head?" check triggers. Destroy() defensively calls
  `counter.leaveQueue(this)` / `register.leaveQueue(this)` in case a
  customer is destroyed mid-flight.
- **CustomerSystem cap**: `CUSTOMER_MAX_PER_ZONE = 24`. With no
  patience, customers who can't be served just accumulate forever; the
  cap prevents memory/perf blowup if the player abandons a zone. Spawn
  is paused while at the cap, not denied-and-retimed.
- **`ShopCounter.tick` unchanged path**: the player can still walk up
  and drop stock on a counter that has a customer queue — the transfer
  path doesn't touch the queue, it just happens alongside it.
- **Config payload deliberately light**: each purchase slot carries
  only `slotId + cost`. The *type* / *recipeId* / *position* come from
  the same spawn def the pass-through path uses, so a purchased entry
  is identical to a pre-placed one in every respect except gating.

### Phase 4 — DONE ✅

1. ✅ **Worker stat upgrades** — `worker_speed_1/2` and `worker_stack_1/2`
   live in [upgrades.ts](src/config/upgrades.ts). `EconomySystem` does not
   apply them directly; instead `WorkerAI.onUpgrade` handles any
   `target: 'worker'` event — `unlock` spawns a worker, `speed`/`maxStack`
   walk the live `workers[]` and mutate in place. The latest upgraded
   values are also cached on `WorkerAI` (`workerSpeed`, `workerMaxStack`)
   so workers spawned *after* the stat upgrade inherit the upgraded values
   on spawn (applies on save-load too, since `upgrade:applied` events are
   re-emitted by `EconomySystem.loadFromSave()` in purchase order and the
   stat events land before the unlock events that spawn the workers — as
   long as the config keeps unlocks before stat upgrades in the order
   they're saved, which they are because prereq chains enforce it).

2. ✅ **Per-item icon registry** — [src/ui/itemIcons.ts](src/ui/itemIcons.ts)
   has bespoke `Graphics` drawers for every item in `ITEMS` (coconut,
   coconut_milk, fish, grilled_fish, sugarcane, sugar, pineapple,
   pineapple_juice, cocktail). Drawers render into the local frame of the
   passed `Graphics` centered at (0,0), bounded by `size × size`. All
   visible stacks consume them: player stack via
   [StackSystem](src/systems/StackSystem.ts), worker mini-stack via
   [Worker](src/entities/Worker.ts), station input queue + output tray
   via [ProcessingStation](src/entities/ProcessingStation.ts), and shop
   counter visible stock via [ShopCounter](src/entities/ShopCounter.ts).
   One drawer per item = a coconut looks like a coconut everywhere, not
   a beige box on the player and a brown circle on the tree.

### Next: Phase 6+

Roadmap candidates, roughly in priority order:

1. **Dedicated cashier worker** — a stationary NPC bought via upgrade
   that parks itself next to a register permanently. Current cashier
   check already accepts any `{x,y}` so the mechanic is in place; just
   needs a new `Worker` subtype (or a `stationaryTarget` on the existing
   one) plus an `upgrades.ts` entry.
2. **More zones** — third+ island zone behind a higher unlock cost. The
   portal/planner/save pipeline already supports this; need content: 1–2
   new items with icons in [itemIcons.ts](src/ui/itemIcons.ts), recipes
   in [recipes.ts](src/config/recipes.ts), and a new entry in
   [zones.ts](src/config/zones.ts).
3. **Sound + polish** — background music, harvest/process/sell/coin SFX,
   camera shakes on big events. Biggest game-feel win per hour of work.
4. **Sprite-based art pass** — replace procedural `Graphics` visuals with
   real sprite assets. Architecture is sprite-ready (entities encapsulate
   rendering) but procedural icons read well enough that this can wait.
