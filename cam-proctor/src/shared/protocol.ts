// PC·폰·서버가 주고받는 WebSocket 메시지 정의.
// 영상은 절대 보내지 않는다. 이상이 생긴 순간의 이벤트와 사진 1장만 전송한다.
import type { CheckReport } from '../check/envChecks'

export type Source = 'pc' | 'phone'

export interface Violation {
  id: string
  source: Source
  kind: string
  message: string
  /** 이상 상태가 시작된 시각 (epoch ms) */
  startedAt: number
  /** 경고가 확정된 시각 (epoch ms) */
  ts: number
  /** 경고 확정까지 이어진 시간 */
  durationMs: number
  detail?: Record<string, number | string | boolean>
  /** 클라이언트→서버: JPEG data URL. 서버→PC: 저장된 사진 경로 */
  snapshot?: string
}

export interface PhoneStatus {
  fps: number
  handCount: number
  objects: string[]
  calibrated: boolean
  /** 폰이 지금까지 서버로 보낸 바이트 */
  bytesSent: number
}

/** 환경 점검 중 남기는 사진: 방 스캔·책상·귀·손목 */
export type ScanStage = 'room' | 'desk' | 'ear-left' | 'ear-right' | 'wrist'

export type ClientMsg =
  | { type: 'hello-pc'; sessionId?: string }
  | { type: 'hello-phone'; sessionId: string; token: string }
  | { type: 'violation'; violation: Violation }
  | { type: 'phone-status'; status: PhoneStatus }
  | { type: 'scan-frame'; stage: ScanStage; image: string; objects: string[] }
  | { type: 'check-report'; report: CheckReport }

export type PeerState = 'connected' | 'disconnected' | 'stale'

export type ServerMsg =
  | { type: 'session'; sessionId: string; token: string; phoneUrls: string[] }
  | { type: 'phone-joined' }
  | { type: 'peer'; phone: PeerState }
  | { type: 'violation'; violation: Violation }
  | { type: 'phone-status'; status: PhoneStatus }
  | { type: 'error'; message: string }
  | { type: 'scan-frame'; source: Source; stage: ScanStage; url: string; objects: string[] }
  | { type: 'check-report'; source: Source; report: CheckReport }

export const WS_PATH = '/ws'
