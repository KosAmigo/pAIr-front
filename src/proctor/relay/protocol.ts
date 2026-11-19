// PC·휴대폰·릴레이 서버가 주고받는 WebSocket 메시지 (pAIr-back/docs/api/실전시험_감독_API.md §2).
// 영상은 절대 보내지 않는다. 이상이 확정된 순간의 이벤트와 사진 1장, 점검 사진만 오간다.
import type { CheckReport } from '../check/envChecks.ts'
import type { CamViolation } from '../core/events.ts'

export const RELAY_PATH = '/ws/proctor'

export interface PhoneStatus {
  fps: number
  handCount: number
  objects: string[]
  calibrated: boolean
  /** 폰이 지금까지 보낸 바이트 */
  bytesSent: number
}

/** 환경 점검 중 남기는 사진: 방 스캔·책상·귀·손목 */
export type ScanStage = 'room' | 'desk' | 'ear-left' | 'ear-right' | 'wrist'

export type PeerState = 'connected' | 'disconnected' | 'stale'

export type ClientMsg =
  | { type: 'hello-pc'; invite: string }
  | { type: 'hello-phone'; pairCode: string }
  | { type: 'violation'; violation: CamViolation }
  | { type: 'phone-status'; status: PhoneStatus }
  | { type: 'scan-frame'; stage: ScanStage; image: string; objects: string[] }
  | { type: 'check-report'; report: CheckReport }

export type ServerMsg =
  | { type: 'paired'; pairCode: string; phoneUrl: string }
  | { type: 'phone-joined' }
  | { type: 'peer'; phone: PeerState }
  | { type: 'violation'; violation: CamViolation }
  | { type: 'phone-status'; status: PhoneStatus }
  | { type: 'scan-frame'; stage: ScanStage; image: string; objects: string[] }
  | { type: 'check-report'; report: CheckReport }
  | { type: 'error'; message: string }
