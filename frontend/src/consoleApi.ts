// 콘솔 API (pAIr-back: ExamConsoleController, TaskConsoleController). 데이터는 모두 백엔드(AWS RDS)에서 온다.
// 응답 타입은 백엔드 ExamDtos, SessionResultService, TaskConsoleService 의 record 와 같은 모양이다.
import { ApiError, call, getAuthHeaders, type Task } from './api'

const enc = encodeURIComponent

export type Phase = 'UPCOMING' | 'LIVE' | 'ENDED' | 'CANCELED'
export type InviteStatus = 'PENDING' | 'SENT' | 'FAILED'
export type EventSource = 'BROWSER' | 'PC_CAM' | 'PHONE_CAM'
export type EventReview = 'OK' | 'SUSPECT'
export type EventType =
  | 'TAB_HIDDEN' | 'WINDOW_BLUR' | 'MOUSE_LEAVE' | 'PASTE' | 'FULLSCREEN_EXIT'
  | 'NO_FACE' | 'MULTI_FACE' | 'HEAD_TURN' | 'HEAD_DOWN' | 'GAZE_AWAY' | 'TORSO_SHIFT' | 'TORSO_TURN'
  | 'HAND_MISSING' | 'HAND_MOVED' | 'ARM_MOVE' | 'PHONE' | 'EXTRA_SCREEN' | 'BOOK' | 'PHONE_DISCONNECTED'
  | 'CONNECTION_LOST' | 'LINK_EXPIRED'

export type SessionSummary = {
  id: number
  companyId: number
  title: string
  startsAt: string
  endsAt: string
  proctoring: boolean
  phase: Phase
  taskIds: string[]
  participants: number
  entered: number
  submitted: number
  canceledAt: string | null
  unreviewedEvents: number
  createdAt: string
}

export type ParticipantView = {
  id: number
  name: string
  email: string
  inviteStatus: InviteStatus
  inviteError: string | null
  invitedAt: string
  remindedAt: string | null
  enteredAt: string | null
  startedAt: string | null
  submittedAt: string | null
  /** 과제 ID → 응시(attempt) ID */
  attempts: Record<string, string>
}

export type SessionDetail = {
  session: SessionSummary
  serverNow: string
  closedAt: string | null
  participants: ParticipantView[]
}

/** companyId 는 관리자만 넣는다 (기업 회원은 로그인한 회사로 정해진다) */
export type SessionRequest = {
  companyId?: number
  title: string
  startsAt: string
  endsAt: string
  proctoring: boolean
  taskIds: string[]
}

export type ParticipantInput = { name: string; email: string }
export type Rejected = { line: number; name: string; email: string; reason: string }
export type AddParticipantsResult = { added: number; rejected: Rejected[] }

export type ProctorEventView = {
  id: number
  participantId: number
  type: EventType
  source: EventSource
  startedAt: string
  durationMs: number
  confidence: number | null
  /** JSON 문자열 */
  detail: string | null
  /** null 사진 없음, ok 있음, deleted 보관 기간이 지나 지움 */
  snapshot: 'ok' | 'deleted' | null
  snapshotBytes: number
  review: EventReview | null
  reviewNote: string | null
  reviewedBy: number | null
  reviewedAt: string | null
}

export type ResultState = 'NOT_ENTERED' | 'WAITING' | 'SOLVING' | 'SUBMITTED'
export type ResultRow = {
  rank: number
  participantId: number
  name: string
  email: string
  state: ResultState
  enteredAt: string | null
  startedAt: string | null
  submittedAt: string | null
  score: number | null
  maxScore: number | null
  items: Record<string, number> | null
  events: Partial<Record<EventType, number>>
}
export type SessionResult = {
  sessionId: number
  title: string
  phase: Phase
  participants: number
  started: number
  submitted: number
  scored: number
  average: number | null
  distribution: { from: number; to: number; count: number }[]
  itemAverages: Record<string, number>
  topItemAverages: Record<string, number>
  bottomItemAverages: Record<string, number>
  eventTotals: Partial<Record<EventType, number>>
  metrics: { autoSubmitLagMs: number | null; snapshotBytes: number; videoBytesEstimate: number; savedRatio: number | null }
  rows: ResultRow[]
}

/** CLOSED: 목록에만 보이고 응시 막힘 (ERD tasks.status) */
export type TaskPublicationStatus = 'HIDDEN' | 'OPEN' | 'CLOSED'
/** SELF 자가진단 / LIVE 기업 실전(회차에 거는 과제) */
export type TaskUsage = 'SELF' | 'LIVE'
export type ConsoleTaskSummary = {
  id: string
  /** dev | biz */
  type: string
  title: string
  minutes: number
  usage: TaskUsage
  /** 실전 복사본이면 원본(자가진단) 과제 ID */
  parentId: string | null
  status: TaskPublicationStatus
  publishedAt: string | null
  updatedAt: string | null
}
/** definition 은 백엔드 TaskDef (응시 화면 Task 와 같은 필드 + 채점 설정) */
export type ConsoleTaskDetail = {
  summary: ConsoleTaskSummary
  definition: Task & { d4Minutes: number[] | null; requiredHeadings: string[] | null }
}

/** 파일 올리기(multipart). call() 은 JSON 만 보내서 따로 둔다 */
async function upload<T>(url: string, form: FormData): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: getAuthHeaders(), body: form })
  } catch {
    throw new ApiError('백엔드에 연결할 수 없습니다. backend 서버(포트 8180)가 켜져 있는지 확인하세요.')
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(data?.message ?? `요청 실패 (${res.status})`)
  return data as T
}

/** 로그인 헤더가 필요한 파일(CSV, 사진)을 받아 브라우저 URL 로 바꾼다 */
async function blobUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: getAuthHeaders() })
  if (!res.ok) throw new ApiError(`파일을 받지 못했습니다 (${res.status})`)
  return URL.createObjectURL(await res.blob())
}

const S = '/api/console/sessions'

export const consoleApi = {
  // 회차
  sessions: (companyId?: number) => call<SessionSummary[]>('GET', companyId == null ? S : `${S}?companyId=${companyId}`),
  session: (id: number) => call<SessionDetail>('GET', `${S}/${id}`),
  createSession: (req: SessionRequest) => call<SessionSummary>('POST', S, req),
  updateSession: (id: number, req: SessionRequest) => call<SessionSummary>('PUT', `${S}/${id}`, req),
  cancelSession: (id: number) => call<SessionSummary>('POST', `${S}/${id}/cancel`),

  // 대상자
  addParticipants: (id: number, participants: ParticipantInput[]) =>
    call<AddParticipantsResult>('POST', `${S}/${id}/participants`, { participants }),
  /** dryRun: 등록하지 않고 미리 보기만 */
  importCsv: (id: number, file: File, dryRun = false) => {
    const form = new FormData()
    form.append('file', file)
    return upload<AddParticipantsResult>(`${S}/${id}/participants/csv?dryRun=${dryRun}`, form)
  },
  templateCsvUrl: `${S}/participants-template.csv`,
  removeParticipant: (id: number, participantId: number) => call<void>('DELETE', `${S}/${id}/participants/${participantId}`),
  resendInvite: (id: number, participantId: number) => call<void>('POST', `${S}/${id}/participants/${participantId}/invite`),

  // 감독
  events: (id: number) => call<ProctorEventView[]>('GET', `${S}/${id}/events`),
  participantEvents: (id: number, participantId: number) =>
    call<ProctorEventView[]>('GET', `${S}/${id}/participants/${participantId}/events`),
  review: (id: number, eventId: number, review: EventReview | null, note?: string) =>
    call<ProctorEventView>('PUT', `${S}/${id}/events/${eventId}/review`, { review, note }),
  snapshotUrl: (id: number, eventId: number) => blobUrl(`${S}/${id}/events/${eventId}/snapshot`),

  // 결과
  results: (id: number) => call<SessionResult>('GET', `${S}/${id}/results`),
  /** 종료된 회차에서 채점으로 넘어가지 못한 응시를 다시 넘긴다 (pending: 멈춘 응시 수, failed: 이번에도 못 넘긴 수) */
  rescueSession: (id: number) => call<{ pending: number; failed: number }>('POST', `${S}/${id}/rescue`),
  resultsCsvUrl: (id: number) => blobUrl(`${S}/${id}/results.csv`),
  resultsXlsxUrl: (id: number) => blobUrl(`${S}/${id}/results.xlsx`),
  templateXlsxUrl: () => blobUrl(`${S}/participants-template.xlsx`),

  // 과제 (공개 상태)
  tasks: () => call<ConsoleTaskSummary[]>('GET', '/api/console/tasks'),
  task: (taskId: string) => call<ConsoleTaskDetail>('GET', `/api/console/tasks/${enc(taskId)}`),
  publishTask: (taskId: string) => call<ConsoleTaskSummary>('POST', `/api/console/tasks/${enc(taskId)}/publish`),
  hideTask: (taskId: string) => call<ConsoleTaskSummary>('POST', `/api/console/tasks/${enc(taskId)}/hide`),
}
