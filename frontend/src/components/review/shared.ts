import { useCallback, useEffect, useState } from 'react'
import { api, type AttemptCompare, type Turn } from '../../api'
import { commonPrefixLength } from '../../lib/replayCompare'

/** A 는 파랑, B 는 보라 (시안 값. 갈래 색과 겹치지 않게 슬롯 전용으로 쓴다) */
export const SLOT = {
  a: { name: 'A', color: '#3b82f6', soft: '#eff6ff', border: '#bfdbfe', text: '#2563eb' },
  b: { name: 'B', color: '#a855f7', soft: '#faf5ff', border: '#e9d5ff', text: '#9333ea' },
} as const

export const pad2 = (n: number) => String(n).padStart(2, '0')
export const turnTag = (n: number) => `T${pad2(n)}`
/** 같은 날 시작한 미제출 풀이를 구분하는 날짜 + 시각 */
export const startLabel = (iso: string) => {
  const d = new Date(iso)
  return `${shortDate(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export const shortDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${pad2(d.getDate())}`
}

export type CompareState =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'ready'; compare: AttemptCompare; turnsA: Turn[]; turnsB: Turn[]; forkTurn: number | null; questionA: Turn | null; questionB: Turn | null }

/** 두 응시의 비교 결과와 대화 기록을 함께 불러온다. 갈라진 순간의 질문은 앞부분이 같은 대화 뒤 첫 응시자 턴 */
export function useCompare(aId: string | null, bId: string | null): CompareState {
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState<{ key: string; state: CompareState } | null>(null)
  const retry = useCallback(() => setTick((t) => t + 1), [])
  const key = aId && bId ? `${aId}|${bId}|${tick}` : ''
  useEffect(() => {
    if (!aId || !bId) return
    let alive = true
    Promise.all([api.compareAttempts(aId, bId), api.report(aId), api.report(bId)])
      .then(([compare, ra, rb]) => {
        if (!alive) return
        const turnsA = ra.report?.transcript ?? []
        const turnsB = rb.report?.transcript ?? []
        const n = commonPrefixLength(turnsA, turnsB)
        const questionA = turnsA.slice(n).find((t) => t.role === 'user') ?? null
        const questionB = turnsB.slice(n).find((t) => t.role === 'user') ?? null
        const turns = [questionA?.turn, questionB?.turn].filter((t): t is number => t != null)
        setResult({ key, state: { status: 'ready', compare, turnsA, turnsB, forkTurn: turns.length ? Math.min(...turns) : null, questionA, questionB } })
      })
      .catch((e: Error) => alive && setResult({ key, state: { status: 'error', message: e.message, retry } }))
    return () => {
      alive = false
    }
  }, [aId, bId, key, retry])
  return result && result.key === key ? result.state : { status: 'loading' }
}
