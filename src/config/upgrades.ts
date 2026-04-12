import type { UpgradeDef } from '../types'

/**
 * Upgrade registry — add new upgrade = add one entry here.
 */
export const UPGRADES: UpgradeDef[] = [
  { id: 'stack_1',  target: 'player', stat: 'maxStack', value: 10,  cost: 100 },
  { id: 'stack_2',  target: 'player', stat: 'maxStack', value: 20,  cost: 300, prerequisite: 'stack_1' },
  { id: 'stack_3',  target: 'player', stat: 'maxStack', value: 50,  cost: 800, prerequisite: 'stack_2' },
  { id: 'speed_1',  target: 'player', stat: 'speed',    value: 200, cost: 150 },
  { id: 'speed_2',  target: 'player', stat: 'speed',    value: 260, cost: 400, prerequisite: 'speed_1' },
  { id: 'worker_1', target: 'worker', stat: 'unlock',   value: 1,   cost: 500 },
]
