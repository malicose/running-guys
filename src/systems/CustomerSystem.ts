import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { Customer } from '../entities/Customer'
import type { ShopCounter } from '../entities/ShopCounter'
import type { CashRegister } from '../entities/CashRegister'

/**
 * CustomerSystem — spawns and manages Customer NPCs for one zone.
 *
 * Customers now spawn on a fixed cadence regardless of counter stock —
 * they queue up and wait. The only limiter is CUSTOMER_MAX_PER_ZONE so
 * memory doesn't blow up if the player abandons a zone.
 *
 * Target selection picks the counter with the shortest queue (and breaks
 * ties toward the one with the most stock) so customers fan out across
 * counters instead of all piling on the first one.
 */
export class CustomerSystem {
  private scene:     Phaser.Scene
  private counters:  ShopCounter[]
  private register:  CashRegister
  private spawnX:    number
  private spawnY:    number

  private customers:   Customer[] = []
  private spawnTimer = 0

  constructor(
    scene:    Phaser.Scene,
    counters: ShopCounter[],
    register: CashRegister,
    spawnX:   number,
    spawnY:   number,
  ) {
    this.scene    = scene
    this.counters = counters
    this.register = register
    this.spawnX   = spawnX
    this.spawnY   = spawnY

    // First customer arrives sooner than the regular interval
    this.spawnTimer = BALANCE.CUSTOMER_SPAWN_INTERVAL * 0.4
  }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  tick(delta: number): void {
    const dt = delta / 1000

    // Spawn — paused while zone is over the soft cap
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      if (this.customers.length < BALANCE.CUSTOMER_MAX_PER_ZONE) {
        this._spawnCustomer()
      }
      this.spawnTimer = BALANCE.CUSTOMER_SPAWN_INTERVAL
    }

    // Update existing customers; remove done ones in-place (no temp arrays)
    for (let i = this.customers.length - 1; i >= 0; i--) {
      this.customers[i].tick(delta)
      if (this.customers[i].isDone) {
        this.customers[i].destroy()
        this.customers.splice(i, 1)
      }
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _spawnCustomer(): void {
    const target = this._pickCounter()
    if (!target) return

    const c = new Customer(
      this.scene,
      this.spawnX,
      this.spawnY,
      target,
      this.register,
      this.spawnX,
      this.spawnY,
    )
    this.customers.push(c)
  }

  /**
   * Pick the counter a newly-spawned customer should target.
   * Primary key: shortest existing queue.
   * Tiebreaker: most stock (so an empty queue on a stocked counter wins
   * over an empty queue on an empty counter).
   */
  private _pickCounter(): ShopCounter | null {
    if (!this.counters.length) return null

    let best = this.counters[0]
    for (const c of this.counters) {
      if (c.queueLength < best.queueLength) { best = c; continue }
      if (c.queueLength === best.queueLength && c.stockCount > best.stockCount) {
        best = c
      }
    }
    return best
  }
}
