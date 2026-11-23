// 휴대폰 JPEG 화질 자동 조절 (순수 계산). 기종마다 같은 화질에서 크기가 달라(아이폰이 1.6~1.8배)
// 방금 보낸 프레임 크기를 보고 다음 화질을 정해 장당 크기를 목표에 맞춘다.

/** 평소(감시) 목표 크기. 실측 13~15KB 에 맞춘다 (Worker_분리_설계.md 13장) */
export const WATCH_TARGET_BYTES = 14_000
/** 책상 스캔 목표 크기. 서버 상한(프레임당 100KB) 아래 */
export const SCAN_TARGET_BYTES = 70_000
/** 서버가 받는 프레임 상한(100KB). 이보다 크면 서버가 버린다 */
export const MAX_FRAME_BYTES = 100_000

export const QUALITY_RANGE = { min: 0.3, max: 0.85 } as const
/** 목표의 ±5% 안이면 건드리지 않는다 */
const DEAD_BAND = 0.05
/** 한 번에 바꾸는 비율 한계 (진동 방지) */
const MAX_STEP = 0.2
/** 크기는 화질에 대략 1.7제곱 비례한다. 그래서 크기 오차의 1/1.7 제곱근 만큼만 움직이면 안정적으로 수렴한다 */
const SIZE_EXPONENT = 1.7

export function nextQuality(current: number, sizeBytes: number, targetBytes: number): number {
  if (sizeBytes <= 0) return current
  const err = targetBytes / sizeBytes
  if (Math.abs(err - 1) <= DEAD_BAND) return current
  const ratio = Math.min(1 + MAX_STEP, Math.max(1 - MAX_STEP, err ** (1 / SIZE_EXPONENT)))
  const next = current * ratio
  return Math.round(Math.min(QUALITY_RANGE.max, Math.max(QUALITY_RANGE.min, next)) * 1000) / 1000
}
