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

const enc = encodeURIComponent
export const taskGenApi = {
  start: (req: TaskGenRequest) => call<{ jobId: string }>('POST', '/api/admin/task-gen', req),
  job: (jobId: string) => call<TaskGenJob>('GET', `/api/admin/task-gen/${enc(jobId)}`),
}

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
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export const allChecksOk = (job: Pick<TaskGenJob, 'checks'>) => job.checks.every((c) => c.ok)

/** 폼 입력 검사. 오류가 없으면 빈 객체 */
export function validateForm(f: Pick<TaskGenRequest, 'track' | 'jobRole' | 'topic' | 'trap'>): Partial<Record<'track' | 'jobRole' | 'topic' | 'trap', string>> {
  const e: Partial<Record<'track' | 'jobRole' | 'topic' | 'trap', string>> = {}
  if (f.track === 'BIZ') e.track = '비개발 과제는 준비 중이에요. 개발을 고르세요.'
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
