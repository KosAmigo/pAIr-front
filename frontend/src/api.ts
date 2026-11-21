// 백엔드 API를 호출하고 로그인 중에는 bearer 토큰을 전달한다. Vite가 /api 요청을 Spring Boot로 넘긴다.
import { readAuthSession } from './auth/authApi.ts'
import type { QuestionResults } from './data/questions.ts'

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

/** 자가진단 과제 목록의 한 줄 (GET /api/tasks). CLOSED 는 목록에만 보이고 응시는 막힌다 */
export type TaskSummary = { id: string; type: TaskType; title: string; minutes: number; status: 'OPEN' | 'CLOSED' }

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

/** AI 답변 속 파일 수정 제안. status: PENDING 결정 전, APPLIED 적용, REJECTED 거절. applicable: 지금 파일에 적용할 수 있는지 */
export type EditProposal = {
  index: number
  path: string
  hunks: { search: string; replace: string }[]
  newFile: boolean
  status: 'PENDING' | 'APPLIED' | 'REJECTED'
  applicable: boolean
}

export type Turn = { turn: number; role: 'user' | 'ai'; time: string; text: string; edits?: EditProposal[] }

/** 복기 비교: 한 풀이에서 체크 하나의 결과. 그 풀이 리포트에 이 체크가 없으면 CheckDiff 의 a·b 가 null */
export type CheckSide = { status: CheckResult['status']; deducted: number; reason: string | null; evidence: string[] }
export type CheckDiff = { code: string; label: string; method: 'AUTO' | 'JUDGE'; points: number; a: CheckSide | null; b: CheckSide | null; changed: boolean }
export type ItemDiff = { key: string; name: string; max: number; a: number | null; b: number | null; checks: CheckDiff[] }
export type AttemptCompare = { a: string; b: string; items: ItemDiff[] }

/**
 * 복기 비교의 파일 하나: base 는 과제 원본, a·b 는 두 풀이의 최종 내용. 그 파일이 없으면 null
 * (base 가 null 이면 풀이에서 새로 만든 파일). 원본·A·B 가 모두 같은 파일은 오지 않는다.
 */
export type FileDiff = { path: string; base: string | null; a: string | null; b: string | null }

/** 복기: 질문 하나를 보낸 순간의 체크포인트 (질문마다 하나, 이름은 응시자가 붙인다) */
export type Checkpoint = { checkpointId: number; turnNo: number; label: string | null; createdAt: string }

/** 채점 점수. 채점이 끝난(DONE) 응시만 있다 */
export type ItemScore = { key: string; name: string; max: number; score: number | null }
export type TreeScore = { total: number; max: number; items: ItemScore[] }

/** 복기 트리의 응시 한 건. 뿌리(원래 응시)만 parentAttemptId 가 null. score 는 채점 전이거나 이전 형식 리포트면 null */
export type TreeNode = {
  attemptId: string
  parentAttemptId: string | null
  forkedAtTurn: number | null
  forkedFromCheckpointId: number | null
  status: AttemptStatus
  startedAt: string
  score: TreeScore | null
}

export type EditDecision = { status: 'APPLIED' | 'REJECTED'; path: string; content: string | null }

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

/** 감점표의 체크 항목 하나 (pAIr-docs/평가/채점_기준표.md) */
export type CheckResult = {
  code: string
  label: string
  method: 'AUTO' | 'JUDGE'
  points: number
  deducted: number
  /** DEDUCTED 감점, PASSED 통과, SKIPPED 적용 안 함, NO_EVIDENCE 걸렸지만 근거가 없어 감점 안 함, SPLIT 두 채점 모델 판정이 엇갈려 절반 감점 */
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
  /** 객관식·단답형 문항 점수. 6개 역량 100점과 따로 센다. 문항이 없는 과제나 예전 리포트는 없음/null */
  questions?: QuestionResults | null
  notes: string[]
  hiddenTests?: { name: string; passed: boolean }[]
  r2KeyTurns?: { turn: number; adoption: number; verdicts: { replay: number; same: boolean; reason: string }[] }[]
  /** judge_claude, judge_openai 는 model, cachedInput 도 있음 */
  tokens: Record<string, { input: number; output: number; model?: string; cachedInput?: number }>
  transcript: Turn[]
}

export type ReportResponse = { status: AttemptStatus; error: string | null; report: Report | null }

export class ApiError extends Error {
  /** HTTP 상태 코드 (네트워크 실패 등 응답이 없으면 없음) */
  status?: number
}

/**
 * 로그인 정보 헤더. 로그인 토큰이 있으면 Authorization: Bearer 로 보내고(백엔드 /api/auth 로그인),
 * 백엔드가 헤더 방식(HeaderCurrentUserResolver, pair.auth.mode=header)이어도 되도록 X-Pair-* 도 함께 보낸다.
 * AuthProvider 가 로그인 상태가 바뀔 때마다 setAuthHeaders 를 부른다.
 */
let authHeaders: Record<string, string> = {}
export function setAuthHeaders(user: { id: number; role: string; companyId?: number } | null) {
  authHeaders = user
    ? {
        'X-Pair-User-Id': String(user.id),
        'X-Pair-Role': user.role,
        ...(user.companyId != null ? { 'X-Pair-Company-Id': String(user.companyId) } : {}),
      }
    : {}
}
export function getAuthHeaders(): Record<string, string> {
  const token = readAuthSession()?.token
  return token ? { ...authHeaders, Authorization: `Bearer ${token}` } : authHeaders
}

export async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { ...getAuthHeaders(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('백엔드에 연결할 수 없습니다. backend 서버(포트 8180)가 켜져 있는지 확인하세요.')
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = new ApiError(data?.message ?? `요청 실패 (${res.status})`)
    err.status = res.status
    throw err
  }
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
  decideEdit: (id: string, turn: number, index: number, action: 'apply' | 'reject') =>
    call<EditDecision>('POST', `/api/attempts/${enc(id)}/edits`, { turn, index, action }),
  submit: (id: string) => call<Attempt>('POST', `/api/attempts/${enc(id)}/submit`),
  followUps: (id: string, answers: string[]) => call<Attempt>('POST', `/api/attempts/${enc(id)}/followups`, { answers }),
  rescore: (id: string) => call<Attempt>('POST', `/api/attempts/${enc(id)}/rescore`),
  report: (id: string) => call<ReportResponse>('GET', `/api/attempts/${enc(id)}/report`),
  checkpoints: (id: string) => call<Checkpoint[]>('GET', `/api/attempts/${enc(id)}/checkpoints`),
  replayTree: (id: string) => call<TreeNode[]>('GET', `/api/attempts/${enc(id)}/tree`),
  /** 과제 원본과 두 풀이의 최종 코드를 받는다. 원본·A·B 가 모두 같은 파일은 빠진다 (코드 변경 비교용, 내 풀이만) */
  compareFiles: (a: string, b: string) => call<FileDiff[]>('GET', `/api/attempts/${enc(a)}/compare/files?with=${enc(b)}`),
  /** 두 풀이의 감점 근거를 항목·체크별로 나란히 받는다 (채점이 끝난 내 풀이만) */
  compareAttempts: (a: string, b: string) => call<AttemptCompare>('GET', `/api/attempts/${enc(a)}/compare?with=${enc(b)}`),
  /** 체크포인트에서 갈라진 새 응시를 만든다 (크레딧 차감, 부족하면 402). 새 응시 ID 를 돌려준다 */
  rollback: (checkpointId: number) => call<{ attemptId: string }>('POST', `/api/checkpoints/${checkpointId}/rollback`),
  /** 체크포인트 이름 붙이기. 빈 문자열이면 이름을 지운다 */
  renameCheckpoint: (checkpointId: number, label: string) => call<Checkpoint>('PATCH', `/api/checkpoints/${checkpointId}`, { label }),
  /** 자가진단 과제 목록 (응시자용). 직군을 주면 그 직군만 */
  taskList: (track?: TaskType) => call<TaskSummary[]>('GET', `/api/tasks${track ? `?track=${track}` : ''}`),
  /** 과제 정의 (설명·요구사항 등 상세) */
  task: (taskId: string) => call<Task>('GET', `/api/tasks/${enc(taskId)}`),
}

/**
 * 채팅 스트리밍: 답변 글자가 오는 대로 onDelta 로 넘기고, 끝나면 저장된 새 턴 2개(질문, 답변)를 돌려준다.
 * 서버는 Server-Sent Events(delta, done, error)로 보낸다.
 */
export async function chatStream(id: string, message: string, onDelta: (t: string) => void): Promise<Turn[]> {
  let res: Response
  try {
    res = await fetch(`/api/attempts/${enc(id)}/chat/stream`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message }),
    })
  } catch {
    throw new ApiError('백엔드에 연결할 수 없습니다. backend 서버(포트 8180)가 켜져 있는지 확인하세요.')
  }
  if (!res.ok || !res.body) {
    const text = await res.text()
    let msg = `요청 실패 (${res.status})`
    try {
      msg = JSON.parse(text)?.message ?? msg
    } catch {
      // 본문이 JSON 이 아님
    }
    throw new ApiError(msg)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
    let cut: number
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut)
      buf = buf.slice(cut + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (!data.length) continue
      const raw = data.join('\n')
      if (event === 'error') {
        let payload: unknown
        try {
          payload = JSON.parse(raw)
        } catch {
          throw new ApiError(raw || 'AI 응답 중 오류가 발생했습니다.')
        }
        const message = typeof payload === 'string' ? payload
          : typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
            ? payload.message : 'AI 응답 중 오류가 발생했습니다.'
        throw new ApiError(message)
      }
      const payload = JSON.parse(raw)
      if (event === 'delta') onDelta(payload.t as string)
      else if (event === 'done') return payload as Turn[]
    }
  }
  throw new ApiError('AI 답변을 끝까지 받지 못했습니다. 다시 보내 주세요.')
}

// ── 채점 툴 (임시 기능) ─────────────────────

export type GraderCheckInfo = {
  key: string
  code: string
  item: string
  itemName: string
  track: 'all' | 'dev' | 'biz'
  method: 'AUTO' | 'JUDGE'
  label: string
  defaultPoints: number
  defaultHint: string | null
  pointsEditable: boolean
}

export type GraderRubric = {
  items: { key: string; name: string; max: number }[]
  checks: GraderCheckInfo[]
  defaults: { judgeRepeat: number; parallel: number }
}

export type PromptVersionRow = { id: string; name: string; note: string; createdAt: string; parent: string | null; active: boolean }

export type PromptVersion = {
  id: string
  name: string
  note: string
  createdAt: string
  parent: string | null
  judgeSystem: string
  checks: Record<string, { hint: string | null; points: number }>
}

export type GraderSource = 'sample' | 'mine'
export type GraderAttempt = {
  source: GraderSource
  id: string
  label: string | null
  taskId: string
  taskTitle: string
  taskType: TaskType
  startedAt: string
  total: number | null
  chatTurns: number
}
export type GraderRef = { source: GraderSource; id: string }
export type GraderMode = 'api' | 'batch'
export type GraderRunRequest = { attempts: GraderRef[]; versionId: string; count: number; judgeRepeat: number; mode: GraderMode; batchWaitMinutes: number }
export type GraderEstimate = {
  scorings: number
  usd: number
  minutes: number
  attempts: { source: GraderSource; id: string; usdPerScoring: number; basis: 'report' | 'task' | 'default' }[]
}
export type GraderRunStatus = 'RUNNING' | 'DONE' | 'CANCELLED' | 'INTERRUPTED'
export type GraderRun = {
  id: string
  createdAt: string
  finishedAt: string | null
  versionId: string
  versionName: string
  attempts: GraderAttempt[]
  count: number
  judgeRepeat: number
  status: GraderRunStatus
  done: number
  failed: number
  total: number
  estimateUsd: number
  actualUsd: number
  errors: string[]
  /** api: 바로 호출, batch: 배치 API (예전 기록은 null) */
  mode: GraderMode | null
  /** 배치 진행 단계 설명 */
  phase: string | null
}
export type GraderCheckSummary = {
  code: string
  item: string
  method: 'AUTO' | 'JUDGE'
  points: number
  deducted: number
  status: CheckResult['status']
  judges: { judge: string; model: string; violated: boolean }[]
}
export type GraderResult = {
  file: string
  source: GraderSource
  attemptId: string
  n: number
  total: number
  items: Record<string, number>
  checks: GraderCheckSummary[]
}

export const grader = {
  rubric: () => call<GraderRubric>('GET', '/api/grader/rubric'),
  versions: () => call<PromptVersionRow[]>('GET', '/api/grader/versions'),
  version: (id: string) => call<PromptVersion>('GET', `/api/grader/versions/${enc(id)}`),
  createVersion: (v: Omit<PromptVersion, 'id' | 'createdAt'>) => call<PromptVersion>('POST', '/api/grader/versions', v),
  setActive: (id: string) => call<{ active: string }>('PUT', '/api/grader/active', { id }),
  attempts: () => call<GraderAttempt[]>('GET', '/api/grader/attempts'),
  estimate: (req: GraderRunRequest) => call<GraderEstimate>('POST', '/api/grader/estimate', req),
  start: (req: GraderRunRequest) => call<GraderRun>('POST', '/api/grader/runs', req),
  runs: () => call<GraderRun[]>('GET', '/api/grader/runs'),
  run: (id: string) => call<{ meta: GraderRun; results: GraderResult[] }>('GET', `/api/grader/runs/${enc(id)}`),
  cancel: (id: string) => call<GraderRun>('POST', `/api/grader/runs/${enc(id)}/cancel`),
  result: (id: string, file: string) => call<Report>('GET', `/api/grader/runs/${enc(id)}/results/${enc(file)}`),
  exportUrl: (id: string) => `/api/grader/runs/${enc(id)}/export`,
}
