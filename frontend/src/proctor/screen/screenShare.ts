// PC 화면 공유 (getDisplayMedia). 화면 영상은 녹화·저장·분석하지 않는다.
// 이 브라우저 안에서 (1) 공유가 살아 있는지 (2) 전체 화면인지 확인하고, (3) 이벤트 순간의 글자를 읽을 수 없는 흐린 사진 1장만 만든다.

/** 화면 공유 동의 문구 (입장 화면·사전 테스트가 같이 쓴다) */
export const SCREEN_CONSENT_LINES = [
  '시험 중 PC 화면 공유가 필요합니다. 화면 영상은 녹화·저장하지 않고, 화면 속 내용을 분석하지 않습니다.',
  '감독관이 내 영상(웹캠·휴대폰·화면)을 열어 볼 때만 그 순간 실시간으로 전달되며, 보는 동안 화면에 표시됩니다.',
  '이벤트가 생긴 순간의 화면 한 장만, 글자를 읽을 수 없게 흐리게 처리해 저장합니다.',
  '공유 대상은 반드시 "전체 화면"을 고르세요. 창이나 탭만 공유하면 시험을 시작할 수 없습니다.',
] as const

/** 흐린 사진 가로 크기(px). 이 정도로 줄이면 글자를 알아볼 수 없다 */
export const BLUR_WIDTH = 96
const BLUR_QUALITY = 0.5

export type ShareKind = 'full' | 'partial' | 'unknown'

/** 공유한 대상이 전체 화면(monitor)인지. 브라우저가 알려 주지 않으면 unknown (막지 않고 기록만 한다) */
export function classifySurface(displaySurface: string | undefined): ShareKind {
  if (displaySurface === 'monitor') return 'full'
  if (displaySurface === 'window' || displaySurface === 'browser') return 'partial'
  return 'unknown'
}

/** 흐린 사진 크기 (가로 BLUR_WIDTH, 세로는 비율대로, 최소 1) */
export function blurSize(videoWidth: number, videoHeight: number, width = BLUR_WIDTH): { w: number; h: number } {
  if (videoWidth <= 0 || videoHeight <= 0) return { w: 0, h: 0 }
  return { w: width, h: Math.max(1, Math.round((videoHeight / videoWidth) * width)) }
}

export type ScreenHandle = {
  stream: MediaStream
  kind: ShareKind
  /** 지금 화면 한 장을 흐리게 만든다 (실패하면 undefined) */
  captureBlurred: () => string | undefined
  stop: () => void
}

export class ScreenShareError extends Error {
  readonly cancelled: boolean
  constructor(message: string, cancelled: boolean) {
    super(message)
    this.cancelled = cancelled
  }
}

/** 화면 공유를 시작한다. 반드시 응시자의 클릭(동의) 안에서 불러야 한다. onEnded: 공유가 끊기면(브라우저 "공유 중지" 포함) 한 번 불린다 */
export async function startScreenShare(onEnded: () => void): Promise<ScreenHandle> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new ScreenShareError('이 브라우저는 화면 공유를 지원하지 않습니다. 최신 크롬·엣지를 사용해 주세요.', false)
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor', frameRate: { ideal: 2, max: 5 } } as MediaTrackConstraints, audio: false })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError' || name === 'AbortError') throw new ScreenShareError('화면 공유가 취소되었습니다. 다시 시도해 주세요.', true)
    throw new ScreenShareError(e instanceof Error ? e.message : String(e), false)
  }
  const track = stream.getVideoTracks()[0]
  const kind = classifySurface((track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface)
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  void video.play().catch(() => undefined)
  const canvas = document.createElement('canvas')
  let ended = false
  const finish = () => {
    if (ended) return
    ended = true
    onEnded()
  }
  track?.addEventListener('ended', finish)
  return {
    stream,
    kind,
    captureBlurred: () => {
      const { w, h } = blurSize(video.videoWidth, video.videoHeight)
      if (!w) return undefined
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return undefined
      ctx.filter = 'blur(1px)'
      ctx.drawImage(video, 0, 0, w, h)
      return canvas.toDataURL('image/jpeg', BLUR_QUALITY)
    },
    stop: () => {
      ended = true
      track?.removeEventListener('ended', finish)
      stream.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    },
  }
}
