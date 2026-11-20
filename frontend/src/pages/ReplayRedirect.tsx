import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api, type ApiError } from '../api'
import { ErrorState } from '../components/ErrorState'
import { SelfShell } from '../components/SelfShell'

/** 예전 주소 /replay/:attemptId 를 /review?task=…&b=… 로 보낸다 (DESIGN.md §7 라우트). 응시의 과제는 리포트에서 찾는다 */
export default function ReplayRedirect() {
  const { attemptId = '' } = useParams()
  const [to, setTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    api
      .report(attemptId)
      .then((r) => alive && setTo(`/review?task=${encodeURIComponent(r.report?.taskId ?? '')}&b=${encodeURIComponent(attemptId)}`))
      .catch((e: ApiError) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [attemptId, tick])
  if (to) return <Navigate to={to} replace />
  return (
    <SelfShell>
      {error ? (
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} className="mt-16" />
      ) : (
        <p className="m-8 flex items-center gap-2 text-body text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> 복기로 이동하는 중
        </p>
      )}
    </SelfShell>
  )
}
