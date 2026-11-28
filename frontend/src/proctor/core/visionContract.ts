// 서버 추론 감독(`/ws/vision`) 메시지 계약의 순수 부분: 메시지 형태, 기본 전송값, 프레임 머리말, 점검 체크리스트.
// 계약 원본: pAIr-docs/설계/서버_추론_감독_설계.md §3-1 (노트 폴더 contract.md v1.2). 계약이 바뀌면 이 파일만 고친다.
import type { CheckItem } from '../check/envChecks.ts'

export const VISION_PATH = '/ws/vision'

export type VisionChannel = 'webcam' | 'phone'
export type VisionState = 'up' | 'down' | 'unknown'
export type VisionMode = 'check' | 'exam'

/** 서버가 지시하는 전송 간격·크기·화질 (`rate`). maxEdge 는 사진 긴 변의 최대 픽셀 */
export type VisionRate = { fps: number; maxEdge: number; quality: number }

/** 서버 지시(`ready`·`rate`)를 받기 전 기본값 (임시: 실측 전). 웹캠은 기존 증거 링 값, 휴대폰은 평소 송신 값 */
export const DEFAULT_RATE: Record<VisionChannel, VisionRate> = {
  webcam: { fps: 1, maxEdge: 400, quality: 0.55 },
  phone: { fps: 1, maxEdge: 512, quality: 0.5 },
}

const FPS_RANGE = { min: 0.5, max: 2 }
const QUALITY_RANGE = { min: 0.3, max: 0.9 }
const EDGE_RANGE = { min: 160, max: 1280 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 서버가 보낸 값을 안전한 범위로 맞춘다. 숫자가 아닌 값은 이전 값을 쓴다 */
export function normalizeRate(input: { fps?: unknown; maxEdge?: unknown; quality?: unknown }, base: VisionRate): VisionRate {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    fps: clamp(num(input.fps, base.fps), FPS_RANGE.min, FPS_RANGE.max),
    maxEdge: Math.round(clamp(num(input.maxEdge, base.maxEdge), EDGE_RANGE.min, EDGE_RANGE.max)),
    quality: clamp(num(input.quality, base.quality), QUALITY_RANGE.min, QUALITY_RANGE.max),
  }
}

/** 전송 간격(ms) */
export const intervalMsOf = (rate: VisionRate): number => Math.round(1000 / rate.fps)

// ---- 클라이언트 → 서버 ----

export type VisionClientMsg =
  | { type: 'hello'; role: 'webcam'; invite: string }
  | { type: 'hello'; role: 'phone'; pairCode: string }
  /** 5초마다. 서버가 pong 으로 답한다 (15초 무신호면 상대에게 stale). 입장 점검의 지연 측정에도 쓴다 */
  | { type: 'ping' }

// ---- 서버 → 클라이언트 ----

/** 입장 점검 판정 (`check` 모드에서만, 영상 없음). 모르는 항목·힌트 코드는 무시한다 */
export type VisionCheck = {
  items: { keyboard?: boolean; mouse?: boolean; leftHand?: boolean; rightHand?: boolean; desk?: boolean }
  hints: string[]
  /** 모든 항목이 연속으로 참인 시간(ms) */
  holdMs: number
  /** 서버가 판정한 통과 (holdMs ≥ 3000, 임시) */
  passed: boolean
}

export type VisionServerMsg =
  | { type: 'paired'; pairCode: string; phoneUrl: string }
  | { type: 'ready'; mode: VisionMode; vision: VisionState; rate?: Partial<VisionRate> }
  | { type: 'peer'; phone: string }
  | { type: 'mode'; mode: VisionMode }
  | { type: 'rate'; fps?: number; maxEdge?: number; quality?: number }
  | { type: 'status'; vision?: VisionState; phone?: string }
  | { type: 'check'; check: VisionCheck }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string }

const modeOf = (v: unknown): VisionMode => (v === 'exam' ? 'exam' : 'check')
const stateOf = (v: unknown): VisionState => (v === 'up' || v === 'down' ? v : 'unknown')

/** 서버 메시지 한 건을 검증해 돌려준다. 형식이 틀리거나 모르는 종류면 null (연결을 끊지 않는다) */
export function parseVisionMsg(raw: unknown): VisionServerMsg | null {
  if (typeof raw !== 'string') return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  switch (o.type) {
    case 'paired':
      return typeof o.pairCode === 'string' && typeof o.phoneUrl === 'string' ? { type: 'paired', pairCode: o.pairCode, phoneUrl: o.phoneUrl } : null
    case 'ready':
      return { type: 'ready', mode: modeOf(o.mode), vision: stateOf(o.vision), rate: o.rate && typeof o.rate === 'object' ? (o.rate as Partial<VisionRate>) : undefined }
    case 'peer':
      return typeof o.phone === 'string' ? { type: 'peer', phone: o.phone } : null
    case 'mode':
      return { type: 'mode', mode: modeOf(o.mode) }
    case 'rate':
      return { type: 'rate', fps: o.fps as number | undefined, maxEdge: o.maxEdge as number | undefined, quality: o.quality as number | undefined }
    case 'status':
      return { type: 'status', vision: o.vision === 'up' || o.vision === 'down' ? o.vision : undefined, phone: typeof o.phone === 'string' ? o.phone : undefined }
    case 'check':
      return parseCheck(o)
    case 'pong':
      return { type: 'pong' }
    case 'error':
      return { type: 'error', code: typeof o.code === 'string' ? o.code : 'UNKNOWN', message: typeof o.message === 'string' ? o.message : '서버 연결 오류' }
    default:
      return null
  }
}

function parseCheck(o: Record<string, unknown>): VisionServerMsg | null {
  if (!o.items || typeof o.items !== 'object') return null
  const src = o.items as Record<string, unknown>
  const items: VisionCheck['items'] = {}
  for (const k of ['keyboard', 'mouse', 'leftHand', 'rightHand', 'desk'] as const) {
    if (typeof src[k] === 'boolean') items[k] = src[k]
  }
  const hints = Array.isArray(o.hints) ? o.hints.filter((h): h is string => typeof h === 'string') : []
  return { type: 'check', check: { items, hints, holdMs: typeof o.holdMs === 'number' ? o.holdMs : 0, passed: o.passed === true } }
}

/** 닫기 코드별 프론트 동작 (계약 §3-1 표) */
export type CloseAction = 'stop' | 'fallback-legacy' | 'consent' | 'retry-5s' | 'retry-backoff'

export function closeAction(code: number, errorCode?: string): CloseAction {
  if (code === 4403) return errorCode === 'CONSENT_REQUIRED' ? 'consent' : 'fallback-legacy'
  if (code === 4400 || code === 4401 || code === 4409) return 'stop'
  if (code === 4429) return 'retry-5s'
  return 'retry-backoff'
}

/** 재연결 대기(ms): 1·2·4·8초, 최대 30초 */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))
}

// ---- 프레임 머리말 ----

/** 사진 앞에 붙는 4바이트: 소켓 안에서 1씩 늘어나는 번호(uint32 BE). 캡처 시각은 보내지 않는다(서버 수신 시각) */
export const FRAME_HEADER_BYTES = 4
/** 한 프레임(머리말 + JPEG) 최대 100KB. 넘으면 서버가 버린다 */
export const MAX_FRAME_BYTES = 100 * 1024

export function packFrame(seq: number, jpeg: ArrayBuffer): ArrayBuffer {
  const out = new Uint8Array(FRAME_HEADER_BYTES + jpeg.byteLength)
  new DataView(out.buffer).setUint32(0, seq >>> 0)
  out.set(new Uint8Array(jpeg), FRAME_HEADER_BYTES)
  return out.buffer
}

// ---- 입장 점검 체크리스트 ----

type ItemKey = keyof VisionCheck['items']
/** id 는 점검 JSON(`env-progress`·`consent`)에 그대로 들어간다 (계약 §10) */
type CheckDef = { key: ItemKey; id: string; label: string; fix: string }

/** 항목 순서와 실패 때 보여 줄 조치 문장. 두 손(왼손·오른손)이 모두 인식되어야 통과한다 */
export const CHECK_DEFS: readonly CheckDef[] = [
  { key: 'keyboard', id: 'phone_keyboard', label: '키보드 인식', fix: '키보드가 보이지 않습니다. 휴대폰을 키보드가 화면 안에 들어오도록 조금 뒤로 옮겨 주세요.' },
  { key: 'mouse', id: 'phone_mouse', label: '마우스 인식', fix: '마우스가 보이지 않습니다. 마우스가 키보드 옆에서 화면 안에 들어오도록 휴대폰 위치를 조정해 주세요.' },
  { key: 'leftHand', id: 'phone_hand_left', label: '왼손 인식', fix: '왼손이 보이지 않습니다. 왼손을 키보드 위에 올려 주세요.' },
  { key: 'rightHand', id: 'phone_hand_right', label: '오른손 인식', fix: '오른손이 보이지 않습니다. 오른손을 마우스 위에 올려 주세요. 두 손이 모두 보여야 통과합니다.' },
  { key: 'desk', id: 'phone_desk', label: '책상 전체 인식', fix: '책상이 일부만 보입니다. 휴대폰을 조금 뒤로 옮기거나 각도를 조정해 책상 전체가 보이게 해 주세요.' },
]

/** 위치 힌트 코드 → 문장. 모르는 코드는 무시한다 (계약: 코드가 추가될 수 있음) */
const HINT_TEXT: Record<string, string> = {
  KEYBOARD_LEFT: '키보드가 화면의 왼쪽에 치우쳐 있습니다. 휴대폰을 왼쪽으로 조금 돌려 주세요.',
  KEYBOARD_RIGHT: '키보드가 화면의 오른쪽에 치우쳐 있습니다. 휴대폰을 오른쪽으로 조금 돌려 주세요.',
  KEYBOARD_TOP: '키보드가 화면의 위쪽에 치우쳐 있습니다. 휴대폰을 위로 조금 기울여 주세요.',
  KEYBOARD_BOTTOM: '키보드가 화면의 아래쪽에 치우쳐 있습니다. 휴대폰을 아래로 조금 기울여 주세요.',
}

/** 판정 힌트 중 우리가 문장을 아는 것만 */
export function hintTexts(hints: readonly string[]): string[] {
  return hints.flatMap((h) => (HINT_TEXT[h] ? [HINT_TEXT[h]] : []))
}

/** 서버 판정 → 체크리스트. 판정이 아직 없으면 확인 중, 실패 항목에는 조치 문장(위치 힌트가 있으면 키보드 항목에 덧붙임) */
export function checkItemsFrom(check: VisionCheck | null, connected: boolean): CheckItem[] {
  const hintLine = check ? hintTexts(check.hints).join(' ') : ''
  return CHECK_DEFS.map((d) => {
    if (!connected) return { id: d.id, label: d.label, status: 'pending', detail: '휴대폰을 먼저 연결해 주세요.' }
    const v = check?.items[d.key]
    if (v === true) return { id: d.id, label: d.label, status: 'pass', detail: '인식되었습니다.' }
    if (v === false) return { id: d.id, label: d.label, status: 'fail', detail: d.key === 'keyboard' && hintLine ? `${d.fix} ${hintLine}` : d.fix }
    return { id: d.id, label: d.label, status: 'running', detail: '확인하는 중입니다.' }
  })
}

/** 서버가 통과로 판정했는지 (모든 항목이 연속으로 참, 두 손이 모두 인식) */
export function checkPassed(check: VisionCheck | null): boolean {
  return !!check && check.passed && CHECK_DEFS.every((d) => check.items[d.key] === true)
}

// ---- 대역폭·지연 점검 ----

export type LinkProbe = { rttMs: number[]; sent: number; lost: number }

/** 지연 p95(ms). 표본이 없으면 null */
export function p95(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]
}

/** 점검 임계값 (실측 전 임시값. M5·M6 측정 뒤 정한다) */
export const LINK_LIMITS = { p95WarnMs: 600, p95FailMs: 1500, lossWarn: 0.1, lossFail: 0.4 }

export function linkVerdict(p: LinkProbe): { status: 'pass' | 'warn' | 'fail'; detail: string } {
  const p95v = p95(p.rttMs)
  const loss = p.sent === 0 ? 1 : p.lost / p.sent
  if (p95v === null) return { status: 'fail', detail: '서버와 통신하지 못했습니다. 인터넷 연결을 확인해 주세요.' }
  const text = `응답 지연 ${Math.round(p95v)}ms · 손실 ${Math.round(loss * 100)}%`
  if (p95v > LINK_LIMITS.p95FailMs || loss > LINK_LIMITS.lossFail) return { status: 'fail', detail: `${text}. 연결이 너무 느립니다. 다른 네트워크(유선·다른 와이파이)로 바꿔 주세요.` }
  if (p95v > LINK_LIMITS.p95WarnMs || loss > LINK_LIMITS.lossWarn) return { status: 'warn', detail: `${text}. 연결이 다소 느립니다. 다른 프로그램의 업로드·다운로드를 멈춰 주세요.` }
  return { status: 'pass', detail: text }
}
