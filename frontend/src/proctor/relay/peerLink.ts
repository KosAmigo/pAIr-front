// 휴대폰 → PC 영상 연결 (WebRTC). 시그널링(offer/answer/ICE)은 릴레이 WebSocket 으로 주고받고,
// 영상 자체는 두 기기가 직접 주고받는다 (같은 와이파이가 아니어도 STUN, 막힌 망은 TURN 이 이어 준다).
// 서버에는 영상이 지나가지 않고 저장되지도 않는다 (TURN 을 쓰면 중계만 하고 저장하지 않는다).
import { setTorch } from '../check/probes.ts'
import type { IceCandidate, RtcSignal, VideoMode } from './rtcSignal.ts'

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const MAX_RETRIES = 3
// 휴대폰 영상은 PC 가 받아 손·물체를 분석하므로 작은 물체가 보일 화질로 보낸다.
// 휴대폰은 모델을 돌리지 않고 영상만 보내므로 낮출 이유가 없다 (해상도 축소 없음).
export const PHONE_VIDEO_MAX_BITRATE = 1_200_000
export const PHONE_VIDEO_MAX_FPS = 15
export const PHONE_VIDEO_SCALE_DOWN = 1
/** 책상 스캔 중에는 책상 위 작은 물체(휴대폰·책)를 타일 감지로 찾을 수 있도록 올려 보낸다. 스캔이 끝나면 되돌린다 */
export const SCAN_VIDEO_MAX_BITRATE = 3_500_000
export const SCAN_VIDEO_MAX_FPS = 15
/** 스캔 때 카메라 캡처 해상도 (되는 기기만 올라가고, 안 되면 열려 있던 해상도 그대로) */
export const SCAN_CAPTURE = { width: 1920, height: 1080 }
export const WATCH_CAPTURE = { width: 1280, height: 720 }

/** 송신 모드별 인코딩 값 (순수 함수: 테스트용) */
export function videoEncoding(mode: VideoMode): { maxBitrate: number; maxFramerate: number; scaleResolutionDownBy: number } {
  return mode === 'scan'
    ? { maxBitrate: SCAN_VIDEO_MAX_BITRATE, maxFramerate: SCAN_VIDEO_MAX_FPS, scaleResolutionDownBy: 1 }
    : { maxBitrate: PHONE_VIDEO_MAX_BITRATE, maxFramerate: PHONE_VIDEO_MAX_FPS, scaleResolutionDownBy: PHONE_VIDEO_SCALE_DOWN }
}
const RETRY_DELAY_MS = 2000

export type LinkState = 'idle' | 'connecting' | 'live' | 'failed'
type SendSignal = (signal: RtcSignal) => void

/**
 * 기본은 공개 STUN. 회사·학교 망처럼 P2P 가 막히는 환경을 위해 TURN 을 쓰려면
 * VITE_TURN_URL (쉼표로 여러 개), VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL 을 설정한다.
 */
export function iceServersFrom(env: Record<string, unknown>): RTCIceServer[] {
  const url = typeof env.VITE_TURN_URL === 'string' ? env.VITE_TURN_URL : ''
  const urls = url.split(',').map((u) => u.trim()).filter(Boolean)
  if (urls.length === 0) return DEFAULT_ICE_SERVERS
  return [
    ...DEFAULT_ICE_SERVERS,
    { urls, username: String(env.VITE_TURN_USERNAME ?? ''), credential: String(env.VITE_TURN_CREDENTIAL ?? '') },
  ]
}

function rtcConfig(): RTCConfiguration {
  return { iceServers: iceServersFrom(import.meta.env ?? {}) }
}

/** 원격 설명이 정해지기 전에 도착한 ICE 후보를 모아 뒀다가 넣는다 */
export class CandidateQueue {
  private queue: IceCandidate[] = []

  async add(pc: RTCPeerConnection, candidate: IceCandidate) {
    if (pc.remoteDescription) await pc.addIceCandidate(candidate)
    else this.queue.push(candidate)
  }

  async flush(pc: RTCPeerConnection) {
    const pending = this.queue
    this.queue = []
    for (const c of pending) await pc.addIceCandidate(c)
  }

  clear() {
    this.queue = []
  }
}

/** 휴대폰 쪽 (offer 를 만든다). PC 가 요청하고 카메라가 열려 있으면 영상 트랙을 실어 보낸다 */
export class PhoneLink {
  private pc: RTCPeerConnection | null = null
  private stream: MediaStream | null = null
  private wanted = false
  private mode: VideoMode = 'watch'
  private readonly queue = new CandidateQueue()
  private readonly send: SendSignal
  private readonly onError: (e: unknown) => void
  private readonly enabled: boolean

  /** enabled=false 면 영상을 보내지 않는다 (휴대폰 페이지가 죽는 원인이 영상 전송인지 가려 볼 때) */
  constructor(send: SendSignal, onError: (e: unknown) => void, enabled = true) {
    this.send = send
    this.onError = onError
    this.enabled = enabled
  }

  /** 카메라가 열리거나 바뀔 때 부른다 (전·후면 전환 포함). null 이면 연결을 닫는다 */
  setStream(stream: MediaStream | null) {
    this.stream = stream
    if (stream) void this.publish()
    else this.closePeer()
  }

  async handle(signal: RtcSignal) {
    try {
      if (signal.kind === 'request') {
        this.wanted = true
        await this.publish()
      } else if (signal.kind === 'quality') {
        await this.applyMode(signal.mode)
      } else if (signal.kind === 'torch') {
        if (this.stream) await setTorch(this.stream, signal.on)
      } else if (signal.kind === 'answer' && this.pc) {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        await this.queue.flush(this.pc)
      } else if (signal.kind === 'candidate' && this.pc) {
        await this.queue.add(this.pc, signal.candidate)
      }
    } catch (e) {
      this.onError(e)
    }
  }

  close() {
    this.stream = null
    this.wanted = false
    this.closePeer()
  }

  private async publish() {
    const stream = this.stream
    if (!this.enabled || !stream || !this.wanted) return
    this.closePeer()
    const pc = new RTCPeerConnection(rtcConfig())
    this.pc = pc
    for (const track of stream.getVideoTracks()) {
      pc.addTransceiver(track, {
        direction: 'sendonly',
        streams: [stream],
        sendEncodings: [videoEncoding(this.mode)],
      })
    }
    pc.onicecandidate = (e) => {
      if (e.candidate && this.pc === pc) this.send({ kind: 'candidate', candidate: toIceCandidate(e.candidate) })
    }
    try {
      await pc.setLocalDescription(await pc.createOffer())
      const sdp = pc.localDescription?.sdp
      if (sdp && this.pc === pc) this.send({ kind: 'offer', sdp })
    } catch (e) {
      this.onError(e)
    }
  }

  /** 연결을 다시 맺지 않고 송신 파라미터와 캡처 해상도만 바꾼다. 실패해도 영상은 이전 화질로 계속 간다 */
  private async applyMode(mode: VideoMode) {
    this.mode = mode
    const track = this.stream?.getVideoTracks()[0]
    const size = mode === 'scan' ? SCAN_CAPTURE : WATCH_CAPTURE
    await track?.applyConstraints({ width: { ideal: size.width }, height: { ideal: size.height } }).catch(() => undefined)
    const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'video')
    if (!sender) return
    const params = sender.getParameters()
    if (!params.encodings?.length) return
    Object.assign(params.encodings[0], videoEncoding(mode))
    await sender.setParameters(params)
  }

  private closePeer() {
    this.pc?.close()
    this.pc = null
    this.queue.clear()
  }
}

/** PC 쪽 (answer 를 만든다). 영상이 도착하면 onChange 로 스트림을 넘긴다. 실패하면 몇 번 다시 요청한다 */
export class PcLink {
  private pc: RTCPeerConnection | null = null
  private retries = 0
  private retryTimer: number | null = null
  private readonly queue = new CandidateQueue()
  private readonly send: SendSignal
  private readonly onChange: (state: LinkState, stream: MediaStream | null) => void

  constructor(send: SendSignal, onChange: (state: LinkState, stream: MediaStream | null) => void) {
    this.send = send
    this.onChange = onChange
  }

  /** 휴대폰에 영상을 보내 달라고 요청한다 */
  request() {
    this.onChange('connecting', null)
    this.send({ kind: 'request' })
  }

  /** 휴대폰 송신 화질을 바꾼다 (책상 스캔 동안만 'scan') */
  setQuality(mode: VideoMode) {
    this.send({ kind: 'quality', mode })
  }

  setTorch(on: boolean) {
    this.send({ kind: 'torch', on })
  }

  async handle(signal: RtcSignal) {
    try {
      if (signal.kind === 'offer') await this.answer(signal.sdp)
      else if (signal.kind === 'candidate' && this.pc) await this.queue.add(this.pc, signal.candidate)
    } catch {
      this.fail()
    }
  }

  close() {
    this.clearRetry()
    this.closePeer()
    this.onChange('idle', null)
  }

  private async answer(sdp: string) {
    this.closePeer()
    const pc = new RTCPeerConnection(rtcConfig())
    this.pc = pc
    pc.onicecandidate = (e) => {
      if (e.candidate && this.pc === pc) this.send({ kind: 'candidate', candidate: toIceCandidate(e.candidate) })
    }
    pc.ontrack = (e) => {
      if (this.pc !== pc) return
      this.onChange('live', e.streams[0] ?? new MediaStream([e.track]))
    }
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return
      if (pc.connectionState === 'connected') this.retries = 0
      if (pc.connectionState === 'failed') this.fail()
    }
    await pc.setRemoteDescription({ type: 'offer', sdp })
    await this.queue.flush(pc)
    await pc.setLocalDescription(await pc.createAnswer())
    const local = pc.localDescription?.sdp
    if (local && this.pc === pc) this.send({ kind: 'answer', sdp: local })
  }

  private fail() {
    this.closePeer()
    if (this.retries >= MAX_RETRIES) {
      this.onChange('failed', null)
      return
    }
    this.retries += 1
    this.onChange('connecting', null)
    this.clearRetry()
    this.retryTimer = window.setTimeout(() => this.request(), RETRY_DELAY_MS)
  }

  private clearRetry() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private closePeer() {
    this.pc?.close()
    this.pc = null
    this.queue.clear()
  }
}

function toIceCandidate(c: RTCIceCandidate): IceCandidate {
  return { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment }
}
