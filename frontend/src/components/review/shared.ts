import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type AttemptCompare, type Turn } from '../../api'
import { freshOnMount, queryKeys } from '../../data/queryKeys'
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
  // 두 응시 ID 가 키에 들어 있어 다른 응시로 바꾸면 이전 비교는 보이지 않는다
  const q = useQuery({
    queryKey: queryKeys.compare(aId ?? '', bId ?? ''),
    queryFn: async () => {
      const [compare, ra, rb] = await Promise.all([api.compareAttempts(aId!, bId!), api.report(aId!), api.report(bId!)])
      const turnsA = ra.report?.transcript ?? []
      const turnsB = rb.report?.transcript ?? []
      const n = commonPrefixLength(turnsA, turnsB)
      const questionA = turnsA.slice(n).find((t) => t.role === 'user') ?? null
      const questionB = turnsB.slice(n).find((t) => t.role === 'user') ?? null
      const turns = [questionA?.turn, questionB?.turn].filter((t): t is number => t != null)
      return { compare, turnsA, turnsB, forkTurn: turns.length ? Math.min(...turns) : null, questionA, questionB }
    },
    enabled: !!aId && !!bId,
    ...freshOnMount,
  })
  const { refetch } = q
  const retry = useCallback(() => void refetch(), [refetch])
  if (q.data) return { status: 'ready', ...q.data }
  if (q.error) return { status: 'error', message: q.error instanceof Error ? q.error.message : String(q.error), retry }
  return { status: 'loading' }
}
