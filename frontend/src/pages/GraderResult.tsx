import { ErrorState } from '../components/ErrorState'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Logo } from '../components/ui'
import { Aurora } from '../components/fx'
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
    <div className="relative isolate flex h-full flex-col">
      <Aurora variant="band" className="h-[360px]" />
      <header className="glass relative z-20 flex h-14 shrink-0 items-center gap-4 rounded-none! border-0! border-b! border-line/70! px-8 shadow-none!">
        <Logo />
        <span className="rounded-sm bg-brand-dim px-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-brand">LAB</span>
        <Link to="/grader" className="text-[16px] font-semibold hover:text-brand">
          채점 툴
        </Link>
        <span className="text-[16px] text-text-muted">실험 채점 결과</span>
        <span className="ml-auto font-mono text-[13px] text-text-muted">
          {runId} │ {n ? `#${n}` : file}
        </span>
      </header>
      <main className="relative z-10 min-h-0 flex-1 overflow-auto">
        {err && <ErrorState message={err} className="mt-16" />}
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
