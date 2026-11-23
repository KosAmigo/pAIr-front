// 휴대폰 프레임 송신의 순수 계산 (해상도·화질 모드). 브라우저 부분은 phoneSender.ts.

export type SendMode = 'scan' | 'watch'

/** 평소(watch)는 긴 변 512px, 책상 스캔(scan)은 1280px. 해상도는 모드마다 고정하고 화질만 자동 조절한다 */
export const LONG_SIDE: Record<SendMode, number> = { watch: 512, scan: 1280 }

/**
 * 연결 직후 이 시간 동안은 scan 으로 보낸다. 운영 중계가 PC 의 화질 요청(quality)을 아직 휴대폰에 전달하지 않아서,
 * 휴대폰이 스스로 책상 스캔 시간 동안만 높은 화질을 쓰고 평소 화질로 돌아간다. PC 가 요청을 보내면(개발 릴레이) 그 값을 따른다.
 */
export const SCAN_FALLBACK_MS = 120_000

/** 카메라 해상도(video 크기)에서 모드별 고정 크기를 정한다. 방향(가로/세로)과 비율은 유지하고, 카메라보다 키우지 않는다 */
export function frameSizeFor(videoW: number, videoH: number, mode: SendMode): { w: number; h: number } {
  const long = Math.max(videoW, videoH)
  const scale = Math.min(1, LONG_SIDE[mode] / long)
  return { w: Math.round(videoW * scale), h: Math.round(videoH * scale) }
}

/** 지금 보낼 모드. PC 가 정해 준 값(requested)이 있으면 그것, 없으면 시작 후 경과 시간으로 정한다 */
export function modeAt(sinceStartMs: number, requested: SendMode | null): SendMode {
  if (requested) return requested
  return sinceStartMs < SCAN_FALLBACK_MS ? 'scan' : 'watch'
}
