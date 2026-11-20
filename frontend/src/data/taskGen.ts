// AI 과제 만들기 (DESIGN.md §7-9-2, pAIr-docs 설계/AI_과제_생성_설계.md 8장 API).
// 백엔드 응답 모양은 이 파일 한 곳에만 둔다. 모양이 달라지면 여기만 고친다.
import { ApiError, call } from '../api.ts'

export type GenTrack = 'DEV' | 'BIZ'
export type GenDifficulty = '초급' | '중급' | '고급'
/** SELF = 공개 문제(자가진단), LIVE = 비공개 문제(실전 시험) */
export type GenUsage = 'SELF' | 'LIVE'
export type GenMinutes = 40 | 60

export type TaskGenRequest = {
  track: GenTrack
  jobRole: string
  difficulty: GenDifficulty
  topic: string
  trap: string
  usage: GenUsage
  minutes: GenMinutes
}

export type GenStep = '생성 중' | '확인 중' | '다시 생성 중' | '저장 중'
export type GenCheck = { name: string; ok: boolean; detail: string }
export type TaskGenJob = {
  status: 'RUNNING' | 'DONE' | 'FAILED'
  step: GenStep | null
  taskCode: string | null
  checks: GenCheck[]
  error: string | null
}

/** AI 추천 카드 하나 (POST /api/admin/task-gen/suggestions, 한 번에 3개) */
export type Suggestion = {
  jobRole: string
  difficulty: GenDifficulty
  topic: string
  trap: string
  /** 함정 종류 (예: 경계값, 중복 적용). 칩으로 보여 준다 */
  trapType: string
  /** 왜 좋은 문제인지 한두 문장 */
  why: string
}
export type SuggestRequest = { track: GenTrack; jobRole?: string; difficulty?: GenDifficulty; exclude?: string[] }

/** 과제 콘솔 상세에 보이는 생성 기록 (_gen/report.json, 백엔드 TaskGenerator.GenReport) */
export type GenReport = {
  model: string
  attempts: number
  seconds: number
  inputTokens?: number
  outputTokens?: number
  passed?: boolean
  form?: Partial<TaskGenRequest> | null
  checks: GenCheck[]
  retryError?: string | null
  details?: Record<string, unknown> | null
}

const enc = encodeURIComponent
export const taskGenApi = {
  start: (req: TaskGenRequest) => call<{ jobId: string }>('POST', '/api/admin/task-gen', req),
  job: (jobId: string) => call<TaskGenJob>('GET', `/api/admin/task-gen/${enc(jobId)}`),
  suggest: (req: SuggestRequest) => call<{ suggestions: Suggestion[] }>('POST', '/api/admin/task-gen/suggestions', req),
  report: (code: string) => call<GenReport>('GET', `/api/admin/tasks/${enc(code)}/gen-report`),
}

// ── AI 추천 ─────────────────────────────────

/** 추천 요청: 직군은 꼭, 직무·난이도는 적어 둔 것이 있으면 같이, 이미 받은 주제는 빼 달라고 */
export function suggestRequest(f: Pick<TaskGenRequest, 'track' | 'jobRole' | 'difficulty'>, exclude: string[] = [], withDifficulty = false): SuggestRequest {
  const req: SuggestRequest = { track: f.track }
  if (f.jobRole.trim()) req.jobRole = f.jobRole.trim()
  if (withDifficulty) req.difficulty = f.difficulty
  if (exclude.length) req.exclude = exclude
  return req
}

/** 추천을 고르면 채워지는 칸 (화면에서 차례로 반짝인다) */
export const FILL_FIELDS = ['jobRole', 'difficulty', 'topic', 'trap'] as const
export type FillField = (typeof FILL_FIELDS)[number]
export const FILL_LABEL: Record<FillField, string> = { jobRole: '직무', difficulty: '난이도', topic: '주제', trap: '함정' }

/** 이미 직접 적어 둔 칸 중 추천과 내용이 다른 칸. 있으면 덮어쓰기 전에 한 번 묻는다 (난이도는 늘 값이 있어 묻지 않는다) */
export function overwriteConflicts(f: Pick<TaskGenRequest, 'jobRole' | 'topic' | 'trap'>, s: Suggestion): FillField[] {
  return (['jobRole', 'topic', 'trap'] as const).filter((k) => f[k].trim() !== '' && f[k].trim() !== s[k].trim())
}

/** 추천 내용을 폼에 넣는다. 직군·용도·시간은 그대로 둔다 */
export function applySuggestion<F extends Pick<TaskGenRequest, FillField>>(f: F, s: Suggestion): F {
  return { ...f, jobRole: s.jobRole, difficulty: s.difficulty, topic: s.topic, trap: s.trap }
}

/** "다시 추천" 때 뺄 주제: 앞서 받은 주제를 쌓되 중복은 없애고 최근 maxKeep 개만 */
export function nextExclude(prev: string[], got: Pick<Suggestion, 'topic'>[], maxKeep = 15): string[] {
  const all = [...prev, ...got.map((s) => s.topic.trim())].filter(Boolean)
  return [...new Set(all.reverse())].reverse().slice(-maxKeep)
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

export const allChecksOk = (job: Pick<TaskGenJob, 'checks'>) => job.checks.every((c) => c.ok)

/** 폼 입력 검사. 오류가 없으면 빈 객체 */
export function validateForm(
  f: Pick<TaskGenRequest, 'jobRole' | 'topic' | 'trap'> & { track: GenTrack | null },
): Partial<Record<'track' | 'jobRole' | 'topic' | 'trap', string>> {
  const e: Partial<Record<'track' | 'jobRole' | 'topic' | 'trap', string>> = {}
  if (!f.track) e.track = '직군을 고르세요'
  if (!f.jobRole.trim()) e.jobRole = '직무를 입력하세요'
  if (!f.topic.trim()) e.topic = '주제를 입력하세요'
  if (!f.trap.trim()) e.trap = '함정을 입력하세요'
  return e
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
      if (job.status !== 'RUNNING') return job
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
