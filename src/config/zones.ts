import type { ZoneDef } from '../types'

/**
 * Zone registry — add new zone = add one entry here.
 * World positions are in Phaser world-space pixels.
 *
 * Nodes and stations may carry an optional `purchase` field. If set, the
 * entry starts as a PurchaseSlot marker in the world and only becomes a
 * real node/station after the player walks up and pays the slot cost.
 * Purchased slot ids persist via SaveSystem, so re-loading skips the marker.
 */
export const ZONES: ZoneDef[] = [
  {
    id: 'beach_bar',
    unlockCost: 0,
    nodes: [
      // Primary resource nodes — row y=120, three columns
      { type: 'palm_tree',       x: 160, y: 120 },
      { type: 'fishing_spot',    x: 460, y: 120 },
      { type: 'sugarcane_field', x: 760, y: 120 },

      // Purchasable extras — same row, shifted right within each column (+220 px)
      { type: 'palm_tree',       x: 340, y: 120, purchase: { slotId: 'beach_bar.palm_2',       cost: 250 } },
      { type: 'fishing_spot',    x: 640, y: 120, purchase: { slotId: 'beach_bar.fish_2',       cost: 350 } },
      { type: 'sugarcane_field', x: 940, y: 120, purchase: { slotId: 'beach_bar.sugarcane_2', cost: 400 } },
    ],
    stations: [
      // Primary stations — row y=400, well below nodes (280 px gap)
      { recipeId: 'coconut_press',    x: 160, y: 400 },
      { recipeId: 'grill',            x: 460, y: 400 },
      { recipeId: 'sugar_mill',       x: 760, y: 400 },

      // Cocktail station — centre x, well below primary stations (180 px gap)
      { recipeId: 'cocktail_station', x: 630, y: 580 },

      // Purchasable second stations — same row as primary, offset right (+220 px)
      { recipeId: 'coconut_press', x: 340, y: 400, purchase: { slotId: 'beach_bar.press_2',  cost: 450 } },
      { recipeId: 'grill',         x: 640, y: 400, purchase: { slotId: 'beach_bar.grill_2',  cost: 550 } },
      { recipeId: 'sugar_mill',    x: 940, y: 400, purchase: { slotId: 'beach_bar.mill_2',   cost: 600 } },
    ],
    counters: [
      // Counters — row y=780, 180 px below cocktail station
      { itemType: 'coconut_milk', price: 10, x: 180, y: 780 },
      { itemType: 'grilled_fish', price: 15, x: 460, y: 780 },
      { itemType: 'cocktail',     price: 30, x: 700, y: 780 },
    ],
    cashRegisterPos:  { x: 430, y: 930 },
    customerSpawnPos: { x: 100, y: 950 },
    upgradeBoardPos:  { x: 880, y: 780 },
  },
  {
    id: 'cocktail_corner',
    unlockCost: 500,
    nodes: [
      { type: 'pineapple_bush', x: 1110, y: 150 },

      // Second pineapple bush — 230 px apart (was 120)
      { type: 'pineapple_bush', x: 1340, y: 150, purchase: { slotId: 'cocktail_corner.pineapple_2', cost: 500 } },
    ],
    stations: [
      // Presses — 260 px below bushes
      { recipeId: 'juice_press', x: 1110, y: 410 },
      { recipeId: 'juice_press', x: 1340, y: 410, purchase: { slotId: 'cocktail_corner.juice_2', cost: 650 } },
    ],
    counters: [
      // Counter — 240 px below presses
      { itemType: 'pineapple_juice', price: 12, x: 1220, y: 650 },
    ],
    cashRegisterPos:  { x: 1220, y: 860 },
    customerSpawnPos: { x: 1380, y: 950 },
    unlockPortalPos:  { x: 1020, y: 500 },
  },
  {
    id: 'tropical_smoothie_bar',
    unlockCost: 1200,
    nodes: [
      { type: 'mango_tree', x: 1510, y: 150 },
      // Second mango tree — 240 px apart (was 120)
      { type: 'mango_tree', x: 1750, y: 150, purchase: { slotId: 'smoothie_bar.mango_2', cost: 600 } },
    ],
    stations: [
      // Presses — 260 px below trees
      { recipeId: 'mango_press',      x: 1510, y: 410 },
      { recipeId: 'mango_press',      x: 1750, y: 410, purchase: { slotId: 'smoothie_bar.press_2', cost: 700 } },
      // Smoothie station — centred, 200 px below presses
      { recipeId: 'smoothie_station', x: 1630, y: 610 },
    ],
    counters: [
      // Counters — 200 px below smoothie station
      { itemType: 'mango_juice', price: 14, x: 1510, y: 810 },
      { itemType: 'smoothie',    price: 40, x: 1750, y: 810 },
    ],
    cashRegisterPos:  { x: 1630, y: 950 },
    customerSpawnPos: { x: 1870, y: 950 },
    unlockPortalPos:  { x: 1430, y: 500 },
  },
]

/** Convenience lookup by id */
export const ZONE_BY_ID: Record<string, ZoneDef> = Object.fromEntries(
  ZONES.map((z) => [z.id, z])
)
