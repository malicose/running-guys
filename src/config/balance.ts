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
  CUSTOMER_SPAWN_INTERVAL:  2.2,    // seconds between spawns
  CUSTOMER_SPEED:           90,     // px / s
  CUSTOMER_MAX_PER_ZONE:    24,     // soft cap — pause spawning when reached

  // ─── Queues (counter + register) ─────────────────────────────────────────
  QUEUE_SLOT_SPACING:       30,     // px between successive customers in line
  QUEUE_FRONT_OFFSET:       42,     // px from entity centre to the first slot
  COUNTER_QUEUE_CAP_SLOTS:  6,      // slot count with unique positions; extras pile on last
  REGISTER_QUEUE_CAP_SLOTS: 6,

  // ─── Cash register ───────────────────────────────────────────────────────
  REGISTER_COLLECT_RADIUS:  70,     // px — player collects pending money
  CASHIER_RADIUS:           64,     // px — cashier counts as present if within this of register
  CASHIER_HIRE_COST:        800,    // cost to hire a stationary cashier at a register

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
