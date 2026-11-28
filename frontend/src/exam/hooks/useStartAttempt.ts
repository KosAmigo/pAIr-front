import { useCallback, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../api'
import { useCredits } from '../../data/credits'

export type StartBlocked = { message: string; creditShortage: boolean }

/**
 * 과제 목록의 "도전" 버튼: 화면을 넘기기 전에 응시를 먼저 만든다.
 * 크레딧이 모자라면(서버 402) 페이지를 넘기지 않고 누른 자리에 창을 띄운다.
 * 비용·잔액 비교는 서버가 한다(다른 탭에서 쓴 크레딧까지 반영된 최종 판단).
 */
export function useStartAttempt() {
  const navigate = useNavigate()
  const { refresh: refreshCredits } = useCredits()
  const [blocked, setBlocked] = useState<StartBlocked | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const busy = useRef(false) // 두 번 눌러 응시가 두 개 생기지 않게

  const start = useCallback(
    (taskId: string) => (e: MouseEvent) => {
      // 새 탭 열기(Ctrl/⌘·가운데 클릭)는 링크 그대로 /exam/new 로 간다
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      if (busy.current) return
      busy.current = true
      setStartingId(taskId)
      api
        .start(taskId)
        .then(({ attemptId }) => {
          void refreshCredits()
          navigate(`/exam/${encodeURIComponent(attemptId)}`)
        })
        .catch((err: unknown) => {
          const status = err instanceof ApiError ? err.status : undefined
          const message = err instanceof Error ? err.message : '응시를 시작하지 못했습니다.'
          if (status === 402) void refreshCredits() // 화면 위 잔액도 서버 값으로 맞춘다
          setBlocked({ message, creditShortage: status === 402 })
        })
        .finally(() => {
          busy.current = false
          setStartingId(null)
        })
    },
    [navigate, refreshCredits],
  )

  const close = useCallback(() => setBlocked(null), [])
  return { start, startingId, blocked, close }
}
