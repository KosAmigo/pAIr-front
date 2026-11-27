import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Loader2 } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ErrorState } from '../components/ErrorState'
import { TrackChip } from '../components/TrackChip'
import { ButtonLink } from '../components/ui'
import type { AttemptSummary } from '../api'
import { attemptsQuery } from '../data/userQueries'
import { errorMessage } from '../data/queryKeys'
import { reportAttempts } from '../lib/attempts'

// 상단 탭 "리포트": 제출한 자가진단 응시를 최근 순으로 보여 주고, 누르면 결과 리포트(/report/:attemptId)로 간다

const startedLabel = (iso: string) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

function Result({ a }: { a: AttemptSummary }) {
  if (a.status === 'SCORING') return <span className="font-semibold text-brand">채점 중</span>
  if (a.status === 'ERROR') return <span className="font-semibold text-alert">채점 실패</span>
  if (a.legacyReport || a.total == null) return <span className="text-text-muted">이전 채점 방식</span>
  return (
    <span className="text-text">
      <b className="tnum font-mono text-[19px]">{a.total}</b>점
    </span>
  )
}

export default function Reports() {
  const q = useQuery(attemptsQuery(false))
  const list = useMemo<AttemptSummary[] | null>(() => (q.data ? reportAttempts(q.data) : null), [q.data])
  const error = errorMessage(q.error)

  return (
    <SelfShell header={<PageHeader label="REPORTS" title="리포트" />}>
      <div className="mx-auto max-w-[960px] px-4 py-6 md:px-8">
        {error ? (
          <ErrorState message={error} onRetry={() => void q.refetch()} />
        ) : !list ? (
          <p className="flex items-center gap-2 py-10 text-body text-text-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden /> 불러오는 중
          </p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="text-[15px] text-text-muted">아직 리포트가 없어요. 과제를 풀고 제출하면 여기에 쌓여요.</p>
            <ButtonLink to="/tasks" variant="primary">
              과제 보러 가기
            </ButtonLink>
          </div>
        ) : (
          <ul aria-label="리포트 목록" className="flex flex-col gap-2">
            {list.map((a) => (
              <li key={a.id}>
                <Link to={`/report/${encodeURIComponent(a.id)}`} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-brand/50 md:px-5">
                  <div className="min-w-0 flex-1">
                    <TrackChip type={a.taskType} />
                    <h2 className="mt-1 text-[16px] leading-6 font-bold text-text">{a.taskTitle}</h2>
                    <p className="text-[13px] text-text-muted">{startedLabel(a.startedAt)} 시작</p>
                  </div>
                  <span className="shrink-0 text-[14px]">
                    <Result a={a} />
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SelfShell>
  )
}
