import type { ItemDef } from '../types'

/**
 * Item registry — add new item = add one entry here.
 * No changes to entity/system code required.
 */
export const ITEMS: Record<string, ItemDef> = {
  coconut:          { label: 'Coconut',          color: 0xc8a96e, stackable: true },
  coconut_milk:     { label: 'Coconut Milk',      color: 0xfff8dc, stackable: true },
  fish:             { label: 'Fish',              color: 0x4fc3f7, stackable: true },
  grilled_fish:     { label: 'Grilled Fish',      color: 0xff8c42, stackable: true },
  sugarcane:        { label: 'Sugar Cane',         color: 0xa5d6a7, stackable: true },
  sugar:            { label: 'Sugar',              color: 0xffffff, stackable: true },
  pineapple:        { label: 'Pineapple',          color: 0xffd54f, stackable: true },
  pineapple_juice:  { label: 'Pineapple Juice',    color: 0xffeb3b, stackable: true },
  cocktail:         { label: 'Cocktail',           color: 0xff4081, stackable: true },
}
