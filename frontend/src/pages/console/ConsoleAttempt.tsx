// DESIGN.md §7-9-4a 응시자 상세: 왼쪽 결과 리포트 본문, 오른쪽 감독 패널(판단 남기기)
// 주소의 attemptId 는 대상자(participant) ID 다. 대상자는 과제마다 응시(attempt)가 하나씩 있어
// 과제를 골라 그 응시의 리포트를 백엔드(api.report)에서 불러온다.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CircleAlert, Loader2 } from 'lucide-react'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { ErrorState } from '../../components/ErrorState'
import { Glass } from '../../components/fx'
import { cx } from '../../components/cx'
import { api } from '../../api'
import { useAuth } from '../../auth/auth'
import { consoleApi } from '../../consoleApi'
import { PSTATE_LABEL, stateOf, taskTitle, useLoad, useTaskMap } from '../../data/consoleSessions'
import { ReportView } from '../RealReport'
import { Loading } from './Loading'
import ProctorPanel from './ProctorPanel'

export default function ConsoleAttempt() {
  const { sessionId, attemptId } = useParams()
  // 감독관은 감독 업무만 한다. 리포트는 매니저와 관리자만 볼 수 있다(서버도 403)
  const { user } = useAuth()
  const canViewReport = user?.role !== 'PROCTOR'
  const sid = Number(sessionId)
  const pid = Number(attemptId)
  const detail = useLoad(Number.isFinite(sid) ? `session-${sid}` : null, () => consoleApi.session(sid))
  const tasks = useTaskMap()
  const s = detail.data?.session
  const p = detail.data?.participants.find((x) => x.id === pid)
  useConsoleCrumbs(s && p ? [s.title, p.name] : [])
  const taskIds = p ? (s?.taskIds ?? []).filter((t) => p.attempts[t]).concat(Object.keys(p.attempts).filter((t) => !s?.taskIds.includes(t))) : []
  const [picked, setPicked] = useState<string | null>(null)
  const taskId = picked && taskIds.includes(picked) ? picked : (taskIds[0] ?? null)
  const attempt = p && taskId ? p.attempts[taskId] : null
  const report = useLoad(attempt && canViewReport ? `report-${attempt}` : null, () => api.report(attempt!))

  if (detail.error && !detail.data) {
    return (
      <div className="flex flex-col items-center gap-4 px-8 py-24 text-center">
        <ErrorState message={detail.error} onRetry={detail.reload} />
        <Link to="/console/sessions" className="text-[14px] font-semibold text-brand hover:underline">
          회차 목록으로
        </Link>
      </div>
    )
  }
  if (detail.loading) return <Loading text="응시 정보를 불러오는 중" className="py-32" />
  if (!s || !p) {
    return (
      <div className="flex flex-col items-center gap-3 py-32 text-center">
        <CircleAlert size={28} className="text-text-faint" aria-hidden />
        <p className="text-[15px] text-text-muted">찾을 수 없는 응시입니다.</p>
        <Link to="/console/sessions" className="text-[14px] font-semibold text-brand hover:underline">
          회차 목록으로
        </Link>
      </div>
    )
  }
  const rr = report.data

  return (
    <div className="grid items-start gap-6 p-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {/* 2026-11-19 개편: 유리 머리 카드. 아래 리포트 본문이 이 화면의 다크 무대(ScoreHero)를 가진다 */}
        <Glass className="mb-4 flex items-center gap-4 rounded-xl px-5 py-4">
          <span className="bg-brand-gradient flex size-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-on-accent">{p.name.slice(0, 1)}</span>
          <div className="min-w-0">
            <h1 className="text-[22px] leading-7 font-bold text-text">{p.name}</h1>
            <p className="truncate font-mono text-[13px] text-text-muted">
              {p.email} │ {s.title}
            </p>
          </div>
          <span className="ml-2 rounded-full bg-panel-raised px-2.5 py-1 text-[13px] font-semibold text-text-muted">{PSTATE_LABEL[stateOf(p)]}</span>
          <Link to={`/console/sessions/${s.id}?tab=results`} className="ml-auto text-[14px] font-semibold text-brand hover:underline">
            결과 목록으로
          </Link>
        </Glass>
        {taskIds.length > 1 && (
          <div role="tablist" aria-label="과제" className="mb-4 flex flex-wrap gap-1.5">
            {taskIds.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === taskId}
                onClick={() => setPicked(t)}
                className={cx('h-8 rounded-full px-3 text-[13px] font-medium', t === taskId ? 'bg-brand-dim text-brand' : 'bg-panel-raised text-text-muted hover:text-text')}
              >
                {taskTitle(tasks.map, t)}
              </button>
            ))}
          </div>
        )}
        {!attempt ? (
          <p className="rounded-xl border border-line bg-panel py-16 text-center text-[14px] text-text-muted shadow-sm">아직 응시 기록이 없습니다.</p>
        ) : !canViewReport ? (
          <p className="rounded-xl border border-line bg-panel py-16 text-center text-[14px] text-text-muted shadow-sm">결과 리포트는 매니저만 볼 수 있습니다.</p>
        ) : report.error ? (
          <ErrorState message={report.error} onRetry={report.reload} />
        ) : !rr ? (
          <p className="flex items-center justify-center gap-2 py-16 text-[14px] text-text-muted">
            <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 리포트를 불러오는 중
          </p>
        ) : rr.status === 'DONE' && rr.report ? (
          <ReportView r={rr.report} bare />
        ) : rr.status === 'ERROR' ? (
          <ErrorState message={rr.error ?? '채점에 실패했습니다'} onRetry={report.reload} />
        ) : (
          <p className="rounded-xl border border-line bg-panel py-16 text-center text-[14px] text-text-muted shadow-sm">
            {rr.status === 'SCORING' ? '채점 중입니다. 잠시 뒤 다시 확인하세요.' : '아직 제출하지 않은 응시입니다.'}
          </p>
        )}
      </div>
      <ProctorPanel session={s} p={p} className="xl:sticky xl:top-4" onRestored={detail.reload} />
    </div>
  )
}
