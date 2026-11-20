// 이탈 누적 횟수를 이 브라우저에 기억해 새로 고침해도 이어 센다 (화면 표시용).
// 감독 기록 자체는 camHub 가 백엔드 감독 이벤트(proctor_events, source=BROWSER)로 보낸다.
const PREFIX = 'pair:anti-cheating:count:'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readViolationCount(sessionId: string): number {
  const raw = storage()?.getItem(PREFIX + encodeURIComponent(sessionId))
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function writeViolationCount(sessionId: string, count: number) {
  try {
    storage()?.setItem(PREFIX + encodeURIComponent(sessionId), String(count))
  } catch {
    /* 저장하지 못하면 이번 화면에서만 센다 */
  }
}
