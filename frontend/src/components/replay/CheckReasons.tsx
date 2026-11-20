import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, ApiError, type AttemptCompare, type CheckDiff, type CheckSide } from '../../api'
import { changeKind, changedItems, shortTurns, sideText, type ChangeKind } from '../../lib/replayCompare'
import { cx } from '../cx'
import { ErrorState } from '../ErrorState'

const KIND: Record<ChangeKind, { text: string; cls: string }> = {
  improved: { text: '개선', cls: 'bg-signal/12 text-signal' },
  worsened: { text: '악화', cls: 'bg-alert/12 text-alert' },
  changed: { text: '변경', cls: 'bg-line text-text-muted' },
}

/** 한 풀이가 이 체크에서 왜 그런 결과였는지: 채점 모델의 이유와 근거 */
function Why({ tag, label, side }: { tag: string; label: string; side: CheckSide | null }) {
  if (!side || (!side.reason && side.evidence.length === 0)) return null
  return (
    <p className="mt-1 text-[14px] leading-6 text-text">
      <span className="font-mono text-[13px] text-text-muted">{tag} · {label}</span> {side.reason ? shortTurns(side.reason) : null}
      {side.evidence.slice(0, 3).map((e) => (
        <span key={e} className="ml-1 rounded bg-line px-1.5 font-mono text-[12px] text-text-muted">{shortTurns(e)}</span>
      ))}
    </p>
  )
}

function CheckRow({ c, aLabel, bLabel }: { c: CheckDiff; aLabel: string; bLabel: string }) {
  const kind = KIND[changeKind(c)]
  return (
    <li className="rounded-md bg-panel-raised px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full px-2 text-[12px] font-semibold', kind.cls)}>{kind.text}</span>
        <span className="font-mono text-[12px] text-text-muted">{c.code}</span>
        <span className="text-[14px] font-semibold text-text">{c.label}</span>
        <span className="ml-auto font-mono text-[13px] text-text">
          A {sideText(c.a)} → B {sideText(c.b)}
        </span>
      </div>
      <Why tag="A" label={aLabel} side={c.a} />
      <Why tag="B" label={bLabel} side={c.b} />
    </li>
  )
}

/**
 * 점수가 달라진 이유: 두 풀이의 감점표 체크를 맞춰 보고, 결과가 달라진 체크만 보여 준다.
 * 어떤 체크가 감점에서 통과로 바뀌었는지(개선)와 그때의 채점 이유·근거가 나온다.
 */
export function CheckReasons({ aId, bId, aLabel, bLabel }: { aId: string; bId: string; aLabel: string; bLabel: string }) {
  const [data, setData] = useState<AttemptCompare | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    api
      .compareAttempts(aId, bId)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: ApiError) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [aId, bId, tick])

  const items = data ? changedItems(data.items) : []
  return (
    <section aria-label="점수가 달라진 이유">
      <p className="label text-text-muted">WHY</p>
      <h3 className="mb-2 text-[15px] font-semibold text-text">점수가 달라진 이유</h3>
      {error ? (
        <ErrorState compact message={error} onRetry={() => setTick((t) => t + 1)} />
      ) : !data ? (
        <p className="flex items-center gap-2 text-[14px] text-text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
        </p>
      ) : items.length === 0 ? (
        <p className="text-[14px] text-text-muted">두 풀이에서 감점 결과가 달라진 체크가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((it) => (
            <div key={it.key}>
              <p className="mb-1 flex items-baseline gap-2 text-[14px] text-text">
                <span className="font-semibold">{it.name}</span>
                <span className="tnum font-mono text-[13px] text-text-muted">{it.a ?? '-'} → {it.b ?? '-'}</span>
              </p>
              {it.checks.length === 0 ? (
                <p className="text-[14px] text-text-muted">바뀐 체크는 없지만 항목 점수가 다릅니다.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {it.checks.map((c) => (
                    <CheckRow key={c.code} c={c} aLabel={aLabel} bLabel={bLabel} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
