import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { ResourceNode } from '../entities/ResourceNode'
import { ProcessingStation } from '../entities/ProcessingStation'
import { ShopCounter } from '../entities/ShopCounter'
import { CashRegister } from '../entities/CashRegister'
import { InputSystem } from '../systems/InputSystem'
import { StackSystem } from '../systems/StackSystem'
import { CustomerSystem } from '../systems/CustomerSystem'
import { EventBus } from '../systems/EventBus'
import { ZONES } from '../config/zones'
import type { UI } from './UI'
import type { ResourceNodeType } from '../types'

export class Game extends Phaser.Scene {
  private player!:          Player
  private input!:           InputSystem
  private stack!:           StackSystem
  private nodes:            ResourceNode[]      = []
  private stations:         ProcessingStation[] = []
  private counters:         ShopCounter[]       = []
  private registers:        CashRegister[]      = []
  private customerSystems:  CustomerSystem[]    = []

  private joystickLinked = false

  constructor() {
    super({ key: 'Game' })
  }

  create(): void {
    EventBus.clear()

    const W = 1000, H = 1000
    this.physics.world.setBounds(0, 0, W, H)
    this._buildBackground(W, H)

    this.player = new Player(this, W / 2, H / 2)
    this.stack  = new StackSystem(this, this.player)
    this.input  = new InputSystem(this)

    this._buildZones()

    this.cameras.main
      .setBounds(0, 0, W, H)
      .startFollow(this.player, true)
      .setLerp(0.1, 0.1)
  }

  update(_time: number, delta: number): void {
    // Lazy-link joystick
    if (!this.joystickLinked) {
      const ui = this.scene.get('UI') as UI
      if (ui?.joystick) { this.input.joystick = ui.joystick; this.joystickLinked = true }
    }

    const dir = this.input.getDirection()
    this.player.update(dir.x, dir.y, delta)
    this.stack.update(delta)

    for (const n of this.nodes)           n.tick(delta, this.player, this.stack)
    for (const s of this.stations)        s.tick(delta, this.player, this.stack)
    for (const c of this.counters)        c.tick(delta, this.player, this.stack)
    for (const r of this.registers)       r.tick(delta, this.player)
    for (const cs of this.customerSystems) cs.tick(delta)
  }

  // ── Zone builder ──────────────────────────────────────────────────────────

  private _buildZones(): void {
    for (const zone of ZONES) {
      if (zone.unlockCost > 0) continue

      for (const def of zone.nodes) {
        this.nodes.push(new ResourceNode(this, def.x, def.y, def.type as ResourceNodeType))
      }
      for (const def of zone.stations) {
        this.stations.push(new ProcessingStation(this, def.x, def.y, def.recipeId))
      }

      const zoneCounters: ShopCounter[] = []
      for (const def of zone.counters) {
        const counter = new ShopCounter(this, def.x, def.y, def.itemType, def.price)
        this.counters.push(counter)
        zoneCounters.push(counter)
      }

      const register = new CashRegister(this, zone.cashRegisterPos.x, zone.cashRegisterPos.y)
      this.registers.push(register)

      this.customerSystems.push(new CustomerSystem(
        this,
        zoneCounters,
        register,
        zone.customerSpawnPos.x,
        zone.customerSpawnPos.y,
      ))
    }
  }

  // ── Background ────────────────────────────────────────────────────────────

  private _buildBackground(w: number, h: number): void {
    this.add.rectangle(0, 0, w, h, 0x1565c0).setOrigin(0).setDepth(-100)
    this.add.rectangle(40, 40, w - 80, h - 80, 0xf4c56a).setOrigin(0).setDepth(-99)
    this.add.rectangle(80, 80, w - 160, h - 160, 0x4caf50).setOrigin(0).setDepth(-98)

    for (const [px, py, pw, ph] of [
      [120, 120, 60, 50], [320, 240, 80, 40], [760, 420, 70, 55],
      [120, 560, 90, 45], [780, 620, 65, 50], [340, 780, 75, 40],
    ] as [number, number, number, number][]) {
      this.add.rectangle(px, py, pw, ph, 0x43a047, 0.3).setOrigin(0).setDepth(-97)
    }

    for (const [px, py] of [[110, 100], [880, 100], [95, 920], [900, 910]] as [number, number][]) {
      this._addDecoPalm(px, py)
    }

    // Spawn point marker (faint)
    for (const zone of ZONES) {
      if (zone.unlockCost > 0) continue
      this.add
        .triangle(
          zone.customerSpawnPos.x, zone.customerSpawnPos.y,
          0, -14, -10, 6, 10, 6,
          0xffffff, 0.15,
        )
        .setDepth(-95)
    }
  }

  private _addDecoPalm(x: number, y: number): void {
    this.add.rectangle(x, y + 8, 7, 40, 0x795548).setOrigin(0.5, 1).setDepth(y - 5)
    this.add.ellipse(x, y - 10, 48, 20, 0x1b5e20, 0.3).setDepth(y - 6)
    this.add.ellipse(x, y - 18, 44, 30, 0x2e7d32, 0.85).setDepth(y - 5)
    this.add.ellipse(x + 12, y - 10, 32, 20, 0x388e3c, 0.75).setDepth(y - 5)
    this.add.ellipse(x - 12, y - 10, 32, 20, 0x388e3c, 0.75).setDepth(y - 5)
  }
}
