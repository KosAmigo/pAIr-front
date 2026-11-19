// 실전 시험·감독 API 어댑터. 백엔드 호출은 전부 이 파일을 거친다 (pAIr-docs/API/실전시험_감독_API.md §1).
// 팀원 백엔드의 주소·경로가 바뀌면 이 파일만 고친다.
import type { CamSource, ProctorEventType } from '../core/events.ts'

/** 백엔드가 다른 호스트면 VITE_API_BASE (예: https://api.pair.test). 비우면 같은 호스트의 /api (Vite 프록시) */
const BASE = ((import.meta.env?.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

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
}

export type TaskStatus = {
  taskId: string
  /** 시작 전이면 null */
  attemptId: string | null
  submitted: boolean
}

export type ProctorEventRequest = {
  type: ProctorEventType
  source: CamSource
  startedAt: string
  durationMs: number
  confidence?: number
  detail?: Record<string, unknown>
  snapshot?: string
}

/** status: HTTP 상태 (네트워크 오류면 0). 아웃박스가 다시 보낼지 정할 때 쓴다 */
export class ProctorApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }

  /** 네트워크 오류·서버 오류만 다시 보낼 가치가 있다. 4xx 는 다시 보내도 같은 결과 */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500
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
  consent: (invite: string, envCheck: unknown, consentVersion = 'v1') =>
    call<EntryInfo>('POST', `/api/entry/${enc(invite)}/consent`, { consentVersion, envCheck }),
  enter: (invite: string) => call<EntryInfo>('POST', `/api/entry/${enc(invite)}/enter`),
  start: (invite: string) => call<EntryInfo>('POST', `/api/entry/${enc(invite)}/start`),
  /** 과제 하나 제출. 모든 과제를 내면 submittedAt 이 채워진다 */
  submitTask: (invite: string, taskId: string) =>
    call<EntryInfo>('POST', `/api/entry/${enc(invite)}/tasks/${enc(taskId)}/submit`),
  /** 남은 과제 모두 제출 (시험 끝내기) */
  submit: (invite: string) => call<EntryInfo>('POST', `/api/entry/${enc(invite)}/submit`),
  recordEvent: (invite: string, event: ProctorEventRequest) =>
    call<{ id: number }>('POST', `/api/entry/${enc(invite)}/proctor-events`, event),
}

/** 서버 시각 - 내 시각 (ms). 이 값을 더하면 서버 기준 지금이 된다 */
export function serverOffsetFrom(serverNowIso: string, requestedAt: number, receivedAt = Date.now()): number {
  // 응답이 오가는 동안의 절반만큼 서버 시각이 앞서 있다고 본다
  const midpoint = requestedAt + (receivedAt - requestedAt) / 2
  return Date.parse(serverNowIso) - midpoint
}
