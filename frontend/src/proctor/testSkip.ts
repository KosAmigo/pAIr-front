// 테스트용 "점검 건너뛰기" 표시. 개발 서버이거나 VITE_ALLOW_CHECK_SKIP=true 로 빌드했을 때만 동작한다.
// 건너뛴 응시에서는 카메라 감독 패널과 카메라 연결 오류 창을 띄우지 않는다 (카메라 없이 시험 화면을 확인하려는 용도).
const KEY = 'pair.testSkipChecks'

export const CAN_SKIP_CHECKS = import.meta.env.DEV || import.meta.env.VITE_ALLOW_CHECK_SKIP === 'true'

export function markChecksSkipped() {
  if (!CAN_SKIP_CHECKS) return
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* 저장하지 못하면 이번 화면에서만 건너뜀이 풀린다 */
  }
}

export function clearChecksSkipped() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}

export function checksSkipped(): boolean {
  if (!CAN_SKIP_CHECKS) return false
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
