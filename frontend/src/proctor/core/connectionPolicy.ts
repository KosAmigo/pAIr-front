// 3채널(웹캠·휴대폰·PC 화면 공유) 연결 정책. 순수 함수라 단위 테스트 대상이다.
// 연결됨 → (끊김 시작) 유예 → 유예 초과 시 차단 → 모두 다시 연결되면 차단 해제.

/** 순간 끊김 유예. 이 안에 복구되면 끊김으로 치지 않는다 (사용자 확정: 15초) */
export const GRACE_MS = 15_000

export type Channel = 'webcam' | 'phone' | 'screen'
export const CHANNELS: readonly Channel[] = ['webcam', 'phone', 'screen']
export const CHANNEL_LABEL: Record<Channel, string> = { webcam: '웹캠', phone: '휴대폰 캠', screen: 'PC 화면 공유' }

export type ChannelUp = Record<Channel, boolean>

export type GateState = {
  /** 채널별 끊기기 시작한 시각(ms). 연결 중이면 키가 없다 */
  lostAt: Partial<Record<Channel, number>>
  /** 유예를 넘겨 막힌 상태. 세 채널이 모두 돌아와야 풀린다 */
  blocked: boolean
}

export type Gate = {
  status: 'ok' | 'grace' | 'blocked'
  /** 지금 끊겨 있는 채널 */
  missing: Channel[]
  /** 유예가 남은 시간(ms). grace 일 때만 의미가 있다 */
  graceLeftMs: number
  /** 이번 갱신에서 유예를 막 넘긴 채널 (차단이 시작되는 순간에만 비어 있지 않다) */
  newlyExpired: Channel[]
}

export const GATE_INITIAL: GateState = { lostAt: {}, blocked: false }

/** 세 채널이 모두 연결돼야 응시를 시작할 수 있다 */
export function allUp(up: ChannelUp): boolean {
  return CHANNELS.every((c) => up[c])
}

export function missingChannels(up: ChannelUp): Channel[] {
  return CHANNELS.filter((c) => !up[c])
}

/** 현재 연결 상태로 다음 상태와 판정을 계산한다 (입력 상태는 바꾸지 않는다) */
export function stepGate(prev: GateState, up: ChannelUp, now: number, graceMs = GRACE_MS): { state: GateState; gate: Gate } {
  const lostAt: Partial<Record<Channel, number>> = {}
  for (const c of CHANNELS) {
    if (!up[c]) lostAt[c] = prev.lostAt[c] ?? now
  }
  const missing = missingChannels(up)
  if (missing.length === 0) return { state: { lostAt, blocked: false }, gate: { status: 'ok', missing, graceLeftMs: graceMs, newlyExpired: [] } }

  const expired = missing.filter((c) => now - (lostAt[c] as number) >= graceMs)
  const blocked = prev.blocked || expired.length > 0
  const oldest = Math.min(...missing.map((c) => lostAt[c] as number))
  const newlyExpired = prev.blocked ? [] : expired
  return {
    state: { lostAt, blocked },
    gate: { status: blocked ? 'blocked' : 'grace', missing, graceLeftMs: Math.max(0, graceMs - (now - oldest)), newlyExpired },
  }
}
