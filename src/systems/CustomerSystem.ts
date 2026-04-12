import Phaser from 'phaser'
import { BALANCE } from '../config/balance'
import { Customer } from '../entities/Customer'
import type { ShopCounter } from '../entities/ShopCounter'
import type { CashRegister } from '../entities/CashRegister'

/**
 * CustomerSystem — spawns and manages Customer NPCs.
 *
 * Customers spawn from a fixed entrance point and target the counter with
 * the most stock. If all counters are empty they still walk over (and wait,
 * or leave if patience runs out).
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

    // Spawn
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this._spawnCustomer()
      this.spawnTimer = BALANCE.CUSTOMER_SPAWN_INTERVAL
    }

    // Update existing customers; collect done ones
    for (const c of this.customers) c.tick(delta)

    const done = this.customers.filter(c => c.isDone)
    for (const c of done) c.destroy()
    this.customers = this.customers.filter(c => !c.isDone)
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

  /** Pick the counter with the most stock, falling back to round-robin. */
  private _pickCounter(): ShopCounter | null {
    if (!this.counters.length) return null
    return this.counters.reduce((best, c) =>
      c.stockCount > best.stockCount ? c : best, this.counters[0])
  }
}
