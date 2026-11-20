import { useMemo, type CSSProperties, type KeyboardEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { cx } from '../cx'
import { branchColor } from '../../lib/replayTree'
import { commonAncestor, routeIds, type TreeLane } from '../../lib/reviewTree'
import { shortDate, SLOT, turnTag } from './shared'

// DESIGN.md §7-5 갈래 트리 (어두운 안쪽 무대). 가로축은 대화 턴, 갈래는 가로 선 하나.
// 모든 갈래의 끝(점수 원)은 오른쪽 같은 열(결승선)에 세운다. 그래프는 SVG.
const GAP_X = 72
const X0 = 70
const ROW = 74
const TOP = 48
const ROOT_GAP = 26
const LABEL_W = 236
const laneColor = (l: TreeLane) => `var(--color-branch-${branchColor(l.branch)})`

type Slot = 'a' | 'b'

export function BranchStage({
  title,
  lanes,
  lastFork,
  a,
  b,
  slot,
  onSlot,
  onPick,
  onOpen,
}: {
  title: string
  lanes: TreeLane[]
  lastFork: number
  a: string | null
  b: string | null
  slot: Slot
  onSlot: (s: Slot) => void
  onPick: (id: string) => void
  onOpen: (id: string) => void
}) {
  const reduce = useReducedMotion() ?? false
  const cols = Math.max(6, lastFork + 2)
  const X = (t: number) => X0 + (t - 1) * GAP_X
  const finishX = X(cols)
  const roots = lanes.length ? Math.max(...lanes.map((l) => l.root)) + 1 : 0
  const yOf = (l: TreeLane) => TOP + l.lane * ROW + l.root * ROOT_GAP
  const W = finishX + 30 + LABEL_W
  const H = TOP + Math.max(1, lanes.length) * ROW + (roots - 1) * ROOT_GAP
  const byId = useMemo(() => new Map(lanes.map((l) => [l.attemptId, l])), [lanes])
  const route = useMemo(() => (a && b ? routeIds(lanes, a, b) : null), [lanes, a, b])
  const common = useMemo(() => (a && b ? commonAncestor(lanes, a, b) : null), [lanes, a, b])
  const dimmed = (id: string) => route != null && !route.has(id) && id !== common
  const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? '') : '')

  const lanePath = (l: TreeLane) => {
    const y = yOf(l)
    if (l.parentLane == null) return `M ${X(1)} ${y} L ${finishX} ${y}`
    const py = yOf(lanes[l.parentLane])
    const x0 = X(Math.max(l.startTurn, 2) - 1)
    const x1 = X(Math.max(l.startTurn, 2))
    return `M ${x0} ${py} C ${x0 + 34} ${py}, ${x1 - 34} ${y}, ${x1} ${y} L ${finishX} ${y}`
  }
  const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }

  return (
    <section className="review-stage rounded-[20px] px-5 pt-[18px] pb-3" aria-label="갈래 트리">
      <div className="relative z-10 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="label !text-[#9b97c4]">BRANCHES</p>
          <h2 className="truncate text-[18px] font-bold text-[#eceaff]">{title}</h2>
        </div>
        <div className="ml-auto flex gap-1.5" role="group" aria-label="비교할 갈래 고르기">
          {(['a', 'b'] as const).map((s) => {
            const on = slot === s
            const id = s === 'a' ? a : b
            const c = SLOT[s]
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => onSlot(s)}
                className="rounded-full border px-3 py-1.5 text-[13px] font-bold transition-[box-shadow,color,border-color] duration-150"
                style={
                  on
                    ? { borderColor: c.color, color: '#fff', boxShadow: `0 0 14px ${c.color}99` }
                    : { borderColor: '#26234a', color: '#9b97c4', background: 'rgb(255 255 255 / 0.04)' }
                }
              >
                {on ? `${c.name} 고르는 중` : `${c.name} · ${nameOf(id) || '비어 있음'}`}
              </button>
            )
          })}
        </div>
      </div>
      <p className="relative z-10 mt-1 text-[12px] text-[#9b97c4]">점을 눌러 A와 B를 고르면 아래에 비교가 바로 나와요. 가지 위 숫자는 갈라지기 전 대비 점수 변화예요. 고른 점을 한 번 더 누르면 대화를 볼 수 있어요.</p>

      <div className="relative z-10 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[820px]" role="group" aria-label="갈래 트리 그래프">
          <defs>
            <filter id="rv-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 턴 눈금과 결승선 */}
          {Array.from({ length: cols }, (_, i) => i + 1).map((t) => (
            <g key={t} aria-hidden>
              <line x1={X(t)} x2={X(t)} y1={34} y2={H - 6} stroke="rgb(255 255 255 / 0.06)" />
              {t < cols && (
                <text x={X(t)} y={24} textAnchor="middle" fontSize={11} fontWeight={700} fill="#6f6a9c">
                  {turnTag(t)}
                </text>
              )}
            </g>
          ))}
          <line x1={finishX} x2={finishX} y1={34} y2={H - 6} stroke="rgb(255 255 255 / 0.22)" strokeDasharray="3 5" aria-hidden />
          <text x={finishX} y={24} textAnchor="middle" fontSize={11} fontWeight={700} fill="#c4c0ee" aria-hidden>
            점수
          </text>

          {/* 갈래 선: 번짐 한 겹 + 본선 + (경로면) 흐르는 빛 */}
          {lanes.map((l, i) => {
            const on = route?.has(l.attemptId) ?? false
            const dim = dimmed(l.attemptId)
            const d = lanePath(l)
            const style: CSSProperties | undefined = reduce ? undefined : { animationDelay: `${i * 0.15}s` }
            const cls = reduce ? undefined : 'review-lane'
            return (
              <g key={l.attemptId} aria-hidden>
                <path d={d} pathLength={1} fill="none" stroke={laneColor(l)} strokeWidth={on ? 10 : 6} opacity={dim ? 0.12 : 0.35} filter="url(#rv-glow)" className={cls} style={style} />
                <path d={d} pathLength={1} fill="none" stroke={laneColor(l)} strokeWidth={on ? 4 : 2.5} strokeLinecap="round" opacity={dim ? 0.35 : 1} className={cls} style={style} />
                {on && !reduce && <path d={d} fill="none" stroke="#fff" strokeWidth={2} opacity={0.8} className="review-flow" />}
              </g>
            )
          })}

          {/* 갈라진 지점과 부모 대비 점수 변화 배지 */}
          {lanes.map((l) => {
            if (l.parentLane == null) return null
            const dim = dimmed(l.attemptId)
            const px = X(Math.max(l.startTurn, 2) - 1)
            const py = yOf(lanes[l.parentLane])
            const bx = X(Math.max(l.startTurn, 2)) + 38
            const by = yOf(l) - 16
            const up = (l.delta ?? 0) >= 0
            return (
              <g key={`f-${l.attemptId}`} opacity={dim ? 0.4 : 1} aria-hidden>
                <circle cx={px} cy={py} r={7} fill="#0b0a1c" stroke="#fff" strokeWidth={2} />
                {l.delta != null && (
                  <>
                    <rect x={bx - 23} y={by - 11} width={46} height={20} rx={10} fill={up ? 'rgb(16 185 129 / 0.2)' : 'rgb(244 63 94 / 0.2)'} stroke={up ? '#10b981' : '#f43f5e'} />
                    <text x={bx} y={by + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill={up ? '#6ee7b7' : '#fda4af'}>
                      {l.delta > 0 ? `+${l.delta}` : l.delta < 0 ? `−${Math.abs(l.delta)}` : '0'}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {/* 결승선의 점수 원 */}
          {lanes.map((l) => {
            const y = yOf(l)
            const scored = l.score != null
            const r = scored ? 12 + l.score!.total / 8 : 11
            const sel = l.attemptId === a ? 'a' : l.attemptId === b ? 'b' : null
            const dim = dimmed(l.attemptId) && !sel
            const press = () => (scored ? (sel ? onOpen(l.attemptId) : onPick(l.attemptId)) : undefined)
            return (
              <g
                key={`n-${l.attemptId}`}
                role="button"
                tabIndex={0}
                aria-disabled={!scored}
                aria-label={`${l.name}${scored ? ` ${l.score!.total}점` : ' 채점 전'}${sel ? `, ${sel.toUpperCase()}로 고름` : ''}`}
                onClick={press}
                onKeyDown={keyActivate(() => press())}
                className={cx('outline-none', scored ? 'cursor-pointer' : 'cursor-not-allowed')}
                opacity={dim ? 0.55 : 1}
              >
                {!scored && <title>채점이 끝나야 비교할 수 있어요</title>}
                {sel && !reduce && <circle cx={finishX} cy={y} r={26} fill="none" stroke={SLOT[sel].color} strokeWidth={3} className="review-ring" />}
                {sel && reduce && <circle cx={finishX} cy={y} r={28} fill="none" stroke={SLOT[sel].color} strokeWidth={3} opacity={0.5} />}
                {scored ? (
                  <>
                    <circle cx={finishX} cy={y} r={r + 6} fill={laneColor(l)} opacity={0.35} filter="url(#rv-glow)" />
                    <circle cx={finishX} cy={y} r={r} fill={laneColor(l)} stroke={sel ? '#fff' : 'rgb(255 255 255 / 0.5)'} strokeWidth={sel ? 3 : 1.5} />
                    <text x={finishX} y={y + 5} textAnchor="middle" fontSize={15} fontWeight={800} fill="#fff">
                      {l.score!.total}
                    </text>
                  </>
                ) : (
                  <circle cx={finishX} cy={y} r={r} fill="none" stroke="#6f6a9c" strokeWidth={2} strokeDasharray="3 3" />
                )}
                <text x={finishX + r + 10} y={y - 4} fontSize={13} fontWeight={700} fill="#eceaff">
                  {l.name}
                </text>
                <text x={finishX + r + 10} y={y + 12} fontSize={11} fontWeight={600} fill="#9b97c4">
                  {shortDate(l.startedAt)}
                  {l.parentLane != null ? ` · ${turnTag(l.startTurn)}에서 갈라짐` : ' · 원래 응시'}
                  {!scored ? ' · 채점 전' : ''}
                </text>
                <text
                  x={finishX + r + 10}
                  y={y + 29}
                  fontSize={11}
                  fontWeight={700}
                  fill="#a5b4fc"
                  textDecoration="underline"
                  className="cursor-pointer"
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(l.attemptId)
                  }}
                >
                  대화 보기
                </text>
                {sel && (
                  <g>
                    <circle cx={finishX - r - 4} cy={y - r - 2} r={11} fill={SLOT[sel].color} stroke="#fff" strokeWidth={2} />
                    <text x={finishX - r - 4} y={y - r + 2} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff">
                      {SLOT[sel].name}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}
