import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, ApiError, type Turn } from '../../api'
import { branchColor, type TreeRow } from '../../lib/replayTree'
import { commonPrefixLength } from '../../lib/replayCompare'
import { ErrorState } from '../ErrorState'
import { TurnItem } from './TurnItem'

type Side = { turns: Turn[] } | { error: string } | null

const color = (branch: number) => `var(--color-branch-${branchColor(branch)})`

/** 한 풀이의 대화 카드. divideAfter 번째 턴 뒤에 "여기서부터 달라짐" 선을 긋는다 */
function Card({ tag, row, side, divideAfter, showDivider, onRetry }: { tag: string; row: TreeRow; side: Side; divideAfter: number; showDivider: boolean; onRetry: () => void }) {
  const turns = side && 'turns' in side ? side.turns : []
  const bodyRef = useRef<HTMLDivElement>(null)
  // 카드가 작아도 달라지는 곳이 바로 보이도록, 대화가 들어오면 "여기서부터 달라짐" 선 근처로 맞춘다
  useEffect(() => {
    const body = bodyRef.current
    const line = body?.querySelector<HTMLElement>('[role="separator"]')
    if (body && line) body.scrollTop = Math.max(0, line.offsetTop - 72)
  }, [showDivider, divideAfter, turns.length])
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm" aria-label={`${tag} 풀이 AI 대화 기록`}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="font-mono text-[13px] font-semibold" style={{ color: color(row.branch) }}>{tag} · {row.label}</span>
        <span className="text-[15px] font-semibold">AI 대화 기록</span>
        <span className="tnum ml-auto font-mono text-[13px] text-text-muted">{turns.length}턴</span>
      </header>
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-auto p-3">
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
            {turns.map((t, i) => (
              <div key={`${t.turn}-${t.role}`} className="contents">
                {showDivider && i === divideAfter && <Divider />}
                <TurnItem t={t} />
              </div>
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
 * 비교 중인 두 풀이의 AI 대화를 위아래로 함께 보여 준다. 롤백한 풀이는 갈라진 질문 앞의 대화를 그대로 가지고 있어서,
 * 처음부터 똑같은 턴은 그대로 두고 달라지는 곳에 선을 그어 어디서 다른 질문을 했는지 바로 보이게 한다.
 */
export function CompareTranscripts({ a, b }: { a: TreeRow; b: TreeRow }) {
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
    <div className="col-span-5 my-4 mr-4 ml-2 flex min-h-0 flex-col gap-3">
      <Card tag="A" row={a} side={sides.a} divideAfter={shared} showDivider={differs && shared > 0} onRetry={retry} />
      <Card tag="B" row={b} side={sides.b} divideAfter={shared} showDivider={differs && shared > 0} onRetry={retry} />
    </div>
  )
}
