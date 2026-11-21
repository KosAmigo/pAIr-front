import { Fragment, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, ApiError, type Turn } from '../../api'
import { branchColor, type TreeRow } from '../../lib/replayTree'
import { commonPrefixLength } from '../../lib/replayCompare'
import { ErrorState } from '../ErrorState'
import { turnTag } from '../review/shared'
import { TurnItem } from './TurnItem'

type Side = { turns: Turn[] } | { error: string } | null

const color = (branch: number) => `var(--color-branch-${branchColor(branch)})`

/**
 * 한 풀이의 대화 카드. divideAfter 번째 턴 뒤에 "여기서부터 달라짐" 선을 긋는다.
 * 두 풀이가 같은 앞부분은 한 줄로 접어 두고(누르면 펼친다), 카드 안에 따로 스크롤을 두지 않는다 — 스크롤은 페이지 하나만.
 */
function Card({ tag, row, side, divideAfter, showDivider, onRetry }: { tag: string; row: TreeRow; side: Side; divideAfter: number; showDivider: boolean; onRetry: () => void }) {
  const turns = side && 'turns' in side ? side.turns : []
  const [openShared, setOpenShared] = useState(false)
  const foldShared = showDivider && divideAfter > 0
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm" aria-label={`${tag} 풀이 AI 대화 기록`}>
      <header className="flex h-10 items-center gap-2 border-b border-line px-4">
        <span className="font-mono text-[13px] font-semibold" style={{ color: color(row.branch) }}>{tag} · {row.label}</span>
        <span className="text-[15px] font-semibold">AI 대화 기록</span>
        <span className="tnum ml-auto font-mono text-[13px] text-text-muted">{turns.length}턴</span>
      </header>
      <div className="p-3">
        {side === null ? (
          <p className="flex items-center gap-2 py-6 text-[14px] text-text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
          </p>
        ) : 'error' in side ? (
          <ErrorState compact message={side.error} onRetry={onRetry} />
        ) : turns.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-text-muted">이 풀이에는 AI 대화 기록이 없습니다.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {foldShared && (
              <li>
                <button type="button" aria-expanded={openShared} onClick={() => setOpenShared((o) => !o)} className="w-full rounded-md border border-dashed border-line px-3 py-1.5 text-center text-[13px] text-text-muted hover:bg-panel-raised">
                  같은 대화 {turnTag(turns[0].turn)}–{turnTag(turns[divideAfter - 1].turn)} {openShared ? '접기' : '펼치기'}
                </button>
              </li>
            )}
            {turns.map((t, i) => (
              <Fragment key={`${t.turn}-${t.role}`}>
                {showDivider && i === divideAfter && <Divider />}
                {!(foldShared && i < divideAfter && !openShared) && <TurnItem t={t} />}
              </Fragment>
            ))}
            {showDivider && divideAfter >= turns.length && <Divider />}
          </ol>
        )}
      </div>
    </section>
  )
}

function Divider() {
  return (
    <li role="separator" className="flex items-center gap-2 py-1 text-[13px] font-semibold text-brand">
      <span className="h-px flex-1 bg-brand/40" /> 여기서부터 달라짐 <span className="h-px flex-1 bg-brand/40" />
    </li>
  )
}

/**
 * 비교 중인 두 풀이의 AI 대화를 양옆으로 나란히 보여 준다. 롤백한 풀이는 갈라진 질문 앞의 대화를 그대로 가지고 있어서,
 * 처음부터 똑같은 턴은 그대로 두고 달라지는 곳에 선을 그어 어디서 다른 질문을 했는지 바로 보이게 한다.
 */
export function CompareTranscripts({ a, b, className }: { a: TreeRow; b: TreeRow; className?: string }) {
  const [sides, setSides] = useState<{ a: Side; b: Side }>({ a: null, b: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const load = (id: string) =>
      api
        .report(id)
        .then((r): Side => ({ turns: r.report?.transcript ?? [] }))
        .catch((e: ApiError): Side => ({ error: e.message }))
    void Promise.all([load(a.attemptId), load(b.attemptId)]).then(([sa, sb]) => alive && setSides({ a: sa, b: sb }))
    return () => {
      alive = false
    }
  }, [a.attemptId, b.attemptId, tick])

  const ta = sides.a && 'turns' in sides.a ? sides.a.turns : null
  const tb = sides.b && 'turns' in sides.b ? sides.b.turns : null
  const shared = ta && tb ? commonPrefixLength(ta, tb) : 0
  const differs = ta && tb ? shared < Math.max(ta.length, tb.length) : false
  const retry = () => {
    setSides({ a: null, b: null })
    setTick((t) => t + 1)
  }
  return (
    <div className={`grid grid-cols-2 items-start gap-4 ${className ?? ''}`}>
      <Card tag="A" row={a} side={sides.a} divideAfter={shared} showDivider={differs && shared > 0} onRetry={retry} />
      <Card tag="B" row={b} side={sides.b} divideAfter={shared} showDivider={differs && shared > 0} onRetry={retry} />
    </div>
  )
}
