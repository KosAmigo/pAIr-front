// 감독 오탐률 측정 (포트폴리오: 오탐률을 숫자로).
// 정상 응시(부정행위 없음)를 조건별로 N분씩 하면서 뜬 경고는 모두 오탐이다.
// 측정 1회 = FpRun. 같은 조건·같은 기준값끼리 묶어 분당 오탐 수를 낸다. 기준값(thresholds)을 바꾸면 버전이 달라져 전후를 비교한다.

export type Lighting = 'bright' | 'normal' | 'dim' | 'backlit'
export type Angle = 'front' | 'high' | 'low' | 'side'
export type Eyewear = 'none' | 'glasses' | 'sunglasses'

export type FpCondition = { lighting: Lighting; angle: Angle; eyewear: Eyewear }

export type FpRun = {
  id: string
  at: string
  condition: FpCondition
  /** 실제 감시한 시간 (보정 3초 제외) */
  durationSec: number
  /** 규칙 이름(kind) → 경고 수 */
  counts: Record<string, number>
  /** 측정할 때 쓴 기준값 묶음의 짧은 이름 (thresholdsVersion) */
  version: string
  note?: string
}

export const LIGHTING_LABEL: Record<Lighting, string> = { bright: '밝음', normal: '보통', dim: '어두움', backlit: '역광' }
export const ANGLE_LABEL: Record<Angle, string> = { front: '정면', high: '위에서', low: '아래에서', side: '옆에서' }
export const EYEWEAR_LABEL: Record<Eyewear, string> = { none: '없음', glasses: '안경', sunglasses: '선글라스' }

export const conditionKey = (c: FpCondition) => `${c.lighting}/${c.angle}/${c.eyewear}`
export const conditionLabel = (c: FpCondition) => `${LIGHTING_LABEL[c.lighting]} · ${ANGLE_LABEL[c.angle]} · 안경 ${EYEWEAR_LABEL[c.eyewear]}`

/** 기준값 묶음 → 짧은 버전 이름 (같은 값이면 같은 이름). 기준값을 고치면 이름이 바뀐다 */
export function thresholdsVersion(t: Record<string, number>): string {
  const text = Object.keys(t).sort().map((k) => `${k}=${t[k]}`).join(';')
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `v-${(h >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`
}

export const totalOf = (r: FpRun) => Object.values(r.counts).reduce((a, b) => a + b, 0)

export type FpRow = {
  version: string
  condition: FpCondition
  runs: number
  minutes: number
  falsePositives: number
  /** 분당 오탐 수 (반올림 셋째 자리) */
  perMinute: number
  /** 규칙별 분당 오탐 수 */
  byRule: Record<string, number>
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** 같은 기준값 버전 + 같은 조건끼리 합친다. 감시 시간이 0 인 측정은 뺀다 */
export function summarize(runs: FpRun[]): FpRow[] {
  const groups = new Map<string, FpRun[]>()
  for (const r of runs) {
    if (r.durationSec <= 0) continue
    const key = `${r.version}|${conditionKey(r.condition)}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const rows: FpRow[] = []
  for (const list of groups.values()) {
    const minutes = list.reduce((n, r) => n + r.durationSec, 0) / 60
    const byRuleCount: Record<string, number> = {}
    for (const r of list) for (const [k, v] of Object.entries(r.counts)) byRuleCount[k] = (byRuleCount[k] ?? 0) + v
    const fp = Object.values(byRuleCount).reduce((a, b) => a + b, 0)
    rows.push({
      version: list[0].version,
      condition: list[0].condition,
      runs: list.length,
      minutes: round3(minutes),
      falsePositives: fp,
      perMinute: round3(fp / minutes),
      byRule: Object.fromEntries(Object.entries(byRuleCount).map(([k, v]) => [k, round3(v / minutes)])),
    })
  }
  return rows.sort((a, b) => a.version.localeCompare(b.version) || conditionKey(a.condition).localeCompare(conditionKey(b.condition)))
}

/** 측정 기록 CSV (엑셀에서 열리도록 BOM). 수식으로 읽힐 수 있는 메모 칸은 ' 를 붙인다 */
export function runsCsv(runs: FpRun[], rules: string[]): string {
  const cell = (v: string | number) => {
    let s = String(v)
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['측정 시각', '기준값', '조명', '각도', '안경', '감시(초)', '오탐 합계', ...rules, '메모']
  const lines = runs.map((r) =>
    [r.at, r.version, LIGHTING_LABEL[r.condition.lighting], ANGLE_LABEL[r.condition.angle], EYEWEAR_LABEL[r.condition.eyewear],
      r.durationSec, totalOf(r), ...rules.map((k) => r.counts[k] ?? 0), r.note ?? ''].map(cell).join(','),
  )
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n'
}
