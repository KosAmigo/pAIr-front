import type { AttemptStatus, TreeNode } from '../api.ts'

/** 세로 git 그래프의 한 줄: 응시 하나 (DESIGN.md §6.13) */
export type TreeRow = {
  attemptId: string
  /** 레인 번호. 뿌리는 0, 갈라질수록 오른쪽 */
  depth: number
  /** 분기 색 번호 (1 = main). branch-1 … branch-5 를 돌려 쓴다 */
  branch: number
  /** main, b2, b3 … */
  label: string
  parentAttemptId: string | null
  forkedAtTurn: number | null
  status: AttemptStatus
  startedAt: string
  /** 뿌리에서 이 줄까지의 줄기 (자기 자신 포함). 이 줄을 지나는 레인들의 색을 정한다 */
  path: { attemptId: string; depth: number; branch: number }[]
}

export const BRANCH_COLORS = 5

/** 분기 번호(1부터)를 색 번호(1~5)로 */
export function branchColor(branch: number): number {
  return ((branch - 1) % BRANCH_COLORS) + 1
}

/**
 * 서버가 준 평평한 목록(부모 ID 포함)을 위에서 아래로 그릴 순서로 편다.
 * 부모 바로 아래에 자식들이 오고(시작 시각 순), 자식의 자식도 그 아래에 이어진다.
 * 분기 번호는 그려지는 순서대로 매겨 main, b2, b3 … 가 된다.
 */
export function layoutTree(nodes: TreeNode[]): TreeRow[] {
  const byParent = new Map<string | null, TreeNode[]>()
  for (const n of nodes) {
    const list = byParent.get(n.parentAttemptId) ?? []
    list.push(n)
    byParent.set(n.parentAttemptId, list)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  const rows: TreeRow[] = []
  const walk = (node: TreeNode, depth: number, parentPath: TreeRow['path']) => {
    const branch = rows.length + 1
    const path = [...parentPath, { attemptId: node.attemptId, depth, branch }]
    rows.push({
      attemptId: node.attemptId,
      depth,
      branch,
      label: branch === 1 ? 'main' : `b${branch}`,
      parentAttemptId: node.parentAttemptId,
      forkedAtTurn: node.forkedAtTurn,
      status: node.status,
      startedAt: node.startedAt,
      path,
    })
    for (const child of byParent.get(node.attemptId) ?? []) walk(child, depth + 1, path)
  }
  for (const root of byParent.get(null) ?? []) walk(root, 0, [])
  return rows
}

/** 뿌리에서 현재 응시까지에 해당하는 줄인지 (그래프에서 선택된 줄기를 밝게 그릴 때) */
export function onPathTo(rows: TreeRow[], currentId: string): Set<string> {
  const byId = new Map(rows.map((r) => [r.attemptId, r]))
  const out = new Set<string>()
  for (let r = byId.get(currentId); r; r = r.parentAttemptId ? byId.get(r.parentAttemptId) : undefined) out.add(r.attemptId)
  return out
}
