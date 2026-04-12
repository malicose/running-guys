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
- Each worker is assigned a fixed route: harvest node X → bring to station Y → bring to counter Z
- Worker is NOT intelligent — it loops its assigned route forever
- Player assigns routes by tapping worker then tapping nodes/stations in order
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
- World size: 800 × 900 px
- `ProcessingStation` has a separate output tray zone offset +68 px to the right —
  player must walk there to pick up processed items (creates natural movement)
- `ZoneDef` extended with `customerSpawnPos: { x, y }` (data-driven spawn point)
- Balance additions: `NODE_MAX_ITEMS: 6`, `TRANSFER_INTERVAL: 0.35 s`
- Y-sorting via `setDepth(y)` on every entity every frame
- Drop shadows are separate world-space objects (not container children) so their
  depth is independent of their parent entity

### Next: Phase 2

Implement in this order:
1. **Fishing spot + Grill** — second resource node + processing chain → grilled fish counter
2. **Sugar cane + Sugar mill** — third chain, sets up cocktail station later
3. **Upgrade board** — physical sign in world, player walks up → panel slides in,
   buy speed / stack upgrades with collected money (`EconomySystem`)
4. **Workers** — NPC that loops a fixed route (harvest → station → counter),
   assigned by player tapping worker then nodes (`WorkerAI` FSM)
5. **SaveSystem** — localStorage, auto-save on key events (item sold, upgrade bought)
