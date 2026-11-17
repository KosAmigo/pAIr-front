import { useCallback, useEffect, useRef, useState } from 'react'
import { ViolationApi } from '../api/ViolationApi.ts'
import { BrowserEventDetector } from '../core/BrowserEventDetector.ts'
import { ViolationManager } from '../core/ViolationManager.ts'
import { DEFAULT_ANTI_CHEATING_CONFIG, type AntiCheatingConfig, type Violation } from '../core/types.ts'
import { ViolationOutbox } from '../storage/ViolationOutbox.ts'

type Lifecycle = { finish: () => Promise<void> }

export function useAntiCheating({
  sessionId,
  active,
  config = DEFAULT_ANTI_CHEATING_CONFIG,
}: {
  sessionId: string
  active: boolean
  config?: AntiCheatingConfig
}) {
  const [countState, setCountState] = useState(() => ({
    sessionId,
    count: ViolationOutbox.cachedCount(sessionId),
  }))
  const [warning, setWarning] = useState<Violation | null>(null)
  const lifecycle = useRef<Lifecycle | null>(null)
  const count = countState.sessionId === sessionId ? countState.count : ViolationOutbox.cachedCount(sessionId)
  const updateCount = useCallback((nextCount: number) => {
    setCountState((current) => ({
      sessionId,
      count: Math.max(current.sessionId === sessionId ? current.count : ViolationOutbox.cachedCount(sessionId), nextCount),
    }))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || !active || !config.enabled) return
    let alive = true
    const outbox = new ViolationOutbox(sessionId, config)
    const api = new ViolationApi()

    let sync: () => Promise<number | null> = async () => null
    const manager = new ViolationManager(sessionId, config, outbox.localCount, (violation, isNew, localCount) => {
      if (isNew) setWarning(violation)
      else setWarning((current) => (current ? violation : current))
      updateCount(localCount)
      outbox.enqueue(violation, localCount)
      void sync()
    })
    const detector = new BrowserEventDetector(
      (type) => manager.signal(type),
      (reason) => manager.resume(reason),
      config,
    )

    sync = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return null
      const serverCount = await outbox.sync(api)
      if (alive && serverCount != null) {
        manager.setCountFloor(serverCount)
        updateCount(serverCount)
      }
      return serverCount
    }

    const finish = async () => {
      detector.stop()
      manager.finish()
      outbox.markFinished()
      const serverCount = await sync()
      if (alive && serverCount != null) updateCount(serverCount)
    }
    lifecycle.current = { finish }
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    detector.start()
    void sync()

    return () => {
      alive = false
      detector.stop()
      manager.finish()
      window.removeEventListener('online', onOnline)
      if (lifecycle.current?.finish === finish) lifecycle.current = null
    }
  }, [sessionId, active, config, updateCount])

  const finish = useCallback(async () => {
    await lifecycle.current?.finish()
  }, [])
  const dismissWarning = useCallback(() => setWarning(null), [])
  const requestFullscreen = useCallback(async () => {
    if (typeof document === 'undefined' || document.fullscreenElement) return
    await document.documentElement.requestFullscreen()
  }, [])

  return { count, warning, finish, dismissWarning, requestFullscreen, enabled: active && config.enabled }
}
