// DESIGN.md §7-2 대시보드 "자주 깎이는 습관 Top 3"의 계산 부분.

export type HabitCheck = { itemKey: string; code: string; label: string; deducted: number }
export type HabitAttempt = { id: string; taskId: string; checks: HabitCheck[] }

export type Habit = {
  code: string
  label: string
  itemKey: string
  /** 이 감점에 걸린 응시 수 */
  hits: number
  /** 집계에 쓴 응시 수 */
  of: number
  /** 깎인 점수 합 */
  sum: number
  /** 가장 최근에 걸린 응시와 그 과제 (복기에서 보기로 이동할 때 쓴다) */
  latestAttemptId: string
  latestTaskId: string
}

/**
 * 채점된 응시들(오래된 것부터, 마지막이 최근)에서 deducted > 0 인 체크를 code 로 모아
 * 걸린 횟수 → 깎인 점수 합 순으로 limit 개를 돌려준다. 같으면 code 순.
 */
export function topHabits(attempts: HabitAttempt[], limit = 3): Habit[] {
  const map = new Map<string, Habit>()
  for (const at of attempts) {
    const seen = new Set<string>()
    for (const c of at.checks) {
      if (!(c.deducted > 0)) continue
      const h = map.get(c.code)
      if (h) {
        if (!seen.has(c.code)) h.hits += 1
        h.sum = Math.round((h.sum + c.deducted) * 10) / 10
        h.latestAttemptId = at.id
        h.latestTaskId = at.taskId
        h.label = c.label
      } else {
        map.set(c.code, { code: c.code, label: c.label, itemKey: c.itemKey, hits: 1, of: attempts.length, sum: c.deducted, latestAttemptId: at.id, latestTaskId: at.taskId })
      }
      seen.add(c.code)
    }
  }
  return [...map.values()].sort((x, y) => y.hits - x.hits || y.sum - x.sum || x.code.localeCompare(y.code)).slice(0, limit)
}
