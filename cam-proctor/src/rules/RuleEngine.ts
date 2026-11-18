// "이상 상태가 일정 시간 이상 이어지면 경고" 규칙 엔진.
// 한 프레임 튀는 오탐을 막기 위해 durationMs 동안 계속 참이어야 경고하고,
// 감지가 잠깐(graceMs) 끊기는 건 같은 구간으로 본다.

export interface RuleSpec {
  kind: string
  message: string
  /** 이 시간 이상 지속되어야 경고 */
  durationMs: number
  /** 같은 규칙의 경고 사이 최소 간격 */
  cooldownMs: number
  /** 이 시간 이내로 끊긴 건 같은 구간으로 이어 붙임 */
  graceMs?: number
}

export interface Fired {
  kind: string
  message: string
  startedAt: number
  ts: number
  durationMs: number
}

const DEFAULT_GRACE_MS = 400

export class SustainedRule {
  private since: number | null = null
  private lastTrue = Number.NEGATIVE_INFINITY
  private lastFired = Number.NEGATIVE_INFINITY

  constructor(readonly spec: RuleSpec) {}

  /** 현재 이상 구간이 이어진 시간 (없으면 0) */
  heldMs(now: number): number {
    return this.since === null ? 0 : now - this.since
  }

  update(active: boolean, now: number): Fired | null {
    const grace = this.spec.graceMs ?? DEFAULT_GRACE_MS
    if (!active) {
      if (this.since !== null && now - this.lastTrue > grace) this.since = null
      return null
    }
    if (this.since === null) this.since = now
    this.lastTrue = now
    const held = now - this.since
    if (held >= this.spec.durationMs && now - this.lastFired >= this.spec.cooldownMs) {
      this.lastFired = now
      return {
        kind: this.spec.kind,
        message: this.spec.message,
        startedAt: this.since,
        ts: now,
        durationMs: held,
      }
    }
    return null
  }

  reset() {
    this.since = null
    this.lastTrue = Number.NEGATIVE_INFINITY
    this.lastFired = Number.NEGATIVE_INFINITY
  }
}

export class RuleEngine {
  private readonly rules: Map<string, SustainedRule>

  constructor(specs: RuleSpec[]) {
    this.rules = new Map(specs.map((s) => [s.kind, new SustainedRule(s)]))
  }

  /** conditions에 없는 규칙은 "정상"으로 본다. */
  evaluate(conditions: Record<string, boolean>, now: number): Fired[] {
    const fired: Fired[] = []
    for (const [kind, rule] of this.rules) {
      const f = rule.update(conditions[kind] === true, now)
      if (f) fired.push(f)
    }
    return fired
  }

  /** UI용: 현재 진행 중인 이상 구간들 */
  active(now: number): { kind: string; message: string; heldMs: number; durationMs: number }[] {
    const out = []
    for (const rule of this.rules.values()) {
      const heldMs = rule.heldMs(now)
      if (heldMs > 0) out.push({ kind: rule.spec.kind, message: rule.spec.message, heldMs, durationMs: rule.spec.durationMs })
    }
    return out
  }

  reset() {
    for (const r of this.rules.values()) r.reset()
  }
}
