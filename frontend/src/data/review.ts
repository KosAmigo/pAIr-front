// 복기 화면 데이터 불러오기 (DESIGN.md §7-5 데이터)
import { api, type TreeNode } from '../api'

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
