import { useId, useRef } from 'react'
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
  const id = useId()
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true })
  const run = useShouldAnimate()
  const target = progress ?? (inView || !run ? 1 : 0)
  const W = 1000
  const branchColors = ['var(--color-branch-2)', 'var(--color-branch-3)', 'var(--color-branch-4)', 'var(--color-branch-5)']
  const t = { duration: run ? duration.crawl : 0, ease: easing.expo }
  return (
    <svg ref={ref} viewBox={`0 0 ${W} 24`} preserveAspectRatio="none" aria-hidden className={cx('h-6 w-full overflow-visible', className)}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--color-branch-3)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--color-brand)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-brand-blue)' }} />
        </linearGradient>
      </defs>
      <line x1="0" y1="6" x2={W} y2="6" stroke="var(--color-line)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="3 5" />
      <motion.path
        d={`M0 6 H${W}`}
        stroke={`url(#${id}-g)`}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
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
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: run ? 0 : on ? 1 : 0 }}
            animate={{ pathLength: on ? 1 : 0 }}
            transition={{ ...t, delay: run ? at * duration.crawl : 0 }}
          />
        )
      })}
      {loading && run && (
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
      )}
    </svg>
  )
}
