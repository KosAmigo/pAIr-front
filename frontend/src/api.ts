// 백엔드(backend/, Spring Boot) API 호출. vite 개발 서버가 /api 를 localhost:8180 으로 넘긴다.

export type TaskType = 'dev' | 'biz'

export type Task = {
  id: string
  type: TaskType
  title: string
  minutes: number
  description: string[]
  requirements: string[]
  notes: string[]
  followUps: string[]
  openFile: string
  editableFile: string | null
}

export type AttemptStatus = 'SOLVING' | 'FOLLOWUP' | 'SCORING' | 'DONE' | 'ERROR'

export type Attempt = {
  id: string
  taskId: string
  provider: string
  model: string
  startedAt: string
  submittedAt: string | null
  status: AttemptStatus
  error: string | null
}

export type Turn = { turn: number; role: 'user' | 'ai'; time: string; text: string }

export type AttemptView = {
  attempt: Attempt
  task: Task
  files: string[]
  turns: Turn[]
  elapsedSeconds: number
  chatMaxChars?: number
}

export type CompileDiagnostic = { file: string; line: number; column: number; severity: 'error' | 'warning'; message: string }

export type RunResult = {
  compiled: boolean
  lines: string[]
  passed: number
  failed: number
  diagnostics?: CompileDiagnostic[]
  millis: number
}

export type BuildResult = { compiled: boolean; lines: string[]; diagnostics: CompileDiagnostic[]; millis: number }

/** 감점표의 체크 항목 하나 (docs/evaluation/채점_기준표.md) */
export type CheckResult = {
  code: string
  label: string
  method: 'AUTO' | 'JUDGE'
  points: number
  deducted: number
  /** DEDUCTED 감점, PASSED 통과, SKIPPED 적용 안 함, NO_EVIDENCE 걸렸지만 근거가 없어 감점 안 함, SPLIT 두 채점 모델 판정이 엇갈려 감점 안 함 */
  status: 'DEDUCTED' | 'PASSED' | 'SKIPPED' | 'NO_EVIDENCE' | 'SPLIT'
  evidence: string[]
  reason: string | null
  /** 이중 채점에서 채점 모델별 판정 (이전 리포트에는 없음) */
  judges?: JudgeView[]
}

export type JudgeView = { judge: string; model: string; violated: boolean; count: number; evidence: string[]; reason: string }

export type ReportItem = { key: string; name: string; max: number; score: number; checks: CheckResult[] }

export type Report = {
  /** 2 = 감점식. 그 아래는 이전 형식이라 다시 채점해야 한다. */
  version?: number
  total: number
  max: number
  attemptId: string
  taskId: string
  taskTitle: string
  taskType: TaskType
  assistant: string
  judgeModel: string
  startedAt: string
  submittedAt: string
  durationSec: number | null
  chatTurns: number
  firstValidMinutes: number | null
  items: ReportItem[]
  notes: string[]
  hiddenTests?: { name: string; passed: boolean }[]
  r2KeyTurns?: { turn: number; adoption: number; verdicts: { replay: number; same: boolean; reason: string }[] }[]
  /** judge_claude, judge_openai 는 model, cachedInput 도 있음 */
  tokens: Record<string, { input: number; output: number; model?: string; cachedInput?: number }>
  transcript: Turn[]
}

export type ReportResponse = { status: AttemptStatus; error: string | null; report: Report | null }

export class ApiError extends Error {}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('백엔드에 연결할 수 없습니다. backend 서버(포트 8180)가 켜져 있는지 확인하세요.')
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(data?.message ?? `요청 실패 (${res.status})`)
  return data as T
}

const enc = encodeURIComponent

export type AttemptSummary = {
  id: string
  taskId: string
  taskTitle: string
  taskType: TaskType
  startedAt: string
  status: AttemptStatus
  total?: number | null
  legacyReport?: boolean
}

export const api = {
  list: () => call<AttemptSummary[]>('GET', '/api/attempts'),
  taskIdFor: (track: TaskType) => (track === 'biz' ? 'pricing-plan' : 'order-deadlock'),
  start: (taskId: string) => call<{ attemptId: string }>('POST', '/api/attempts', { taskId }),
  attempt: (id: string) => call<AttemptView>('GET', `/api/attempts/${enc(id)}`),
  file: (id: string, path: string) => call<{ path: string; content: string }>('GET', `/api/attempts/${enc(id)}/file?path=${enc(path)}`),
  save: (id: string, path: string, content: string) => call<{ saved: boolean }>('PUT', `/api/attempts/${enc(id)}/file?path=${enc(path)}`, { content }),
  build: (id: string) => call<BuildResult>('POST', `/api/attempts/${enc(id)}/build`),
  run: (id: string) => call<RunResult>('POST', `/api/attempts/${enc(id)}/run`),
  chat: (id: string, message: string) => call<Turn[]>('POST', `/api/attempts/${enc(id)}/chat`, { message }),
  submit: (id: string) => call<Attempt>('POST', `/api/attempts/${enc(id)}/submit`),
  followUps: (id: string, answers: string[]) => call<Attempt>('POST', `/api/attempts/${enc(id)}/followups`, { answers }),
  rescore: (id: string) => call<Attempt>('POST', `/api/attempts/${enc(id)}/rescore`),
  report: (id: string) => call<ReportResponse>('GET', `/api/attempts/${enc(id)}/report`),
}

/** 실제 응시 ID인지 (목업 ID 'a-1107' 등과 구분) */
export const isRealAttempt = (id: string | undefined) => !!id && id.startsWith('att-')
