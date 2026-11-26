// 서버 모드의 웹캠 사진 송신. 분석 없이 서버가 지시한 간격·크기·화질(rate)로 JPEG 만 뽑아 보낸다.
import { DEFAULT_RATE, intervalMsOf, normalizeRate, type VisionRate } from '../core/visionContract.ts'

export interface FrameSink {
  sendFrame(jpeg: ArrayBuffer): boolean
}

export class WebcamVisionSender {
  private rate: VisionRate = DEFAULT_RATE.webcam
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private encoding = false
  /** 캔버스는 한 번 만들어 계속 쓴다 */
  private readonly canvas = document.createElement('canvas')
  sent = 0

  private readonly video: HTMLVideoElement
  private readonly sink: FrameSink

  constructor(video: HTMLVideoElement, sink: FrameSink) {
    this.video = video
    this.sink = sink
  }

  /** 서버 `rate` 지시 반영 (다음 사진부터 적용) */
  setRate(input: { fps?: unknown; maxEdge?: unknown; quality?: unknown }) {
    this.rate = normalizeRate(input, this.rate)
  }

  get currentRate(): VisionRate {
    return this.rate
  }

  start() {
    if (this.running) return
    this.running = true
    this.schedule()
  }

  stop() {
    this.running = false
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule() {
    if (!this.running) return
    this.timer = setTimeout(() => void this.tick(), intervalMsOf(this.rate))
  }

  private async tick() {
    try {
      // 탭이 가려져도 보낸다 (웹캠 사진은 서버가 상시 저장한다). 영상 프레임이 아직 없으면 건너뛴다
      if (!this.encoding && this.video.readyState >= 2 && this.video.videoWidth) await this.encodeAndSend()
    } catch (e) {
      console.warn('웹캠 사진 전송 실패:', e)
    } finally {
      this.schedule()
    }
  }

  private async encodeAndSend() {
    this.encoding = true
    try {
      const { maxEdge, quality } = this.rate
      const v = this.video
      // 긴 변을 maxEdge 이하로 맞춘다 (카메라보다 키우지 않는다)
      const scale = Math.min(1, maxEdge / Math.max(v.videoWidth, v.videoHeight))
      const w = Math.round(v.videoWidth * scale)
      const h = Math.round(v.videoHeight * scale)
      const c = this.canvas
      if (c.width !== w) c.width = w
      if (c.height !== h) c.height = h
      c.getContext('2d')?.drawImage(v, 0, 0, w, h)
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', quality))
      if (!blob) return
      if (this.sink.sendFrame(await blob.arrayBuffer())) this.sent++
    } finally {
      this.encoding = false
    }
  }
}
