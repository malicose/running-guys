// ─── Item ────────────────────────────────────────────────────────────────────

export type ItemId = string

export interface ItemDef {
  label: string
  color: number       // 0xRRGGBB hex color for the stack square
  stackable: boolean
}

// ─── Recipe ──────────────────────────────────────────────────────────────────

export interface RecipeDef {
  id: string
  input: ItemId[]     // one or more required input types
  output: ItemId
  time: number        // seconds to process one batch
}

// ─── Zone ────────────────────────────────────────────────────────────────────

/**
 * Optional "buy in-world" gating for an entity. If set, the entity is NOT
 * spawned on zone build — instead a PurchaseSlot marker appears at the same
 * position, which the player can walk onto to pay `cost` and materialize
 * the real entity in-place. Purchased slot ids persist via SaveSystem.
 */
export interface PurchaseInfo {
  slotId: string
  cost:   number
}

export interface NodeSpawnDef {
  type: string        // matches a ResourceNodeType
  x: number
  y: number
  purchase?: PurchaseInfo
}

export interface StationSpawnDef {
  recipeId: string    // matches a RecipeDef.id
  x: number
  y: number
  purchase?: PurchaseInfo
}

export interface CounterSpawnDef {
  itemType: ItemId
  price: number
  x: number
  y: number
}

export interface ZoneDef {
  id: string
  unlockCost: number
  nodes: NodeSpawnDef[]
  stations: StationSpawnDef[]
  counters: CounterSpawnDef[]
  cashRegisterPos:   { x: number; y: number }
  customerSpawnPos:  { x: number; y: number }
  upgradeBoardPos?:  { x: number; y: number }
  /** World position of the unlock portal — required when unlockCost > 0. */
  unlockPortalPos?:  { x: number; y: number }
}

// ─── Upgrade ─────────────────────────────────────────────────────────────────

export type UpgradeTarget = 'player' | 'worker' | 'station'
export type UpgradeStat = 'maxStack' | 'speed' | 'unlock' | 'cashier' | 'processSpeed' | 'queueMax'

export interface UpgradeDef {
  id: string
  target: UpgradeTarget
  stat: UpgradeStat
  value: number
  cost: number
  prerequisite?: string   // upgradeId that must be bought first
}

// ─── Stack item (runtime) ─────────────────────────────────────────────────────

export interface StackItem {
  id: ItemId
  worldX: number
  worldY: number
}

// ─── EventBus payloads ───────────────────────────────────────────────────────

export interface EventMap {
  'item:harvested':   { item: ItemId; nodeId: string }
  'item:processed':   { input: ItemId[]; output: ItemId; stationId: string }
  'item:deposited':   { item: ItemId; stationId: string }
  'item:stocked':     { item: ItemId; counterId: string }
  'item:sold':        { item: ItemId; price: number; counterId: string }
  'money:collected':  { amount: number }
  'money:deposited':  { amount: number }
  'zone:unlocked':    { zoneId: string }
  'slot:purchased':   { slotId: string }
  'upgrade:bought':   { upgradeId: string }
  'upgrade:applied':  { upgradeId: string; target: 'player' | 'worker' | 'station'; stat: string; value: number }
  'economy:changed':  { balance: number }
  'upgradeboard:proximity': { near: boolean }
  'stack:full':       Record<string, never>
  'stack:changed':    { size: number; max: number }
}

export type EventKey = keyof EventMap

// ─── Player state ─────────────────────────────────────────────────────────────

export type PlayerAction = 'idle' | 'harvesting' | 'depositing' | 'collecting'

// ─── Worker state ─────────────────────────────────────────────────────────────

export type WorkerState = 'idle' | 'harvesting' | 'carrying' | 'depositing'

// ─── Customer state ───────────────────────────────────────────────────────────

export type CustomerState = 'entering' | 'browsing' | 'waiting' | 'paying' | 'leaving'

// ─── Resource node ────────────────────────────────────────────────────────────

export type ResourceNodeType =
  | 'palm_tree'
  | 'fishing_spot'
  | 'sugarcane_field'
  | 'pineapple_bush'
  | 'mango_tree'
