import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx } from '../cx'
import { duration, easing, springs } from '../../lib/motion'
import { CountUp } from '../fx'

export type HexStat = { key: string; name: string; score: number; max: number; color: string }

const C = 260
const R = 168

/**
 * 대시보드 역량 육각형 (DESIGN.md §7-2). 다크 무대 위에서 쓴다.
 * 링 5겹 + 레이더 스윕(천천히 도는 빛) + 지난 응시 다각형(점선) + 이번 다각형(그라데이션 면, 빛).
 * 꼭짓점·라벨에 마우스를 올리면 그 항목이 강조된다(active). 가운데에 총점.
 */
export function StatHex({
  stats,
  prev,
  total,
  active,
  onActive,
  size = 520,
}: {
  stats: HexStat[]
  /** 지난 응시 점수 (같은 순서) */
  prev?: number[]
  total: number
  active: string | null
  onActive: (key: string | null) => void
  size?: number
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const reduce = useReducedMotion()
  const n = stats.length
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180
  const pt = (i: number, r: number) => [C + r * Math.cos(ang(i)), C + r * Math.sin(ang(i))] as const
  const ring = (k: number) => stats.map((_, i) => pt(i, R * k).join(',')).join(' ')
  const ratio = (v: number, i: number) => Math.max(0.06, v / stats[i].max)
  const shape = (vals: number[]) => vals.map((v, i) => pt(i, R * ratio(v, i)).join(',')).join(' ')
  const cur = stats.map((s) => s.score)

  return (
    <svg viewBox="0 0 520 520" width={size} height={size} className="max-w-full overflow-visible" role="img" aria-label={`역량 육각형: ${stats.map((s) => `${s.name} ${s.score}/${s.max}`).join(', ')}, 총점 ${total}`}>
      <defs>
        <radialGradient id={`${uid}-fill`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'var(--color-stage-brand)', stopOpacity: 0.55 }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-stage-blue)', stopOpacity: 0.25 }} />
        </radialGradient>
        <linearGradient id={`${uid}-ring`} gradientUnits="userSpaceOnUse" x1={C - R} y1={C - R} x2={C + R} y2={C + R}>
          <stop offset="0%" style={{ stopColor: 'var(--color-stage-brand)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-stage-blue)' }} />
        </linearGradient>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: 'var(--color-stage-brand)', stopOpacity: 0 }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-stage-brand)', stopOpacity: 0.28 }} />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <polygon points={ring(1)} />
        </clipPath>
      </defs>

      {/* 링 5겹: 안쪽일수록 조금 더 밝게 */}
      {[1, 0.8, 0.6, 0.4, 0.2].map((k, i) => (
        <polygon
          key={k}
          points={ring(k)}
          fill={i % 2 === 0 ? 'var(--color-stage-raised)' : 'var(--color-stage-panel)'}
          fillOpacity={i % 2 === 0 ? 0.55 : 0.4}
          stroke={k === 1 ? `url(#${uid}-ring)` : 'var(--color-stage-line)'}
          strokeWidth={k === 1 ? 1.5 : 1}
        />
      ))}

      {/* 레이더 스윕: 육각형 안에서만 천천히 돈다 (꾸밈. 움직임 줄이기면 멈춤) */}
      {!reduce && (
        <g clipPath={`url(#${uid}-clip)`}>
          <g className="hex-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
            <path d={`M ${C} ${C} L ${C + R + 20} ${C} A ${R + 20} ${R + 20} 0 0 0 ${C + (R + 20) * Math.cos(-0.7)} ${C + (R + 20) * Math.sin(-0.7)} Z`} fill={`url(#${uid}-sweep)`} />
          </g>
        </g>
      )}

      {/* 축 */}
      {stats.map((s, i) => {
        const [x, y] = pt(i, R)
        const on = active === s.key
        return <line key={s.key} x1={C} y1={C} x2={x} y2={y} stroke={on ? s.color : 'var(--color-stage-line-strong)'} strokeWidth={on ? 2 : 1} className="transition-[stroke,stroke-width] duration-200" />
      })}

      {/* 지난 응시: 점선 */}
      {prev && <polygon points={shape(prev)} fill="none" stroke="var(--color-stage-muted)" strokeWidth={1.5} strokeDasharray="4 5" strokeLinejoin="round" opacity={0.7} />}

      {/* 이번 응시: 그라데이션 면 + 빛 */}
      <motion.polygon
        points={shape(cur)}
        fill={`url(#${uid}-fill)`}
        stroke="var(--color-stage-brand)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 18px color-mix(in srgb, var(--color-stage-brand) 60%, transparent))' }}
        initial={reduce ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: duration.crawl, ease: easing.expo, delay: 0.2 }}
      />

      {/* 꼭짓점 */}
      {stats.map((s, i) => {
        const [x, y] = pt(i, R * ratio(s.score, i))
        const on = active === s.key
        return (
          <motion.circle
            key={s.key}
            cx={x}
            cy={y}
            r={on ? 9 : 6}
            fill={s.color}
            stroke="var(--color-stage-bg)"
            strokeWidth={2.5}
            style={{ filter: `drop-shadow(0 0 ${on ? 14 : 8}px ${s.color})`, transformOrigin: `${x}px ${y}px` }}
            className="transition-[r] duration-200"
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...springs.gentle, delay: 0.7 + i * 0.07 }}
          />
        )
      })}

      {/* 라벨: 이름 + 점수/배점. 올리면 강조 */}
      {stats.map((s, i) => {
        const [x, y] = pt(i, R + 44)
        const anchor = Math.abs(x - C) < 4 ? 'middle' : x > C ? 'start' : 'end'
        const on = active === s.key
        return (
          <g
            key={s.key}
            onMouseEnter={() => onActive(s.key)}
            onMouseLeave={() => onActive(null)}
            className="cursor-default"
          >
            <rect x={x - 70} y={y - 26} width={140} height={44} fill="transparent" />
            <text x={x} y={y - 6} textAnchor={anchor} className={cx('text-[14px] font-semibold transition-colors', on ? 'fill-stage-text' : 'fill-stage-muted')}>
              {s.name}
            </text>
            <text x={x} y={y + 13} textAnchor={anchor} className="tnum fill-stage-text font-mono text-[15px] font-semibold">
              {s.score}
              <tspan className="fill-stage-faint text-[12px]">/{s.max}</tspan>
            </text>
          </g>
        )
      })}

      {/* 가운데 총점 */}
      <circle cx={C} cy={C} r={50} fill="var(--color-stage-bg)" stroke={`url(#${uid}-ring)`} strokeWidth={1.5} />
      <foreignObject x={C - 50} y={C - 30} width={100} height={60}>
        <div className="flex h-full flex-col items-center justify-center">
          <CountUp value={total} className="font-mono text-[34px] leading-9 font-semibold text-stage-text" />
          <span className="font-mono text-[10px] tracking-[0.12em] text-stage-muted">/ 100</span>
        </div>
      </foreignObject>
    </svg>
  )
}

/** 최근 응시 카드용 작은 육각형 (라벨 없음) */
export function MiniHex({ stats, size = 72 }: { stats: HexStat[]; size?: number }) {
  const n = stats.length
  const c = 50
  const r = 42
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180
  const pt = (i: number, k: number) => [c + r * k * Math.cos(ang(i)), c + r * k * Math.sin(ang(i))].join(',')
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <polygon points={stats.map((_, i) => pt(i, 1)).join(' ')} fill="var(--color-panel-raised)" stroke="var(--color-line-strong)" strokeWidth={1} />
      <polygon points={stats.map((_, i) => pt(i, 0.5)).join(' ')} fill="none" stroke="var(--color-line)" strokeWidth={1} />
      <polygon
        points={stats.map((s, i) => pt(i, Math.max(0.08, s.score / s.max))).join(' ')}
        fill="var(--color-brand)"
        fillOpacity={0.22}
        stroke="var(--color-brand)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  )
}
