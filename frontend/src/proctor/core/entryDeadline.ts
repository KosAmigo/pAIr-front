// 감독 회차의 대기실 입장 마감.
// 감독관이 응시자의 책상 위 사진(환경 점검 스냅샷)을 검증할 시간이 필요해서, 시험 시작 10분 전까지는
// 환경 점검을 마치고 대기실에 들어와 있어야 한다 (사용자 확정). 마감 뒤에 처음 들어오는 응시는 막는다.

/** 마감은 시험 시작 10분 전 */
export const ENTRY_DEADLINE_MS = 10 * 60 * 1000

/** 대기실 입장 마감 시각 (epoch ms) */
export function entryDeadlineAt(startsAtMs: number): number {
  return startsAtMs - ENTRY_DEADLINE_MS
}

/** 마감이 지났는지. nowMs 는 서버 시각 기준(PC 시계 + 서버 시각 보정)으로 넣는다 */
export function entryClosed(startsAtMs: number, nowMs: number): boolean {
  return nowMs > entryDeadlineAt(startsAtMs)
}

/** 응시자 PC 의 현지 시각으로 "HH:MM" */
export function clockOf(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 마감 안내 문구 (입장 화면·대기실에서 같이 쓴다) */
export function entryClosedMessage(startsAtMs: number): string {
  return `감독관이 책상 위 사진을 확인할 시간이 필요해서, 시험 시작 10분 전(${clockOf(entryDeadlineAt(startsAtMs))})까지 환경 점검을 마치고 대기실에 입장해야 합니다. 기업 담당자에게 문의해 주세요.`
}
