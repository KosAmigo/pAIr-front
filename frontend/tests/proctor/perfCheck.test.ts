import { test } from 'node:test'
import { expect } from './expect.ts'
import { PERF, perfVerdict, summarizePerf, type PerfSample } from '../../src/proctor/check/perfCheck.ts'

/** 분석 1회가 ms 걸린 표본 n 개를 elapsedMs 동안 쟀다고 친다 */
function sample(over: Partial<PerfSample> & { ms?: number; n?: number } = {}): PerfSample {
  const { ms = 25, n = 40, ...rest } = over
  return { kind: 'worker', analysisMs: Array.from({ length: n }, () => ms), elapsedMs: 4000, blockedMs: 0, ...rest }
}

test('summarizePerf: p50·p95·초당 횟수·메인 막힘 비율을 계산한다', () => {
  const s = summarizePerf({ kind: 'worker', analysisMs: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], elapsedMs: 2000, blockedMs: 200 })
  expect(s.n).toBe(10)
  expect(s.p50).toBe(60)
  expect(s.p95).toBe(100)
  expect(s.perSec).toBe(5)
  expect(s.blockedPct).toBe(10)
})

test('summarizePerf: 표본이 없으면 0 으로 돌려준다', () => {
  const s = summarizePerf({ kind: 'worker', analysisMs: [], elapsedMs: 0, blockedMs: 0 })
  expect(s.n).toBe(0)
  expect(s.perSec).toBe(0)
  expect(s.blockedPct).toBe(0)
})

test('perfVerdict: 빠르면 통과하고 기본 간격(100ms)을 쓴다', () => {
  const v = perfVerdict(sample({ ms: 25, n: 40 })) // 4초에 40번 = 초당 10회
  expect(v.status).toBe('pass')
  expect(v.level).toBe('ok')
  expect(v.intervalMs).toBe(100)
})

test('perfVerdict: 분석 1회가 느리면(p95 130ms 초과) 주의하고 간격을 200ms 로 늘린다', () => {
  const v = perfVerdict(sample({ ms: 160, n: 24 })) // 초당 6회
  expect(v.status).toBe('warn')
  expect(v.level).toBe('slow')
  expect(v.intervalMs).toBe(200)
  expect(v.detail).toContain('느린 편')
})

test('perfVerdict: 웹캠 분석 1회 p95 가 250ms 를 넘으면 감독이 멈출 수 있음(unfit), 간격은 가장 길게', () => {
  const v = perfVerdict(sample({ ms: 300, n: 20 }))
  expect(v.status).toBe('warn')
  expect(v.level).toBe('unfit')
  expect(v.intervalMs).toBe(300)
  expect(v.detail).toContain('다른 PC')
})

test('perfVerdict: 초당 분석 횟수가 4회 미만이면 분석 1회가 빨라도 unfit', () => {
  const v = perfVerdict(sample({ ms: 50, n: 12 })) // 4초에 12번 = 초당 3회
  expect(v.level).toBe('unfit')
})

test('perfVerdict: 표본이 너무 적으면(5개 미만) unfit', () => {
  const v = perfVerdict(sample({ ms: 20, n: PERF.minSamples - 1 }))
  expect(v.level).toBe('unfit')
})

test('perfVerdict: 경계값 — p95 가 정확히 130ms 면 통과, 131ms 면 주의', () => {
  expect(perfVerdict(sample({ ms: 130, n: 40 })).level).toBe('ok')
  expect(perfVerdict(sample({ ms: 131, n: 40 })).level).toBe('slow')
})

test('perfVerdict: Worker 를 못 써서 메인에서 분석하는데 화면이 20% 이상 멈추면 주의', () => {
  const v = perfVerdict(sample({ kind: 'main', ms: 40, n: 40, blockedMs: 1000 })) // 4초 중 1초 = 25%
  expect(v.level).toBe('slow')
  expect(v.detail).toContain('화면이')
})

test('perfVerdict: Worker 에서 분석하면 메인 막힘은 판정에 쓰지 않는다', () => {
  const v = perfVerdict(sample({ kind: 'worker', ms: 40, n: 40, blockedMs: 3000 }))
  expect(v.level).toBe('ok')
})

test('perfVerdict: 어떤 경우에도 fail 을 내지 않는다 (입장을 막지 않는다)', () => {
  const worst = perfVerdict(sample({ ms: 5000, n: 1 }))
  expect(worst.status === 'fail').toBe(false)
})

test('perfVerdict: 코어 수·메모리를 사유에 남겨 감독관이 볼 수 있게 한다', () => {
  const v = perfVerdict(sample({ ms: 25, n: 40, cores: 4, memoryGB: 8 }))
  expect(v.detail).toContain('4코어')
  expect(v.detail).toContain('8GB')
})

const phone = (ms: number) => Array.from({ length: 6 }, () => ms)

// 아래 세 개는 코어 제한 측정값(웹캠 Worker + 휴대폰 Worker 동시, 2026-11-23)을 그대로 쓴다.
test('측정값 — 제한 없음(웹캠 p95 28ms·초당 9.6회, 휴대폰 p95 157ms): 좋은 PC 는 통과', () => {
  const v = perfVerdict(sample({ ms: 28, n: 38, phoneMs: phone(157) }))
  expect(v.level).toBe('ok')
})

test('측정값 — 2코어(웹캠 p95 118ms·초당 7회, 휴대폰 p95 707ms): 느린 편, 두 간격을 함께 늘린다', () => {
  const v = perfVerdict(sample({ ms: 118, n: 28, phoneMs: phone(707) }))
  expect(v.level).toBe('slow')
  expect(v.intervalMs).toBe(200)
  expect(v.phoneIntervalMs).toBe(PERF.phoneIntervalMs.slow)
  expect(v.detail).toContain('휴대폰')
})

test('측정값 — 1코어(웹캠 p95 4645ms·초당 0.7회, 휴대폰 p95 9064ms): 감독이 멈출 수 있음', () => {
  const v = perfVerdict(sample({ ms: 4645, n: 3, phoneMs: phone(9064) }))
  expect(v.level).toBe('unfit')
  expect(v.status).toBe('warn') // 입장은 막지 않는다 (현재 환경 점검의 주의 규칙)
  expect(v.phoneIntervalMs).toBe(PERF.phoneIntervalMs.severe)
})

test('웹캠은 괜찮아도 휴대폰 분석이 너무 느려 합계가 한도를 넘으면 unfit', () => {
  const v = perfVerdict(sample({ ms: 100, n: 40, phoneMs: phone(9000) }))
  expect(v.level).toBe('unfit')
})

test('합계가 느린 편과 unfit 사이면 severe: 진행하되 간격을 가장 길게', () => {
  const v = perfVerdict(sample({ ms: 100, n: 40, phoneMs: phone(1200) }))
  expect(v.level).toBe('severe')
  expect(v.intervalMs).toBe(300)
})

test('휴대폰 분석이 가벼우면 웹캠만 쟀을 때와 같은 판정', () => {
  const v = perfVerdict(sample({ ms: 25, n: 40, phoneMs: phone(30) }))
  expect(v.level).toBe('ok')
  expect(v.phoneIntervalMs).toBe(PERF.phoneIntervalMs.ok)
})

test('휴대폰 표본이 없으면(휴대폰 안 씀·측정 실패) 웹캠 기준으로만 판정하고 휴대폰 간격은 기본', () => {
  const v = perfVerdict(sample({ ms: 160, n: 24 }))
  expect(v.level).toBe('slow')
  expect(v.phoneIntervalMs).toBe(PERF.phoneIntervalMs.slow)
})
