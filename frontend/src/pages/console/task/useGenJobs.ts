// 진행 목록 조회: GET /api/admin/task-gen/jobs?active=true 를 3초마다 가져온다.
// 작업 번호를 따로 저장하지 않는다. 페이지를 떠났다 와도 서버 목록에서 이어 보인다.
// 숨은 탭에서는 쉬고, 조회가 겹치지 않게 앞 조회가 끝난 뒤에 다음 시간을 잰다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { taskGenApi, type JobRow } from '../../../data/taskGen'

export const JOBS_POLL_MS = 3000

export function useGenJobs(intervalMs = JOBS_POLL_MS) {
  const [rows, setRows] = useState<JobRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const alive = useRef(true)
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const next = await taskGenApi.jobs()
      if (!alive.current) return
      setRows(Array.isArray(next) ? next : [])
      setError(null)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    alive.current = true
    const tick = async () => {
      if (!document.hidden) await load()
      if (alive.current) timer.current = window.setTimeout(() => void tick(), intervalMs)
    }
    void tick()
    return () => {
      alive.current = false
      window.clearTimeout(timer.current)
    }
  }, [load, intervalMs])

  /** 새 작업을 넣거나 취소한 직후 바로 한 번 더 가져온다 */
  const refresh = useCallback(() => void load(), [load])

  return { rows, error, refresh }
}
