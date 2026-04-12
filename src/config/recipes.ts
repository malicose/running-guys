import type { RecipeDef } from '../types'

/**
 * Recipe registry — add new recipe = add one entry here.
 */
export const RECIPES: RecipeDef[] = [
  { id: 'coconut_press',    input: ['coconut'],                  output: 'coconut_milk',    time: 1.5 },
  { id: 'grill',            input: ['fish'],                     output: 'grilled_fish',    time: 2.0 },
  { id: 'sugar_mill',       input: ['sugarcane'],                output: 'sugar',           time: 1.2 },
  { id: 'juice_press',      input: ['pineapple'],                output: 'pineapple_juice', time: 1.2 },
  { id: 'cocktail_station', input: ['coconut_milk', 'sugar'],    output: 'cocktail',        time: 3.0 },
]

/** Convenience lookup by id */
export const RECIPE_BY_ID: Record<string, RecipeDef> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r])
)
