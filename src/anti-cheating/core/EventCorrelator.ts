import type { BrowserSignal, SignalType, Violation } from './types.ts'

export type CorrelationResult = { violation: Violation; isNew: boolean }

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export class EventCorrelator {
  private current: Violation | null = null

  record(sessionId: string, type: SignalType, occurredAt = new Date().toISOString()): CorrelationResult {
    const signal: BrowserSignal = { signalId: createId(), type, occurredAt }
    if (!this.current || this.current.sessionId !== sessionId) {
      this.current = { violationId: createId(), sessionId, occurredAt, signals: [signal] }
      return { violation: this.current, isNew: true }
    }
    this.current = { ...this.current, signals: [...this.current.signals, signal] }
    return { violation: this.current, isNew: false }
  }

  close() {
    this.current = null
  }

  get activeViolation() {
    return this.current
  }
}
