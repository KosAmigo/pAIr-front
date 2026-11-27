import { ErrorState } from '../components/ErrorState'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useConsoleCrumbs } from '../components/consoleCrumbs'
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
  useConsoleCrumbs(['실험 채점 결과'])
  return (
    // 콘솔 셸 안에서 보인다: 상단 바(브레드크럼)·오로라는 셸이 그린다
    <div className="relative flex min-h-full flex-col">
      <p className="relative z-10 px-8 pt-4 text-right font-mono text-[13px] text-text-muted">
        {runId} │ {n ? `#${n}` : file}
      </p>
      <div className="relative z-10">
        {err && <ErrorState message={err} className="mt-16" />}
        {!r && !err && (
          <p className="m-8 flex items-center gap-2 text-text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
          </p>
        )}
        {r && <ReportView r={r} />}
      </div>
    </div>
  )
}
