import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../api'
import { useCredits } from '../../data/credits'
import { CenterMessage } from './CenterMessage'
import { StartBlockedModal } from '../../components/StartBlockedModal'

// ── 진입: /exam/new?task=과제ID (또는 ?track=dev|biz 로 직군 기본 과제) → 응시 생성 후 이동 ─────
export function NewExam() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [shortage, setShortage] = useState<string | null>(null)
  const started = useRef(false)
  const { refresh: refreshCredits } = useCredits()
  useEffect(() => {
    if (started.current) return
    started.current = true
    const track = params.get('track') === 'biz' ? 'biz' : 'dev'
    api
      .start(params.get('task') || api.taskIdFor(track))
      .then(({ attemptId }) => {
        void refreshCredits()
        navigate(`/exam/${attemptId}`, { replace: true })
      })
      .catch((e: ApiError) => {
        // 새 탭으로 열었거나 직군 링크로 들어온 경우: 크레딧 부족은 큰 오류 화면 대신 과제 목록 위에서 보던 것과 같은 창으로
        if (e.status === 402) {
          void refreshCredits()
          setShortage(e.message)
        } else setError(e.message)
      })
  }, [params, navigate, refreshCredits])
  if (shortage) return <StartBlockedModal message={shortage} creditShortage onClose={() => navigate('/tasks', { replace: true })} />
  return <CenterMessage error={error} text="응시를 준비하고 있습니다" />
}
