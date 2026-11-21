// 영상 속 이벤트의 서버 재확인 상태 → 콘솔 배지(문구·색·우선순위). 화면 코드 없이 테스트할 수 있게 순수 함수로 둔다.
// 필드는 백엔드가 구현한 뒤에야 오므로 없을 수 있다. 없으면 배지를 보여 주지 않는다 (docs: pAIr-docs/API/실전시험_감독_API.md "서버 재확인").

export type ServerCheck = 'PENDING' | 'CONFIRMED' | 'UNCONFIRMED'

/** 색 이름은 콘솔 디자인 토큰(signal·caution·alert)과 같다 */
export type ServerCheckTone = 'neutral' | 'signal' | 'caution'

export type ServerCheckBadge = {
  state: ServerCheck
  label: string
  tone: ServerCheckTone
  /** 클수록 감독관이 먼저 봐야 한다. 서버가 못 찾은 이벤트는 오탐일 수도 있어 사람이 사진을 직접 확인해야 한다 */
  priority: number
  hint: string
}

const BADGES: Record<ServerCheck, ServerCheckBadge> = {
  PENDING: { state: 'PENDING', label: '서버 확인 중', tone: 'neutral', priority: 1, hint: '서버가 사진으로 다시 확인하는 중입니다' },
  CONFIRMED: { state: 'CONFIRMED', label: '서버 확인됨', tone: 'signal', priority: 0, hint: '서버도 같은 이벤트를 확인했습니다' },
  UNCONFIRMED: {
    state: 'UNCONFIRMED',
    label: '서버 미확인',
    tone: 'caution',
    priority: 2,
    hint: '서버가 사진에서 찾지 못했습니다. 감독관이 사진을 직접 확인해 주세요',
  },
}

/** 서버 확인 대상은 영상(PC 웹캠·휴대폰)에서 나온 감지 이벤트뿐이다. 브라우저·화면 공유 이벤트와 연결 끊김은 제외 */
const NON_VISUAL_TYPES: ReadonlySet<string> = new Set(['PHONE_DISCONNECTED', 'CONNECTION_LOST', 'LINK_EXPIRED'])

export function isServerCheckTarget(e: { source: string; type: string }): boolean {
  return (e.source === 'PC_CAM' || e.source === 'PHONE_CAM') && !NON_VISUAL_TYPES.has(e.type)
}

/** 알 수 없는 값(백엔드가 나중에 늘린 상태)이나 빠진 필드는 null → 배지 없음 */
export function serverCheckBadge(e: { source: string; type: string; serverCheck?: string | null }): ServerCheckBadge | null {
  if (!isServerCheckTarget(e) || !e.serverCheck) return null
  return BADGES[e.serverCheck as ServerCheck] ?? null
}

/** 정렬·강조용 우선순위. 배지가 없으면 -1 */
export function serverCheckPriority(e: { source: string; type: string; serverCheck?: string | null }): number {
  return serverCheckBadge(e)?.priority ?? -1
}

/** 서버 미확인 건수 (콘솔 머리글 요약용) */
export function countUnconfirmed(events: { source: string; type: string; serverCheck?: string | null }[]): number {
  return events.filter((e) => serverCheckBadge(e)?.state === 'UNCONFIRMED').length
}
