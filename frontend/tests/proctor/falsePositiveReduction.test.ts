// 오탐·증거 유실 대응: 경고 간격 늘리기, 코딩 회차 기준값 묶음, 아웃박스가 넘칠 때는 사진만 버리기
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_EVENT_ITEMS, MAX_PHOTO_ITEMS, trimOutbox } from '../../src/proctor/api/camOutbox.ts'
import type { ProctorEventRequest } from '../../src/proctor/api/proctorApi.ts'
import { SustainedRule } from '../../src/proctor/core/RuleEngine.ts'
import { PC_PROFILES, PC_RULES, PC_THRESHOLDS, pcProfile } from '../../src/proctor/core/pcRules.ts'

const spec = { kind: 'x', message: 'x', durationMs: 1000, cooldownMs: 6000, maxCooldownMs: 60000, graceMs: 300 }

/** 이상이 계속되는 동안 100ms 간격으로 돌려 경고 시각을 모은다 */
function firedTimes(rule: SustainedRule, from: number, to: number): number[] {
  const out: number[] = []
  for (let t = from; t <= to; t += 100) if (rule.update(true, t)) out.push(t)
  return out
}

describe('같은 규칙 반복 경고 간격', () => {
  it('이상이 이어지면 간격이 6초 → 12초 → 24초 → 48초 → 60초로 늘고 60초에서 멈춘다', () => {
    const times = firedTimes(new SustainedRule(spec), 0, 300_000)
    const gaps = times.slice(1).map((t, i) => t - times[i])
    assert.deepEqual(gaps.slice(0, 6), [6000, 12000, 24000, 48000, 60000, 60000])
  })

  it('같은 자세 이탈 5분이면 간격을 늘리지 않을 때보다 이벤트가 크게 줄어든다', () => {
    const fixed = firedTimes(new SustainedRule({ ...spec, maxCooldownMs: spec.cooldownMs }), 0, 300_000)
    const grown = firedTimes(new SustainedRule(spec), 0, 300_000)
    assert.ok(fixed.length >= 45)
    assert.ok(grown.length <= 10, `늘어난 간격 경고 수: ${grown.length}`)
  })

  it('정상으로 돌아오면 간격이 원래대로 돌아간다', () => {
    const rule = new SustainedRule(spec)
    firedTimes(rule, 0, 30_000) // 6s, 12s 간격까지 커짐
    assert.ok(rule.currentCooldownMs() > spec.cooldownMs)
    rule.update(false, 30_100)
    rule.update(false, 31_000) // 끊김 허용(grace) 초과 → 구간 종료
    assert.equal(rule.currentCooldownMs(), spec.cooldownMs)
    const again = firedTimes(rule, 40_000, 60_000)
    assert.equal(again[1] - again[0], 6000)
  })

  it('상한을 따로 정하지 않으면 60초가 상한이다', () => {
    const rule = new SustainedRule({ kind: 'y', message: 'y', durationMs: 100, cooldownMs: 10_000 })
    firedTimes(rule, 0, 600_000)
    assert.equal(rule.currentCooldownMs(), 60_000)
  })

  it('reset 하면 간격도 원래대로 돌아온다 (기준 자세를 다시 잡을 때)', () => {
    const rule = new SustainedRule(spec)
    firedTimes(rule, 0, 30_000)
    rule.reset()
    assert.equal(rule.currentCooldownMs(), spec.cooldownMs)
  })
})

describe('회차 종류별 기준값', () => {
  it('기본 값은 기존 PC_THRESHOLDS·PC_RULES 그대로다', () => {
    assert.equal(pcProfile(undefined).thresholds, PC_THRESHOLDS)
    assert.equal(pcProfile('default').rules, PC_RULES)
  })

  it('코딩 회차 묶음이 있고, 기본 값을 고치지 않도록 따로 복사돼 있다', () => {
    const coding = PC_PROFILES.coding
    assert.notEqual(coding.thresholds, PC_THRESHOLDS)
    assert.notEqual(coding.rules, PC_RULES)
    assert.deepEqual(coding.rules.map((r) => r.kind), PC_RULES.map((r) => r.kind))
    assert.ok(coding.rules.some((r) => r.kind === 'head_down'))
  })
})

describe('아웃박스 가득 참', () => {
  const req = (i: number, photo: boolean): ProctorEventRequest => ({
    type: 'NO_FACE',
    source: 'PC_CAM',
    startedAt: new Date(i * 1000).toISOString(),
    durationMs: 2000,
    snapshot: photo ? 'data:image/jpeg;base64,AAAA' : undefined,
    clientId: `evt-${i}`,
  })

  it('사진 100장을 넘으면 오래된 건부터 사진만 버리고 이벤트는 모두 남긴다', () => {
    const total = MAX_PHOTO_ITEMS + 30
    const out = trimOutbox(Array.from({ length: total }, (_, i) => req(i, true)))
    assert.equal(out.length, total)
    assert.equal(out.filter((e) => e.snapshot).length, MAX_PHOTO_ITEMS)
    assert.equal(out[0].snapshot, undefined)
    assert.equal(out[29].snapshot, undefined)
    assert.ok(out[30].snapshot)
    assert.deepEqual(out.map((e) => e.clientId), Array.from({ length: total }, (_, i) => `evt-${i}`))
  })

  it('한도 안이면 그대로 둔다', () => {
    const items = Array.from({ length: 10 }, (_, i) => req(i, true))
    assert.deepEqual(trimOutbox(items), items)
  })

  it('이벤트 수가 극단적으로 많을 때만 가장 오래된 이벤트를 버린다', () => {
    const out = trimOutbox(Array.from({ length: MAX_EVENT_ITEMS + 5 }, (_, i) => req(i, false)))
    assert.equal(out.length, MAX_EVENT_ITEMS)
    assert.equal(out[0].clientId, 'evt-5')
  })
})
