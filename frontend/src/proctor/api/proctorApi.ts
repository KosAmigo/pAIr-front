// 실전 시험·감독 API 어댑터. 백엔드 호출은 전부 이 파일을 거친다 (pAIr-docs/API/실전시험_감독_API.md §1).
// 팀원 백엔드의 주소·경로가 바뀌면 이 파일만 고친다.
import type { EventSource, ProctorEventType } from '../core/events.ts'

/** 백엔드가 다른 호스트면 VITE_API_BASE (예: https://api.pair.test). 비우면 같은 호스트의 /api (Vite 프록시) */
const BASE = ((import.meta.env?.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

/** 동의 문구 버전. 문구를 바꿀 때마다 올린다 (백엔드는 값을 그대로 저장만 한다: proctor_consents.consent_version, 최대 20자) */
export const CONSENT_VERSION = 'v2'

export type Phase = 'UPCOMING' | 'LIVE' | 'ENDED'

export type EntryInfo = {
  sessionTitle: string
  companyName?: string | null
  name: string
  email: string
  startsAt: string
  endsAt: string
  serverNow: string
  phase: Phase
  proctoring: boolean
  consented: boolean
  startedAt: string | null
  submittedAt: string | null
  taskIds: string[]
  /** 과제 ID → 응시 ID */
  attempts: Record<string, string>
  /** 과제별 진행 상태 (과제별 제출) */
  tasks: TaskStatus[]
  /** 시험 중 연결이 끊긴 뒤 유예(5분) 안에 돌아오지 않아 입장 링크가 만료됨 */
  linkExpired: boolean
}

export type TaskStatus = {
  taskId: string
  /** 시작 전이면 null */
  attemptId: string | null
  submitted: boolean
}

/** 콘솔이 응시자에게 보낸 안내 메시지. readAt 이 null 이면 아직 확인하지 않음 */
export type InviteNotice = { id: number; message: string; sentAt: string; readAt: string | null }

/** 환경 점검 사진 (책상 위). 방 360도 스캔은 없어져 DESK 만 올린다 */
export type EnvScanRequest = { stage: 'DESK'; objects: string[]; image: string }

export type ProctorEventRequest = {
  type: ProctorEventType
  source: EventSource
  startedAt: string
  durationMs: number
  confidence?: number
  detail?: Record<string, unknown>
  snapshot?: string
  /** 이벤트마다 브라우저가 만든 고유값. 다시 보내도 서버가 같은 이벤트로 알아보고 중복 저장하지 않는다 */
  clientId?: string
}

/** 이벤트 앞뒤 증거 구간의 사진 한 장 (POST .../proctor-events/{clientId}/clip). offsetMs: 이벤트 시각 기준 -8000~4000 */
export type ClipFrameRequest = { source: 'PC_CAM'; offsetMs: number; image: string }

/** status: HTTP 상태 (네트워크 오류면 0). 아웃박스가 다시 보낼지 정할 때 쓴다 */
export class ProctorApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }

  /** 네트워크 오류·서버 오류·요청 시간 초과(408)·요청 과다(429)만 다시 보낼 가치가 있다. 나머지 4xx 는 다시 보내도 같은 결과 */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 408 || this.status === 429
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ProctorApiError('서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', 0)
  }
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* 본문이 JSON 이 아니면 상태 코드로만 알린다 */
  }
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `요청 실패 (${res.status})`
    throw new ProctorApiError(message, res.status)
  }
  return data as T
}

const enc = encodeURIComponent

export const proctorApi = {
  serverTime: () => call<{ serverNow: string }>('GET', '/api/time'),
  entry: (invite: string) => call<EntryInfo>('GET', `/api/entry/${enc(invite)}`),
  consent: (invite: string, envCheck: unknown, consentVersion = CONSENT_VERSION) =>
    call<EntryInfo>('POST', `/api/entry/${enc(invite)}/consent`, { consentVersion, envCheck }),
  enter: (invite: string) => call<EntryInfo>('POST', `/api/entry/${enc(invite)}/enter`),
  start: (invite: string) => call<EntryInfo>('POST', `/api/entry/${enc(invite)}/start`),
  /** 시험 화면의 연결 신호 (10초마다). expired=true 면 유예를 넘겨 링크가 만료된 것 */
  heartbeat: (invite: string) => call<{ expired: boolean }>('POST', `/api/entry/${enc(invite)}/heartbeat`),
  /** 과제 하나 제출. 모든 과제를 내면 submittedAt 이 채워진다 */
  submitTask: (invite: string, taskId: string) =>
    call<EntryInfo>('POST', `/api/entry/${enc(invite)}/tasks/${enc(taskId)}/submit`),
  /** 남은 과제 모두 제출 (시험 끝내기) */
  submit: (invite: string) => call<EntryInfo>('POST', `/api/entry/${enc(invite)}/submit`),
  /** 점검 사진 업로드. 실패해도 점검은 계속되므로 호출하는 쪽에서 오류를 삼킨다 */
  uploadEnvScan: (invite: string, photo: EnvScanRequest) => call<unknown>('POST', `/api/entry/${enc(invite)}/env-scan`, photo),
  /** 점검 진행 상태 (콘솔이 실시간으로 본다). 실패해도 점검은 계속되므로 호출하는 쪽에서 오류를 삼킨다 */
  sendEnvProgress: (invite: string, result: unknown) => call<null>('POST', `/api/entry/${enc(invite)}/env-progress`, { result }),
  /** 콘솔이 보낸 안내 메시지 (읽음 여부 포함) */
  notices: (invite: string) => call<InviteNotice[]>('GET', `/api/entry/${enc(invite)}/notices`),
  readNotice: (invite: string, noticeId: number) => call<null>('POST', `/api/entry/${enc(invite)}/notices/${noticeId}/read`),
  /** 이벤트 앞뒤 증거 구간 사진 (이벤트가 같은 clientId 로 먼저 저장돼 있어야 한다. 응답 201 본문 없음) */
  uploadClip: (invite: string, clientId: string, frames: ClipFrameRequest[]) =>
    call<null>('POST', `/api/entry/${enc(invite)}/proctor-events/${enc(clientId)}/clip`, { frames }),
  recordEvent: (invite: string, event: ProctorEventRequest) =>
    call<{ id: number }>('POST', `/api/entry/${enc(invite)}/proctor-events`, event),
}

/** 서버 시각 - 내 시각 (ms). 이 값을 더하면 서버 기준 지금이 된다 */
export function serverOffsetFrom(serverNowIso: string, requestedAt: number, receivedAt = Date.now()): number {
  // 응답이 오가는 동안의 절반만큼 서버 시각이 앞서 있다고 본다
  const midpoint = requestedAt + (receivedAt - requestedAt) / 2
  return Date.parse(serverNowIso) - midpoint
}
