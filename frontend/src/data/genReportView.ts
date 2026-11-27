// 과제 검수 상세의 '생성 기록' 카드: gen-report 의 details.stages(호출마다 stage·model·via)를 단계 묶음별 모델·횟수로 줄인다.
// 응답 모양은 taskGen.ts 의 GenReport 한 곳에만 있고, 여기는 보여 줄 글만 만든다. details.stages 가 없는 옛 기록은 null 을 돌려 요약 숫자만 보인다.
import type { GenReport } from './taskGen.ts'

export type StageGroupKey = 'blueprint' | 'writing' | 'code' | 'questions' | 'answer' | 'fillers' | 'judge' | 'other'
export const GROUP_LABEL: Record<StageGroupKey, string> = { blueprint: '설계도', writing: '글', code: '코드', questions: '문항', answer: '정답', fillers: '자료', judge: '검사', other: '기타' }
const ORDER: StageGroupKey[] = ['blueprint', 'writing', 'code', 'questions', 'answer', 'fillers', 'judge', 'other']

/** 호출 하나의 단계 이름(한글 단계 글 또는 영어 이름) → 단계 묶음 */
export function stageGroup(stage: string | null | undefined): StageGroupKey {
  const s = (stage ?? '').toLowerCase()
  if (/설계|blueprint|design/.test(s)) return 'blueprint'
  if (/정답|answer|hidden|solution/.test(s)) return 'answer'
  if (/자료|filler|document|doc/.test(s)) return 'fillers'
  if (/문항|question/.test(s)) return 'questions'
  if (/코드|code|starter/.test(s)) return 'code'
  if (/검사|확인|judge|check|verify|review/.test(s)) return 'judge'
  if (/글|writ|desc/.test(s)) return 'writing'
  return 'other'
}

/** 모델 이름을 짧게: gpt-6.1-sol → sol, claude-sonnet-5-5 → sonnet */
export function shortModel(model: string | null | undefined): string {
  const m = (model ?? '').trim()
  if (!m) return '-'
  return m
    .replace(/^gpt-\d+(?:\.\d+)*-/i, '')
    .replace(/^claude-/i, '')
    .replace(/-\d.*$/, '')
}

export type StageRow = { key: StageGroupKey; label: string; models: string[]; calls: number; batch: number; now: number }
export type StageSummary = { rows: StageRow[]; batch: number; now: number; hasBatch: boolean }

type Call = { stage?: string | null; model?: string | null; via?: string | null }
const isBatch = (via: string | null | undefined) => /batch|배치/i.test(via ?? '')

/** 단계 묶음별 모델(중복 없이)·호출 수·배치/바로 호출 수. 직군에 맞게 코드/문항은 있는 것만 나온다. stages 가 없으면 null */
export function stageSummary(r: Pick<GenReport, 'details'>): StageSummary | null {
  const stages = r.details?.stages
  if (!Array.isArray(stages) || stages.length === 0) return null
  const map = new Map<StageGroupKey, StageRow>()
  let batch = 0
  let now = 0
  for (const c of stages as Call[]) {
    const key = stageGroup(c.stage)
    const row = map.get(key) ?? { key, label: GROUP_LABEL[key], models: [], calls: 0, batch: 0, now: 0 }
    const m = shortModel(c.model)
    if (m !== '-' && !row.models.includes(m)) row.models.push(m)
    row.calls++
    if (isBatch(c.via)) {
      row.batch++
      batch++
    } else {
      row.now++
      now++
    }
    map.set(key, row)
  }
  return { rows: ORDER.flatMap((k) => map.get(k) ?? []), batch, now, hasBatch: batch > 0 }
}

/** 한 줄 글: '설계도 sol · 글 sol · 자료 terra · 검사 sol/sonnet' */
export const modelLine = (s: StageSummary): string => s.rows.map((r) => `${r.label} ${r.models.join('/') || '-'}`).join(' · ')

/** 만든 횟수 줄: '설계도 1 · 글 2 …' (검사는 만든 게 아니라 빼고, 2번 이상 만든 단계는 redo=true) */
export const countRows = (s: StageSummary): { label: string; n: number; redo: boolean }[] => s.rows.filter((r) => r.key !== 'judge').map((r) => ({ label: r.label, n: r.calls, redo: r.calls > 1 }))
