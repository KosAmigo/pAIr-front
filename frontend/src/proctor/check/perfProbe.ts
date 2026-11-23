// 이 PC 의 분석 속도를 실제로 재는 부분 (브라우저 전용). 판정은 perfCheck.ts 가 한다.
import { PC_MIN_ANALYZE_INTERVAL_MS } from '../core/frameBudget.ts'
import { frameLoop } from '../vision/camera.ts'
import type { VisionBackend } from '../vision/visionBackend.ts'
import type { PerfSample } from './perfCheck.ts'

/** 이 시간 동안 감독 루프와 같은 방식(최소 간격 + 걸린 시간만큼 휴식)으로 분석을 돌려 본다 */
export const PERF_PROBE_MS = 4000
/** 처음 몇 번은 첫 실행 지연(워밍업)이라 뺀다 */
const WARMUP_SAMPLES = 2

type NavigatorWithMemory = Navigator & { deviceMemory?: number }

/**
 * 감독 루프와 같은 분석(analyzePc)을 몇 초 돌려 분석 1회 시간과 메인 스레드 막힘을 잰다.
 * 얼굴이 보이는 상태에서 재야 실제 비용에 가깝다(얼굴이 없으면 얼굴 랜드마크 단계를 건너뛰어 더 빠르게 나온다).
 * 취소되거나 분석이 연달아 실패하면 오류를 던진다.
 */
export function measurePerf(opts: { vision: VisionBackend; video: HTMLVideoElement; isCancelled: () => boolean; durationMs?: number }): Promise<PerfSample> {
  const durationMs = opts.durationMs ?? PERF_PROBE_MS
  return new Promise((resolve, reject) => {
    const analysisMs: number[] = []
    const longTasks: number[] = []
    let seen = 0
    let startedAt = 0
    let po: PerformanceObserver | null = null
    try {
      po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration)))
      po.observe({ entryTypes: ['longtask'] })
    } catch {
      /* longtask 를 지원하지 않는 브라우저: 막힘 비율은 0 으로 본다 */
    }
    opts.vision.resetPc()
    const finish = (stop: () => void, err?: Error) => {
      stop()
      po?.disconnect()
      if (err) reject(err)
      else {
        const memoryGB = (navigator as NavigatorWithMemory).deviceMemory
        resolve({
          kind: opts.vision.kind,
          analysisMs,
          elapsedMs: performance.now() - startedAt,
          blockedMs: longTasks.reduce((a, b) => a + b, 0),
          cores: navigator.hardwareConcurrency || undefined,
          memoryGB,
        })
      }
    }
    let failures = 0
    const stopLoop = frameLoop(
      opts.video,
      async (now) => {
        if (opts.isCancelled()) return finish(stopLoop, new Error('취소되었습니다'))
        const s = performance.now()
        try {
          await opts.vision.analyzePc(opts.video, now)
          failures = 0
        } catch (e) {
          if (++failures >= 3) finish(stopLoop, e instanceof Error ? e : new Error(String(e)))
          return
        }
        const took = performance.now() - s
        seen++
        if (seen === WARMUP_SAMPLES) startedAt = performance.now() // 워밍업이 끝난 뒤부터 시간을 센다
        if (seen > WARMUP_SAMPLES) analysisMs.push(took)
        if (seen > WARMUP_SAMPLES && performance.now() - startedAt >= durationMs) finish(stopLoop)
      },
      { minIntervalMs: PC_MIN_ANALYZE_INTERVAL_MS },
    )
  })
}
