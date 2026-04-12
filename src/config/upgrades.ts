import type { UpgradeDef } from '../types'

/**
 * Upgrade registry — add new upgrade = add one entry here.
 */
export const UPGRADES: UpgradeDef[] = [
  // ── Player stack ────────────────────────────────────────────────────────
  { id: 'stack_1',  target: 'player', stat: 'maxStack', value: 10,  cost: 100 },
  { id: 'stack_2',  target: 'player', stat: 'maxStack', value: 20,  cost: 300, prerequisite: 'stack_1' },
  { id: 'stack_3',  target: 'player', stat: 'maxStack', value: 50,  cost: 800, prerequisite: 'stack_2' },

  // ── Player speed ────────────────────────────────────────────────────────
  { id: 'speed_1',  target: 'player', stat: 'speed',    value: 200, cost: 150 },
  { id: 'speed_2',  target: 'player', stat: 'speed',    value: 260, cost: 400, prerequisite: 'speed_1' },

  // ── Worker unlocks ──────────────────────────────────────────────────────
  { id: 'worker_1', target: 'worker', stat: 'unlock',   value: 1,   cost: 500 },
  { id: 'worker_2', target: 'worker', stat: 'unlock',   value: 1,   cost: 1500, prerequisite: 'worker_1' },
  { id: 'worker_3', target: 'worker', stat: 'unlock',   value: 1,   cost: 3500, prerequisite: 'worker_2' },

  // ── Worker stat upgrades (apply to all current + future workers) ────────
  { id: 'worker_speed_1', target: 'worker', stat: 'speed',    value: 110, cost: 600,  prerequisite: 'worker_1' },
  { id: 'worker_speed_2', target: 'worker', stat: 'speed',    value: 160, cost: 1800, prerequisite: 'worker_speed_1' },
  { id: 'worker_stack_1', target: 'worker', stat: 'maxStack', value: 5,   cost: 700,  prerequisite: 'worker_1' },
  { id: 'worker_stack_2', target: 'worker', stat: 'maxStack', value: 8,   cost: 2000, prerequisite: 'worker_stack_1' },
]
