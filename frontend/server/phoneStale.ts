// 감시 중 폰 무신호(stale) 판정.
// 2026-11-21 재현 로그: 아이폰 CPU delegate 추론이 메인 스레드를 8~20초 잡아 상태 전송이 밀렸고,
// WebSocket 은 멀쩡한데(재연결 0회) 기준 6초를 넘겨 stale 이 8초 주기로 반복됐다.
// 실제 화면 꺼짐·앱 전환은 phone_hidden 이벤트가 즉시 알리므로, 무신호 기준은 추론 정지보다 길게 잡는다.
export const PHONE_STALE_MS = 15000

export interface StaleInput {
  hasSocket: boolean
  monitoring: boolean
  state: 'connected' | 'disconnected' | 'stale'
  lastSeen: number
  now: number
}

export function isPhoneStale(p: StaleInput): boolean {
  return p.hasSocket && p.monitoring && p.state === 'connected' && p.now - p.lastSeen > PHONE_STALE_MS
}
