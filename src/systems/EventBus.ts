import type { EventKey, EventMap } from '../types'

type Listener<K extends EventKey> = (payload: EventMap[K]) => void

/**
 * Central typed event bus.
 * Systems emit events instead of calling each other directly —
 * new mechanics (quests, achievements, sounds) just subscribe.
 */
class EventBusClass {
  private listeners: {
    [K in EventKey]?: Array<Listener<K>>
  } = {}

  on<K extends EventKey>(event: K, fn: Listener<K>): void {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    ;(this.listeners[event] as Array<Listener<K>>).push(fn)
  }

  off<K extends EventKey>(event: K, fn: Listener<K>): void {
    const list = this.listeners[event] as Array<Listener<K>> | undefined
    if (!list) return
    const idx = list.indexOf(fn)
    if (idx !== -1) list.splice(idx, 1)
  }

  once<K extends EventKey>(event: K, fn: Listener<K>): void {
    const wrapper: Listener<K> = (payload) => {
      fn(payload)
      this.off(event, wrapper)
    }
    this.on(event, wrapper)
  }

  emit<K extends EventKey>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event] as Array<Listener<K>> | undefined
    if (!list) return
    // copy slice so listeners added during emit are not called this round
    for (const fn of list.slice()) {
      fn(payload)
    }
  }

  /** Remove all listeners — useful when restarting a scene. */
  clear(): void {
    this.listeners = {}
  }
}

export const EventBus = new EventBusClass()
