import { useEffect, useId, useRef, useState } from 'react'
import { motion, useInView } from 'motion/react'
import { cx } from '../cx'
import { duration, easing, useShouldAnimate } from '../../lib/motion'

/**
 * 복기 트리 문법의 갈라지는 선 (DESIGN.md §0-4, §3.7). 구분선, 섹션 장식, 진행 막대, 로딩 표시에 쓴다.
 * - progress 를 주면 줄기가 그 비율까지 그려진다(진행 막대).
 * - 주지 않으면 화면에 들어올 때 한 번 끝까지 그려진다(구분선).
 * - branches: 줄기에서 갈라지는 가지의 위치(0–1). 가지 색은 분기 색 순서(b2, b3 …).
 * - loading: 줄기를 따라 빛이 흐른다(집중 무대에서도 허용되는 유일한 용도).
 */
export function BranchLine({
  progress,
  branches = [],
  loading = false,
  className,
}: {
  progress?: number
  branches?: number[]
  loading?: boolean
  className?: string
}) {
  // useId 값의 특수문자(«», :)는 url(#…) 안에서 깨지므로 영문·숫자만 남긴다
  const id = `bl${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true })
  const run = useShouldAnimate()
  const target = progress ?? (inView || !run ? 1 : 0)
  // viewBox 를 실제 픽셀 폭에 맞춘다. 늘려 그리면(preserveAspectRatio none) pathLength 대시가 깨진다
  const [W, setW] = useState(1000)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const branchColors = ['var(--color-branch-2)', 'var(--color-branch-3)', 'var(--color-branch-4)', 'var(--color-branch-5)']
  // progress 를 줄 때(진행 막대)는 조회 주기(약 0.5초)보다 조금 길게 선형으로 잇는다.
  // expo 곡선이면 값이 갱신될 때마다 빠르게 출발했다 멈춰서 끊겨 보인다
  const t = progress !== undefined ? { duration: run ? 0.6 : 0, ease: 'linear' as const } : { duration: run ? duration.crawl : 0, ease: easing.expo }
  return (
    <svg ref={ref} viewBox={`0 0 ${W} 24`} aria-hidden className={cx('h-6 w-full overflow-visible', className)}>
      <defs>
        {/* 높이 0 인 가로선은 objectBoundingBox 그라데이션이 칠해지지 않으므로 userSpaceOnUse 로 */}
        {/* 빛이 채워진 구간 밖으로 나가지 않게 자른다. 폭은 progress 를 따라 부드럽게 늘어난다 */}
        <clipPath id={`${id}-c`}>
          <motion.rect x="0" y="0" height="12" initial={{ width: 0 }} animate={{ width: target * W }} transition={t} />
        </clipPath>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--color-branch-3)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--color-brand)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-brand-blue)' }} />
        </linearGradient>
      </defs>
      <line x1="0" y1="6" x2={W} y2="6" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="3 5" />
      <motion.path
        d={`M0 6 H${W}`}
        stroke={`url(#${id}-g)`}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
       
        initial={{ pathLength: run ? 0 : target }}
        animate={{ pathLength: target }}
        transition={t}
      />
      {branches.map((at, i) => {
        const x = at * W
        const on = target >= at
        return (
          <motion.path
            key={i}
            d={`M${x} 6 L${x + 14} 18 H${x + 90}`}
            stroke={branchColors[i % branchColors.length]}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
           
            initial={{ pathLength: run ? 0 : on ? 1 : 0 }}
            animate={{ pathLength: on ? 1 : 0 }}
            transition={{ ...t, delay: run ? at * duration.crawl : 0 }}
          />
        )
      })}
      {loading && run && (
        <g clipPath={progress !== undefined ? `url(#${id}-c)` : undefined}>
        <motion.rect
          y="4"
          height="4"
          width="120"
          rx="2"
          fill="var(--color-brand)"
          opacity="0.5"
          initial={{ x: -120 }}
          animate={{ x: W }}
          transition={{ duration: duration.pulse, ease: easing.standard, repeat: Infinity }}
        />
        </g>
      )}
    </svg>
  )
}
