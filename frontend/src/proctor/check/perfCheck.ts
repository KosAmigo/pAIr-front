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
  /** 분석 간격(ms): 정상 / 느린 편 / 많이 느림. 정상은 core/frameBudget.ts 의 PC_MIN_ANALYZE_INTERVAL_MS 와 같다 */
  intervalMs: { ok: 100, slow: 200, severe: 300 },
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
  cores?: number
  memoryGB?: number
}

export type PerfSummary = { kind: 'worker' | 'main'; n: number; p50: number; p95: number; perSec: number; blockedPct: number }

export type PerfVerdict = Verdict & { level: 'ok' | 'slow' | 'severe'; intervalMs: number }

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

export function perfVerdict(s: PerfSample): PerfVerdict {
  const sum = summarizePerf(s)
  const hw = [s.cores ? `${s.cores}코어` : '', s.memoryGB ? `메모리 ${s.memoryGB}GB 이상` : ''].filter(Boolean).join(' · ')
  const stat = `분석 1회 ${Math.round(sum.p95)}ms · 초당 ${sum.perSec.toFixed(1)}회${hw ? ` · ${hw}` : ''}`
  const severe = sum.n < PERF.minSamples || sum.p95 > PERF.severeP95Ms || sum.perSec < PERF.minRatePerSec
  if (severe) {
    return {
      status: 'warn',
      level: 'severe',
      intervalMs: PERF.intervalMs.severe,
      detail: `이 PC 에서는 분석이 많이 느립니다 (${stat}). 다른 프로그램·탭을 닫고, 가능하면 사양이 높은 PC 를 써 주세요. 분석 간격을 늘려 진행하며 감독 기록에 남습니다.`,
    }
  }
  const mainBlocked = sum.kind === 'main' && sum.blockedPct >= PERF.mainBlockedPct
  if (sum.p95 > PERF.slowP95Ms || mainBlocked) {
    return {
      status: 'warn',
      level: 'slow',
      intervalMs: PERF.intervalMs.slow,
      detail: `이 PC 에서는 분석이 느린 편입니다 (${stat}${mainBlocked ? ` · 화면이 ${Math.round(sum.blockedPct)}% 멈춤` : ''}). 다른 프로그램을 닫아 주세요. 분석 간격을 늘려 진행하며 감독 기록에 남습니다.`,
    }
  }
  return { status: 'pass', level: 'ok', intervalMs: PERF.intervalMs.ok, detail: stat }
}
