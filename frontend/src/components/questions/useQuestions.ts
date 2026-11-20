import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiError } from '../../api'
import { answeredCount, createAnswerSaver, questionsApi, type Answer, type Question, type SaveState } from '../../data/questions'

export type QuestionLoad = 'loading' | 'ready' | 'error'

/** 응시의 문항 목록과 자동 저장. 문항이 없으면(개발 과제 등) questions 가 빈 배열이다. */
export function useQuestions(attemptId: string, readOnly: boolean) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [load, setLoad] = useState<QuestionLoad>('loading')
  const [states, setStates] = useState<Record<number, { state: SaveState; error?: string }>>({})
  const [serverLocked, setServerLocked] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    questionsApi
      .list(attemptId)
      .then((q) => {
        if (!alive) return
        setQuestions([...q].sort((a, b) => a.seq - b.seq))
        setLoad('ready')
      })
      .catch((e: ApiError) => {
        if (!alive) return
        // 문항 API 가 없는 예전 서버(404)는 문항 없음으로 본다
        if (e.status === 404) {
          setQuestions([])
          setLoad('ready')
        } else setLoad('error')
      })
    return () => {
      alive = false
    }
  }, [attemptId, reloadKey])

  const saver = useMemo(
    () =>
      createAnswerSaver({
        save: (id, answer) => questionsApi.save(attemptId, id, answer),
        onState: (id, state, error) => setStates((m) => ({ ...m, [id]: { state, error } })),
        onLocked: () => setServerLocked(true),
      }),
    [attemptId],
  )
  const saverRef = useRef(saver)
  useEffect(() => {
    saverRef.current = saver
    return () => saver.dispose()
  }, [saver])

  const setAnswer = useCallback((id: number, answer: Answer) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, answer } : q)))
  }, [])

  const choose = useCallback(
    (id: number, choiceIds: number[]) => {
      setAnswer(id, { choiceIds })
      saver.choose(id, choiceIds)
    },
    [saver, setAnswer],
  )
  const type = useCallback(
    (id: number, text: string) => {
      setAnswer(id, { text })
      saver.type(id, text)
    },
    [saver, setAnswer],
  )

  return {
    questions,
    load,
    states,
    readOnly: readOnly || serverLocked,
    answered: answeredCount(questions),
    choose,
    type,
    retry: saver.retry,
    flush: saver.flush,
    reload: () => {
      setLoad('loading')
      setReloadKey((k) => k + 1)
    },
  }
}

export type QuestionsState = ReturnType<typeof useQuestions>
