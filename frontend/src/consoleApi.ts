// 콘솔 API (pAIr-back: ExamConsoleController, TaskConsoleController). 데이터는 모두 백엔드(AWS RDS)에서 온다.
// 응답 타입은 백엔드 ExamDtos, SessionResultService, TaskConsoleService 의 record 와 같은 모양이다.
import { ApiError, call, getAuthHeaders, type Task } from './api'
import { authenticatedFetch, AuthRequestError } from './auth/authApi'
import type { ServerCheck } from './proctor/core/serverCheck'

const enc = encodeURIComponent

export type Phase = 'UPCOMING' | 'LIVE' | 'ENDED' | 'CANCELED'
export type InviteStatus = 'PENDING' | 'SENT' | 'FAILED'
export type EventSource = 'BROWSER' | 'PC_CAM' | 'PHONE_CAM'
export type EventReview = 'OK' | 'SUSPECT'
export type EventType =
  | 'TAB_HIDDEN' | 'WINDOW_BLUR' | 'MOUSE_LEAVE' | 'PASTE' | 'FULLSCREEN_EXIT'
  | 'NO_FACE' | 'MULTI_FACE' | 'HEAD_TURN' | 'HEAD_DOWN' | 'GAZE_AWAY' | 'TORSO_SHIFT' | 'TORSO_TURN'
  | 'HAND_MISSING' | 'HAND_MOVED' | 'ARM_MOVE' | 'PHONE' | 'EXTRA_SCREEN' | 'BOOK' | 'PHONE_DISCONNECTED'
  | 'CONNECTION_LOST' | 'LINK_EXPIRED' | 'LINK_RESTORED'

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
  /** 연결 유예(5분)를 넘겨 입장 링크가 만료됨 (진행 중인 시험에서만). 콘솔의 "링크 복구" 버튼 조건 */
  linkExpired: boolean
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
  /** 사진이 없는 카메라 이벤트의 사유. LIMIT_EXCEEDED 서버 사진 상한 초과, UPLOAD_FAILED 업로드 실패. 사진이 있거나 삭제됐거나 브라우저 이벤트면 null (옛 서버는 없음) */
  snapshotMissing?: 'LIMIT_EXCEEDED' | 'UPLOAD_FAILED' | null
  review: EventReview | null
  reviewNote: string | null
  reviewedBy: number | null
  reviewedAt: string | null
  /** 서버 재확인 상태. 영상 이벤트(PC_CAM·PHONE_CAM)에만 오고, 백엔드가 구현하기 전에는 없다 */
  serverCheck?: ServerCheck | null
  serverCheckedAt?: string | null
}

/** 환경 점검 사진 (책상 위. ROOM 은 예전 기록용) */
export type EnvScanPhotoView = {
  id: number
  participantId: number
  stage: 'ROOM' | 'DESK'
  /** 방 스캔에서 찍은 방향(도). 책상은 null */
  angle: number | null
  objects: string[]
  /** 휴대폰으로 감지된 장면 */
  phoneSuspect: boolean
  sizeBytes: number
  capturedAt: string
  /** 보관 기간이 지나 파일을 지움 */
  deleted: boolean
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
  // ── 2026-11-20 목록 개편으로 백엔드에 더해지는 칸. 예전 서버에는 없을 수 있어 모두 옵셔널 ──
  /** DEV | BIZ (없으면 type 으로 판단) */
  track?: 'DEV' | 'BIZ' | null
  /** 초급 | 중급 | 고급 */
  difficulty?: string | null
  /** 과제 형태 키 (incident, planning …) 또는 직무 이름 */
  category?: string | null
  /** 한 줄 소개 */
  summary?: string | null
  createdAt?: string | null
  /** AI 로 만든 과제인지 */
  generated?: boolean | null
  /** AI 생성 자동 확인을 모두 통과했는지. AI 생성이 아니면 null */
  checksOk?: boolean | null
}
/** definition 은 백엔드 TaskDef (응시 화면 Task 와 같은 필드 + 채점 설정) */
export type ConsoleTaskDetail = {
  summary: ConsoleTaskSummary
  definition: Task & { d4Minutes: number[] | null; requiredHeadings: string[] | null }
}

/** 검수용 PDF 자료 한 개 (pAIr-docs/API/응시_자료_PDF_API.md) */
export type TaskMaterial = { path: string; mimeType: string; sizeBytes: number; pages: number }
export type MaterialPage = { page: number; text: string }

/**
 * (가정) 관리자 검수용 과제 파일. 백엔드에 아직 없는 API 라 404 면 화면이 "준비 중"으로 보여 준다.
 * visibility: VISIBLE 응시자에게 보임, HIDDEN 숨은 테스트·정답 등
 */
export type AdminTaskFile = { path: string; visibility: 'VISIBLE' | 'HIDDEN'; readOnly?: boolean; content: string | null }
/** (가정) 관리자 검수용 문항. 정답과 근거 쪽까지 들어 있다. 404 면 "준비 중" */
export type AdminQuestion = {
  id: number
  seq: number
  type: 'SINGLE' | 'MULTI' | 'SHORT'
  content: string
  points: number
  choices: { id: number; seq: number; content: string; correct: boolean }[]
  /** 단답형 인정 답안 */
  answers: string[]
  /** 근거 문서와 쪽 */
  sources: { path: string; pages: string }[]
}

/** 파일 올리기(multipart). call() 은 JSON 만 보내서 따로 둔다 */
async function upload<T>(url: string, form: FormData): Promise<T> {
  let res: Response
  try {
    res = await authenticatedFetch(url, { method: 'POST', headers: getAuthHeaders(), body: form })
  } catch (error) {
    if (error instanceof AuthRequestError) throw error
    throw new ApiError('백엔드에 연결할 수 없습니다. backend 서버(포트 8180)가 켜져 있는지 확인하세요.')
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(data?.message ?? `요청 실패 (${res.status})`)
  return data as T
}

/** 로그인 헤더가 필요한 파일(CSV, 사진)을 받아 브라우저 URL 로 바꾼다 */
async function blobUrl(url: string): Promise<string> {
  const res = await authenticatedFetch(url, { headers: getAuthHeaders() })
  if (!res.ok) {
    const err = new ApiError(`파일을 받지 못했습니다 (${res.status})`)
    err.status = res.status
    throw err
  }
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
  /** 만료된 입장 링크를 되살린다 (매니저·감독관·관리자). 시험 시간은 연장하지 않는다 */
  restoreLink: (id: number, participantId: number) => call<ParticipantView>('POST', `${S}/${id}/participants/${participantId}/restore-link`),

  // 감독
  events: (id: number) => call<ProctorEventView[]>('GET', `${S}/${id}/events`),
  participantEvents: (id: number, participantId: number) =>
    call<ProctorEventView[]>('GET', `${S}/${id}/participants/${participantId}/events`),
  review: (id: number, eventId: number, review: EventReview | null, note?: string) =>
    call<ProctorEventView>('PUT', `${S}/${id}/events/${eventId}/review`, { review, note }),
  snapshotUrl: (id: number, eventId: number) => blobUrl(`${S}/${id}/events/${eventId}/snapshot`),
  envScanPhotos: (id: number, participantId: number) => call<EnvScanPhotoView[]>('GET', `${S}/${id}/participants/${participantId}/env-scan`),
  envScanImageUrl: (id: number, photoId: number) => blobUrl(`${S}/${id}/env-scan/${photoId}/image`),

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
  /** 용도 바꾸기 (검수 전 과제만. 409 = 공개한 적 있는 과제 또는 복사본) */
  changeUsage: (taskId: string, usage: TaskUsage) => call<ConsoleTaskSummary>('PATCH', `/api/console/tasks/${enc(taskId)}/usage`, { usage }),

  // 과제 검수 자료
  materials: (taskId: string) => call<TaskMaterial[]>('GET', `/api/console/tasks/${enc(taskId)}/materials`),
  /** PDF 는 인증 헤더가 필요해 fetch → blob URL 로 받는다. 다 쓰면 URL.revokeObjectURL */
  materialFileUrl: (taskId: string, path: string) => blobUrl(`/api/console/tasks/${enc(taskId)}/materials/file?path=${enc(path)}`),
  materialPages: (taskId: string, path: string, pages?: string) =>
    call<MaterialPage[]>('GET', `/api/console/tasks/${enc(taskId)}/materials/pages?path=${enc(path)}${pages ? `&pages=${enc(pages)}` : ''}`),
  /** (가정) 백엔드에 아직 없음 */
  taskFiles: (taskId: string) => call<AdminTaskFile[]>('GET', `/api/console/tasks/${enc(taskId)}/files`),
  /** (가정) 백엔드에 아직 없음 */
  taskQuestions: (taskId: string) => call<AdminQuestion[]>('GET', `/api/console/tasks/${enc(taskId)}/questions`),
}
