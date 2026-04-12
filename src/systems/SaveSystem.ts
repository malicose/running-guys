import { EventBus } from './EventBus'

const STORAGE_KEY = 'stackandsell.save'
const SAVE_VERSION = 2
const DEBOUNCE_MS  = 500

/**
 * SaveSystem — persists the economy state to localStorage.
 *
 * Scope: we only save the information that *cannot* be regenerated from the
 * code/config — balance and purchased upgrade ids. Everything else (stack,
 * node depletion, station queues, active customers, worker positions) is
 * ephemeral and restored to a blank-but-functional state on load.
 *
 * Autosave triggers: `economy:changed` (catches both collects and purchases),
 * debounced so bursts of events collapse to a single write.
 *
 * Module singleton — same pattern as EventBus and EconomySystem.
 */

export interface SaveState {
  version:       number
  balance:       number
  purchased:     string[]
  unlockedZones: string[]
}

type GetStateFn = () => { balance: number; purchased: string[]; unlockedZones: string[] }

class SaveSystemClass {
  private listenerAttached = false
  private pendingTimer:     ReturnType<typeof setTimeout> | null = null
  private getStateFn:       GetStateFn | null = null

  /**
   * Wire up autosave.
   * @param getState  callback that returns the current economy state to serialize.
   */
  init(getState: GetStateFn): void {
    this.getStateFn = getState

    if (!this.listenerAttached) {
      EventBus.on('economy:changed', () => this._scheduleSave())
      this.listenerAttached = true
    }
  }

  /** Load saved state, or null if no save / corrupt. */
  load(): SaveState | null {
    if (!this._storageAvailable()) return null

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null

      const parsed = JSON.parse(raw) as Partial<SaveState>
      if (!parsed) return null
      if (typeof parsed.balance !== 'number') return null
      if (!Array.isArray(parsed.purchased)) return null
      // Migrate v1 → v2: v1 had no unlockedZones; treat as empty.
      if (parsed.version !== SAVE_VERSION && parsed.version !== 1) return null

      return {
        version:       SAVE_VERSION,
        balance:       parsed.balance,
        purchased:     parsed.purchased.filter((x): x is string => typeof x === 'string'),
        unlockedZones: Array.isArray(parsed.unlockedZones)
          ? parsed.unlockedZones.filter((x): x is string => typeof x === 'string')
          : [],
      }
    } catch (err) {
      console.warn('[SaveSystem] load failed:', err)
      return null
    }
  }

  /** Force immediate save, skipping debounce. */
  saveNow(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
    this._writeToStorage()
  }

  /** Wipe any existing save. Used by the dev hotkey. */
  clear(): void {
    if (!this._storageAvailable()) return
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch (err) {
      console.warn('[SaveSystem] clear failed:', err)
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _scheduleSave(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null
      this._writeToStorage()
    }, DEBOUNCE_MS)
  }

  private _writeToStorage(): void {
    if (!this.getStateFn || !this._storageAvailable()) return

    const { balance, purchased, unlockedZones } = this.getStateFn()
    const payload: SaveState = {
      version:       SAVE_VERSION,
      balance,
      purchased:     [...purchased],
      unlockedZones: [...unlockedZones],
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      console.warn('[SaveSystem] save failed:', err)
    }
  }

  private _storageAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && !!window.localStorage
    } catch {
      return false
    }
  }
}

export const SaveSystem = new SaveSystemClass()
