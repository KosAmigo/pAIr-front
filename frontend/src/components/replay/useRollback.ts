import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../api'
import { useCredits } from '../../data/credits'

/**
 * 체크포인트에서 다시 풀기. 성공하면 크레딧 표시를 갱신하고 새 응시 화면으로 이동한다.
 * 실패하면(예: 크레딧 부족 402) 오류 문장을 error 로 준다.
 */
export function useRollback() {
  const navigate = useNavigate()
  const { refresh: refreshCredits } = useCredits()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (checkpointId: number) => {
    setBusy(true)
    setError(null)
    try {
      const { attemptId } = await api.rollback(checkpointId)
      void refreshCredits()
      navigate(`/exam/${encodeURIComponent(attemptId)}`)
    } catch (e) {
      setError((e as ApiError).message)
      setBusy(false)
    }
  }
  return { busy, error, run, clearError: () => setError(null) }
}
