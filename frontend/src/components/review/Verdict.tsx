import { Loader2, Rows2 } from 'lucide-react'
import { CountUp } from '../fx'
import { Button } from '../ui'
import { ErrorState } from '../ErrorState'
import { cx } from '../cx'
import { STATS } from '../../data/dashboard'
import { biggestMover, itemChanges } from '../../lib/scoreSteps'
import type { TreeLane } from '../../lib/reviewTree'
import { shortDate, SLOT, turnTag, type CompareState } from './shared'

const itemColor = (key: string) => STATS.find((s) => s.key === key)?.color ?? 'var(--color-text-faint)'
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

function Pill({ slot, lane }: { slot: 'a' | 'b'; lane: TreeLane }) {
  const c = SLOT[slot]
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
      <span className="grid size-[26px] shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: c.color }}>
        {c.name}
      </span>
      <div className="min-w-0">
        <span className="block truncate text-[12px] text-text-muted">
          {lane.name} · {shortDate(lane.startedAt)}
        </span>
        <span className="tnum font-mono text-[22px] leading-6 font-extrabold text-text">{lane.score!.total}</span>
        <span className="text-[12px] text-text-muted"> / {lane.score!.max}</span>
      </div>
    </div>
  )
}

/** 결론 카드 (DESIGN.md §7-5): 큰 차이 숫자, 한 줄 결론, A·B 알약, 항목별 차이 막대, 갈라진 순간 */
export function Verdict({ a, b, state, fallbackFork, transcriptOpen, onToggleTranscript }: { a: TreeLane & { score: NonNullable<TreeLane['score']> }; b: TreeLane & { score: NonNullable<TreeLane['score']> }; state: CompareState; fallbackFork: number | null; transcriptOpen: boolean; onToggleTranscript: () => void }) {
  const delta = Math.round((b.score.total - a.score.total) * 10) / 10
  const changes = state.status === 'ready' ? itemChanges(state.compare.items) : []
  const mover = state.status === 'ready' ? biggestMover(changes, delta) : null
  const fork = state.status === 'ready' ? (state.forkTurn ?? fallbackFork) : fallbackFork
  const scale = Math.max(5, ...changes.map((c) => Math.abs(c.diff)))
  return (
    <section className="rounded-2xl border border-line bg-panel px-5 py-[18px] shadow-sm" aria-label="비교 결론">
      <div className="flex items-center gap-[18px]">
        <div className={cx('tnum shrink-0 font-mono text-[56px] leading-none font-extrabold tracking-[-0.03em]', delta > 0 ? 'text-signal' : delta < 0 ? 'text-alert' : 'text-text-muted')}>
          {delta > 0 ? '+' : delta < 0 ? '−' : ''}
          <CountUp key={`${a.attemptId}-${b.attemptId}`} value={Math.abs(delta)} decimals={Number.isInteger(delta) ? 0 : 1} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[20px] font-extrabold text-text">{delta === 0 ? '두 풀이 점수가 같아요' : `B가 A보다 ${Math.abs(delta)}점 ${delta > 0 ? '높아요' : '낮아요'}`}</h3>
          <p className="mt-1 text-[14px] leading-6 text-text-muted">
            {fork != null && <>{turnTag(fork)} 질문에서 갈라졌어요. </>}
            {mover && (
              <>
                가장 크게 {mover.diff > 0 ? '오른' : '깎인'} 항목은 <b style={{ color: itemColor(mover.key) }}>{mover.name}</b> ({signed(mover.diff)})이에요.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2.5">
        <Pill slot="a" lane={a} />
        <Pill slot="b" lane={b} />
      </div>

      {state.status === 'loading' && (
        <p className="mt-5 flex items-center gap-2 text-[14px] text-text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden /> 비교를 불러오는 중
        </p>
      )}
      {state.status === 'error' && <ErrorState compact className="mt-5" message={state.message} onRetry={state.retry} />}

      {state.status === 'ready' && (
        <>
          <div className="mt-5 flex flex-col gap-2" role="list" aria-label="항목별 점수 차이">
            <div className="grid grid-cols-[120px_1fr_1fr_48px] text-[11px] font-bold text-text-faint" aria-hidden>
              <span />
              <span className="pr-2 text-right">깎임</span>
              <span className="pl-2">오름</span>
              <span />
            </div>
            {changes.map((c) => (
              <div key={c.key} role="listitem" className="grid grid-cols-[120px_1fr_1fr_48px] items-center text-[13px]">
                <span className="flex items-center gap-1.5 font-bold text-text">
                  <i className="size-2 shrink-0 rounded-full" style={{ background: itemColor(c.key) }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="relative h-3.5 border-r-2 border-line">
                  {c.diff < 0 && <span className="absolute inset-y-0 right-0 rounded-l-md bg-gradient-to-l from-alert to-alert/60 transition-[width] duration-[600ms]" style={{ width: `${(Math.abs(c.diff) / scale) * 100}%` }} />}
                </span>
                <span className="relative h-3.5">
                  {c.diff > 0 && <span className="absolute inset-y-0 left-0 rounded-r-md bg-gradient-to-r from-signal to-signal/60 transition-[width] duration-[600ms]" style={{ width: `${(c.diff / scale) * 100}%` }} />}
                </span>
                <span className={cx('tnum text-right font-mono font-extrabold', c.diff > 0 ? 'text-signal' : c.diff < 0 ? 'text-alert' : 'text-text-faint')}>{signed(c.diff)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-dashed border-line pt-3.5">
            <h4 className="flex items-center gap-2 text-[15px] font-extrabold text-text">
              갈라진 순간 {fork != null && <span className="rounded-md bg-brand-dim px-2 py-0.5 text-[12px] font-semibold text-brand">{turnTag(fork)}</span>}
            </h4>
            {fork != null && fork > 1 && <p className="mt-1 text-[13px] text-text-muted">{turnTag(fork - 1)}까지는 같은 대화예요. 여기서 이렇게 다르게 물었어요.</p>}
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {(['a', 'b'] as const).map((s) => {
                const q = s === 'a' ? state.questionA : state.questionB
                const c = SLOT[s]
                return (
                  <div key={s} className="rounded-2xl border px-3 py-2.5 text-[14px] leading-[1.55]" style={{ background: c.soft, borderColor: c.border }}>
                    <em className="mb-1 block text-[11px] font-extrabold not-italic" style={{ color: c.text }}>
                      {c.name}가 보낸 질문
                    </em>
                    <span className="break-words whitespace-pre-wrap text-text">{q ? q.text : '(이 시점 이후 대화 없음)'}</span>
                  </div>
                )
              })}
            </div>
            <Button size="sm" variant="secondary" className="mt-3" aria-expanded={transcriptOpen} onClick={onToggleTranscript}>
              <Rows2 size={15} aria-hidden /> {transcriptOpen ? '대화 접기' : '전체 대화 나란히 보기'}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
