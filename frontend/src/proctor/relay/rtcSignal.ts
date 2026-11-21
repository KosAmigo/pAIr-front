// WebRTC 시그널링 메시지 (휴대폰 ↔ PC). 릴레이 서버는 내용을 해석하지 않고 짝에게 그대로 넘긴다.
// 서버가 넘기기 전에 형식을 검사하도록 파서를 한곳에 둔다 (서버·클라이언트 공용, DOM 타입 없이 동작).

export interface IceCandidate {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
  usernameFragment: string | null
}

export type VideoMode = 'watch' | 'scan'

export type RtcSignal =
  /** PC → 휴대폰: 영상을 보내 달라는 요청 (PC 가 새로 붙거나 연결이 실패했을 때) */
  | { kind: 'request' }
  /** PC → 휴대폰: 송신 화질 전환. 'scan' 은 책상 스캔 동안만 고화질, 끝나면 'watch' 로 되돌린다 */
  | { kind: 'quality'; mode: VideoMode }
  /** PC → 휴대폰: 손전등 (어두운 방 점검용, 안드로이드 크롬만 지원) */
  | { kind: 'torch'; on: boolean }
  /** 휴대폰 → PC */
  | { kind: 'offer'; sdp: string }
  /** PC → 휴대폰 */
  | { kind: 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: IceCandidate }

const MAX_SDP_LENGTH = 32_000
const MAX_CANDIDATE_LENGTH = 2_000

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function parseCandidate(value: unknown): IceCandidate | null {
  const c = asRecord(value)
  if (!c || typeof c.candidate !== 'string' || c.candidate.length > MAX_CANDIDATE_LENGTH) return null
  return {
    candidate: c.candidate,
    sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : null,
    sdpMLineIndex: typeof c.sdpMLineIndex === 'number' ? c.sdpMLineIndex : null,
    usernameFragment: typeof c.usernameFragment === 'string' ? c.usernameFragment : null,
  }
}

/** 클라이언트가 보낸 값이므로 알려진 필드만 골라 새 객체로 돌려준다. 형식이 틀리면 null */
export function parseRtcSignal(value: unknown): RtcSignal | null {
  const v = asRecord(value)
  if (!v) return null
  switch (v.kind) {
    case 'request':
      return { kind: 'request' }
    case 'quality':
      return v.mode === 'scan' || v.mode === 'watch' ? { kind: 'quality', mode: v.mode } : null
    case 'torch':
      return typeof v.on === 'boolean' ? { kind: 'torch', on: v.on } : null
    case 'offer':
    case 'answer':
      if (typeof v.sdp !== 'string' || v.sdp.length === 0 || v.sdp.length > MAX_SDP_LENGTH) return null
      return { kind: v.kind, sdp: v.sdp }
    case 'candidate': {
      const candidate = parseCandidate(v.candidate)
      return candidate ? { kind: 'candidate', candidate } : null
    }
    default:
      return null
  }
}
