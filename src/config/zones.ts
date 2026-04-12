import type { ZoneDef } from '../types'

/**
 * Zone registry — add new zone = add one entry here.
 * World positions are in Phaser world-space pixels.
 *
 * Phase 1 prototype: beach_bar only.
 */
export const ZONES: ZoneDef[] = [
  {
    id: 'beach_bar',
    unlockCost: 0,
    nodes: [
      { type: 'palm_tree',       x: 180, y: 180 },
      { type: 'fishing_spot',    x: 500, y: 140 },
      { type: 'sugarcane_field', x: 820, y: 180 },
    ],
    stations: [
      { recipeId: 'coconut_press',   x: 180, y: 340 },
      { recipeId: 'grill',           x: 500, y: 340 },
      { recipeId: 'sugar_mill',      x: 820, y: 340 },
      { recipeId: 'cocktail_station', x: 500, y: 500 },
    ],
    counters: [
      { itemType: 'coconut_milk', price: 10, x: 200, y: 660 },
      { itemType: 'grilled_fish', price: 15, x: 440, y: 660 },
      { itemType: 'cocktail',     price: 30, x: 680, y: 660 },
    ],
    cashRegisterPos:  { x: 440, y: 820 },
    customerSpawnPos: { x: 140, y: 900 },
    upgradeBoardPos:  { x: 850, y: 780 },
  },
  {
    id: 'cocktail_corner',
    unlockCost: 500,
    nodes: [
      { type: 'pineapple_bush', x: 1140, y: 200 },
    ],
    stations: [
      { recipeId: 'juice_press', x: 1140, y: 360 },
    ],
    counters: [
      { itemType: 'pineapple_juice', price: 12, x: 1140, y: 560 },
    ],
    cashRegisterPos:  { x: 1140, y: 740 },
    customerSpawnPos: { x: 1320, y: 900 },
    unlockPortalPos:  { x: 970, y: 500 },
  },
]

/** Convenience lookup by id */
export const ZONE_BY_ID: Record<string, ZoneDef> = Object.fromEntries(
  ZONES.map((z) => [z.id, z])
)
