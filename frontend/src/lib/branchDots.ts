import type { Checkpoint } from '../api.ts'

// 복기 갈래 트리(가로축 = 대화 턴)의 칸 계산과, 갈래 선 위에 찍을 질문 시점 점.

export const BASE_GAP = 72
const MAX_PLAIN_COLS = 12
const MIN_GAP = 44

/** 가로 칸 수: 마지막으로 갈라진 턴 뒤 두 칸, 가장 늦은 질문 시점 뒤 한 칸, 최소 6칸 */
export function stageCols(lastFork: number, maxCheckpointTurn: number): number {
  return Math.max(6, lastFork + 2, maxCheckpointTurn + 1)
}

/** 칸 사이 간격: 12칸까지는 그대로, 넘으면 줄이되 44 아래로는 줄이지 않는다(그래프가 넓어지면 가로로 스크롤) */
export function stageGap(cols: number): number {
  return cols > MAX_PLAIN_COLS ? Math.max(MIN_GAP, Math.round((BASE_GAP * MAX_PLAIN_COLS) / cols)) : BASE_GAP
}

/** 간격이 좁으면 턴 이름을 한 칸 건너 하나씩만 쓴다 (질문 턴은 홀수라 T01, T03, … 이 남는다) */
export function labelEvery(gap: number): number {
  return gap < 56 ? 2 : 1
}

/**
 * 갈래 선 위에 점을 찍을 체크포인트. 갈래가 직접 한 질문(시작 턴 이후)만, 턴 순으로.
 * 갈라져 나온 갈래는 앞 대화를 복사해 갔을 뿐 그 질문을 이 갈래에서 한 것이 아니다.
 */
export function laneDots(startTurn: number, checkpoints: Checkpoint[]): Checkpoint[] {
  return checkpoints.filter((c) => c.turnNo >= startTurn).sort((a, b) => a.turnNo - b.turnNo)
}

/** 모든 갈래의 체크포인트 중 가장 늦은 턴 */
export function maxCheckpointTurn(byLane: Record<string, Checkpoint[]>): number {
  return Math.max(0, ...Object.values(byLane).flatMap((list) => list.map((c) => c.turnNo)))
}

/**
 * 점을 놓을 가로 칸(턴 번호). 질문 1에서 갈라진 갈래는 선이 T02 칸에서 시작해서(부모 선에서 꺾여 내려오느라 한 칸이 필요하다)
 * 그 갈래의 첫 점이 선 밖에 뜨지 않게 T02 칸에 붙인다. 뿌리 갈래(부모 없음)는 T01 에서 시작하므로 그대로 둔다.
 */
export function dotColumn(startTurn: number, hasParent: boolean, turnNo: number): number {
  return hasParent && startTurn < 2 ? Math.max(turnNo, 2) : turnNo
}
