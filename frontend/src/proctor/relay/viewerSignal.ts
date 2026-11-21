// 감독관 실시간 영상 시그널링 (감독관 ↔ 응시자 PC). 5단계.
// 영상은 WebRTC 로 응시자 PC → 감독관 브라우저로 직접 가고 서버를 지나지 않으며 저장되지 않는다.
// 서버는 view-rtc 를 해석하지 않고 형식만 검사해 반대편으로 넘긴다 (서버·클라이언트 공용, DOM 타입 없이 동작).
import { parseRtcSignal, type RtcSignal } from './rtcSignal.ts'

/** 감독관이 볼 수 있는 영상 채널. 휴대폰 영상은 응시자 PC 가 받은 것을 그대로 중계한다 (휴대폰 부하 증가 없음) */
export const VIEW_CHANNELS = ['phone', 'webcam', 'screen'] as const
export type ViewChannel = (typeof VIEW_CHANNELS)[number]

export const VIEW_CHANNEL_LABEL: Record<ViewChannel, string> = { phone: '휴대폰', webcam: '웹캠', screen: '화면 공유' }

export type ViewSignal =
  /** 응시자 PC → 감독관: 영상 제안 / 양방향 ICE */
  | Extract<RtcSignal, { kind: 'offer' | 'answer' | 'candidate' }>
  /** 감독관 → 응시자 PC: 이 채널 영상을 다시 보내 달라 (연결 실패 뒤) */
  | { kind: 'request' }
  /** 응시자 PC → 감독관: 이 채널은 지금 보낼 영상이 없다 (휴대폰 미연결, 화면 공유 안 함 등) */
  | { kind: 'unavailable' }

export function isViewChannel(value: unknown): value is ViewChannel {
  return typeof value === 'string' && (VIEW_CHANNELS as readonly string[]).includes(value)
}

/** 클라이언트가 보낸 값이므로 알려진 필드만 골라 새 객체로 돌려준다. 형식이 틀리면 null */
export function parseViewSignal(value: unknown): ViewSignal | null {
  if (typeof value !== 'object' || value === null) return null
  const kind = (value as { kind?: unknown }).kind
  if (kind === 'request') return { kind: 'request' }
  if (kind === 'unavailable') return { kind: 'unavailable' }
  if (kind !== 'offer' && kind !== 'answer' && kind !== 'candidate') return null
  const signal = parseRtcSignal(value)
  return signal && (signal.kind === 'offer' || signal.kind === 'answer' || signal.kind === 'candidate') ? signal : null
}

/** 감독관 전송 화질 상한. 응시자 PC 는 웹캠·휴대폰·화면 분석을 이미 하고 있으므로 낮게 잡는다 (감독관이 열 때만 켜진다) */
export const VIEW_ENCODING: Record<ViewChannel, { maxBitrate: number; maxFramerate: number; scaleResolutionDownBy: number }> = {
  phone: { maxBitrate: 500_000, maxFramerate: 10, scaleResolutionDownBy: 1.5 },
  webcam: { maxBitrate: 500_000, maxFramerate: 10, scaleResolutionDownBy: 1.5 },
  screen: { maxBitrate: 400_000, maxFramerate: 4, scaleResolutionDownBy: 1 },
}
