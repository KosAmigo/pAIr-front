// 점검 진행 상태를 서버로 올린다 (콘솔이 입장 대기 중 응시자의 점검을 실시간으로 보게). 점검 화면이 매 프레임 바뀔 수 있어 간격을 둔다.
import { useCallback, useEffect, useRef } from 'react'
import { proctorApi } from '../api/proctorApi.ts'
import type { EnvCheckResult } from './EnvCheckPanel.tsx'

/** 올리는 최소 간격. 이 안에 바뀐 것은 마지막 값 하나만 간격이 끝날 때 올린다 */
export const ENV_PROGRESS_INTERVAL_MS = 3000

export function useEnvProgressUpload(invite: string): (r: EnvCheckResult) => void {
  const latest = useRef<EnvCheckResult | null>(null)
  const lastSentAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    timer.current = null
    const r = latest.current
    if (!r) return
    latest.current = null
    lastSentAt.current = Date.now()
    // 올리기에 실패해도 점검은 계속된다 (콘솔 화면만 조금 늦는다)
    proctorApi.sendEnvProgress(invite, r).catch(() => {})
  }, [invite])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return useCallback(
    (r: EnvCheckResult) => {
      latest.current = r
      if (timer.current) return
      const wait = Math.max(0, lastSentAt.current + ENV_PROGRESS_INTERVAL_MS - Date.now())
      timer.current = setTimeout(flush, wait)
    },
    [flush],
  )
}
