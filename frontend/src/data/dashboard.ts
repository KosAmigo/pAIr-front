// 대시보드 스탯 설정과 데이터 불러오기 (DESIGN.md §7-2, 2026-11-19 개편).
// 역량은 현재 채점 기준의 6개 항목(§1.5)과 배점을 쓴다 (백엔드 Rubric 의 item key 와 같다).
import { api, type ReportItem } from '../api'
import type { HabitCheck } from '../lib/habits'
import { groupByTask, type TaskGroup } from '../lib/reviewTree'

export type StatKey = 'usage' | 'control' | 'decomposition' | 'delegation' | 'delivery' | 'potential'

export const STATS: { key: StatKey; name: string; short: string; max: number; color: string; desc: string }[] = [
  { key: 'usage', name: 'AI 활용력', short: '활용', max: 20, color: 'var(--color-branch-2)', desc: '필요한 순간에 AI를 불러 맞는 질문을 던진다' },
  { key: 'control', name: 'AI 통제력', short: '통제', max: 15, color: 'var(--color-branch-3)', desc: 'AI의 답을 그대로 믿지 않고 확인한다' },
  { key: 'decomposition', name: '문제 분해력', short: '분해', max: 10, color: 'var(--color-branch-4)', desc: '큰 문제를 AI에게 맡길 단위로 나눈다' },
  { key: 'delegation', name: '위임 판단력', short: '위임', max: 10, color: 'var(--color-comp-7)', desc: '맡길 일과 직접 할 일을 가려낸다' },
  { key: 'delivery', name: 'AI 결과 도출력', short: '도출', max: 30, color: 'var(--color-branch-5)', desc: '끝내 돌아가는 결과물을 만들어 낸다' },
  { key: 'potential', name: '성과 잠재력', short: '잠재', max: 15, color: 'var(--color-comp-6)', desc: '다음에 더 잘할 수 있는 습관을 보인다' },
]

export type StatScores = Record<StatKey, number>

/** 응시 회차 하나의 항목 점수 (배점 기준) */
export type StatEntry = { id: string; taskId: string; date: string; task: string; scores: StatScores; /** 이 응시의 모든 체크 결과 (자주 깎이는 습관 집계용) */ checks: HabitCheck[] }

export const total = (s: StatScores) => STATS.reduce((n, st) => n + s[st.key], 0)

export function dayLabel(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** 리포트 항목(key, score)을 스탯 점수로. 없는 항목은 0 */
export function toStatScores(items: ReportItem[]): StatScores {
  const s = Object.fromEntries(STATS.map((st) => [st.key, 0])) as StatScores
  for (const it of items) if (it.key in s) s[it.key as StatKey] = it.score
  return s
}

/** 리포트 항목의 체크를 평평하게 편다 */
export const toHabitChecks = (items: ReportItem[]): HabitCheck[] =>
  items.flatMap((it) => it.checks.map((c) => ({ itemKey: it.key, code: c.code, label: c.label, deducted: c.deducted })))

/**
 * 한 과제의 채점이 끝난 최근 응시(최대 limit 개) 항목 점수. 오래된 것부터, 마지막이 최근.
 * taskId 가 없거나 채점된 응시가 없는 과제면 가장 최근에 푼 과제를 고른다.
 * GET /api/attempts 로 목록을 받고, 항목 점수는 응시마다 GET /api/attempts/{id}/report 로 받는다.
 */
export async function loadStatHistory(
  taskId: string | null,
  limit = 6,
): Promise<{ entries: StatEntry[]; attempts: number; tasks: TaskGroup[]; taskId: string | null }> {
  const rows = await api.list()
  /** 채점된 응시가 있는 과제들 (최근에 푼 과제가 먼저) */
  const tasks = groupByTask(rows.filter((r) => r.status === 'DONE' && r.total != null && !r.legacyReport))
  const selected = tasks.find((t) => t.taskId === taskId) ?? tasks[0]
  const done = selected?.attempts.slice(-limit) ?? []
  const reports = await Promise.all(done.map((r) => api.report(r.id)))
  const entries: StatEntry[] = []
  done.forEach((r, i) => {
    const rep = reports[i].report
    if (!rep || (rep.version ?? 1) < 2) return
    entries.push({
      id: r.id,
      taskId: r.taskId,
      date: dayLabel(r.startedAt),
      task: r.taskTitle,
      scores: toStatScores(rep.items),
      checks: toHabitChecks(rep.items),
    })
  })
  return { entries, attempts: rows.filter((r) => r.taskId === selected?.taskId).length, tasks, taskId: selected?.taskId ?? null }
}
