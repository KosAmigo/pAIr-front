import { ViolationApi } from '../api/ViolationApi.ts'
import type { ViolationApiPort } from '../api/ViolationApi.ts'
import type { AntiCheatingConfig, Violation } from '../core/types.ts'
import { DEFAULT_ANTI_CHEATING_CONFIG } from '../core/types.ts'

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
type QueueState = {
  sessionId: string
  settings: AntiCheatingConfig
  cachedCount: number
  violations: Violation[]
  finished: boolean
}

const STORAGE_PREFIX = 'pair:anti-cheating:session:'
const memoryStorage = new Map<string, string>()
const syncLocks = new Map<string, Promise<number | null>>()

function browserStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Browser storage may be disabled; keep this tab's retry queue in memory.
  }
  return {
    get length() { return memoryStorage.size },
    key(index) { return [...memoryStorage.keys()][index] ?? null },
    getItem(key) { return memoryStorage.get(key) ?? null },
    setItem(key, value) { memoryStorage.set(key, value) },
    removeItem(key) { memoryStorage.delete(key) },
  }
}

function mergeSignals(first: Violation, next: Violation): Violation {
  const signals = new Map(first.signals.map((signal) => [signal.signalId, signal]))
  next.signals.forEach((signal) => signals.set(signal.signalId, signal))
  return { ...first, signals: [...signals.values()] }
}

export class ViolationOutbox {
  private readonly key: string
  private readonly storage: StorageLike
  private state: QueueState

  constructor(
    sessionId: string,
    settings: AntiCheatingConfig = DEFAULT_ANTI_CHEATING_CONFIG,
    storage: StorageLike = browserStorage(),
  ) {
    this.storage = storage
    this.key = STORAGE_PREFIX + encodeURIComponent(sessionId)
    this.state = this.read() ?? {
      sessionId,
      settings: { enabled: settings.enabled, signals: { ...settings.signals } },
      cachedCount: 0,
      violations: [],
      finished: false,
    }
    this.persist()
  }

  get localCount() {
    return Math.max(this.state.cachedCount, this.state.violations.length)
  }
  get pendingCount() {
    return this.state.violations.length
  }

  enqueue(violation: Violation, estimatedCount: number) {
    const index = this.state.violations.findIndex((item) => item.violationId === violation.violationId)
    if (index < 0) this.state.violations.push(violation)
    else this.state.violations[index] = mergeSignals(this.state.violations[index], violation)
    this.state.cachedCount = Math.max(this.state.cachedCount, estimatedCount)
    this.persist()
  }

  markFinished() {
    this.state.finished = true
    this.persist()
  }

  async sync(api: ViolationApiPort = new ViolationApi()): Promise<number | null> {
    const existing = syncLocks.get(this.state.sessionId)
    if (existing) return existing
    const task = this.performSync(api)
    syncLocks.set(this.state.sessionId, task)
    try {
      return await task
    } finally {
      syncLocks.delete(this.state.sessionId)
    }
  }

  private async performSync(api: ViolationApiPort): Promise<number | null> {
    try {
      await api.startSession(this.state.sessionId, this.state.settings)
      while (this.state.violations.length) {
        const current = this.state.violations[0]
        const sent = JSON.stringify(current)
        const result = await api.saveViolation(this.state.sessionId, current)
        this.state.cachedCount = Math.max(this.state.cachedCount, result.violationCount)
        const latest = this.state.violations.find((item) => item.violationId === current.violationId)
        if (latest && JSON.stringify(latest) === sent) {
          this.state.violations = this.state.violations.filter((item) => item.violationId !== current.violationId)
        }
        this.persist()
      }
      let summary = await api.getSession(this.state.sessionId)
      if (this.state.finished) {
        summary = await api.finishSession(this.state.sessionId)
        this.storage.removeItem(this.key)
        return summary.violationCount
      }
      this.state.cachedCount = Math.max(this.state.cachedCount, summary.violationCount)
      this.persist()
      return summary.violationCount
    } catch {
      return null
    }
  }

  static cachedCount(sessionId: string, storage: StorageLike = browserStorage()) {
    try {
      const raw = storage.getItem(STORAGE_PREFIX + encodeURIComponent(sessionId))
      if (!raw) return 0
      const state = JSON.parse(raw) as QueueState
      return state.sessionId === sessionId ? Math.max(state.cachedCount, state.violations.length) : 0
    } catch {
      return 0
    }
  }

  static async flushAll(storage: StorageLike = browserStorage(), api: ViolationApiPort = new ViolationApi()) {
    const ids = new Set<string>()
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(STORAGE_PREFIX)) continue
      try {
        const state = JSON.parse(storage.getItem(key) ?? '') as QueueState
        if (state.sessionId) ids.add(state.sessionId)
      } catch {
        // Ignore malformed local queue entries; they cannot be replayed safely.
      }
    }
    await Promise.all([...ids].map((sessionId) => new ViolationOutbox(sessionId, DEFAULT_ANTI_CHEATING_CONFIG, storage).sync(api)))
  }

  private read(): QueueState | null {
    try {
      const raw = this.storage.getItem(this.key)
      if (!raw) return null
      const state = JSON.parse(raw) as QueueState
      if (state.sessionId !== decodeURIComponent(this.key.slice(STORAGE_PREFIX.length))) return null
      return state
    } catch {
      return null
    }
  }

  private persist() {
    this.storage.setItem(this.key, JSON.stringify(this.state))
  }
}
