import type { AttemptStatus, AttemptSummary } from '../api.ts'

/** 아직 채점으로 넘어가지 않은 응시 (풀이 중이거나 후속 질문이 남음) */
export const isUnsubmitted = (status: AttemptStatus) => status === 'SOLVING' || status === 'FOLLOWUP'

const newestFirst = (list: AttemptSummary[]) => [...list].sort((x, y) => y.startedAt.localeCompare(x.startedAt))

/** 과제 ID → 이어서 풀 응시 ID. 제출하지 않은 응시가 여럿이면 가장 최근 것. 빈 응시는 작업한 응시가 없을 때만 고른다 */
export function resumeByTask(list: AttemptSummary[]): Map<string, string> {
  const open = newestFirst(list).filter((a) => isUnsubmitted(a.status))
  const preferred = [...open.filter((a) => !a.empty), ...open.filter((a) => a.empty)]
  // 뒤에 넣은 값이 남으므로 우선순위가 낮은 것부터 넣는다
  return new Map(preferred.reverse().map((a) => [a.taskId, a.id]))
}

/** 리포트 목록: 제출한 응시만 (채점 중·실패 포함), 최근 것부터 */
export const reportAttempts = (list: AttemptSummary[]) => newestFirst(list).filter((a) => !isUnsubmitted(a.status))
