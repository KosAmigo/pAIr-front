import type { AttemptCompare, CheckSide, ItemDiff } from '../api.ts'

// DESIGN.md §7-5 점수 계단: A 점수에서 출발해 바뀐 체크 하나마다 오르내리며 B 점수에 닿는다.

export type ScoreStep = {
  kind: 'up' | 'down' | 'rest'
  code: string
  label: string
  itemKey: string
  itemName: string
  /** 이 줄로 점수가 변한 양 (오르면 +, 깎이면 −) */
  delta: number
  /** 이 줄 직전과 직후의 누적 점수 */
  from: number
  to: number
  a: CheckSide | null
  b: CheckSide | null
}

export type ScoreSteps = {
  totalA: number
  totalB: number
  steps: ScoreStep[]
  /** 계단 합이 B − A 와 달라서 "기타 차이" 줄로 맞춘 양 (0 이면 줄이 없다) */
  rest: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * 비교 결과와 두 총점으로 계단 줄을 만든다.
 * 줄 = 감점이 달라진 체크(변화량 = A 감점 − B 감점, 한쪽에 없으면 0). 오른 줄을 큰 것부터, 그다음 깎인 줄을 큰 것부터.
 * 상태만 바뀌고 감점은 같은 체크는 점수가 안 움직이므로 줄로 만들지 않는다.
 * 계단 합이 B − A 와 다르면(항목 점수 바닥 등) 마지막에 "기타 차이" 줄을 붙여 B 점수에 정확히 닿게 한다.
 */
export function buildScoreSteps(compare: AttemptCompare, totalA: number, totalB: number): ScoreSteps {
  const raw: Omit<ScoreStep, 'from' | 'to'>[] = []
  for (const it of compare.items) {
    for (const c of it.checks) {
      if (!c.changed) continue
      const delta = round1((c.a?.deducted ?? 0) - (c.b?.deducted ?? 0))
      if (delta === 0) continue
      raw.push({ kind: delta > 0 ? 'up' : 'down', code: c.code, label: c.label, itemKey: it.key, itemName: it.name, delta, a: c.a, b: c.b })
    }
  }
  raw.sort((x, y) => (x.kind === y.kind ? Math.abs(y.delta) - Math.abs(x.delta) : x.kind === 'up' ? -1 : 1))
  let run = totalA
  const steps: ScoreStep[] = raw.map((s) => {
    const from = run
    run = round1(run + s.delta)
    return { ...s, from, to: run }
  })
  const rest = round1(totalB - run)
  if (rest !== 0) {
    steps.push({ kind: 'rest', code: 'REST', label: '기타 차이', itemKey: '', itemName: '', delta: rest, from: run, to: totalB, a: null, b: null })
  }
  return { totalA, totalB, steps, rest }
}

export type ItemChange = { key: string; name: string; max: number; a: number | null; b: number | null; diff: number }

/** 항목별 점수 차이(B − A). 한쪽 점수가 없으면 0. 차이가 큰 항목이 위로 */
export function itemChanges(items: ItemDiff[]): ItemChange[] {
  return items
    .map((it) => ({ key: it.key, name: it.name, max: it.max, a: it.a, b: it.b, diff: it.a != null && it.b != null ? round1(it.b - it.a) : 0 }))
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
}

/** 가장 크게 오른(또는 깎인) 항목. 차이가 전부 0 이면 null */
export function biggestMover(changes: ItemChange[], delta: number): ItemChange | null {
  const pool = delta < 0 ? changes.filter((c) => c.diff < 0) : changes.filter((c) => c.diff > 0)
  if (pool.length === 0) return null
  return pool.reduce((best, c) => (Math.abs(c.diff) > Math.abs(best.diff) ? c : best))
}
