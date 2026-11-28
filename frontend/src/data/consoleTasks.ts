// 콘솔 과제 목록 (DESIGN.md §7-9-1 ~ 9-3). 데이터는 백엔드(/api/console/tasks)에서만 온다.
// 목록은 과제 화면·콘솔 메뉴(검수 대기 숫자)·회차 화면이 같이 쓰므로 React Query 캐시 하나(['console-tasks'])에 둔다.
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../queryClient'
import { consoleApi, type ConsoleTaskDetail, type ConsoleTaskSummary, type TaskUsage } from '../consoleApi'
import { KINDS } from './catalog'
import { errorMessage, queryKeys } from './queryKeys'

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

/** 과제 삭제(검수 전 과제만). 지운 과제는 목록 캐시에서 바로 빼고, 서버 기준으로 목록·만드는 중 작업을 다시 받는다 */
export async function deleteTask(id: string) {
  await consoleApi.deleteTask(id)
  queryClient.setQueryData<ConsoleTaskSummary[]>(consoleTasksQuery.queryKey, (l) => l?.filter((t) => t.id !== id))
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: consoleTasksQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: queryKeys.genJobs }),
  ])
}

/** 용도 바꾸기(검수 전 과제만). 바뀐 요약으로 목록을 고친다 */
export async function setUsage(id: string, usage: TaskUsage) {
  const next = await consoleApi.changeUsage(id, usage)
  patchList(next)
  return next
}

/** 과제 하나의 요약과 정의(설명·요구사항·후속 질문 등). setSummary 로 공개 상태가 바뀐 요약을 반영한다 */
export function useTaskDetail(id: string | undefined) {
  // 과제 ID 가 키에 들어 있어 다른 과제로 가면 이전 과제의 결과는 보이지 않는다
  const q = useQuery({ queryKey: queryKeys.consoleTask(id ?? ''), queryFn: () => consoleApi.task(id!), enabled: !!id, staleTime: 0, gcTime: 0 })
  const { refetch } = q
  const reload = useCallback(() => void refetch(), [refetch])
  const setSummary = useCallback(
    (summary: ConsoleTaskSummary) =>
      queryClient.setQueryData<ConsoleTaskDetail>(queryKeys.consoleTask(id ?? ''), (d) => (d ? { ...d, summary } : d)),
    [id],
  )
  return { detail: id ? (q.data ?? null) : null, error: id ? errorMessage(q.error) : null, reload, setSummary }
}
