import type { UpgradeDef } from '../types'

/**
 * Upgrade registry — add new upgrade = add one entry here.
 */
export const UPGRADES: UpgradeDef[] = [
  // ── Player stack ────────────────────────────────────────────────────────
  { id: 'stack_1',  target: 'player', stat: 'maxStack', value: 7,   cost: 80  },
  { id: 'stack_2',  target: 'player', stat: 'maxStack', value: 10,  cost: 200,  prerequisite: 'stack_1' },
  { id: 'stack_3',  target: 'player', stat: 'maxStack', value: 14,  cost: 400,  prerequisite: 'stack_2' },
  { id: 'stack_4',  target: 'player', stat: 'maxStack', value: 20,  cost: 700,  prerequisite: 'stack_3' },
  { id: 'stack_5',  target: 'player', stat: 'maxStack', value: 30,  cost: 1200, prerequisite: 'stack_4' },
  { id: 'stack_6',  target: 'player', stat: 'maxStack', value: 50,  cost: 2000, prerequisite: 'stack_5' },

  // ── Player speed ────────────────────────────────────────────────────────
  { id: 'speed_1',  target: 'player', stat: 'speed',    value: 175, cost: 120 },
  { id: 'speed_2',  target: 'player', stat: 'speed',    value: 200, cost: 280,  prerequisite: 'speed_1' },
  { id: 'speed_3',  target: 'player', stat: 'speed',    value: 230, cost: 500,  prerequisite: 'speed_2' },
  { id: 'speed_4',  target: 'player', stat: 'speed',    value: 260, cost: 900,  prerequisite: 'speed_3' },
  { id: 'speed_5',  target: 'player', stat: 'speed',    value: 300, cost: 1500, prerequisite: 'speed_4' },

  // ── Worker unlocks ──────────────────────────────────────────────────────
  { id: 'worker_1', target: 'worker', stat: 'unlock',   value: 1,   cost: 400 },
  { id: 'worker_2', target: 'worker', stat: 'unlock',   value: 1,   cost: 900,  prerequisite: 'worker_1' },
  { id: 'worker_3', target: 'worker', stat: 'unlock',   value: 1,   cost: 1800, prerequisite: 'worker_2' },
  { id: 'worker_4', target: 'worker', stat: 'unlock',   value: 1,   cost: 3200, prerequisite: 'worker_3' },
  { id: 'worker_5', target: 'worker', stat: 'unlock',   value: 1,   cost: 5500, prerequisite: 'worker_4' },

  // ── Station upgrades (apply globally to every processing station) ────────
  // processSpeed value is a multiplier on recipe.time (0.8 = 20% faster)
  { id: 'station_speed_1', target: 'station', stat: 'processSpeed', value: 0.80, cost: 700  },
  { id: 'station_speed_2', target: 'station', stat: 'processSpeed', value: 0.65, cost: 1600, prerequisite: 'station_speed_1' },
  { id: 'station_speed_3', target: 'station', stat: 'processSpeed', value: 0.50, cost: 3000, prerequisite: 'station_speed_2' },
  { id: 'station_speed_4', target: 'station', stat: 'processSpeed', value: 0.35, cost: 5500, prerequisite: 'station_speed_3' },

  // queueMax value is the new absolute input queue capacity (default 10)
  { id: 'station_queue_1', target: 'station', stat: 'queueMax', value: 15, cost: 500  },
  { id: 'station_queue_2', target: 'station', stat: 'queueMax', value: 20, cost: 1200, prerequisite: 'station_queue_1' },
  { id: 'station_queue_3', target: 'station', stat: 'queueMax', value: 30, cost: 2500, prerequisite: 'station_queue_2' },

  // ── Worker stat upgrades (apply to all current + future workers) ────────
  { id: 'worker_speed_1', target: 'worker', stat: 'speed',    value: 100, cost: 500,  prerequisite: 'worker_1' },
  { id: 'worker_speed_2', target: 'worker', stat: 'speed',    value: 120, cost: 900,  prerequisite: 'worker_speed_1' },
  { id: 'worker_speed_3', target: 'worker', stat: 'speed',    value: 145, cost: 1600, prerequisite: 'worker_speed_2' },
  { id: 'worker_speed_4', target: 'worker', stat: 'speed',    value: 175, cost: 2800, prerequisite: 'worker_speed_3' },
  { id: 'worker_stack_1', target: 'worker', stat: 'maxStack', value: 4,   cost: 550,  prerequisite: 'worker_1' },
  { id: 'worker_stack_2', target: 'worker', stat: 'maxStack', value: 6,   cost: 1000, prerequisite: 'worker_stack_1' },
  { id: 'worker_stack_3', target: 'worker', stat: 'maxStack', value: 8,   cost: 1800, prerequisite: 'worker_stack_2' },
  { id: 'worker_stack_4', target: 'worker', stat: 'maxStack', value: 12,  cost: 3000, prerequisite: 'worker_stack_3' },
]
