// DESIGN.md §7-1 척추 선 (Spine): 스크롤을 따라 그려지고 복기 트리처럼 갈라지는 선.
// 섹션 안의 [data-spine="이름"] 표식 위치를 재서 선을 그린다. 표식은 높이 0 짜리 div 이고,
// 고정(sticky)되거나 기울어지는 요소 바깥에 둔다 (그래야 문서 좌표가 흔들리지 않는다).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { ScrollTrigger, prefersReducedMotion } from './motion'

const LANE = 56 // 가지 레인 간격 (줄기에서 오른쪽으로)
const DRAW_LINE = 0.62 // 화면 위에서 62% 지점까지 그려진다

type Pt = { x: number; y: number }
type Geo = { w: number; h: number; x: number; pts: Record<string, Pt> }

type NodeDef = { at: string; lane: 0 | 1; color: string; label: string; time?: string; score?: number }

const NODES: NodeDef[] = [
  { at: 'hero', lane: 0, color: 'var(--color-brand)', label: 'main', time: '00:00' },
  { at: 'replay', lane: 0, color: 'var(--color-brand)', label: 'main', time: '00:23' },
  { at: 'replay-end', lane: 1, color: 'var(--color-branch-2)', label: 'b2', score: 88 },
  { at: 'report', lane: 0, color: 'var(--color-brand)', label: 'main', time: '00:31' },
  { at: 'live', lane: 0, color: 'var(--color-brand)', label: 'main', time: '00:42' },
  { at: 'live-end', lane: 1, color: 'var(--color-branch-3)', label: 'b3', score: 91 },
  { at: 'finale', lane: 0, color: 'var(--color-brand-blue)', label: 'main', time: '00:52' },
]

const BRANCHES = [
  { from: 'replay', to: 'replay-end', color: 'var(--color-branch-2)' },
  { from: 'live', to: 'live-end', color: 'var(--color-branch-3)' },
]

// 마무리 두 갈래: 줄기를 따라 내려오다 각 줄 버튼의 가운데 높이에서 오른쪽으로 꺾여 줄 왼쪽 끝에 닿는다.
const SPLITS = [
  { to: 'card-self', color: 'url(#spine-grad-h)' },
  { to: 'card-live', color: 'var(--color-alert)' },
]

function branchPath(x: number, a: Pt, b: Pt) {
  return `M ${x} ${a.y} L ${x + LANE} ${a.y + LANE} L ${x + LANE} ${b.y}`
}

function splitPath(x: number, from: Pt, to: Pt) {
  const r = 24
  return `M ${x} ${from.y} L ${x} ${to.y - r} Q ${x} ${to.y} ${x + r} ${to.y} L ${to.x} ${to.y}`
}

export default function Spine({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const [geo, setGeo] = useState<Geo | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const measure = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const r = root.getBoundingClientRect()
    const pts: Record<string, Pt> = {}
    root.querySelectorAll<HTMLElement>('[data-spine]').forEach((el) => {
      const b = el.getBoundingClientRect()
      pts[el.dataset.spine!] = { x: b.left - r.left, y: b.top - r.top }
    })
    const x = r.width >= 1024 ? 48 : 24
    setGeo((g) => {
      const next = { w: r.width, h: r.height, x, pts }
      return g && JSON.stringify(g) === JSON.stringify(next) ? g : next
    })
  }, [rootRef])

  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (rootRef.current) ro.observe(rootRef.current)
    ScrollTrigger.addEventListener('refresh', measure)
    document.fonts?.ready.then(measure)
    return () => {
      ro.disconnect()
      ScrollTrigger.removeEventListener('refresh', measure)
    }
  }, [measure, rootRef])

  // 스크롤마다 그려진 길이, 진행 머리, 노드 켜짐을 DOM에 바로 반영한다 (React 렌더 없음).
  useEffect(() => {
    const svg = svgRef.current
    const root = rootRef.current
    if (!svg || !root || !geo) return
    const reduced = prefersReducedMotion()
    const draws = [...svg.querySelectorAll<SVGPathElement>('[data-draw]')].map((p) => {
      const len = p.getTotalLength()
      p.style.strokeDasharray = `${len}`
      return { p, len, y0: Number(p.dataset.y0), y1: Number(p.dataset.y1) }
    })
    const nodes = [...svg.querySelectorAll<SVGGElement>('[data-node]')].map((n) => ({ n, y: Number(n.dataset.y) }))
    const head = svg.querySelector<SVGGElement>('[data-head]')
    const main = geo.pts.hero && geo.pts.finale ? [geo.pts.hero.y, geo.pts.finale.y] : [0, 0]

    let last = NaN
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const top = root.getBoundingClientRect().top
      const line = reduced ? Infinity : -top + window.innerHeight * DRAW_LINE
      if (line === last) return
      last = line
      for (const d of draws) {
        const f = Math.min(1, Math.max(0, (line - d.y0) / Math.max(1, d.y1 - d.y0)))
        d.p.style.strokeDashoffset = `${d.len * (1 - f)}`
      }
      for (const { n, y } of nodes) n.dataset.on = String(line >= y - 2)
      if (head) {
        const y = Math.min(main[1], Math.max(main[0], line))
        head.setAttribute('transform', `translate(${geo.x} ${y})`)
        head.style.opacity = line > main[0] && line < main[1] ? '1' : '0'
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [geo, rootRef])

  if (!geo || !geo.pts.hero || !geo.pts.finale) return null
  const { x, pts } = geo
  const y0 = pts.hero.y
  const y1 = pts.finale.y

  return (
    <svg
      ref={svgRef}
      aria-hidden
      // 크기를 부모에 맞춘다. scrollHeight 로 높이를 정하면 SVG 자신이 높이에 들어가 페이지가 줄어들지 않는다
      className="pointer-events-none absolute inset-0 z-20 hidden h-full w-full md:block"
      overflow="visible"
    >
      <defs>
        <linearGradient id="spine-grad" gradientUnits="userSpaceOnUse" x1="0" y1={y0} x2="0" y2={y1}>
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="45%" stopColor="#6c47ff" />
          <stop offset="100%" stopColor="#2f5bea" />
        </linearGradient>
        <linearGradient id="spine-grad-h" gradientUnits="userSpaceOnUse" x1={x} y1="0" x2={x + 600} y2="0">
          <stop offset="0%" stopColor="#2f5bea" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      {/* 아직 지나지 않은 길: 점선으로 미리 보인다 */}
      <g stroke="var(--color-line-strong)" strokeWidth={1} strokeDasharray="3 6" fill="none">
        <line x1={x} y1={y0} x2={x} y2={y1} />
        {BRANCHES.map((b) => pts[b.from] && pts[b.to] && <path key={b.to} d={branchPath(x, pts[b.from], pts[b.to])} />)}
        {SPLITS.map((s) => pts[s.to] && <path key={s.to} d={splitPath(x, pts.finale, pts[s.to])} />)}
      </g>

      {/* 그려지는 선 */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          data-draw
          data-y0={y0}
          data-y1={y1}
          d={`M ${x} ${y0} L ${x} ${y1}`}
          stroke="url(#spine-grad)"
          strokeWidth={3}
          style={{ filter: 'drop-shadow(0 0 6px rgb(108 71 255 / 0.35))' }}
        />
        {BRANCHES.map(
          (b) =>
            pts[b.from] &&
            pts[b.to] && (
              <path
                key={b.to}
                data-draw
                data-y0={pts[b.from].y}
                data-y1={pts[b.to].y}
                d={branchPath(x, pts[b.from], pts[b.to])}
                stroke={b.color}
                strokeWidth={2.5}
                style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${b.color} 45%, transparent))` }}
              />
            ),
        )}
        {SPLITS.map(
          (s) =>
            pts[s.to] && (
              <path
                key={s.to}
                data-draw
                data-y0={y1}
                data-y1={pts[s.to].y}
                d={splitPath(x, pts.finale, pts[s.to])}
                stroke={s.color}
                strokeWidth={3}
              />
            ),
        )}
      </g>

      {/* 노드 + 라벨 (복기 트리 문법: 색과 이름을 함께) */}
      {NODES.map((n) => {
        const p = pts[n.at]
        if (!p) return null
        const nx = x + n.lane * LANE
        return (
          <g
            key={n.at}
            data-node
            data-y={p.y}
            data-on="false"
            className="spine-node"
            transform={`translate(${nx} ${p.y})`}
            style={{ '--glow': n.color } as CSSProperties}
          >
            <circle className="dot" r={8} fill={n.color} stroke="var(--color-panel)" strokeWidth={3} />
            {n.score != null ? (
              <g>
                <rect x={14} y={-10} width={30} height={20} rx={5} fill={n.color} />
                <text x={29} y={4} textAnchor="middle" className="fill-on-accent font-mono text-[11px] font-semibold">
                  {n.score}
                </text>
                <text x={52} y={4} className="fill-text-muted font-mono text-[12px]">
                  {n.label}
                </text>
              </g>
            ) : (
              <text x={-16} y={4} textAnchor="end" className="fill-text-muted font-mono text-[12px]">
                {n.label === 'main' ? n.time : n.label}
              </text>
            )}
          </g>
        )
      })}

      {/* 진행 머리 */}
      <g data-head style={{ opacity: 0, transition: 'opacity 200ms' }}>
        <circle r={7} fill="var(--color-panel)" stroke="var(--color-brand)" strokeWidth={3} style={{ filter: 'drop-shadow(0 0 10px rgb(108 71 255 / 0.6))' }} />
      </g>
    </svg>
  )
}
