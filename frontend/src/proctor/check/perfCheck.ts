// 이 PC 가 카메라 분석을 얼마나 빨리 돌리는지 판정한다 (순수 함수 — 단위 테스트 대상).
// 입장은 막지 않는다: 느려도 pass/warn 만 내고, 분석 간격을 늘려 진행하며 점검 결과(감독 기록)에 남긴다.
import type { Verdict } from './envChecks.ts'

/**
 * 잠정 임계값. 개발 PC 에서 코어를 제한해 흉내 낸 측정(Worker_분리_설계.md 12장) 한 번에만 근거한다.
 * 실제 저사양 PC 측정으로 확정한다.
 */
export const PERF = {
  /** 분석 1회(p95)가 이보다 길면 "느린 편" */
  slowP95Ms: 130,
  /** 이보다 길거나 초당 분석 횟수가 minRatePerSec 미만이면 "많이 느림" */
  severeP95Ms: 250,
  minRatePerSec: 4,
  /** Worker 를 못 써서 화면 안에서 분석하는 경우: 메인 스레드가 이만큼 이상 막히면 "느린 편" */
  mainBlockedPct: 20,
  /** 이보다 표본이 적으면 많이 느린 것으로 본다 */
  minSamples: 5,
  /**
   * 휴대폰 분석 비용까지 합산해 판정할 때의 한도(웹캠 p95 + 휴대폰 p95, ms). 잠정값: 코어 제한 측정 3점에만 근거한다.
   * 제한 없음 약 185 → 좋은 PC(통과) / 2코어(2.5배 느림) 약 825 → 느리지만 웹캠 분석은 초당 7회로 돎 / 1코어 약 13700 → 사실상 멈춤.
   * 그 사이를 가르는 값(300·1000·3000)은 실제 저사양 PC 측정이 없어 위 3점 사이에서 임의로 나눈 것이다.
   */
  combined: { slowP95Ms: 300, severeP95Ms: 1000, unfitP95Ms: 3000 },
  /** 분석 간격(ms): 정상 / 느린 편 / 많이 느림(·unfit). 정상은 core/frameBudget.ts 의 PC_MIN_ANALYZE_INTERVAL_MS 와 같다 */
  intervalMs: { ok: 100, slow: 200, severe: 300 },
  /** 휴대폰 분석 간격(ms): 웹캠과 같은 단계로 함께 늘린다. 정상은 core/frameBudget.ts 의 PHONE_MIN_ANALYZE_INTERVAL_MS(200). 잠정값 */
  phoneIntervalMs: { ok: 200, slow: 400, severe: 600 },
} as const

export type PerfSample = {
  /** 분석이 돈 곳: Worker(백그라운드) 또는 메인(화면 안) */
  kind: 'worker' | 'main'
  /** 분석 1회에 걸린 시간(ms). 워밍업은 뺀다 */
  analysisMs: number[]
  /** 측정한 시간(ms) */
  elapsedMs: number
  /** 측정하는 동안 메인 스레드가 50ms 넘게 막힌 시간의 합(ms) */
  blockedMs: number
  /** 휴대폰 프레임 분석 1회에 걸린 시간(ms). 휴대폰을 쓰지 않거나 재지 못하면 없음. 웹캠 분석과 같은 CPU 를 나눠 쓰므로 합산해 판정한다 */
  phoneMs?: number[]
  cores?: number
  memoryGB?: number
}

export type PerfSummary = { kind: 'worker' | 'main'; n: number; p50: number; p95: number; perSec: number; blockedPct: number }

/** unfit: 이 PC 로는 감독 분석이 멈출 수 있음 (다른 PC 안내). 입장은 막지 않는다 — 현재 환경 점검 규칙대로 warn 으로 알리고 응시자가 판단한다 */
export type PerfLevel = 'ok' | 'slow' | 'severe' | 'unfit'
export type PerfVerdict = Verdict & { level: PerfLevel; intervalMs: number; phoneIntervalMs: number }

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

export function summarizePerf(s: PerfSample): PerfSummary {
  const sorted = [...s.analysisMs].sort((a, b) => a - b)
  const sec = s.elapsedMs / 1000
  return {
    kind: s.kind,
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    perSec: sec > 0 ? sorted.length / sec : 0,
    blockedPct: s.elapsedMs > 0 ? (s.blockedMs / s.elapsedMs) * 100 : 0,
  }
}

/** 휴대폰 표본이 이보다 적으면 믿지 않고 웹캠 기준으로만 판정한다 */
const MIN_PHONE_SAMPLES = 3

export function perfVerdict(s: PerfSample): PerfVerdict {
  const sum = summarizePerf(s)
  const phoneSorted = [...(s.phoneMs ?? [])].sort((a, b) => a - b)
  const phoneP95 = phoneSorted.length >= MIN_PHONE_SAMPLES ? percentile(phoneSorted, 95) : 0
  // 웹캠·휴대폰 분석은 따로 돌지만 같은 CPU 를 나눠 쓰므로, 한쪽 분석이 도는 동안 다른 쪽이 밀리는 최악의 경우로 합산한다
  const p95 = sum.p95 + phoneP95
  const hw = [s.cores ? `${s.cores}코어` : '', s.memoryGB ? `메모리 ${s.memoryGB}GB 이상` : ''].filter(Boolean).join(' · ')
  const stat = `분석 1회 ${Math.round(sum.p95)}ms${phoneP95 ? ` + 휴대폰 ${Math.round(phoneP95)}ms` : ''} · 초당 ${sum.perSec.toFixed(1)}회${hw ? ` · ${hw}` : ''}`
  // 휴대폰 비용이 있으면 합계 한도를, 없으면 웹캠 단독 한도를 쓴다
  const hasPhone = phoneP95 > 0
  const slowLimit = hasPhone ? PERF.combined.slowP95Ms : PERF.slowP95Ms
  const severeLimit = hasPhone ? PERF.combined.severeP95Ms : PERF.severeP95Ms
  // 감독이 멈출 수 있는 수준: 웹캠 분석 자체가 느리거나 드물거나, 합계가 한계를 크게 넘는 경우
  const unfit = sum.n < PERF.minSamples || sum.p95 > PERF.severeP95Ms || sum.perSec < PERF.minRatePerSec || (hasPhone && p95 > PERF.combined.unfitP95Ms)
  if (unfit) {
    return {
      status: 'warn',
      level: 'unfit',
      intervalMs: PERF.intervalMs.severe,
      phoneIntervalMs: PERF.phoneIntervalMs.severe,
      detail: `이 PC 로는 시험 감독이 멈출 수 있습니다 (${stat}). 가능하면 사양이 더 좋은 다른 PC 로 응시해 주세요. 다른 프로그램·탭을 닫아 보고 다시 점검할 수도 있습니다. 계속 진행하면 분석 간격을 가장 길게 늘려 진행하며 감독 기록에 남습니다.`,
    }
  }
  if (p95 > severeLimit) {
    return {
      status: 'warn',
      level: 'severe',
      intervalMs: PERF.intervalMs.severe,
      phoneIntervalMs: PERF.phoneIntervalMs.severe,
      detail: `이 PC 에서는 분석이 많이 느립니다 (${stat}). 다른 프로그램·탭을 닫고, 가능하면 사양이 높은 PC 를 써 주세요. 분석 간격을 늘려 진행하며 감독 기록에 남습니다.`,
    }
  }
  const mainBlocked = sum.kind === 'main' && sum.blockedPct >= PERF.mainBlockedPct
  if (p95 > slowLimit || mainBlocked) {
    return {
      status: 'warn',
      level: 'slow',
      intervalMs: PERF.intervalMs.slow,
      phoneIntervalMs: PERF.phoneIntervalMs.slow,
      detail: `이 PC 에서는 분석이 느린 편입니다 (${stat}${mainBlocked ? ` · 화면이 ${Math.round(sum.blockedPct)}% 멈춤` : ''}). 다른 프로그램을 닫아 주세요. 분석 간격을 늘려 진행하며 감독 기록에 남습니다.`,
    }
  }
  return { status: 'pass', level: 'ok', intervalMs: PERF.intervalMs.ok, phoneIntervalMs: PERF.phoneIntervalMs.ok, detail: stat }
}
