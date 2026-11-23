// 연산 장치(delegate) 선택. 무거운 MediaPipe 를 불러오지 않고도 쓸 수 있게 따로 둔다.
export type Delegate = 'GPU' | 'CPU'

/**
 * 아이폰 사파리는 GPU delegate 로 모델을 여러 번 돌리면 WebGL 메모리가 쌓여 탭이 메모리 부족으로 죽는다
 * ("이 페이지에 문제가 반복적으로 발생했습니다"). 아이폰은 CPU 로 시작한다.
 * 주소 끝에 &delegate=gpu 또는 &delegate=cpu 를 붙이면 기기와 상관없이 그 쪽으로 고정한다 (비교 시험용).
 */
export function forcedDelegate(): Delegate | null {
  const choice = new URLSearchParams(location.search).get('delegate')
  if (choice === 'gpu') return 'GPU'
  if (choice === 'cpu') return 'CPU'
  const ua = navigator.userAgent
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return isIos ? 'CPU' : null
}
