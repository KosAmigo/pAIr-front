import { motion, useReducedMotion } from 'motion/react'
import { duration, easing, springs } from '../../lib/motion'

export type RadarItem = { key: string; name: string; score: number; max: number; color: string }

/**
 * 다크 무대 위 역량 레이더 (DESIGN.md §7-4). 축이 가운데서 뻗고, 점수 면이 커지며, 점이 튀어나온다.
 * 항목 수에 맞춰 다각형을 그린다. 색은 항목 색(§1.5), 글자는 stage 토큰.
 */
export function ScoreRadar({ items, size = 260 }: { items: RadarItem[]; size?: number }) {
  const reduce = useReducedMotion()
  const n = Math.max(3, items.length)
  const c = 150
  const R = 96
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180
  const pt = (i: number, r: number) => [c + r * Math.cos(ang(i)), c + r * Math.sin(ang(i))] as const
  const poly = (f: (i: number) => number) => items.map((_, i) => pt(i, f(i)).join(',')).join(' ')
  const ratio = (i: number) => Math.max(0.04, items[i].score / Math.max(1, items[i].max))
  const grow = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { scale: 0, opacity: 0 },
          whileInView: { scale: 1, opacity: 1 },
          viewport: { once: true },
          transition: { duration: duration.crawl, ease: easing.expo, delay },
        }

  return (
    <svg
      viewBox="0 0 300 300"
      width={size}
      height={size}
      role="img"
      aria-label={`역량 레이더: ${items.map((it) => `${it.name} ${it.score}/${it.max}`).join(', ')}`}
      className="overflow-visible"
    >
      {[1, 2 / 3, 1 / 3].map((k) => (
        <polygon key={k} points={poly(() => R * k)} fill="none" stroke="var(--color-stage-line)" strokeWidth={1} />
      ))}
      {items.map((it, i) => {
        const [x, y] = pt(i, R)
        return (
          <motion.line
            key={it.key}
            x1={c}
            y1={c}
            x2={x}
            y2={y}
            stroke="var(--color-stage-line-strong)"
            strokeWidth={1}
            {...(reduce ? {} : { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true }, transition: { duration: duration.slow, ease: easing.expo, delay: i * 0.06 } })}
          />
        )
      })}
      <motion.polygon
        points={poly((i) => R * ratio(i))}
        fill="var(--color-stage-brand)"
        fillOpacity={0.22}
        stroke="var(--color-stage-brand)"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ transformOrigin: `${c}px ${c}px`, filter: 'drop-shadow(0 0 10px color-mix(in srgb, var(--color-stage-brand) 40%, transparent))' }}
        {...grow(0.25)}
      />
      {items.map((it, i) => {
        const [x, y] = pt(i, R * ratio(i))
        return (
          <motion.circle
            key={it.key}
            cx={x}
            cy={y}
            r={4.5}
            fill={it.color}
            stroke="var(--color-stage-bg)"
            strokeWidth={2}
            style={{ transformOrigin: `${x}px ${y}px` }}
            {...(reduce ? {} : { initial: { scale: 0 }, whileInView: { scale: 1 }, viewport: { once: true }, transition: { ...springs.gentle, delay: 0.6 + i * 0.06 } })}
          />
        )
      })}
      {items.map((it, i) => {
        const [x, y] = pt(i, R + 18)
        return (
          <text
            key={it.key}
            x={x}
            y={y + 4}
            textAnchor={Math.abs(x - c) < 4 ? 'middle' : x > c ? 'start' : 'end'}
            className="fill-stage-muted text-[11px] font-semibold"
          >
            {it.name}
          </text>
        )
      })}
    </svg>
  )
}
