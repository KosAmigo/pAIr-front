// DESIGN.md §4.3 장면 점: 고정 섹션 오른쪽 아래. 누르면 그 장면으로 스크롤한다.
import type { RefObject } from 'react'
import { cx } from '../../components/cx'
import { ScrollTrigger, useLenis } from './motion'

/** 장면 점: 현재 장면은 brand. 누르면 그 장면 가운데로 스크롤한다. */
export default function SceneDots({
  count,
  scene,
  st,
  labels,
  className,
}: {
  count: number
  scene: number
  st: RefObject<ScrollTrigger | null>
  labels: string[]
  className?: string
}) {
  const lenis = useLenis()
  const go = (i: number) => {
    const t = st.current
    if (!t) return
    const y = t.start + ((i + 0.5) / count) * (t.end - t.start)
    if (lenis?.current) lenis.current.scrollTo(y, { duration: 0.9 })
    else window.scrollTo({ top: y })
  }
  return (
    <div role="group" aria-label="장면 이동" className={cx('flex items-center gap-2', className)}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => go(i)}
          aria-label={`장면 ${i + 1}: ${labels[i]}`}
          aria-current={scene === i ? 'step' : undefined}
          className="group inline-flex size-6 items-center justify-center"
        >
          <span
            className={cx(
              // 너비 대신 scaleX 로 늘린다 (§4.1: width 애니메이션 금지)
              'block h-2 w-6 rounded-full transition-[transform,background-color] duration-300',
              scene === i ? 'scale-x-100 bg-brand' : 'scale-x-[0.34] bg-line-strong group-hover:bg-text-muted',
            )}
          />
        </button>
      ))}
    </div>
  )
}
