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
  /**
   * 이상이 끊기지 않고 이어지는 동안 경고 간격의 상한. 경고할 때마다 간격이 두 배로 늘어 이 값에서 멈춘다.
   * 정상으로 돌아오면 cooldownMs 로 되돌린다. 기본 60초
   */
  maxCooldownMs?: number
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
export const DEFAULT_MAX_COOLDOWN_MS = 60_000
const COOLDOWN_GROWTH = 2

export class SustainedRule {
  private since: number | null = null
  private lastTrue = Number.NEGATIVE_INFINITY
  private lastFired = Number.NEGATIVE_INFINITY
  /** 지금 적용 중인 경고 간격 (같은 이상이 이어지면 늘고, 정상으로 돌아오면 원래대로) */
  private cooldown: number
  /** 이번 이상 구간에서 이미 경고한 횟수 */
  private firedInRun = 0

  readonly spec: RuleSpec

  constructor(spec: RuleSpec) {
    this.spec = spec
    this.cooldown = spec.cooldownMs
  }

  /** 지금 적용 중인 경고 간격 */
  currentCooldownMs(): number {
    return this.cooldown
  }

  /** 현재 이상 구간이 이어진 시간 (없으면 0) */
  heldMs(now: number): number {
    return this.since === null ? 0 : now - this.since
  }

  update(active: boolean, now: number): Fired | null {
    const grace = this.spec.graceMs ?? DEFAULT_GRACE_MS
    if (!active) {
      if (this.since !== null && now - this.lastTrue > grace) {
        this.since = null
        this.cooldown = this.spec.cooldownMs // 정상으로 돌아왔다
        this.firedInRun = 0
      }
      return null
    }
    if (this.since === null) this.since = now
    this.lastTrue = now
    const held = now - this.since
    if (held >= this.spec.durationMs && now - this.lastFired >= this.cooldown) {
      this.lastFired = now
      // 이번 경고 뒤의 간격: 첫 경고 뒤엔 원래 간격, 이어서 경고할 때마다 두 배 (상한까지)
      const max = Math.max(this.spec.cooldownMs, this.spec.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS)
      this.cooldown = this.firedInRun === 0 ? this.spec.cooldownMs : Math.min(max, this.cooldown * COOLDOWN_GROWTH)
      this.firedInRun++
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
    this.cooldown = this.spec.cooldownMs
    this.firedInRun = 0
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
