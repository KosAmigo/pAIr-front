// 기업 콘솔 API를 호출하고 현재 로그인 토큰을 bearer 헤더로 전달한다.
import { readAuthSession } from '../auth/authApi'

const BASE = ((import.meta.env?.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

export class ConsoleApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// ── 응답 모양 (백엔드 ExamDtos 와 같다) ──
export type ApiPhase = 'UPCOMING' | 'LIVE' | 'ENDED' | 'CANCELED'
export type ApiSessionSummary = {
  id: number
  companyId: number
  title: string
  startsAt: string
  endsAt: string
  proctoring: boolean
  phase: ApiPhase
  taskIds: string[]
  participants: number
  entered: number
  submitted: number
  canceledAt: string | null
  unreviewedEvents: number
  createdAt: string
}
export type ApiParticipant = {
  id: number
  name: string
  email: string
  inviteStatus: 'PENDING' | 'SENT' | 'FAILED'
  inviteError: string | null
  invitedAt: string
  remindedAt: string | null
  enteredAt: string | null
  startedAt: string | null
  submittedAt: string | null
  submitKind: 'AUTO' | 'MANUAL' | null
  attempts: Record<string, string>
}
export type ApiSessionDetail = { session: ApiSessionSummary; serverNow: string; closedAt: string | null; participants: ApiParticipant[] }
export type ApiReview = 'OK' | 'SUSPECT'
export type ApiEvent = {
  id: number
  participantId: number
  type: string
  source: 'BROWSER' | 'PC_CAM' | 'PHONE_CAM'
  startedAt: string
  durationMs: number
  confidence: number | null
  /** JSON 문자열 */
  detail: string | null
  snapshot: 'ok' | 'deleted' | null
  snapshotBytes: number
  review: ApiReview | null
  reviewNote: string | null
  reviewedBy: number | null
  reviewedAt: string | null
}
export type ApiRejected = { line: number; name: string; email: string; reason: string }
export type ApiAddResult = { added: number; rejected: ApiRejected[] }
export type ApiResultRow = {
  rank: number
  participantId: number
  score: number | null
  maxScore: number | null
  /** 역량 이름 → 점수 */
  items: Record<string, number>
}
export type ApiResult = {
  metrics: { autoSubmitLagMs: number | null; snapshotBytes: number; videoBytesEstimate: number; savedRatio: number | null }
  rows: ApiResultRow[]
}
export type ApiTaskStatus = 'HIDDEN' | 'OPEN'
export type ApiTask = { id: string; type: string; title: string; minutes: number; status: ApiTaskStatus; publishedAt: string | null; updatedAt: string | null }
export type SessionInput = { companyId?: number; title: string; startsAt: string; endsAt: string; proctoring: boolean; taskIds: string[] }

export function authHeaders(): Record<string, string> {
  const token = readAuthSession()?.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const isForm = body instanceof FormData
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...authHeaders(), ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ConsoleApiError('서버에 연결할 수 없습니다.', 0)
  }
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`
    try {
      message = ((await res.json()) as { message?: string }).message ?? message
    } catch {
      /* 본문이 JSON 이 아님 */
    }
    throw new ConsoleApiError(message, res.status)
  }
  return res
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const S = '/api/console/sessions'

export const consoleApi = {
  sessions: () => call<ApiSessionSummary[]>('GET', S),
  session: (id: string) => call<ApiSessionDetail>('GET', `${S}/${id}`),
  events: (id: string) => call<ApiEvent[]>('GET', `${S}/${id}/events`),
  results: (id: string) => call<ApiResult>('GET', `${S}/${id}/results`),
  create: (input: SessionInput) => call<ApiSessionSummary>('POST', S, input),
  update: (id: string, input: SessionInput) => call<ApiSessionSummary>('PUT', `${S}/${id}`, input),
  cancel: (id: string) => call<ApiSessionSummary>('POST', `${S}/${id}/cancel`),
  addParticipants: (id: string, people: { name: string; email: string }[]) =>
    call<ApiAddResult>('POST', `${S}/${id}/participants`, { participants: people }),
  uploadCsv: (id: string, file: File, dryRun = false) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return call<ApiAddResult>('POST', `${S}/${id}/participants/csv?dryRun=${dryRun}`, form)
  },
  removeParticipant: (id: string, pid: string) => call<null>('DELETE', `${S}/${id}/participants/${pid}`),
  resendInvite: (id: string, pid: string) => call<null>('POST', `${S}/${id}/participants/${pid}/invite`),
  review: (id: string, eid: string, review: ApiReview | null, note?: string) =>
    call<ApiEvent>('PUT', `${S}/${id}/events/${eid}/review`, { review, note }),
  /** 사진은 인증 헤더가 필요해 img src 로 바로 못 쓴다. 받아서 object URL 로 */
  snapshotUrl: async (id: string, eid: string) => URL.createObjectURL(await (await send('GET', `${S}/${id}/events/${eid}/snapshot`)).blob()),
  resultsCsv: async (id: string) => (await send('GET', `${S}/${id}/results.csv`)).blob(),
  tasks: () => call<ApiTask[]>('GET', '/api/console/tasks'),
  publishTask: (taskId: string) => call<ApiTask>('POST', `/api/console/tasks/${encodeURIComponent(taskId)}/publish`),
  hideTask: (taskId: string) => call<ApiTask>('POST', `/api/console/tasks/${encodeURIComponent(taskId)}/hide`),
}

/** 콘솔 데이터: api(기본) = 백엔드, mock = 브라우저 안 예시 데이터 (VITE_CONSOLE_DATA=mock, 화면 시안·발표용) */
export const CONSOLE_USES_API = (import.meta.env?.VITE_CONSOLE_DATA as string | undefined) !== 'mock'
