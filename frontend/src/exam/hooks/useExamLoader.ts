import { useEffect, useState, type MutableRefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { api, type ApiError, type AttemptView, type Material, type Turn } from '../../api'
import { inviteForAttempt } from '../../proctor/liveExam.ts'

/** 처음 불러온 값을 넘겨받을 쪽(편집기·채팅)의 상태 변경 함수. 세터는 렌더마다 같으므로 ref 로 건네 effect 의존성을 늘리지 않는다 */
export type LoadSinks = {
  setTurns: (t: Turn[]) => void
  setContents: (c: Record<string, string>) => void
  setOpen: (o: string[]) => void
  setActive: (a: string) => void
}

/** 응시 처음 불러오기(attempt·자료·첫 파일)와 경과 시간 타이머 */
export function useExamLoader(sessionId: string, navigate: NavigateFunction, sinks: MutableRefObject<LoadSinks | null>) {
  const [view, setView] = useState<AttemptView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stage, setStage] = useState<'solve' | 'followup'>('solve')
  const [elapsed, setElapsed] = useState(0)
  const [materials, setMaterials] = useState<Material[]>([])

  // 처음 불러오기
  useEffect(() => {
    let alive = true
    api
      .attempt(sessionId)
      .then(async (v) => {
        if (!alive) return
        if (v.attempt.status === 'SCORING' || v.attempt.status === 'DONE' || v.attempt.status === 'ERROR') {
          // 실전 응시는 리포트를 보여 주지 않는다 (기획: 실전은 리포트·복기 차단)
          navigate(inviteForAttempt(sessionId) ? `/exam/${sessionId}/submitted` : `/report/${sessionId}`, { replace: true })
          return
        }
        setView(v)
        // 자료 목록은 없어도 풀이는 된다(개발 과제는 PDF 가 없다)
        api.materials(sessionId).then((m) => alive && setMaterials(m)).catch(() => undefined)
        sinks.current?.setTurns(v.turns)
        setElapsed(v.elapsedSeconds)
        setStage(v.attempt.status === 'FOLLOWUP' ? 'followup' : 'solve')
        const first = v.files.includes(v.task.openFile) ? v.task.openFile : v.files[0]
        const c = await api.file(sessionId, first)
        if (!alive) return
        sinks.current?.setContents({ [first]: c.content })
        sinks.current?.setOpen([first])
        sinks.current?.setActive(first)
      })
      .catch((e: ApiError) => setLoadError(e.message))
    return () => {
      alive = false
    }
  }, [sessionId, navigate])

  // 타이머
  useEffect(() => {
    if (!view || stage !== 'solve') return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [view, stage])

  return { view, setView, loadError, stage, setStage, elapsed, materials }
}
