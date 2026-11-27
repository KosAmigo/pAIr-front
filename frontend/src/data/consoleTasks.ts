// 콘솔 과제 목록 (DESIGN.md §7-9-1 ~ 9-3). 데이터는 백엔드(/api/console/tasks)에서만 온다.
// 목록은 과제 화면·콘솔 메뉴(검수 대기 숫자)·회차 화면이 같이 쓰므로 React Query 캐시 하나(['console-tasks'])에 둔다.
import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../queryClient'
import { consoleApi, type ConsoleTaskDetail, type ConsoleTaskSummary, type TaskUsage } from '../consoleApi'
import { KINDS } from './catalog'

// 탭 나누기·거르기 같은 화면 규칙은 taskBoard.ts (테스트하기 쉽게 따로 둔다)
export { tabOf, type TaskTab } from './taskBoard'

export const kindName = (key: string) => KINDS.find((k) => k.key === key)?.name ?? key
/** 백엔드 과제 type(dev | biz) → 직군 이름 */
export const trackName = (type: string) => (type === 'biz' ? '비개발' : '개발')

/** 콘솔 과제 목록 쿼리. 과제 화면·콘솔 메뉴·회차 화면이 같은 키·같은 함수를 쓴다 */
export const consoleTasksQuery = {
  queryKey: ['console-tasks'] as const,
  queryFn: () => consoleApi.tasks(),
}

/** 과제 목록을 다시 받아 온다 */
export function loadTasks() {
  return queryClient.invalidateQueries({ queryKey: consoleTasksQuery.queryKey })
}

/** 받아 온 과제 목록. enabled=false 면 불러오지 않는다 (관리자 아닌 역할) */
export function useTaskList(enabled = true) {
  const q = useQuery({ ...consoleTasksQuery, enabled })
  return {
    list: q.data ?? null,
    error: q.error ? (q.error instanceof Error ? q.error.message : String(q.error)) : null,
    loading: q.isFetching,
  }
}

const patchList = (next: ConsoleTaskSummary) =>
  queryClient.setQueryData<ConsoleTaskSummary[]>(consoleTasksQuery.queryKey, (l) =>
    l?.map((t) => (t.id === next.id ? next : t)),
  )

/** 공개 상태 바꾸기(관리자). 바뀐 요약으로 목록을 고친다 */
export async function setPublished(id: string, open: boolean) {
  const next = open ? await consoleApi.publishTask(id) : await consoleApi.hideTask(id)
  patchList(next)
  return next
}

/** 용도 바꾸기(검수 전 과제만). 바뀐 요약으로 목록을 고친다 */
export async function setUsage(id: string, usage: TaskUsage) {
  const next = await consoleApi.changeUsage(id, usage)
  patchList(next)
  return next
}

/** 과제 하나의 요약과 정의(설명·요구사항·후속 질문 등). setSummary 로 공개 상태가 바뀐 요약을 반영한다 */
export function useTaskDetail(id: string | undefined) {
  const [tick, setTick] = useState(0)
  // 어떤 요청(과제 ID + 다시 시도 횟수)의 결과인지 key 로 구분해, 이전 과제의 결과를 보여 주지 않는다
  const key = `${id}#${tick}`
  const [res, setRes] = useState<{ key: string; detail: ConsoleTaskDetail | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    consoleApi.task(id).then(
      (d) => alive && setRes({ key, detail: d, error: null }),
      (e) => alive && setRes({ key, detail: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
    }
  }, [id, key])
  const cur = res?.key === key ? res : null
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const setSummary = useCallback(
    (summary: ConsoleTaskSummary) => setRes((r) => (r?.detail ? { ...r, detail: { ...r.detail, summary } } : r)),
    [],
  )
  return { detail: cur?.detail ?? null, error: cur?.error ?? null, reload, setSummary }
}
