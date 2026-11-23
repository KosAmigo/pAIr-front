// 증거 구간 타임라인·보관 기간 표시용 순수 계산 (화면 컴포넌트는 EvidenceClip.tsx · RetentionBar.tsx).

const DAY_MS = 24 * 3600 * 1000
/** 백엔드 규칙: 삭제 예정 2일 전부터 연장할 수 있다 */
const EXTEND_WINDOW_DAYS = 2

export type RetentionLike = {
  expiresAt: string
  extensionsUsed: number
  maxExtensions: number
  extensionDays: number
  canExtend: boolean
}

export type RetentionNotice = {
  text: string
  usage: string
  daysLeft: number
  expired: boolean
  tone: 'neutral' | 'caution' | 'alert'
  /** 연장 버튼이 꺼져 있을 때 이유 (연장할 수 있으면 null) */
  extendHint: string | null
}

export function retentionNotice(r: RetentionLike, now: number): RetentionNotice {
  const leftMs = Date.parse(r.expiresAt) - now
  const daysLeft = Math.max(0, Math.ceil(leftMs / DAY_MS))
  const expired = leftMs <= 0
  const usage = `연장 ${r.extensionsUsed}/${r.maxExtensions}회`
  if (expired) {
    return { text: '보관 기간이 지나 사진이 삭제되었습니다', usage, daysLeft: 0, expired, tone: 'alert', extendHint: '삭제 예정 시각이 지나 연장할 수 없습니다' }
  }
  const soon = leftMs <= EXTEND_WINDOW_DAYS * DAY_MS
  let extendHint: string | null = null
  if (!r.canExtend) {
    extendHint =
      r.extensionsUsed >= r.maxExtensions ? `연장은 최대 ${r.maxExtensions}번까지 할 수 있습니다` : `삭제 예정 ${EXTEND_WINDOW_DAYS}일 전부터 연장할 수 있습니다`
  }
  return { text: `사진이 ${daysLeft}일 뒤 삭제됩니다`, usage, daysLeft, expired, tone: soon ? 'caution' : 'neutral', extendHint }
}

/** 이벤트 시각 기준 오프셋 표시: -8.0초 / 0.0초 / +2.5초 */
export function offsetLabel(offsetMs: number): string {
  const sec = (offsetMs / 1000).toFixed(1)
  return offsetMs > 0 ? `+${sec}초` : `${sec}초`
}

export type ClipFrameLike = { id: number; source: 'PC_CAM' | 'PHONE_CAM'; offsetMs: number; sizeBytes: number; deleted: boolean }

/** 구간 사진을 웹캠 줄과 휴대폰 줄로 나누고 시간순으로 정렬한다 */
export function splitBySource<T extends ClipFrameLike>(frames: T[]): { pc: T[]; phone: T[] } {
  const sorted = [...frames].sort((a, b) => a.offsetMs - b.offsetMs)
  return { pc: sorted.filter((f) => f.source === 'PC_CAM'), phone: sorted.filter((f) => f.source === 'PHONE_CAM') }
}
