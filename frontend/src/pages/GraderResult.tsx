import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Logo } from '../components/ui'
import { ApiError, grader, type Report } from '../api'
import { ReportView } from './RealReport'

// 채점 툴: 실험 채점 회차 하나의 리포트 (리포트 화면과 같은 모양)
export default function GraderResult() {
  const { runId = '', file = '' } = useParams()
  const [r, setR] = useState<Report | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    grader.result(runId, file).then(setR).catch((e: ApiError) => setErr(e.message))
  }, [runId, file])
  const n = /__(\d+)\.json$/.exec(file)?.[1]
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-8">
        <Logo />
        <Link to="/grader" className="text-[16px] font-semibold hover:text-signal">
          채점 툴
        </Link>
        <span className="text-[16px] text-text-muted">실험 채점 결과</span>
        <span className="rounded-sm bg-caution/15 px-1.5 font-mono text-[11px] text-caution">임시 기능</span>
        <span className="ml-auto font-mono text-[13px] text-text-muted">
          {runId} · {n ? `#${n}` : file}
        </span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        {err && <p className="m-8 text-[15px] text-alert">{err}</p>}
        {!r && !err && (
          <p className="m-8 flex items-center gap-2 text-text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
          </p>
        )}
        {r && <ReportView r={r} />}
      </main>
    </div>
  )
}
