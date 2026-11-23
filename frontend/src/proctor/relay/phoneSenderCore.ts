// 휴대폰 프레임 송신의 순수 계산 (해상도·화질 모드). 브라우저 부분은 phoneSender.ts.

export type SendMode = 'scan' | 'watch'

/** 평소(watch)는 긴 변 512px, 책상 스캔(scan)은 1280px. 해상도는 모드마다 고정하고 화질만 자동 조절한다 */
export const LONG_SIDE: Record<SendMode, number> = { watch: 512, scan: 1280 }

/** 카메라 해상도(video 크기)에서 모드별 고정 크기를 정한다. 방향(가로/세로)과 비율은 유지하고, 카메라보다 키우지 않는다 */
export function frameSizeFor(videoW: number, videoH: number, mode: SendMode): { w: number; h: number } {
  const long = Math.max(videoW, videoH)
  const scale = Math.min(1, LONG_SIDE[mode] / long)
  return { w: Math.round(videoW * scale), h: Math.round(videoH * scale) }
}

/** 지금 보낼 모드. 서버가 보낸 quality.mode(휴대폰 연결 직후와 PC 가 바꿀 때마다 온다)로만 정하고, 아직 못 받았으면 평소(watch) */
export function modeAt(requested: SendMode | null): SendMode {
  return requested ?? 'watch'
}
