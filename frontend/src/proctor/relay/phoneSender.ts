// 휴대폰 쪽 프레임 송신 (브라우저 전용). 카메라 영상에서 일정 간격으로 프레임을 뽑아
// 변화가 있을 때만(그리고 5초마다 생존용으로) 고정 해상도 JPEG 로 만들어 서버 중계로 보낸다.
// 분석·모델·영상 스트리밍은 없다. 판정에 쓰는 계산은 core/frameGate.ts · core/jpegQuality.ts · phoneSenderCore.ts.
import { ChangeGate, GATE_DEFAULTS } from '../core/frameGate.ts'
import { MAX_FRAME_BYTES, QUALITY_RANGE, SCAN_TARGET_BYTES, WATCH_TARGET_BYTES, nextQuality } from '../core/jpegQuality.ts'
import type { PhoneRelay } from './PhoneRelay.ts'
import { frameSizeFor, modeAt, type SendMode } from './phoneSenderCore.ts'

/** 변화 확인 간격. 서버 상한(초당 5장) 안에서 여유를 둔 최소 전송 간격(GATE_DEFAULTS.minIntervalMs)과 맞춘다 */
const CHECK_MS = GATE_DEFAULTS.minIntervalMs
/** 시작·모드 전환 직후 이 시간 동안은 변화와 상관없이 보낸다 (PC 가 보정·스캔에 쓸 프레임을 확실히 받도록) */
const FORCE_SEND_MS = 6000
const LUMA_W = 64
const LUMA_H = 48
/** 서버 상한(100KB)에 이만큼 가까워지면 이번 프레임은 버리고 화질을 크게 낮춘다 */
const NEAR_LIMIT_BYTES = Math.floor(MAX_FRAME_BYTES * 0.95)

export type SenderStats = { sent: number; bytes: number; lastBytes: number; quality: number; mode: SendMode }

export class PhoneFrameSender {
  private readonly video: HTMLVideoElement
  private readonly relay: PhoneRelay
  private readonly gate = new ChangeGate()
  /** 캔버스는 한 번 만들어 계속 쓴다 (아이폰 사파리는 새로 만든 캔버스 메모리를 제때 돌려주지 않는다) */
  private readonly lumaCanvas = Object.assign(document.createElement('canvas'), { width: LUMA_W, height: LUMA_H })
  private readonly frameCanvas = document.createElement('canvas')
  private timer: number | null = null
  private encoding = false
  private startedAt = 0
  private forceUntil = 0
  private requested: SendMode | null = null
  private mode: SendMode = 'scan'
  private readonly quality: Record<SendMode, number> = { watch: 0.5, scan: 0.7 }
  private stats: SenderStats = { sent: 0, bytes: 0, lastBytes: 0, quality: 0.7, mode: 'scan' }

  constructor(video: HTMLVideoElement, relay: PhoneRelay) {
    this.video = video
    this.relay = relay
  }

  get snapshot(): SenderStats {
    return this.stats
  }

  start() {
    if (this.timer !== null) return
    this.startedAt = performance.now()
    this.forceUntil = this.startedAt + FORCE_SEND_MS
    this.timer = window.setInterval(() => void this.tick(), CHECK_MS)
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  /** PC 가 요청한 화질 모드 (개발 릴레이만 전달한다). 없으면 시작 후 시간으로 정한다 */
  setRequestedMode(mode: SendMode | null) {
    this.requested = mode
  }

  private async tick() {
    const v = this.video
    if (v.readyState < 2 || !v.videoWidth) return
    const now = performance.now()
    this.relay.alive() // 촬영 루프가 살아 있다 (끊기면 워커의 생존 신호도 멈춘다)
    const mode = modeAt(now - this.startedAt, this.requested)
    if (mode !== this.mode) {
      this.mode = mode
      this.gate.reset()
      this.forceUntil = now + FORCE_SEND_MS
    }
    if (this.encoding) return
    const luma = this.readLuma()
    const changed = this.gate.decide(luma, LUMA_W, LUMA_H, now)
    if (!changed && now > this.forceUntil) return
    this.encoding = true
    try {
      await this.encodeAndSend(mode)
    } finally {
      this.encoding = false
    }
  }

  private readLuma(): Uint8Array {
    const ctx = this.lumaCanvas.getContext('2d', { willReadFrequently: true })
    const out = new Uint8Array(LUMA_W * LUMA_H)
    if (!ctx) return out
    ctx.drawImage(this.video, 0, 0, LUMA_W, LUMA_H)
    const px = ctx.getImageData(0, 0, LUMA_W, LUMA_H).data
    for (let i = 0; i < out.length; i++) out[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
    return out
  }

  private async encodeAndSend(mode: SendMode) {
    const { w, h } = frameSizeFor(this.video.videoWidth, this.video.videoHeight, mode)
    const c = this.frameCanvas
    if (c.width !== w) c.width = w
    if (c.height !== h) c.height = h
    c.getContext('2d')?.drawImage(this.video, 0, 0, w, h)
    const q = this.quality[mode]
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', q))
    if (!blob) return
    const target = mode === 'scan' ? SCAN_TARGET_BYTES : WATCH_TARGET_BYTES
    this.quality[mode] = nextQuality(q, blob.size, target)
    if (blob.size > NEAR_LIMIT_BYTES) {
      // 서버가 버릴 크기: 이번 프레임은 보내지 않고 화질을 확 낮춰 다음 틱에 다시 보낸다
      this.quality[mode] = Math.max(QUALITY_RANGE.min, q * 0.7)
      this.gate.reset()
      return
    }
    this.relay.sendFrame(await blob.arrayBuffer())
    this.stats = { sent: this.stats.sent + 1, bytes: this.stats.bytes + blob.size, lastBytes: blob.size, quality: this.quality[mode], mode }
  }
}
