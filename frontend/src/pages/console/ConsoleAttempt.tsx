// DESIGN.md §7-9-4a 응시자 상세: 왼쪽 결과 리포트 본문, 오른쪽 감독 패널(판단 남기기)
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CircleAlert, Loader2 } from 'lucide-react'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import type { Report } from '../../api'
import { ReportView } from '../RealReport'
import { loadReport, useSession } from '../../data/consoleSessions'
import { useMyCompanyId } from './format'
import ProctorPanel from './ProctorPanel'

export default function ConsoleAttempt() {
  const { sessionId, attemptId } = useParams()
  const s = useSession(sessionId)
  const mine = useMyCompanyId()
  const p = s?.participants.find((x) => x.id === attemptId)
  useConsoleCrumbs(s && p ? [s.title, p.name] : [])
  const [report, setReport] = useState<{ file: string; r: Report | null } | null>(null)

  useEffect(() => {
    if (!p?.reportFile) return
    let alive = true
    loadReport(p.reportFile).then((r) => alive && setReport({ file: p.reportFile!, r }))
    return () => {
      alive = false
    }
  }, [p?.reportFile])

  if (!s || !p || (mine != null && s.companyId !== mine)) {
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
  const loaded = report && report.file === p.reportFile ? report.r : undefined

  return (
    <div className="grid items-start gap-6 p-8 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div className="min-w-0">
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-h1 font-bold text-text">{p.name}</h1>
          <span className="font-mono text-[13px] text-text-muted">{p.email}</span>
          <Link to={`/console/sessions/${s.id}?tab=results`} className="ml-auto text-[14px] font-semibold text-brand hover:underline">
            결과 목록으로
          </Link>
        </div>
        {!p.reportFile ? (
          <p className="rounded-md border border-line bg-panel py-16 text-center text-[14px] text-text-muted shadow-sm">아직 채점 결과가 없습니다.</p>
        ) : loaded === undefined ? (
          <p className="flex items-center justify-center gap-2 py-16 text-[14px] text-text-muted">
            <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 리포트를 불러오는 중
          </p>
        ) : loaded ? (
          <ReportView r={loaded} />
        ) : (
          <p className="py-16 text-center text-[14px] text-alert">리포트를 찾을 수 없습니다.</p>
        )}
      </div>
      <ProctorPanel session={s} p={p} className="xl:sticky xl:top-4" />
    </div>
  )
}
