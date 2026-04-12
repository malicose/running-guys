/**
 * All numeric gameplay constants in one place.
 * Tweak here — no other file changes needed.
 */
export const BALANCE = {
  // ─── Player ──────────────────────────────────────────────────────────────
  PLAYER_SPEED:             150,    // px / s
  PLAYER_MAX_STACK:         5,      // items
  PLAYER_INTERACT_RADIUS:   60,     // px

  // ─── Harvesting ──────────────────────────────────────────────────────────
  HARVEST_INTERVAL:         0.8,    // seconds between items added to stack
  NODE_RESPAWN_TIME:        8.0,    // seconds until depleted node regrows
  NODE_MAX_ITEMS:           6,      // items per harvest cycle before depletion

  // ─── Processing ──────────────────────────────────────────────────────────
  TRANSFER_INTERVAL:        0.35,   // seconds between successive item transfers
  STATION_QUEUE_MAX:        10,     // how many items can wait in input queue
  STATION_OUTPUT_MAX:       10,     // output buffer cap

  // ─── Shop counter ────────────────────────────────────────────────────────
  COUNTER_MAX_STOCK:        5,      // items on counter before full

  // ─── Customers ───────────────────────────────────────────────────────────
  CUSTOMER_SPAWN_INTERVAL:  8.0,    // seconds between spawns
  CUSTOMER_SPEED:           90,     // px / s
  CUSTOMER_PATIENCE:        20.0,   // seconds before leaving unhappy

  // ─── Cash register ───────────────────────────────────────────────────────
  REGISTER_COLLECT_RADIUS:  70,     // px

  // ─── Prices (fallback; counters override via ZoneDef) ────────────────────
  PRICES: {
    coconut_milk:    10,
    grilled_fish:    15,
    cocktail:        30,
    pineapple_juice: 12,
  } as Record<string, number>,

  // ─── Dev / testing ───────────────────────────────────────────────────────
  /** Starting balance credited on scene create. Set to 0 for real play. */
  DEV_STARTING_MONEY: 2000,
  /** How much pressing the `M` dev key grants. */
  DEV_MONEY_HOTKEY_AMOUNT: 1000,
} as const
