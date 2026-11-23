// 휴대폰 연결 상태 변화 → PHONE_DISCONNECTED 이벤트 종류 (순수 함수).
// 운영 중계는 이벤트를 직접 저장하지 않고 peer 메시지(connected | disconnected | stale)만 알린다.
// 그래서 응시자 PC 가 이 변화를 보고 자기 아웃박스로 올린다.
import type { PeerState } from '../relay/protocol.ts'

export type PhoneDropKind = 'phone_disconnected' | 'phone_stale'

/**
 * 연결돼 있던 휴대폰이 끊기거나 응답이 없어졌을 때만 이벤트를 만든다.
 * 응답 없음 → 끊김처럼 이미 문제로 기록한 뒤의 변화와, 처음부터 연결이 없던 상태는 만들지 않는다 (한 번의 끊김에 이벤트 하나).
 */
export function phoneDropEvent(prev: PeerState, next: PeerState): PhoneDropKind | null {
  if (prev !== 'connected') return null
  if (next === 'disconnected') return 'phone_disconnected'
  if (next === 'stale') return 'phone_stale'
  return null
}

export const PHONE_DROP_MESSAGE: Record<PhoneDropKind, string> = {
  phone_disconnected: '보조 카메라(휴대폰) 연결이 끊겼습니다',
  phone_stale: '보조 카메라에서 신호가 오지 않습니다 (화면 꺼짐·앱 전환 의심)',
}
