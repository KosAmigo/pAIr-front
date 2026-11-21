// PC·휴대폰·릴레이 서버가 주고받는 WebSocket 메시지 (pAIr-docs/API/실전시험_감독_API.md §2).
// 이 WebSocket 으로는 영상이 오가지 않는다. 휴대폰 알림·상태와 영상 연결용 WebRTC 시그널링(rtc)만 오간다.
// 점검 사진·점검 결과는 응시자 PC 가 직접 서버에 올린다 (책상 스캔도 PC 가 휴대폰 영상으로 한다).
// 휴대폰 영상은 시그널링으로 맺은 WebRTC 연결로 PC 에 직접 전달되며 서버에 저장되지 않는다.
import type { CamViolation } from '../core/events.ts'
import type { RtcSignal } from './rtcSignal.ts'
import type { ServerWatchState } from '../watch/watchState.ts'
import type { ViewChannel, ViewSignal } from './viewerSignal.ts'

export type { RtcSignal } from './rtcSignal.ts'

export const RELAY_PATH = '/ws/proctor'

export interface PhoneStatus {
  /** 책상 스캔을 마치고 영상만 보내는 중 (분석은 PC 가 한다). 서버는 이때부터 응답 없음을 감시한다 */
  sending: boolean
  /** 폰이 지금까지 보낸 바이트 */
  bytesSent: number
  /** 폰 쪽 릴레이 연결 이력 (끊김 진단용) */
  relay?: RelayHealth
}

export interface RelayHealth {
  /** 이 페이지가 열린 뒤 릴레이를 다시 연결한 횟수 */
  reconnects: number
  /** 마지막으로 연결이 닫힌 시각 (epoch ms), 없으면 0 */
  lastCloseAt: number
  lastCloseCode: number
  /** 상태 전송 타이머가 예정보다 늦게 돈 최대 지연(ms). 메인 스레드가 바빴다는 뜻 */
  maxTimerLagMs: number
}

/** 환경 점검 중 남기는 사진 (PC 가 보관·업로드): 책상·귀·손목. room 은 방 360도 스캔 제거 전의 값 */
export type ScanStage = 'room' | 'desk' | 'ear-left' | 'ear-right' | 'wrist'

export type PeerState = 'connected' | 'disconnected' | 'stale'

export type ClientMsg =
  /** practice: 사전 테스트. 서버는 입장 토큰 확인과 이벤트 저장을 하지 않고 짝만 맺는다 */
  | { type: 'hello-pc'; invite: string; practice?: boolean }
  | { type: 'hello-phone'; pairCode: string }
  /** 휴대폰이 직접 아는 알림 (감독 화면 이탈). 서버는 저장하지 않고 PC 로 넘기며, PC 가 아웃박스에 저장한다 */
  | { type: 'phone-alert'; violation: CamViolation }
  | { type: 'phone-status'; status: PhoneStatus }
  | { type: 'rtc'; signal: RtcSignal }
  /** 워커가 메인 스레드와 무관하게 1초마다 보내는 생존 신호 */
  | { type: 'heartbeat' }
  /**
   * 감독관 → 서버: 이 응시자의 영상을 열었다 (5단계). 한 연결에 한 명만 본다 (다시 보내면 대상이 바뀐다).
   * auth: 개발 릴레이 임시 확인용 로그인 헤더. 운영 백엔드는 WebSocket 연결의 로그인 정보로 권한을 확인한다.
   */
  | { type: 'watch'; sessionId: number; participantId: number; auth?: Record<string, string> }
  /** 감독관 → 서버: 영상을 닫았다. 응시자 PC 의 전송이 멈춘다 */
  | { type: 'unwatch' }
  /** 감독관 → 서버(→응시자 PC) · 응시자 PC → 서버(→감독관) 채널별 영상 시그널링. viewer 는 PC 가 보낼 때만 (어느 감독관에게 가는지) */
  | { type: 'view-rtc'; channel: ViewChannel; signal: ViewSignal; viewer?: string }

export type ServerMsg =
  | { type: 'paired'; pairCode: string; phoneUrl: string }
  | { type: 'phone-joined' }
  | { type: 'peer'; phone: PeerState }
  /** 서버가 직접 만든 이벤트 (연결 끊김 등). 서버가 이미 저장했으니 PC 는 보여 주기만 한다 */
  | { type: 'violation'; violation: CamViolation }
  /** 휴대폰이 보낸 알림. PC 가 저장한다 */
  | { type: 'phone-alert'; violation: CamViolation }
  | { type: 'phone-status'; status: PhoneStatus }
  | { type: 'rtc'; signal: RtcSignal }
  | { type: 'error'; message: string }
  /** 서버 → 감독관: 시청 상태 */
  | { type: 'watch-state'; state: ServerWatchState; message?: string }
  /** 서버 → 응시자 PC: 감독관 viewer 가 이 채널 영상을 보려 한다 (영상 제안을 보내라) */
  | { type: 'viewer-request'; viewer: string; channel: ViewChannel }
  /** 서버 → 응시자 PC: 감독관 viewer 가 닫았거나 연결이 끊겼다 (그 감독관 전송을 멈춰라) */
  | { type: 'viewer-gone'; viewer: string }
  /** 서버 → 응시자 PC(viewer 있음) · 감독관(viewer 없음) */
  | { type: 'view-rtc'; channel: ViewChannel; signal: ViewSignal; viewer?: string }
