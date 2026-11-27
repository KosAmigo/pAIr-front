// 사용자 화면(과제·리포트·대시보드·복기)이 같이 쓰는 React Query 옵션.
// 같은 API 를 여러 화면이 쓰면 같은 키·같은 함수를 쓰도록 옵션 객체로 둔다.
import { api, type Task, type TaskSummary } from '../api'
import { freshOnMount, queryKeys } from './queryKeys'

export type TaskRow = Task & { status: TaskSummary['status'] }

/** 과제 목록 + 각 과제 정의 */
export const tasksQuery = {
  queryKey: queryKeys.tasks,
  queryFn: async (): Promise<TaskRow[]> => {
    const list = await api.taskList()
    const defs = await Promise.all(list.map((s) => api.task(s.id)))
    return defs.map((d, i): TaskRow => ({ ...d, status: list[i].status }))
  },
  ...freshOnMount,
}

/** 내 응시 목록 (includeEmpty: 빈 응시까지) */
export const attemptsQuery = (includeEmpty = false) => ({
  queryKey: queryKeys.attempts(includeEmpty),
  queryFn: () => api.list(includeEmpty),
  ...freshOnMount,
})

/** 리포트. 채점 중(SCORING)이면 2초마다 다시 받는다 */
export const REPORT_POLL_MS = 2000
export const reportQuery = (attemptId: string) => ({
  queryKey: queryKeys.report(attemptId),
  queryFn: () => api.report(attemptId),
  refetchInterval: (q: { state: { data?: { status: string } } }) => (q.state.data?.status === 'SCORING' ? REPORT_POLL_MS : false),
  ...freshOnMount,
})

/** 응시 하나의 요약 */
export const attemptQuery = (attemptId: string) => ({
  queryKey: queryKeys.attempt(attemptId),
  queryFn: () => api.attempt(attemptId),
  ...freshOnMount,
})
