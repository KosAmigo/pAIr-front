// 한 프레임 분석을 감싼다: 이전 감독에서 날아온 결과는 버리고, 실패는 건너뛰되 연달아 실패하면 포기한다.
import type { PcFeatures } from '../core/pcRules.ts'

export type GuardedAnalyzerOptions = {
  /** 이 분석이 지금 감독(보정·감시)에 속하는지. 아니면 결과와 오류를 모두 버린다 */
  isCurrent: () => boolean
  analyze: (now: number) => Promise<PcFeatures>
  /** 연달아 이 횟수만큼 실패하면 onGiveUp 을 부른다 */
  maxFailures: number
  onFail: (e: unknown) => void
  onGiveUp: () => void
}

/** 결과가 있으면 특징값, 버렸거나 실패했으면 null 을 돌려주는 함수를 만든다 */
export function guardedAnalyzer(opts: GuardedAnalyzerOptions): (now: number) => Promise<PcFeatures | null> {
  let failures = 0
  return async (now) => {
    try {
      const f = await opts.analyze(now)
      failures = 0
      return opts.isCurrent() ? f : null
    } catch (e) {
      if (!opts.isCurrent()) return null
      opts.onFail(e)
      if (++failures >= opts.maxFailures) opts.onGiveUp()
      return null
    }
  }
}
