import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { reportQuery } from '../data/userQueries'
import { errorMessage } from '../data/queryKeys'
import { ErrorState } from '../components/ErrorState'
import { SelfShell } from '../components/SelfShell'

/** 예전 주소 /replay/:attemptId 를 /review?task=…&b=… 로 보낸다 (DESIGN.md §7 라우트). 응시의 과제는 리포트에서 찾는다 */
export default function ReplayRedirect() {
  const { attemptId = '' } = useParams()
  const q = useQuery(reportQuery(attemptId))
  const to = q.data ? `/review?task=${encodeURIComponent(q.data.report?.taskId ?? '')}&b=${encodeURIComponent(attemptId)}` : null
  const error = errorMessage(q.error)
  if (to) return <Navigate to={to} replace />
  return (
    <SelfShell>
      {error ? (
        <ErrorState message={error} onRetry={() => void q.refetch()} className="mt-16" />
      ) : (
        <p className="m-8 flex items-center gap-2 text-body text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> 복기로 이동하는 중
        </p>
      )}
    </SelfShell>
  )
}
