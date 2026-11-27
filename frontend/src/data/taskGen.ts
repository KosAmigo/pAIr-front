// 과제 만들기 (DESIGN.md §7-9-2, pAIr-docs 설계/AI_과제_생성_설계.md 8장 API).
// 백엔드 응답 모양은 이 파일 한 곳에만 둔다. 모양이 달라지면 여기만 고친다.
import { ApiError, call } from '../api.ts'

export type GenTrack = 'DEV' | 'BIZ'
/** SELF = 자가진단, LIVE = 실전 */
export type GenUsage = 'SELF' | 'LIVE'
export type GenMinutes = 20 | 40 | 60
export const GEN_MINUTES: GenMinutes[] = [20, 40, 60]
/** NOW = 바로 생성, BATCH = 배치(비용 약 절반, 마감 안에 끝남) */
export type GenMode = 'NOW' | 'BATCH'
/** 백엔드가 받는 마감(그 밖 값은 400). 화면에 보이는 선택지와 이름은 pages/console/task/formConsts.ts 의 DEADLINE_OPTIONS */
export type BatchHours = 3 | 6 | 12 | 24
export const DEFAULT_BATCH_HOURS: BatchHours = 3
/** 자동 생성 개수 범위 */
export const AUTO_COUNT_MIN = 1
export const AUTO_COUNT_MAX = 10

/** 생성 요청. 직무·난이도는 보내지 않는다 (난이도는 AI가 정한다) */
export type TaskGenRequest = {
  track: GenTrack
  topic: string
  trap: string
  usage: GenUsage
  minutes: GenMinutes
  /** 추천 카드를 골라 만들 때만. 직접 입력이면 보내지 않는다 */
  competencies?: string[]
  /** 바로(NOW)·배치(BATCH). 백엔드 기본은 NOW */
  mode?: GenMode
  /** 배치일 때만: 1/3/6시간 */
  batchDeadlineHours?: BatchHours
}

export type GenStep = '생성 중' | '확인 중' | '다시 생성 중' | '저장 중'
/** level 은 실패했을 때의 등급: warn = 재생성을 일으키지 않는 경고. 없으면(예전 기록) fail */
export type GenCheck = { name: string; ok: boolean; detail: string; level?: 'fail' | 'warn' }
export type CheckState = 'pass' | 'warn' | 'fail'
/** QUEUED 대기 → RUNNING → DONE / FAILED / CANCELED */
export type JobState = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELED'
export type TaskGenJob = {
  status: JobState
  /** 백엔드가 보내는 날 것의 단계 글 (예: '설계도 작성 중'). 화면에는 toGenStep / genDetail 을 거쳐 쓴다 */
  step: string | null
  /** DONE 이어도 false 면 확인에 실패한 채 저장된 것 */
  passed?: boolean | null
  taskCode: string | null
  checks: GenCheck[]
  error: string | null
  /** 아래는 작업 목록(jobs)·단건 조회가 주는 칸. 없을 수 있다 */
  mode?: GenMode | null
  /** 배치 마감 시각(ISO) */
  deadlineAt?: string | null
  /** QUEUED 일 때만, 1부터 */
  queuePosition?: number | null
  /** 배치 창구에서 답을 기다리는 중 (백엔드가 아직 안 줄 수도 있다) */
  waitingBatch?: boolean
  /** 만들 때 적은 함정·용도 (백엔드가 새로 붙인 칸, 없을 수 있다) */
  trap?: string | null
  usage?: GenUsage | null
  /** 지금까지(끝났으면 최종) 쓴 비용 USD. 단계가 바뀔 때 갱신되고, 배치 응답을 기다리는 동안은 멈춰 있다 */
  costUsd?: number | null
}

/** 작업 목록의 한 줄 (GET /api/admin/task-gen/jobs) */
export type JobRow = TaskGenJob & {
  jobId: string
  batchId?: string | null
  topic?: string | null
  track?: GenTrack | null
  minutes?: number | null
  createdAt?: string | null
}

/** 자동 생성의 주제 하나 (미리보기 응답, auto 요청의 topics) */
export type AutoTopic = { situation: string; trap: string; trapType: string; competencies: string[] }

/** 자동 생성 폼 */
export type AutoForm = { track: GenTrack; minutes: GenMinutes; usage: GenUsage; count: number; mode: GenMode; batchDeadlineHours: BatchHours }
export type AutoPreviewRequest = { track: GenTrack; minutes: GenMinutes; count: number; exclude?: string[] }
export type AutoRequest = AutoPreviewRequest & { usage: GenUsage; mode: GenMode; batchDeadlineHours?: BatchHours; topics?: AutoTopic[] }
export type AutoResponse = { batchId: string; jobIds: string[] }

/** AI 추천 카드 하나 (POST /api/admin/task-gen/suggestions, 한 번에 3개) */
export type Suggestion = {
  /** 문제 상황 한 줄 (고르면 "상황" 칸에 들어간다) */
  situation: string
  trap: string
  /** 함정 종류 (예: 경계값, 중복 적용). 칩으로 보여 준다 */
  trapType: string
  /** 건드리는 역량 key 1~2개 (data/dashboard.ts 의 STATS key) */
  competencies: string[]
  /** 왜 좋은 문제인지 한두 문장 ("자세히"에서만 보인다) */
  why: string
}
/** 입력한 주제를 AI 가 어떻게 이해했는지. ok=false 면 사용자에게 한 번 확인받는다 */
export type TopicCheck = { ok: boolean; understood: string; message?: string }
export type SuggestResponse = { topicCheck: TopicCheck | null; suggestions: Suggestion[] }
export type SuggestRequest = { track: GenTrack; topic?: string; exclude?: string[] }

/** 과제 콘솔 상세에 보이는 생성 기록 (_gen/report.json, 백엔드 TaskGenerator.GenReport) */
export type GenReport = {
  model: string
  attempts: number
  seconds: number
  inputTokens?: number
  outputTokens?: number
  passed?: boolean
  /** 예전 기록에는 jobRole·difficulty 가 남아 있을 수 있다 */
  form?: (Partial<TaskGenRequest> & { jobRole?: string; difficulty?: string }) | null
  checks: GenCheck[]
  retryError?: string | null
  /** stages = 모델 호출마다 한 줄(stage·model·via). 옛 기록에는 없다 */
  details?: ({ stages?: { stage?: string | null; model?: string | null; via?: string | null }[] | null } & Record<string, unknown>) | null
}

/** GET /api/admin/task-gen/{jobId}/content 응답. 칸이 없거나 null 이면 그 단계는 아직 안 나온 것 */
export type GenContent = {
  jobId?: string
  status?: JobState
  step?: string | null
  updatedAt?: string | null
  form?: { track?: GenTrack | null; topic?: string | null; trap?: string | null; usage?: GenUsage | null; minutes?: number | null; mode?: GenMode | null } | null
  blueprint?: {
    title?: string | null
    summary?: string | null
    scenario?: string | null
    category?: string | null
    competencies?: string[] | null
    api?: string[] | null
    examples?: { input: string; expected: string }[] | null
    flaws?: { what: string; where: string }[] | null
    judgments?: { question: string; options?: string[] | null }[] | null
    neededFiles?: string[] | null
    fillers?: { path: string; summary?: string | null; confusing?: boolean | null }[] | null
    docs?: { path: string; role?: string | null }[] | null
    questionPlan?: string[] | null
  } | null
  writing?: { description?: string[] | null; requirements?: string[] | null; notes?: string | null; documents?: { path: string; chars?: number | null }[] | null } | null
  code?: { files?: { path: string; chars?: number | null }[] | null } | null
  answer?: { hiddenTests?: { path: string; methods?: string[] | null }[] | null; wrongFixes?: number | null; altSolutions?: number | null } | null
  questions?: { seq?: number | null; type?: string | null; content?: string | null }[] | null
  fillers?: { files?: { path: string; chars?: number | null }[] | null } | null
}

/** 예상 비용 (GET /api/admin/task-gen/cost-estimate). HISTORY = 최근 끝난 작업 중앙값, DEFAULT = 기록이 적어 상한에서 어림한 값 */
export type CostEstimate = {
  track: GenTrack
  minutes: number
  mode: GenMode
  count: number
  perTaskUsd: number
  perTaskCapUsd: number
  totalUsd: number
  totalCapUsd: number
  sampleSize: number
  basis: 'HISTORY' | 'DEFAULT'
}
export type CostEstimateQuery = { track: GenTrack; minutes: GenMinutes; mode: GenMode; count: number }

/** $0.27 (1센트보다 작은 값은 $0.005 처럼 세 자리) */
export function fmtUsd(n: number): string {
  return `$${n < 0.01 && n > 0 ? n.toFixed(3) : n.toFixed(2)}`
}

/** 예상 비용 한 줄: "예상 약 $0.90 (과제당 $0.30 · 최대 $2.40)" */
export function estimateLine(e: CostEstimate): string {
  const base = `예상 약 ${fmtUsd(e.totalUsd)} (과제당 ${fmtUsd(e.perTaskUsd)} · 최대 ${fmtUsd(e.totalCapUsd)})`
  return e.basis === 'DEFAULT' ? `${base} · 기록이 적어 어림값` : base
}

/** 실제 비용 글: 실행 중이면 "지금까지 $0.12", 끝났으면 "$0.27", 값이 없으면 null */
export function costLabel(job: Pick<TaskGenJob, 'status' | 'costUsd'>): string | null {
  if (job.costUsd == null || !Number.isFinite(job.costUsd)) return null
  if (job.status === 'QUEUED') return null
  return job.status === 'RUNNING' ? `지금까지 ${fmtUsd(job.costUsd)}` : fmtUsd(job.costUsd)
}

/** 묶음 합계. 비용이 있는 작업이 하나도 없으면 null */
export function groupCost(jobs: Pick<TaskGenJob, 'costUsd'>[]): number | null {
  const known = jobs.filter((j) => j.costUsd != null && Number.isFinite(j.costUsd))
  return known.length ? known.reduce((n, j) => n + (j.costUsd as number), 0) : null
}

const enc = encodeURIComponent
export const taskGenApi = {
  costEstimate: (q: CostEstimateQuery) =>
    call<CostEstimate>('GET', `/api/admin/task-gen/cost-estimate?track=${q.track}&minutes=${q.minutes}&mode=${q.mode}&count=${q.count}`),
  start: (req: TaskGenRequest) => call<{ jobId: string }>('POST', '/api/admin/task-gen', req),
  preview: (req: AutoPreviewRequest) => call<AutoTopic[]>('POST', '/api/admin/task-gen/auto/preview', req),
  startAuto: (req: AutoRequest) => call<AutoResponse>('POST', '/api/admin/task-gen/auto', req),
  jobs: () => call<JobRow[]>('GET', '/api/admin/task-gen/jobs?active=true'),
  cancel: (jobId: string) => call<JobRow>('POST', `/api/admin/task-gen/${enc(jobId)}/cancel`),
  job: (jobId: string) => call<TaskGenJob>('GET', `/api/admin/task-gen/${enc(jobId)}`),
  /** 만들어지는 중·만들어진 내용 (단계가 안 끝났으면 그 칸은 null) */
  content: (jobId: string) => call<GenContent>('GET', `/api/admin/task-gen/${enc(jobId)}/content`),
  suggest: (req: SuggestRequest) => call<SuggestResponse>('POST', '/api/admin/task-gen/suggestions', req),
  report: (code: string) => call<GenReport>('GET', `/api/admin/tasks/${enc(code)}/gen-report`),
}

// ── AI 추천 ─────────────────────────────────

/** 추천 요청: 직군은 꼭, 주제는 적었을 때만, 이미 받은 상황은 빼 달라고 */
export function suggestRequest(f: { track: GenTrack; topic?: string }, exclude: string[] = []): SuggestRequest {
  const req: SuggestRequest = { track: f.track }
  if (f.topic?.trim()) req.topic = f.topic.trim()
  if (exclude.length) req.exclude = exclude
  return req
}

/** 추천을 고르면 채워지는 칸 (화면에서 차례로 반짝인다) */
export const FILL_FIELDS = ['topic', 'trap'] as const
export type FillField = (typeof FILL_FIELDS)[number]
export const FILL_LABEL: Record<FillField, string> = { topic: '상황', trap: '함정' }

/** 이미 직접 적어 둔 칸 중 추천과 내용이 다른 칸. 있으면 덮어쓰기 전에 한 번 묻는다 */
export function overwriteConflicts(f: Pick<TaskGenRequest, 'topic' | 'trap'>, s: Suggestion): FillField[] {
  const to: Record<FillField, string> = { topic: s.situation, trap: s.trap }
  return FILL_FIELDS.filter((k) => f[k].trim() !== '' && f[k].trim() !== to[k].trim())
}

/** 추천 내용을 폼에 넣는다. 직군·용도·시간은 그대로 둔다 */
export function applySuggestion<F extends Pick<TaskGenRequest, FillField>>(f: F, s: Suggestion): F {
  return { ...f, topic: s.situation, trap: s.trap }
}

/** "다시 추천" 때 뺄 상황: 앞서 받은 상황을 쌓되 중복은 없애고 최근 maxKeep 개만 */
export function nextExclude(prev: string[], got: Pick<Suggestion, 'situation'>[], maxKeep = 15): string[] {
  const all = [...prev, ...got.map((s) => s.situation.trim())].filter(Boolean)
  return [...new Set(all.reverse())].reverse().slice(-maxKeep)
}

// ── 직군별 추천 보관 (한 화면 안에서 직군을 바꿔도 그대로 남는다) ──

/** 한 직군에서 받은 추천과 고른 카드 */
export type TrackSuggest = {
  items: Suggestion[]
  topicCheck: TopicCheck | null
  /** 이 추천을 받을 때 적혀 있던 주제 (바뀌었는지 비교용) */
  askedTopic: string
  /** 주제 확인 박스에서 "이대로 보기"를 눌렀는지 */
  accepted: boolean
  /** 고른 카드의 situation */
  picked: string | null
  exclude: string[]
}
export type SuggestStore = Partial<Record<GenTrack, TrackSuggest>>

/** 주제가 처음 받을 때와 같고 목록이 있으면 "다시 추천"(exclude 이어 씀), 아니면 새로 받는다 */
export const isAgain = (t: TrackSuggest | undefined, topic: string): t is TrackSuggest => !!t && t.items.length > 0 && t.askedTopic === topic.trim()

/** 이번 요청에 실을 exclude */
export const excludeFor = (t: TrackSuggest | undefined, topic: string): string[] => (isAgain(t, topic) ? t.exclude : [])

/** 새로 받은 응답을 그 직군 칸에 넣는다. 같은 주제면 exclude 를 이어 쌓고, 주제가 바뀌었으면 목록을 새로 바꾼다 */
export function recordSuggestions(store: SuggestStore, track: GenTrack, topic: string, res: SuggestResponse): SuggestStore {
  const prev = store[track]
  const base = isAgain(prev, topic) ? prev.exclude : []
  const items = res.suggestions ?? []
  return {
    ...store,
    [track]: { items, topicCheck: res.topicCheck ?? null, askedTopic: topic.trim(), accepted: false, picked: null, exclude: nextExclude(base, items) },
  }
}

export function pickSuggestion(store: SuggestStore, track: GenTrack, situation: string): SuggestStore {
  const t = store[track]
  return t ? { ...store, [track]: { ...t, picked: situation } } : store
}

export function acceptTopicCheck(store: SuggestStore, track: GenTrack): SuggestStore {
  const t = store[track]
  return t ? { ...store, [track]: { ...t, accepted: true } } : store
}

/** 주제 확인 박스를 보여야 하는지: AI 가 주제를 다르게 이해했고(ok=false) 아직 이대로 보기를 안 눌렀을 때 */
export const needsTopicCheck = (t: TrackSuggest | undefined): boolean => !!t && t.topicCheck?.ok === false && !t.accepted

/** 카드로 보여 줄 목록: 확인 대기 중에는 숨긴다 */
export const visibleSuggestions = (t: TrackSuggest | undefined): Suggestion[] | null => (!t || needsTopicCheck(t) ? null : t.items)

/** 주제 확인 박스 문장: '{입력한 주제}'를 '{understood}'(으)로 이해했어요. {message} 이대로 볼까요? */
export function topicCheckText(topic: string, c: TopicCheck): string {
  return `'${topic.trim()}'를 '${c.understood}'(으)로 이해했어요. ${c.message ? c.message + ' ' : ''}이대로 볼까요?`
}

export function suggestErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return '추천을 너무 자주 받았어요(1분에 10번까지). 잠깐 뒤에 다시 눌러 주세요.'
    if (e.status === 503) return 'AI가 지금 추천을 만들지 못했어요. 잠시 후 다시 시도하거나 직접 적어 주세요.'
    if (e.status === 403) return '관리자만 추천을 받을 수 있어요.'
    if (e.status === 404) return '추천 기능이 아직 서버에 없어요. 백엔드를 최신으로 받거나 직접 적어 주세요.'
    if (e.status === 400) return `요청을 확인하세요. ${e.message}`
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

// ── 생성 진행 연출 ──────────────────────────

const BUILD_STEPS = new Set(['대기 중', '생성 중', '설계도 작성 중', '글 작성 중', '시작 코드 작성 중', '문항 글 작성 중', '정답 쪽 작성 중', '관련 적은 자료 작성 중'])

/**
 * 백엔드 단계 글 → 화면 4단계. 생성 단계(설계도·글·코드…)는 다시 만드는 중이면 '다시 생성 중', 아니면 '생성 중'.
 * 모르는 글은 직전 단계(prev)를 유지하고, 없으면 '생성 중'.
 */
export function toGenStep(raw: string | null, retried: boolean, prev: GenStep | null = null): GenStep {
  if (raw === null) return prev ?? '생성 중'
  if (raw === '다시 생성 중') return '다시 생성 중'
  if (BUILD_STEPS.has(raw)) return retried ? '다시 생성 중' : '생성 중'
  if (raw === '확인 중' || raw === '관문 검사 중') return '확인 중'
  if (raw === '저장 중' || raw === '완료') return '저장 중'
  return prev ?? '생성 중'
}

/** 화면에 작게 보여 줄 세부 단계 글 (생성기 내부 말을 사람 말로). 보여 줄 게 없으면 null */
export function genDetail(raw: string | null, track: GenTrack): string | null {
  if (!raw || raw === '완료' || raw === '다시 생성 중') return null
  switch (raw) {
    case '관련 적은 자료 작성 중':
      return '함께 둘 업무 자료 작성 중'
    case '관문 검사 중':
      return '품질 검사 중'
    case '정답 쪽 작성 중':
      return track === 'DEV' ? '정답과 숨은 테스트 작성 중' : '정답 작성 중'
    default:
      return raw
  }
}

/** 단계마다 지금 무엇을 하는지 쉬운 문장 */
export function stepNarration(step: GenStep | null, track: GenTrack): string {
  switch (step) {
    case '확인 중':
      return track === 'DEV' ? '만든 코드를 실제로 컴파일하고 테스트를 돌려 보고 있어요' : '정답을 다시 계산하고, 다른 AI에게 문제를 풀려 보고 있어요'
    case '다시 생성 중':
      return '확인에서 걸린 부분을 알려 주고 한 번 더 만들고 있어요'
    case '저장 중':
      return track === 'DEV' ? '시작 코드와 숨은 테스트를 검수 전 상태로 저장하고 있어요' : '자료 PDF와 문항을 검수 전 상태로 저장하고 있어요'
    default:
      return track === 'DEV' ? '설명, 시작 코드, 테스트를 쓰고 있어요' : '설명, 자료, 문항을 쓰고 있어요'
  }
}

/** 단계별 예상 길이(초). 진행 막대가 멈춰 보이지 않게 단계 안에서도 조금씩 찬다 */
const STEP_SECONDS: Record<GenStep, number> = { '생성 중': 30, '확인 중': 15, '다시 생성 중': 30, '저장 중': 5 }

/**
 * 진행 비율 0–1 (끝나기 전에는 최대 0.97). 지난 단계 몫 + 지금 단계 안에서 걸린 시간만큼.
 * stepElapsed: 지금 단계에 들어온 뒤 지난 초
 */
export function progressOf(step: GenStep | null, retried: boolean, stepElapsed: number): number {
  const steps = visibleSteps(retried)
  const cur = step ?? '생성 중'
  const at = Math.max(0, steps.indexOf(cur))
  const total = steps.reduce((n, s) => n + STEP_SECONDS[s], 0)
  const before = steps.slice(0, at).reduce((n, s) => n + STEP_SECONDS[s], 0)
  // 단계 안에서는 예상 시간의 90%까지만 차고 그 뒤로는 천천히 다가간다
  const len = STEP_SECONDS[cur]
  const inStep = len * 0.9 * (1 - Math.exp(-Math.max(0, stepElapsed) / len))
  return Math.min(0.97, (before + inStep) / total)
}

/** 진행 막대 값은 줄어들지 않는다 (다시 생성 단계가 끼어 전체 길이가 늘어도 뒤로 가지 않는다) */
export const advanceProgress = (old: number, next: number): number => Math.max(old, next)

/** 경과 시간 0:42 */
export const fmtElapsed = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`

/** 진행 표시에 보이는 단계. '다시 생성 중'은 확인에서 걸렸을 때만 끼어든다 */
export const STEPS: GenStep[] = ['생성 중', '확인 중', '다시 생성 중', '저장 중']

/** 지금까지 보여 줄 단계 목록: 다시 생성 중은 한 번이라도 거쳤을 때만 넣는다 */
export function visibleSteps(retried: boolean): GenStep[] {
  return retried ? STEPS : STEPS.filter((s) => s !== '다시 생성 중')
}

export type StepState = 'done' | 'active' | 'todo'
export function stepStates(current: GenStep | null, retried: boolean): { step: GenStep; state: StepState }[] {
  const steps = visibleSteps(retried)
  const at = current ? steps.indexOf(current) : 0
  return steps.map((step, i) => ({ step, state: i < at ? 'done' : i === at ? 'active' : 'todo' }))
}

/** 서버 오류를 알기 쉬운 문장으로 바꾼다 */
export function startErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return '지금 다른 과제를 만드는 중이에요. 잠시 후 다시 시도하세요.'
    if (e.status === 403) return '관리자만 과제를 만들 수 있어요. 관리자 계정으로 로그인했는지 확인하세요.'
    if (e.status === 400) return `입력을 확인하세요. ${e.message}`
    if (e.message.includes('공용 DB')) {
      return '서버가 공용 DB에 연결된 채 PDF를 이 PC(local 저장소)에만 저장하도록 설정돼 있어 만들 수 없어요. 백엔드 설정을 PAIR_TASKFILE_STORAGE=s3 로 바꾸거나, 로컬 DB로 서버를 켜고 다시 시도하세요.'
    }
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

/** 통과 / 경고(!ok 이고 level=warn) / 실패(그 외 !ok, level 없음 포함) */
export const checkState = (c: Pick<GenCheck, 'ok' | 'level'>): CheckState => (c.ok ? 'pass' : c.level === 'warn' ? 'warn' : 'fail')

/** 개수 집계. 경고는 실패에 넣지 않는다 */
export function countChecks(checks: Pick<GenCheck, 'ok' | 'level'>[]) {
  const n = { pass: 0, warn: 0, fail: 0 }
  for (const c of checks) n[checkState(c)]++
  return n
}

/** 실패가 없으면 true. 경고만 있어도 통과로 본다 */
export const allChecksOk = (job: Pick<TaskGenJob, 'checks'>) => countChecks(job.checks).fail === 0

/** 폼 입력 검사. 오류가 없으면 빈 객체 */
export function validateForm(
  f: Pick<TaskGenRequest, 'topic' | 'trap'> & { track: GenTrack | null },
): Partial<Record<'track' | 'topic' | 'trap', string>> {
  const e: Partial<Record<'track' | 'topic' | 'trap', string>> = {}
  if (!f.track) e.track = '직군을 고르세요'
  if (!f.topic.trim()) e.topic = '상황을 입력하세요'
  if (!f.trap.trim()) e.trap = '함정을 입력하세요'
  return e
}

/** 화면 폼에서 서버로 보낼 생성 요청을 만든다 (직무·난이도 없음) */
export function buildGenRequest(
  f: { track: GenTrack; topic: string; trap: string; usage: GenUsage; minutes: GenMinutes; mode?: GenMode; batchDeadlineHours?: BatchHours },
  competencies?: string[],
): TaskGenRequest {
  const req: TaskGenRequest = { track: f.track, topic: f.topic.trim(), trap: f.trap.trim(), usage: f.usage, minutes: f.minutes }
  if (competencies && competencies.length > 0) req.competencies = competencies
  if (f.mode) {
    req.mode = f.mode
    if (f.mode === 'BATCH') req.batchDeadlineHours = f.batchDeadlineHours ?? DEFAULT_BATCH_HOURS
  }
  return req
}

/** 고른 추천 카드의 역량. 상황·함정을 그대로 두었을 때만(직접 고쳤거나 직접 입력이면 없음) */
export function pickedCompetencies(f: Pick<TaskGenRequest, 'topic' | 'trap'>, t: TrackSuggest | undefined): string[] | undefined {
  const s = t?.picked ? t.items.find((i) => i.situation === t.picked) : undefined
  if (!s || f.topic.trim() !== s.situation.trim() || f.trap.trim() !== s.trap.trim()) return undefined
  return s.competencies
}

/**
 * 끝날 때까지 intervalMs 마다 상태를 조회한다. signal 이 취소되면(화면을 떠남) 조용히 멈춘다.
 * 조회가 한 번 실패해도 바로 포기하지 않고, 연속 maxErrors 번 실패하면 오류로 끝낸다.
 */
export async function pollJob(
  jobId: string,
  onUpdate: (job: TaskGenJob) => void,
  opts: { signal: AbortSignal; intervalMs?: number; maxErrors?: number; fetchJob?: (id: string) => Promise<TaskGenJob> },
): Promise<TaskGenJob> {
  const { signal, intervalMs = 2000, maxErrors = 3, fetchJob = taskGenApi.job } = opts
  let errors = 0
  for (;;) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    try {
      const job = await fetchJob(jobId)
      errors = 0
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      onUpdate(job)
      if (job.status !== 'RUNNING' && job.status !== 'QUEUED') return job
    } catch (e) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      if (++errors >= maxErrors) throw e
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, intervalMs)
      signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
    })
  }
}

// ── 자동 생성 (여러 개 한 번에) ──────────────

export const DEFAULT_AUTO: Omit<AutoForm, 'track'> = { minutes: 60, usage: 'SELF', count: AUTO_COUNT_MAX, mode: 'NOW', batchDeadlineHours: DEFAULT_BATCH_HOURS }

/** 개수 입력을 1~10 정수로 맞춘다. 숫자가 아니면 기본값(10) */
export function clampCount(v: unknown): number {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n)) return AUTO_COUNT_MAX
  return Math.min(AUTO_COUNT_MAX, Math.max(AUTO_COUNT_MIN, n))
}

/** 미리보기 요청. 받은 적 있는 상황은 exclude 로 빼 달라고 한다 */
export function previewRequest(f: AutoForm, exclude: string[] = []): AutoPreviewRequest {
  const req: AutoPreviewRequest = { track: f.track, minutes: f.minutes, count: clampCount(f.count) }
  if (exclude.length) req.exclude = exclude
  return req
}

/**
 * 만들기 요청. topics 가 있으면 개수는 topics 개수가 되고(백엔드 규칙), 없으면(건너뛰기) 서버가 고른다.
 * 마감 시간은 배치일 때만 보낸다.
 */
export function autoRequest(f: AutoForm, topics?: AutoTopic[] | null): AutoRequest {
  const req: AutoRequest = { track: f.track, minutes: f.minutes, count: topics?.length ? topics.length : clampCount(f.count), usage: f.usage, mode: f.mode }
  if (f.mode === 'BATCH') req.batchDeadlineHours = f.batchDeadlineHours
  if (topics?.length) req.topics = topics
  return req
}

/** 다시 받기 때 서버에 알릴 exclude: 지금까지 본 것 + 방금 받은 것(뺀 것 포함). 중복 없이 최근 maxKeep 개 */
export const rerollExclude = (seen: string[], shown: Pick<AutoTopic, 'situation'>[], maxKeep = 30) => nextExclude(seen, shown, maxKeep)

/** 카드 하나 빼기 (뺀 상황은 따로 seen 에 남겨 다시 받기 때 제외한다) */
export const removeTopic = (topics: AutoTopic[], situation: string): AutoTopic[] => topics.filter((t) => t.situation !== situation)

// ── 진행 목록 ───────────────────────────────

export type JobTone = 'wait' | 'run' | 'batch' | 'done' | 'warn' | 'fail' | 'cancel'
export type JobView = { tone: JobTone; label: string; sub: string | null; done: boolean }

/** ISO 시각 → 지금 PC 시간대의 HH:MM */
export function fmtClock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 완료 요약: 통과 n · 경고 n · 실패 n */
export function checkSummary(checks: Pick<GenCheck, 'ok' | 'level'>[]): string {
  const c = countChecks(checks)
  return `통과 ${c.pass} · 경고 ${c.warn} · 실패 ${c.fail}`
}

/** 작업 한 줄이 화면에 보일 글. 진행 단계는 toGenStep·genDetail 을 그대로 쓴다 */
export function jobView(j: JobRow): JobView {
  const deadline = fmtClock(j.deadlineAt)
  const batch = j.mode === 'BATCH'
  const checks = j.checks ?? []
  switch (j.status) {
    case 'QUEUED':
      return { tone: 'wait', label: j.queuePosition ? `대기 ${j.queuePosition}번째` : '대기 중', sub: batch && deadline ? `마감 ${deadline}` : null, done: false }
    case 'RUNNING': {
      if (j.waitingBatch) return { tone: 'batch', label: '배치 대기 중', sub: deadline ? `마감 ${deadline}` : null, done: false }
      const step = toGenStep(j.step, j.step === '다시 생성 중')
      const detail = genDetail(j.step, j.track ?? 'DEV')
      const sub = [detail && detail !== step ? detail : null, batch && deadline ? `마감 ${deadline}` : null].filter(Boolean).join(' · ')
      return { tone: 'run', label: step, sub: sub || null, done: false }
    }
    case 'DONE': {
      const c = countChecks(checks)
      const failed = j.passed === false || c.fail > 0
      return { tone: failed ? 'fail' : c.warn > 0 ? 'warn' : 'done', label: failed ? '완료 · 확인 실패' : '완료', sub: checks.length ? checkSummary(checks) : null, done: true }
    }
    case 'FAILED':
      return { tone: 'fail', label: '실패', sub: j.error ?? null, done: true }
    case 'CANCELED':
      return { tone: 'cancel', label: '취소됨', sub: null, done: true }
  }
}

/** 대기 중인 작업만 취소할 수 있다 */
export const canCancel = (j: Pick<JobRow, 'status'>): boolean => j.status === 'QUEUED'

export function cancelErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return '이미 시작했거나 끝나서 취소할 수 없어요.'
    if (e.status === 404) return '작업을 찾을 수 없어요. 목록을 새로 불러올게요.'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export type JobGroup = { key: string; batchId: string | null; jobs: JobRow[]; counts: Record<JobState, number> }

/** 묶음(batchId)별로 묶는다. 묶음 없는 작업(직접 만들기)은 하나씩. 새로 만든 묶음이 위로 온다 */
export function groupJobs(rows: JobRow[]): JobGroup[] {
  const at = (j: JobRow) => (j.createdAt ? Date.parse(j.createdAt) || 0 : 0)
  const map = new Map<string, JobRow[]>()
  for (const j of rows) {
    const key = j.batchId ? `b:${j.batchId}` : `j:${j.jobId}`
    map.set(key, [...(map.get(key) ?? []), j])
  }
  const groups = [...map.entries()].map(([key, jobs]) => {
    const sorted = [...jobs].sort((a, b) => at(a) - at(b))
    const counts: Record<JobState, number> = { QUEUED: 0, RUNNING: 0, DONE: 0, FAILED: 0, CANCELED: 0 }
    for (const j of sorted) counts[j.status]++
    return { key, batchId: sorted[0]?.batchId ?? null, jobs: sorted, counts }
  })
  return groups.sort((a, b) => Math.max(...b.jobs.map(at)) - Math.max(...a.jobs.map(at)))
}

/** 묶음 머리글: "5개 중 2개 끝남 · 진행 1 · 대기 2" */
export function groupSummary(g: Pick<JobGroup, 'jobs' | 'counts'>): string {
  const c = g.counts
  const ended = c.DONE + c.FAILED + c.CANCELED
  const parts = [`${g.jobs.length}개 중 ${ended}개 끝남`]
  if (c.RUNNING) parts.push(`진행 ${c.RUNNING}`)
  if (c.QUEUED) parts.push(`대기 ${c.QUEUED}`)
  if (c.FAILED) parts.push(`실패 ${c.FAILED}`)
  return parts.join(' · ')
}

/** 검수하러 갈 과제 콘솔 상세 주소 */
export const reviewHref = (taskCode: string): string => `/console/tasks/${encodeURIComponent(taskCode)}`
