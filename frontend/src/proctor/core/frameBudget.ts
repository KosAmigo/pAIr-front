// 폰 분석 부하 제한. 분석이 프레임마다 돌면 CPU delegate 를 쓰는 아이폰에서 메인 스레드가 계속 차서
// 타이머·네트워크가 수십 초씩 밀리고 사파리가 페이지를 다시 불러온다 (2026-11-21 재현 로그).
// 한 번 분석한 뒤에는 최소 간격과, 걸린 시간만큼의 휴식을 두어 분석 점유율을 절반 이하로 묶는다.

/** 폰 감시 분석의 최소 간격: 초당 최대 5회 */
export const PHONE_MIN_ANALYZE_INTERVAL_MS = 200

/** 다음 분석을 시작해도 되는 시각 */
export function nextAllowedAt(startedAt: number, busyMs: number, minIntervalMs: number): number {
  return startedAt + Math.max(minIntervalMs, busyMs * 2)
}
