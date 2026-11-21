// 복기 화면 데이터 불러오기 (DESIGN.md §7-5 데이터)
import { api, type Checkpoint, type TreeNode } from '../api'

/**
 * 한 과제의 복기 트리를 모은다. 가장 최근 응시로 트리를 부르고, 그 결과에 없는 같은 과제 응시가 남아 있으면
 * 그 응시로 또 부른다(뿌리가 여러 개면 트리가 여러 개). attemptIdsNewestFirst 는 최근 것부터.
 */
export async function loadTaskTrees(attemptIdsNewestFirst: string[]): Promise<TreeNode[]> {
  const covered = new Set<string>()
  const nodes: TreeNode[] = []
  for (const id of attemptIdsNewestFirst) {
    if (covered.has(id)) continue
    const tree = await api.replayTree(id)
    for (const n of tree) {
      covered.add(n.attemptId)
      nodes.push(n)
    }
    covered.add(id)
  }
  return nodes
}

/**
 * 갈래(응시)마다 체크포인트(질문 시점)를 모은다. 갈래 선 위의 점을 찍는 데 쓴다.
 * 한 갈래를 못 불러와도 화면 전체를 막지 않고 그 갈래의 점만 빠진다.
 */
export async function loadCheckpoints(attemptIds: string[]): Promise<Record<string, Checkpoint[]>> {
  const entries = await Promise.all(attemptIds.map(async (id) => [id, await api.checkpoints(id).catch((): Checkpoint[] => [])] as const))
  return Object.fromEntries(entries)
}
