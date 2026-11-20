import type { CheckDiff, CheckSide, ItemDiff } from '../api.ts'

/** 감점표의 체크 상태를 응시자가 읽는 말로 */
export const STATUS_TEXT: Record<CheckSide['status'], string> = {
  DEDUCTED: '감점',
  PASSED: '통과',
  SKIPPED: '해당 없음',
  NO_EVIDENCE: '근거 부족',
  SPLIT: '판정 엇갈림',
}

export type ChangeKind = 'improved' | 'worsened' | 'changed'

/** B 가 A 보다 감점이 줄었으면 개선, 늘었으면 악화, 그 밖에 상태만 다르면 변경. 한쪽에만 있는 체크는 감점 0 으로 본다 */
export function changeKind(c: CheckDiff): ChangeKind {
  const a = c.a?.deducted ?? 0
  const b = c.b?.deducted ?? 0
  if (b < a) return 'improved'
  if (b > a) return 'worsened'
  return 'changed'
}

/** 한 풀이에서 체크 결과를 한 줄로: "감점 −3", "통과", 없으면 "없음" */
export function sideText(s: CheckSide | null): string {
  if (!s) return '없음'
  return s.deducted > 0 ? `${STATUS_TEXT[s.status]} −${s.deducted}` : STATUS_TEXT[s.status]
}

/** 점수가 달라진 항목, 또는 바뀐 체크가 있는 항목만. 바뀐 체크만 남기고 개선 → 악화 → 변경 순으로 (감점 변화가 큰 것부터) */
export function changedItems(items: ItemDiff[]): ItemDiff[] {
  const order: Record<ChangeKind, number> = { improved: 0, worsened: 1, changed: 2 }
  return items
    .map((it) => ({
      ...it,
      checks: it.checks
        .filter((c) => c.changed)
        .sort((x, y) => order[changeKind(x)] - order[changeKind(y)] || Math.abs((y.b?.deducted ?? 0) - (y.a?.deducted ?? 0)) - Math.abs((x.b?.deducted ?? 0) - (x.a?.deducted ?? 0))),
    }))
    .filter((it) => it.checks.length > 0 || (it.a != null && it.b != null && it.a !== it.b))
}
