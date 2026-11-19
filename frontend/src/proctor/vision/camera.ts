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

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

/** 경고 순간의 사진 1장 (작게 줄여 JPEG) */
export function captureSnapshot(video: HTMLVideoElement, width = 320, quality = 0.6): string | undefined {
  if (!video.videoWidth) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width)
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * 새 영상 프레임마다 onFrame을 부른다.
 * requestAnimationFrame은 탭이 가려지면 멈추므로(= 다른 탭으로 가면 감독도 멈춤),
 * 가려진 동안에는 타이머로 계속 돈다 (브라우저가 느리게 줄여도 분석은 이어진다).
 */
export function frameLoop(video: HTMLVideoElement, onFrame: (now: number) => void): () => void {
  let stopped = false
  let lastTime = -1
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
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime
      onFrame(performance.now())
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
