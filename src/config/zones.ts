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
      { type: 'palm_tree',       x: 180, y: 180 },
      { type: 'fishing_spot',    x: 500, y: 140 },
      { type: 'sugarcane_field', x: 820, y: 180 },

      // Purchasable extras — second set of every resource
      { type: 'palm_tree',       x: 100, y: 320, purchase: { slotId: 'beach_bar.palm_2',       cost: 250 } },
      { type: 'fishing_spot',    x: 620, y: 140, purchase: { slotId: 'beach_bar.fish_2',       cost: 350 } },
      { type: 'sugarcane_field', x: 900, y: 320, purchase: { slotId: 'beach_bar.sugarcane_2', cost: 400 } },
    ],
    stations: [
      { recipeId: 'coconut_press',    x: 180, y: 340 },
      { recipeId: 'grill',            x: 500, y: 340 },
      { recipeId: 'sugar_mill',       x: 820, y: 340 },
      { recipeId: 'cocktail_station', x: 500, y: 500 },

      // Purchasable second processing stations
      { recipeId: 'coconut_press', x: 260, y: 460, purchase: { slotId: 'beach_bar.press_2',  cost: 450 } },
      { recipeId: 'grill',         x: 580, y: 460, purchase: { slotId: 'beach_bar.grill_2',  cost: 550 } },
      { recipeId: 'sugar_mill',    x: 760, y: 460, purchase: { slotId: 'beach_bar.mill_2',   cost: 600 } },
    ],
    counters: [
      { itemType: 'coconut_milk', price: 10, x: 200, y: 660 },
      { itemType: 'grilled_fish', price: 15, x: 440, y: 660 },
      { itemType: 'cocktail',     price: 30, x: 680, y: 660 },
    ],
    cashRegisterPos:  { x: 440, y: 820 },
    customerSpawnPos: { x: 140, y: 920 },
    upgradeBoardPos:  { x: 850, y: 780 },
  },
  {
    id: 'cocktail_corner',
    unlockCost: 500,
    nodes: [
      { type: 'pineapple_bush', x: 1140, y: 200 },

      // Second pineapple bush for scale
      { type: 'pineapple_bush', x: 1260, y: 200, purchase: { slotId: 'cocktail_corner.pineapple_2', cost: 500 } },
    ],
    stations: [
      { recipeId: 'juice_press', x: 1140, y: 360 },

      { recipeId: 'juice_press', x: 1260, y: 360, purchase: { slotId: 'cocktail_corner.juice_2', cost: 650 } },
    ],
    counters: [
      { itemType: 'pineapple_juice', price: 12, x: 1140, y: 560 },
    ],
    cashRegisterPos:  { x: 1140, y: 740 },
    customerSpawnPos: { x: 1320, y: 900 },
    unlockPortalPos:  { x: 970, y: 500 },
  },
  {
    id: 'tropical_smoothie_bar',
    unlockCost: 1200,
    nodes: [
      { type: 'mango_tree', x: 1530, y: 200 },
      { type: 'mango_tree', x: 1650, y: 200, purchase: { slotId: 'smoothie_bar.mango_2', cost: 600 } },
    ],
    stations: [
      { recipeId: 'mango_press',      x: 1530, y: 360 },
      { recipeId: 'smoothie_station', x: 1590, y: 520 },
      { recipeId: 'mango_press',      x: 1700, y: 360, purchase: { slotId: 'smoothie_bar.press_2', cost: 700 } },
    ],
    counters: [
      { itemType: 'mango_juice', price: 14, x: 1490, y: 700 },
      { itemType: 'smoothie',    price: 40, x: 1680, y: 700 },
    ],
    cashRegisterPos:  { x: 1590, y: 860 },
    customerSpawnPos: { x: 1800, y: 950 },
    unlockPortalPos:  { x: 1320, y: 500 },
  },
]

/** Convenience lookup by id */
export const ZONE_BY_ID: Record<string, ZoneDef> = Object.fromEntries(
  ZONES.map((z) => [z.id, z])
)
