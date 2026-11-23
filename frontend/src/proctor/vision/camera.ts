import { nextAllowedAt } from '../core/frameBudget.ts'

export async function openCamera(
  video: HTMLVideoElement,
  facingMode: 'user' | 'environment',
  size: { width: number; height: number } = { width: 640, height: 480 },
) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('이 브라우저에서는 카메라를 쓸 수 없습니다. HTTPS 주소로 접속했는지 확인해 주세요.')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode, width: { ideal: size.width }, height: { ideal: size.height }, frameRate: { ideal: 30 } },
    })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError') throw new Error('카메라 권한이 거부되었습니다. 주소창의 카메라 아이콘에서 허용한 뒤 다시 시도해 주세요.')
    if (name === 'NotFoundError') throw new Error('카메라를 찾을 수 없습니다.')
    if (name === 'NotReadableError') throw new Error('다른 프로그램이 카메라를 쓰고 있습니다. 화상회의 앱 등을 종료해 주세요.')
    throw e
  }
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  return stream
}

/** 화면에 보이지 않아도 프레임이 돌도록 문서에 붙인 숨은 video (display:none 은 멈출 수 있음). 다 쓰면 release 를 부른다 */
export async function attachHiddenVideo(stream: MediaStream): Promise<{ video: HTMLVideoElement; release: () => void }> {
  const video = document.createElement('video')
  video.setAttribute('aria-hidden', 'true')
  Object.assign(video.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' })
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  document.body.appendChild(video)
  const release = () => {
    video.srcObject = null
    video.remove()
  }
  try {
    await video.play()
  } catch (e) {
    release()
    throw e
  }
  return { video, release }
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

/** 사진 캔버스는 한 번 만들어 계속 쓴다 (아이폰 사파리는 새로 만든 캔버스 메모리를 제때 돌려주지 않는다) */
let snapshotCanvas: HTMLCanvasElement | null = null

/** 경고 순간의 사진 1장 (작게 줄여 JPEG) */
export function captureSnapshot(video: HTMLVideoElement, width = 320, quality = 0.6): string | undefined {
  if (!video.videoWidth) return undefined
  const canvas = (snapshotCanvas ??= document.createElement('canvas'))
  const height = Math.round((video.videoHeight / video.videoWidth) * width)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * 새 영상 프레임마다 onFrame을 부른다.
 * requestAnimationFrame은 탭이 가려지면 멈추므로(= 다른 탭으로 가면 감독도 멈춤),
 * 가려진 동안에는 타이머로 계속 돈다 (브라우저가 느리게 줄여도 분석은 이어진다).
 *
 * onFrame 이 Promise 를 돌려주면 끝날 때까지 기다린 뒤(걸린 시간을 쉬는 시간 계산에 쓴다) 다음 프레임을 예약한다.
 * 그래서 비동기 분석(Web Worker)이 겹쳐서 쌓이지 않는다. 그 Promise 가 거절되면 onError 로 알리고 루프는 이어 간다.
 */
export function frameLoop(
  video: HTMLVideoElement,
  onFrame: (now: number) => void | Promise<void>,
  opts: { minIntervalMs?: number; onError?: (e: unknown) => void } = {},
): () => void {
  let stopped = false
  let lastTime = -1
  let allowedAt = 0
  const minIntervalMs = opts.minIntervalMs ?? 0
  // rAF와 타이머 중 먼저 오는 쪽이 한 번만 실행 (rAF를 걸어 둔 채 탭이 가려져도 타이머가 이어 받는다)
  let pending = false
  const run = () => {
    if (!pending) return
    pending = false
    tick()
  }
  const schedule = () => {
    if (pending) return
    pending = true
    if (document.visibilityState === 'hidden') {
      setTimeout(run, 100)
    } else {
      requestAnimationFrame(run)
      setTimeout(run, 250)
    }
  }
  const tick = () => {
    if (stopped) return
    const started = performance.now()
    if (video.readyState >= 2 && video.currentTime !== lastTime && started >= allowedAt) {
      lastTime = video.currentTime
      const result = onFrame(started)
      if (result instanceof Promise) {
        // 끝날 때까지 다음 프레임을 예약하지 않는다 (겹쳐 실행되지 않음)
        result
          .catch((e: unknown) => (opts.onError ?? ((err: unknown) => console.error('frameLoop 오류:', err)))(e))
          .finally(() => {
            if (minIntervalMs > 0) allowedAt = nextAllowedAt(started, performance.now() - started, minIntervalMs)
            schedule()
          })
        return
      }
      if (minIntervalMs > 0) allowedAt = nextAllowedAt(started, performance.now() - started, minIntervalMs)
    }
    schedule()
  }
  schedule()
  return () => {
    stopped = true
  }
}

export class FpsMeter {
  private times: number[] = []
  tick(now: number) {
    this.times.push(now)
    while (this.times.length && now - this.times[0] > 1000) this.times.shift()
  }
  get fps() {
    return this.times.length
  }
}
