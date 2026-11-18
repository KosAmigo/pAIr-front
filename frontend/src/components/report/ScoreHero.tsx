import { useEffect, useState, type ReactNode } from 'react'
import { CountUp, Particles, Reveal, StageSection } from '../fx'
import { ScoreRadar, type RadarItem } from './ScoreRadar'

/** 처음 여는 리포트인지 (브라우저 저장소. 막혀 있으면 처음으로 보지 않는다) */
function firstView(key: string) {
  try {
    const k = `pair:report-seen:${key}`
    if (localStorage.getItem(k)) return false
    localStorage.setItem(k, '1')
    return true
  } catch {
    return false
  }
}

/**
 * 결과 리포트 상단 총점 히어로 (DESIGN.md §7-4): 이 화면의 다크 무대.
 * 총점 120px mono 카운트업 + glow, 옆에 역량 레이더. 처음 여는 리포트면 입자가 한 번 터진다.
 */
export function ScoreHero({
  kind,
  title,
  meta,
  total,
  max,
  items,
  aside,
  seenKey,
}: {
  kind: string
  title: ReactNode
  meta: ReactNode
  total: number
  max: number
  items: RadarItem[]
  /** 총점 아래 한 줄 (지난 응시 대비 등) */
  aside?: ReactNode
  seenKey: string
}) {
  const [fire, setFire] = useState(false)
  useEffect(() => {
    if (!firstView(seenKey)) return
    // 카운트업이 거의 끝날 때 터진다
    const t = window.setTimeout(() => setFire(true), 900)
    return () => window.clearTimeout(t)
  }, [seenKey])

  return (
    <StageSection className="col-span-12" aria-label="총점 요약">
      <Particles fire={fire} origin={{ x: 0.78, y: 0.32 }} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-10 px-10 py-9">
        <Reveal>
          <span className="label text-stage-brand">{kind}</span>
          <h2 className="mt-2 text-[30px] leading-10 font-bold tracking-[-0.02em] text-stage-text">{title}</h2>
          <div className="tnum mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[14px] text-stage-muted">{meta}</div>
        </Reveal>
        <ScoreRadar items={items} size={240} />
        <div className="flex flex-col items-end">
          <span className="label text-stage-muted">TOTAL SCORE</span>
          <div className="flex items-baseline gap-2">
            <CountUp
              value={total}
              className="font-mono text-[120px] leading-[120px] font-semibold tracking-[-0.04em] text-stage-text [text-shadow:0_0_48px_rgb(167_139_250/0.55)]"
            />
            <span className="font-mono text-[20px] text-stage-muted">/{max}</span>
          </div>
          {aside && <div className="mt-1 text-[14px] text-stage-muted">{aside}</div>}
        </div>
      </div>
    </StageSection>
  )
}

/** 다크 무대 위 메타 구분선 (§2.4 가운데 점 대신) */
export function StageSep() {
  return <span className="inline-block h-3 w-px shrink-0 self-center bg-stage-line-strong" aria-hidden />
}
