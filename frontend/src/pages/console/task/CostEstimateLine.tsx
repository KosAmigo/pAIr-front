// 시작 버튼 근처에 한 줄로 보이는 예상 비용. 직군·시간·방식·개수가 바뀔 때마다 짧게 기다렸다가 다시 불러온다.
// 불러오지 못하면 조용히 숨긴다(폼 사용을 막지 않는다).
import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { estimateLine, taskGenApi, type CostEstimate, type CostEstimateQuery } from '../../../data/taskGen'

const DEBOUNCE_MS = 300

export function CostEstimateLine({ query }: { query: CostEstimateQuery | null }) {
  const [est, setEst] = useState<CostEstimate | null>(null)
  const { track, minutes, mode, count } = query ?? { track: null, minutes: 0, mode: 'NOW', count: 0 }

  useEffect(() => {
    if (!track) {
      setEst(null)
      return
    }
    let stale = false
    const t = setTimeout(() => {
      taskGenApi
        .costEstimate({ track, minutes: minutes as CostEstimateQuery['minutes'], mode, count })
        .then((e) => !stale && setEst(e))
        .catch(() => !stale && setEst(null))
    }, DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [track, minutes, mode, count])

  if (!est) return null
  return (
    <p data-testid="cost-estimate" aria-live="polite" className="tnum flex items-center gap-1.5 text-[14px] font-semibold break-keep text-text-muted">
      <Coins size={15} aria-hidden className="shrink-0" /> {estimateLine(est)}
    </p>
  )
}
