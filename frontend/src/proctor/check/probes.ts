// 브라우저에서 읽을 수 있는 환경 정보 (장치 이름, 그래픽, 모니터)

export function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return !!brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand))
}

export function isAutomated(): boolean {
  return navigator.webdriver === true
}

export function webglRenderer(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
  } catch {
    return null
  }
}

interface ScreenDetails {
  screens: unknown[]
}

/** 모니터 수. Window Management API(권한 필요) → 안 되면 isExtended */
export async function screenInfo(): Promise<{ count: number | null; isExtended: boolean | undefined }> {
  const isExtended = (screen as Screen & { isExtended?: boolean }).isExtended
  const getDetails = (window as Window & { getScreenDetails?: () => Promise<ScreenDetails> }).getScreenDetails
  if (getDetails) {
    try {
      const d = await getDetails.call(window)
      return { count: d.screens.length, isExtended }
    } catch {
      /* 권한 거부 → isExtended로 */
    }
  }
  return { count: null, isExtended }
}

/** 마이크를 잠깐 열어 장치 이름(이어폰 확인)과 주변 소음 크기를 잰다 */
export async function audioProbe(ms = 2000): Promise<{ labels: string[] | null; noiseDb: number | null }> {
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return { labels: null, noiseDb: null }
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  const labels = devices.filter((d) => d.kind !== 'videoinput').map((d) => d.label).filter(Boolean)
  let noiseDb: number | null = null
  try {
    const ctx = new AudioContext()
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    src.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const samples: number[] = []
    const end = performance.now() + ms
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 100))
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      samples.push(Math.sqrt(sum / buf.length))
    }
    samples.sort((a, b) => a - b)
    const median = samples[Math.floor(samples.length / 2)] || 1e-6
    noiseDb = 20 * Math.log10(median)
    await ctx.close()
  } catch {
    /* 소음 측정은 참고용 */
  }
  stream.getTracks().forEach((t) => t.stop())
  return { labels, noiseDb }
}

/** 영상 프레임을 작게 줄여 RGBA 픽셀을 돌려준다 */
let grabCanvas: HTMLCanvasElement | null = null

export function grabPixels(video: HTMLVideoElement, w = 64, h = 48): ImageData | null {
  if (!video.videoWidth) return null
  // 프레임마다 캔버스를 새로 만들지 않고 하나를 다시 쓴다
  const c = (grabCanvas ??= document.createElement('canvas'))
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export function toGray(img: ImageData): Uint8Array {
  const g = new Uint8Array(img.width * img.height)
  for (let i = 0; i < g.length; i++) {
    const j = i * 4
    g[i] = 0.299 * img.data[j] + 0.587 * img.data[j + 1] + 0.114 * img.data[j + 2]
  }
  return g
}

/** 휴대폰 손전등 (안드로이드 크롬만 지원) */
export async function setTorch(stream: MediaStream, on: boolean): Promise<boolean> {
  const track = stream.getVideoTracks()[0]
  const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean }
  if (!caps?.torch) return false
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
    return true
  } catch {
    return false
  }
}
