import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserEventDetector } from '../core/BrowserEventDetector.ts'
import { ViolationManager } from '../core/ViolationManager.ts'
import { DEFAULT_ANTI_CHEATING_CONFIG, type AntiCheatingConfig, type Violation } from '../core/types.ts'
import { readViolationCount, writeViolationCount } from '../storage/violationCount.ts'

type Lifecycle = { finish: () => void }

export function useAntiCheating({
  sessionId,
  active,
  config = DEFAULT_ANTI_CHEATING_CONFIG,
  onViolation,
}: {
  sessionId: string
  active: boolean
  config?: AntiCheatingConfig
  /** 새 이탈 1건이 생길 때 (실전 회차 감독 기록으로 넘기는 데 쓴다) */
  onViolation?: (violation: Violation) => void
}) {
  const onViolationRef = useRef(onViolation)
  useEffect(() => {
    onViolationRef.current = onViolation
  }, [onViolation])
  const [countState, setCountState] = useState(() => ({
    sessionId,
    count: readViolationCount(sessionId),
  }))
  const [warning, setWarning] = useState<Violation | null>(null)
  const lifecycle = useRef<Lifecycle | null>(null)
  const count = countState.sessionId === sessionId ? countState.count : readViolationCount(sessionId)
  const updateCount = useCallback((nextCount: number) => {
    setCountState((current) => ({
      sessionId,
      count: Math.max(current.sessionId === sessionId ? current.count : readViolationCount(sessionId), nextCount),
    }))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || !active || !config.enabled) return
    const manager = new ViolationManager(sessionId, config, readViolationCount(sessionId), (violation, isNew, localCount) => {
      if (isNew) {
        setWarning(violation)
        onViolationRef.current?.(violation)
      } else setWarning((current) => (current ? violation : current))
      updateCount(localCount)
      writeViolationCount(sessionId, localCount)
    })
    const detector = new BrowserEventDetector(
      (type) => manager.signal(type),
      (reason) => manager.resume(reason),
      config,
    )

    const finish = () => {
      detector.stop()
      manager.finish()
    }
    lifecycle.current = { finish }
    detector.start()

    return () => {
      detector.stop()
      manager.finish()
      if (lifecycle.current?.finish === finish) lifecycle.current = null
    }
  }, [sessionId, active, config, updateCount])

  const finish = useCallback(async () => {
    lifecycle.current?.finish()
  }, [])
  const dismissWarning = useCallback(() => setWarning(null), [])
  const requestFullscreen = useCallback(async () => {
    if (typeof document === 'undefined' || document.fullscreenElement) return
    await document.documentElement.requestFullscreen()
  }, [])

  return { count, warning, finish, dismissWarning, requestFullscreen, enabled: active && config.enabled }
}
