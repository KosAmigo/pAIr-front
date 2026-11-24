// 감독관 시청 화면의 상태 기계 (순수 함수). 화면은 이 상태를 그대로 보여 주기만 한다.
import { VIEW_CHANNELS, type ViewChannel } from '../relay/viewerSignal.ts'

/** 시청 전체 상태. offline: 응시자 PC 가 연결돼 있지 않음 */
export type WatchPhase = 'idle' | 'connecting' | 'watching' | 'offline' | 'denied' | 'full' | 'error'
/** 채널별 상태. unavailable: 응시자 쪽에 보낼 영상이 없음 */
export type ChannelPhase = 'waiting' | 'connecting' | 'live' | 'unavailable' | 'failed'

export type WatchState = { phase: WatchPhase; message: string | null; channels: Record<ViewChannel, ChannelPhase> }

const idleChannels = (): Record<ViewChannel, ChannelPhase> => ({ phone: 'waiting', webcam: 'waiting', screen: 'waiting' })

export const WATCH_IDLE: WatchState = { phase: 'idle', message: null, channels: idleChannels() }

/** 서버가 감독관에게 보내는 시청 상태 */
export type ServerWatchState = 'watching' | 'offline' | 'denied' | 'full' | 'error'

export type WatchEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'server'; state: ServerWatchState; message?: string }
  | { type: 'channel'; channel: ViewChannel; phase: ChannelPhase }

export function reduceWatch(state: WatchState, event: WatchEvent): WatchState {
  switch (event.type) {
    case 'open':
      return { phase: 'connecting', message: null, channels: idleChannels() }
    case 'close':
      return WATCH_IDLE
    case 'server': {
      if (state.phase === 'idle') return state // 이미 닫은 뒤에 늦게 온 메시지
      // 정원 초과·권한 없음·오류는 영상 연결이 없으므로 채널도 초기화한다
      const channels = event.state === 'watching' ? state.channels : idleChannels()
      return { phase: event.state === 'watching' ? 'watching' : event.state, message: event.message ?? null, channels }
    }
    case 'channel': {
      if (state.phase === 'idle' || state.channels[event.channel] === event.phase) return state
      return { ...state, channels: { ...state.channels, [event.channel]: event.phase } }
    }
  }
}

/** 상태 한 줄 설명 (화면 머리글) */
export function watchStatusText(state: WatchState): string | null {
  switch (state.phase) {
    case 'idle':
      return null
    case 'connecting':
      return '응시자 PC에 연결하는 중…'
    case 'offline':
      return '응시자 PC가 연결돼 있지 않습니다. 연결되면 자동으로 이어집니다.'
    case 'denied':
      return state.message ?? '이 응시자의 영상을 볼 권한이 없습니다.'
    case 'full':
      return state.message ?? '이 응시자를 보고 있는 감독관이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.'
    case 'error':
      return state.message ?? '영상 연결 중 오류가 발생했습니다.'
    case 'watching': {
      const all = VIEW_CHANNELS.map((c) => state.channels[c])
      return all.every((c) => c === 'live') ? null : '영상 연결 중…'
    }
  }
}

export const CHANNEL_TEXT: Record<ChannelPhase, string> = {
  waiting: '대기 중',
  connecting: '연결 중',
  live: '',
  unavailable: '이 채널은 지금 영상이 없습니다 (연결 안 됨)',
  failed: '영상 연결 안 됨 (네트워크 때문에 직접 연결하지 못했습니다)',
}
