import type { AttemptSummary, TreeNode } from '../api.ts'
import { layoutTree, type TreeRow } from './replayTree.ts'

// DESIGN.md §7-5 복기 화면의 계산 부분. 그리는 일(SVG)은 컴포넌트가 하고, 여기서는 위치·경로·기본 선택만 정한다.

/** 왼쪽 과제 카드 하나: 같은 과제의 응시를 묶은 것 */
export type TaskGroup = {
  taskId: string
  title: string
  /** 오래된 순 */
  attempts: AttemptSummary[]
  count: number
  /** 채점이 끝난 응시의 최고점. 없으면 null */
  best: number | null
  /** 채점이 끝난 응시의 점수, 오래된 순, 최대 SPARK_MAX 개 (카드의 작은 막대) */
  scores: number[]
  /** 가장 최근 응시 (트리를 부를 때 시작점) */
  newestId: string
  /** 채점이 끝난 응시 중 가장 최근 것 */
  newestScoredId: string | null
  /** 가장 최근 응시 시작 시각 (과제 카드 정렬용) */
  latestAt: string
}

export const SPARK_MAX = 6

const isScored = (a: AttemptSummary) => a.status === 'DONE' && a.total != null

/** 응시 목록을 과제별로 묶는다. 가장 최근에 푼 과제가 위로 온다 */
export function groupByTask(list: AttemptSummary[]): TaskGroup[] {
  const map = new Map<string, AttemptSummary[]>()
  for (const a of list) map.set(a.taskId, [...(map.get(a.taskId) ?? []), a])
  const groups: TaskGroup[] = []
  for (const [taskId, items] of map) {
    const attempts = [...items].sort((x, y) => x.startedAt.localeCompare(y.startedAt))
    const scored = attempts.filter(isScored)
    const newest = attempts[attempts.length - 1]
    groups.push({
      taskId,
      title: newest.taskTitle,
      attempts,
      count: attempts.length,
      best: scored.length ? Math.max(...scored.map((a) => a.total as number)) : null,
      scores: scored.slice(-SPARK_MAX).map((a) => a.total as number),
      newestId: newest.id,
      newestScoredId: scored.length ? scored[scored.length - 1].id : null,
      latestAt: newest.startedAt,
    })
  }
  return groups.sort((x, y) => y.latestAt.localeCompare(x.latestAt))
}

/** 트리 한 줄(갈래 하나)의 그림 정보. 위치는 칸 단위이고 픽셀은 컴포넌트가 곱한다 */
export type TreeLane = TreeRow & {
  /** 위에서부터 몇 번째 줄인지 (뿌리가 여러 개여도 이어서 센다) */
  lane: number
  /** 이 갈래 선이 시작하는 턴. 뿌리는 1, 갈라진 갈래는 갈라진 턴(부모 선은 그 앞 턴에서 꺾여 나온다) */
  startTurn: number
  parentLane: number | null
  /** 부모 대비 점수 변화. 둘 중 하나라도 채점 전이면 null */
  delta: number | null
  /** 화면에 쓰는 이름: 뿌리는 "처음 풀이", 나머지는 "갈래 N" */
  name: string
  /** 몇 번째 뿌리 트리에 속하는지 */
  root: number
}

export type TreeLayout = {
  lanes: TreeLane[]
  /** 갈라진 턴 중 가장 늦은 턴 (가로 칸 수를 정할 때 쓴다) */
  lastFork: number
}

/** 서버가 준 평평한 목록을 줄(lane)과 갈라짐 위치로 편다 */
export function layoutLanes(nodes: TreeNode[]): TreeLayout {
  const rows = layoutTree(nodes)
  const lanes: TreeLane[] = []
  const laneOf = new Map<string, number>()
  const rootIds = new Map<string, number>()
  rows.forEach((r, i) => {
    laneOf.set(r.attemptId, i)
    const rootId = r.path[0].attemptId
    if (!rootIds.has(rootId)) rootIds.set(rootId, rootIds.size)
  })
  const byId = new Map(rows.map((r) => [r.attemptId, r]))
  rows.forEach((r, i) => {
    const parent = r.parentAttemptId ? byId.get(r.parentAttemptId) : undefined
    lanes.push({
      ...r,
      lane: i,
      startTurn: r.parentAttemptId ? (r.forkedAtTurn ?? 1) : 1,
      parentLane: parent ? (laneOf.get(parent.attemptId) ?? null) : null,
      delta: r.score && parent?.score ? r.score.total - parent.score.total : null,
      name: r.parentAttemptId ? `갈래 ${r.branch}` : '처음 풀이',
      root: rootIds.get(r.path[0].attemptId) ?? 0,
    })
  })
  return { lanes, lastFork: Math.max(1, ...lanes.map((l) => l.startTurn)) }
}

/** 뿌리에서 id 까지의 응시 ID (뿌리가 먼저, 자기 자신이 마지막). 모르는 id 면 빈 배열 */
export function ancestorIds(lanes: TreeLane[], id: string): string[] {
  const byId = new Map(lanes.map((l) => [l.attemptId, l]))
  const out: string[] = []
  for (let l = byId.get(id); l; l = l.parentAttemptId ? byId.get(l.parentAttemptId) : undefined) out.unshift(l.attemptId)
  return out
}

/** 두 응시의 가장 가까운 공통 조상 (자기 자신도 조상으로 본다). 뿌리가 다르면 null */
export function commonAncestor(lanes: TreeLane[], a: string, b: string): string | null {
  const pa = ancestorIds(lanes, a)
  const inA = new Set(pa)
  const pb = ancestorIds(lanes, b)
  for (let i = pb.length - 1; i >= 0; i--) if (inA.has(pb[i])) return pb[i]
  return null
}

/** A↔B 경로에 해당하는 갈래들: 공통 조상 아래로 A쪽과 B쪽 줄기. 공통 조상 자신은 넣지 않는다 */
export function routeIds(lanes: TreeLane[], a: string, b: string): Set<string> {
  const common = commonAncestor(lanes, a, b)
  const skip = new Set(common ? ancestorIds(lanes, common) : [])
  return new Set([...ancestorIds(lanes, a), ...ancestorIds(lanes, b)].filter((id) => !skip.has(id)))
}

/** 두 풀이가 처음 갈라진 턴. 공통 조상이 없거나 같은 응시면 null */
export function divergeTurn(lanes: TreeLane[], a: string, b: string): number | null {
  const common = commonAncestor(lanes, a, b)
  if (!common) return null
  const byId = new Map(lanes.map((l) => [l.attemptId, l]))
  const turns: number[] = []
  for (const id of [a, b]) {
    const path = ancestorIds(lanes, id)
    const next = path[path.indexOf(common) + 1]
    const lane = next ? byId.get(next) : undefined
    if (lane) turns.push(lane.startTurn)
  }
  return turns.length ? Math.min(...turns) : null
}

/**
 * 처음 보여 줄 A·B. B 는 채점된 응시 중 가장 최근 것, A 는 B 의 부모(채점 전이면 그다음으로 최근 채점 응시).
 * 채점된 응시가 하나뿐이면 A 만 채운다. 하나도 없으면 둘 다 null.
 */
export function pickDefaults(lanes: TreeLane[]): { a: string | null; b: string | null } {
  const scored = lanes.filter((l) => l.score).sort((x, y) => y.startedAt.localeCompare(x.startedAt))
  if (scored.length === 0) return { a: null, b: null }
  if (scored.length === 1) return { a: scored[0].attemptId, b: null }
  const b = scored[0]
  const parent = b.parentAttemptId ? scored.find((l) => l.attemptId === b.parentAttemptId) : undefined
  const a = parent ?? scored[1]
  return { a: a.attemptId, b: b.attemptId }
}

/** 점을 눌렀을 때 슬롯 규칙: 지금 슬롯에 넣고 슬롯이 넘어간다. 반대쪽과 같은 응시는 무시한다 */
export function assignSlot(sel: { a: string | null; b: string | null }, slot: 'a' | 'b', id: string): { sel: { a: string | null; b: string | null }; slot: 'a' | 'b' } {
  const other = slot === 'a' ? sel.b : sel.a
  if (other === id) return { sel, slot }
  return { sel: { ...sel, [slot]: id }, slot: slot === 'a' ? 'b' : 'a' }
}

/**
 * 주소의 a·b 를 실제로 고를 수 있는 응시(채점된 갈래)와 맞춘다.
 * 둘 다 맞으면 그대로. 하나만 맞으면 나머지를 기본 규칙으로 채우고(B 가 있으면 A = 부모 또는 그다음 최근, A 만 있으면 B = 가장 최근 다른 응시), 둘 다 아니면 pickDefaults.
 */
export function resolveSelection(lanes: TreeLane[], qa: string | null, qb: string | null): { a: string | null; b: string | null } {
  const scored = lanes.filter((l) => l.score).sort((x, y) => y.startedAt.localeCompare(x.startedAt))
  const ok = (id: string | null) => (id && scored.some((l) => l.attemptId === id) ? id : null)
  const a0 = ok(qa)
  const b0 = ok(qb)
  if (a0 && b0 && a0 !== b0) return { a: a0, b: b0 }
  if (b0) {
    const others = scored.filter((l) => l.attemptId !== b0)
    if (others.length === 0) return { a: b0, b: null }
    const parentId = lanes.find((l) => l.attemptId === b0)?.parentAttemptId
    return { a: others.find((l) => l.attemptId === parentId)?.attemptId ?? others[0].attemptId, b: b0 }
  }
  if (a0) {
    const other = scored.find((l) => l.attemptId !== a0)
    return { a: a0, b: other?.attemptId ?? null }
  }
  return pickDefaults(lanes)
}
