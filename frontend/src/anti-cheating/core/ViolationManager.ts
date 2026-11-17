import { ViolationStateMachine } from './ViolationStateMachine.ts'
import type { AntiCheatingConfig, ResumeReason, SignalType, Violation } from './types.ts'

export type ViolationChange = (violation: Violation, isNew: boolean, count: number) => void

export class ViolationManager {
  private readonly stateMachine: ViolationStateMachine
  private readonly config: AntiCheatingConfig
  private readonly onChange: ViolationChange
  private countValue: number
  private stopped = false

  constructor(
    sessionId: string,
    config: AntiCheatingConfig,
    initialCount = 0,
    onChange: ViolationChange = () => undefined,
  ) {
    this.config = config
    this.onChange = onChange
    this.stateMachine = new ViolationStateMachine(sessionId)
    this.countValue = Math.max(0, initialCount)
  }

  signal(type: SignalType, occurredAt?: string) {
    if (this.stopped || !this.config.enabled || !this.config.signals[type]) return
    const result = this.stateMachine.signal(type, occurredAt)
    if (result.isNew) this.countValue += 1
    this.onChange(result.violation, result.isNew, this.countValue)
  }

  resume(reason: ResumeReason) {
    if (!this.stopped) this.stateMachine.resume(reason)
  }

  setCountFloor(count: number) {
    this.countValue = Math.max(this.countValue, count)
  }

  finish() {
    this.stopped = true
    this.stateMachine.finish()
  }

  get count() {
    return this.countValue
  }
}
