import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { ErrorState } from '../ErrorState'
import { cx } from '../cx'
import { STATS } from '../../data/dashboard'
import { shortTurns, sideText } from '../../lib/replayCompare'
import { buildScoreSteps, type ScoreStep } from '../../lib/scoreSteps'
import type { TreeLane } from '../../lib/reviewTree'
import { SLOT, type CompareState } from './shared'

const itemColor = (key: string) => STATS.find((s) => s.key === key)?.color ?? 'var(--color-text-faint)'
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)
const GRID = 'repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), var(--color-line) calc(10% - 1px) 10%)'

/** 0~max 트랙. from→to 구간을 조각으로 칠한다 */
function Track({ from, to, max, color, label, delay, solid }: { from: number; to: number; max: number; color: string; label: string; delay: number; solid?: boolean }) {
  const reduce = useReducedMotion()
  const lo = (Math.min(from, to) / max) * 100
  const w = (Math.abs(to - from) / max) * 100
  return (
    <div className="relative h-[22px] rounded-md" style={{ backgroundImage: GRID }} aria-hidden>
      <motion.div
        className={cx('absolute inset-y-[3px] flex min-w-[30px] items-center rounded-[5px] px-1.5 text-[12px] font-extrabold text-white', solid ? 'justify-end' : 'justify-center')}
        style={{ left: `${solid ? 0 : lo}%`, width: `${w}%`, background: color, originX: 0 }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {label}
      </motion.div>
    </div>
  )
}

function EndRow({ slot, lane, max, delay }: { slot: 'a' | 'b'; lane: TreeLane & { score: NonNullable<TreeLane['score']> }; max: number; delay: number }) {
  const c = SLOT[slot]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_210px] items-center gap-3.5 px-1.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold text-text">
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full text-[12px] font-black text-white" style={{ background: c.color }}>
          {c.name}
        </span>
        <span className="truncate">{lane.name}</span>
        <span className="tnum shrink-0 font-mono text-[13px] font-semibold text-text-muted">{lane.score.total}점</span>
      </div>
      <Track from={0} to={lane.score.total} max={max} color={c.color} label={String(lane.score.total)} delay={delay} solid />
    </div>
  )
}

function Evidence({ tag, slot, side }: { tag: string; slot: 'a' | 'b'; side: ScoreStep['a'] }) {
  const c = SLOT[slot]
  const evidence = side?.evidence ?? []
  return (
    <div className="rounded-[10px] bg-bg px-2.5 py-2 text-[13px] leading-[1.5] text-text">
      <em className="mb-0.5 block text-[11px] font-extrabold not-italic" style={{ color: c.text }}>
        {tag}가 실제로 한 것 · <span className="font-mono">{sideText(side)}</span>
      </em>
      {side?.reason && <p className="break-words">{shortTurns(side.reason)}</p>}
      {evidence.length > 0 && (
        <p className="mt-0.5 flex flex-wrap gap-1">
          {evidence.slice(0, 4).map((e) => (
            <span key={e} className="rounded bg-line px-1.5 font-mono text-[12px] text-text-muted">{shortTurns(e)}</span>
          ))}
        </p>
      )}
      {!side?.reason && evidence.length === 0 && <span className="text-text-faint">남은 근거가 없어요</span>}
    </div>
  )
}

function StepRow({ s, max, index }: { s: ScoreStep; max: number; index: number }) {
  const [open, setOpen] = useState(false)
  const rest = s.kind === 'rest'
  const up = s.kind === 'up'
  const tone = rest ? 'var(--color-text-faint)' : up ? 'var(--color-signal)' : 'var(--color-alert)'
  // 감점된 쪽(오른 줄은 A, 깎인 줄은 B)의 채점 이유 한 줄
  const why = rest ? null : (up ? s.a : s.b)?.reason
  const body = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[15px] leading-[1.35] font-bold text-text">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full text-white" style={{ background: tone }}>
            {rest ? <span className="text-[13px] leading-none">≈</span> : up ? <Check size={14} strokeWidth={3} aria-hidden /> : <X size={14} strokeWidth={3} aria-hidden />}
          </span>
          <span className="min-w-0">{rest ? '기타 차이' : `${up ? '피함' : '새로 걸림'} · ${s.label}`}</span>
          {!rest && <ChevronDown size={14} className={cx('shrink-0 text-text-faint transition-transform', open && 'rotate-180')} aria-hidden />}
        </div>
        <p className="mt-0.5 ml-[30px] truncate text-[12px] font-semibold text-text-faint">
          {rest ? '항목 점수의 바닥·올림 등으로 체크만으로는 설명되지 않는 차이예요' : (
            <>
              <span style={{ color: itemColor(s.itemKey) }}>{s.itemName}</span>
              {why ? ` · ${shortTurns(why)}` : ''}
            </>
          )}
        </p>
      </div>
      <Track from={s.from} to={s.to} max={max} color={tone} label={signed(s.delta)} delay={0.15 + index * 0.1} />
    </>
  )
  if (rest) return <div className="grid grid-cols-[minmax(0,1fr)_210px] items-center gap-3.5 border-b border-line px-1.5 py-2.5">{body}</div>
  return (
    <div className="border-b border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_210px] items-center gap-3.5 rounded-lg px-1.5 py-2.5 text-left hover:bg-bg">
        {body}
      </button>
      {open && (
        <div className="grid gap-2 px-1.5 pt-1 pb-3 sm:grid-cols-2">
          <Evidence tag="A" slot="a" side={s.a} />
          <Evidence tag="B" slot="b" side={s.b} />
        </div>
      )}
    </div>
  )
}

/** 점수 계단 (DESIGN.md §7-5): A 점수에서 출발해 바뀐 체크마다 오르내리며 B 점수에 닿는다 */
export function ScoreStairs({ a, b, state }: { a: TreeLane & { score: NonNullable<TreeLane['score']> }; b: TreeLane & { score: NonNullable<TreeLane['score']> }; state: CompareState }) {
  const max = Math.max(a.score.max, b.score.max, 1)
  const built = state.status === 'ready' ? buildScoreSteps(state.compare, a.score.total, b.score.total) : null
  return (
    <section className="rounded-2xl border border-line bg-panel px-5 py-[18px] shadow-sm" aria-label="점수가 이렇게 움직였어요">
      <h3 className="flex items-baseline gap-2 text-[18px] font-extrabold text-text">
        점수가 이렇게 움직였어요
        <small className="text-[13px] font-semibold text-text-muted">
          {a.score.total}점에서 {b.score.total}점이 되기까지
        </small>
      </h3>
      <div className="mt-2">
        <EndRow slot="a" lane={a} max={max} delay={0} />
        {state.status === 'loading' && (
          <p className="flex items-center gap-2 px-1.5 py-4 text-[14px] text-text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden /> 점수가 움직인 이유를 불러오는 중
          </p>
        )}
        {state.status === 'error' && <ErrorState compact className="my-3" message={state.message} onRetry={state.retry} />}
        {built && built.steps.length === 0 && <p className="mx-1.5 my-3 text-[14px] text-text-muted">감점 판정이 같아요. 점수 차이는 없어요.</p>}
        {built?.steps.map((s, i) => <StepRow key={`${s.code}-${i}`} s={s} max={max} index={i} />)}
        <EndRow slot="b" lane={b} max={max} delay={0.3 + (built?.steps.length ?? 0) * 0.1} />
      </div>
      {built && built.steps.length > 0 && <p className="mx-1.5 mt-1.5 text-[12px] text-text-faint">줄을 누르면 실제 대화에서 찾은 근거가 펼쳐져요.</p>}
    </section>
  )
}
