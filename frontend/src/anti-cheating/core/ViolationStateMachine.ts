import { EventCorrelator, type CorrelationResult } from './EventCorrelator.ts'
import type { ResumeReason, SignalType } from './types.ts'

const AWAY_SIGNALS = new Set<SignalType>(['MOUSE_LEAVE', 'WINDOW_BLUR', 'TAB_HIDDEN'])

export class ViolationStateMachine {
  private readonly correlator = new EventCorrelator()
  private readonly activeAwaySignals = new Set<SignalType>()
  private fullscreenExitPending = false
  private readonly sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  signal(type: SignalType, occurredAt?: string): CorrelationResult {
    const result = this.correlator.record(this.sessionId, type, occurredAt)
    if (AWAY_SIGNALS.has(type)) this.activeAwaySignals.add(type)
    if (type === 'FULLSCREEN_EXIT') this.fullscreenExitPending = true
    return result
  }

  resume(reason: ResumeReason) {
    if (reason === 'pointer-return') this.activeAwaySignals.delete('MOUSE_LEAVE')
    if (reason === 'window-focus') this.activeAwaySignals.delete('WINDOW_BLUR')
    if (reason === 'tab-visible') this.activeAwaySignals.delete('TAB_HIDDEN')
    if (reason === 'fullscreen-enter' || reason === 'user-activity') this.fullscreenExitPending = false
    if (this.activeAwaySignals.size === 0) this.fullscreenExitPending = false
    if (this.activeAwaySignals.size === 0 && !this.fullscreenExitPending) this.correlator.close()
  }

  finish() {
    this.activeAwaySignals.clear()
    this.fullscreenExitPending = false
    this.correlator.close()
  }

  get activeViolation() {
    return this.correlator.activeViolation
  }
}
