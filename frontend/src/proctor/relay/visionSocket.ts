// `/ws/vision` 연결 (서버 추론 감독). 웹캠(PC)과 휴대폰 페이지가 같이 쓴다.
// 끊기면 계약의 닫기 코드표대로 재연결하고, 사진은 최신 한 장만 보낸다 (밀리면 버리고 쌓지 않는다).
import { VISION_PATH, backoffMs, closeAction, packFrame, parseVisionMsg, MAX_FRAME_BYTES, type CloseAction, type VisionClientMsg, type VisionServerMsg } from '../core/visionContract.ts'
import type { RelayHealth } from './protocol.ts'
import type { PhoneRelay } from './PhoneRelay.ts'

/** 주소. 백엔드가 다른 호스트면 VITE_VISION_URL (예: wss://api.pair.test/ws/vision) */
export function visionUrl(): string {
  const fromEnv = import.meta.env?.VITE_VISION_URL as string | undefined
  if (fromEnv) return fromEnv
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${VISION_PATH}`
}

/** 보내는 쪽 버퍼에 이만큼(사진 서너 장) 쌓여 있으면 새 사진은 버린다 */
const MAX_BUFFERED_BYTES = 80_000
/** 5초마다 ping (15초 무신호면 서버가 상대에게 stale 로 알린다) */
const PING_MS = 5000
const RATE_LIMIT_RETRY_MS = 5000

export type VisionSocketOptions = {
  hello: () => VisionClientMsg
  onMessage: (msg: VisionServerMsg) => void
  onOpenChange?: (open: boolean) => void
  /** 재연결하지 않는 닫힘 (토큰 오류·교체·서버 모드 불가·동의 필요). errorCode 는 닫기 직전 error 메시지의 code */
  onStop?: (action: CloseAction, code: number, errorCode?: string) => void
  /** 테스트용 주입 */
  createSocket?: (url: string) => WebSocket
}

export class VisionSocket implements PhoneRelay {
  bytesSent = 0
  private ws: WebSocket | null = null
  private closed = false
  private retry = 0
  private seq = 0
  private reconnects = 0
  private lastCloseAt = 0
  private lastCloseCode = 0
  private opened = false
  private lastErrorCode: string | undefined
  private dropped: (() => void) | null = null
  private pinger: ReturnType<typeof setInterval> | null = null
  private readonly opt: VisionSocketOptions
  /** 보낸 사진 수와 버린 사진 수 (진단용) */
  sentFrames = 0
  droppedFrames = 0

  constructor(opt: VisionSocketOptions) {
    this.opt = opt
    this.connect()
  }

  private connect() {
    const make = this.opt.createSocket ?? ((u: string) => new WebSocket(u))
    const ws = make(visionUrl())
    this.ws = ws
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      if (this.opened) this.reconnects++
      this.opened = true
      this.lastErrorCode = undefined
      this.seq = 0 // 재연결하면 번호는 다시 시작해도 된다
      this.rawSend(JSON.stringify(this.opt.hello()))
      this.opt.onOpenChange?.(true)
    }
    ws.onmessage = (e) => {
      const msg = parseVisionMsg(e.data)
      if (!msg) return // 형식이 틀리거나 모르는 메시지는 버린다
      if (msg.type === 'ready') this.retry = 0
      if (msg.type === 'error') this.lastErrorCode = msg.code // 소켓은 서버가 닫는다 (닫기 코드로 판단). FRAME_TOO_LARGE 등은 소켓이 유지된다
      this.opt.onMessage(msg)
    }
    ws.onclose = (e) => {
      this.lastCloseAt = Date.now()
      this.lastCloseCode = e.code
      this.opt.onOpenChange?.(false)
      if (this.closed) return
      const action = closeAction(e.code, this.lastErrorCode)
      if (action === 'stop' || action === 'fallback-legacy' || action === 'consent') {
        this.closed = true
        this.stopPing()
        this.opt.onStop?.(action, e.code, this.lastErrorCode)
        return
      }
      const delay = action === 'retry-5s' ? RATE_LIMIT_RETRY_MS : backoffMs(this.retry++)
      setTimeout(() => this.connect(), delay)
    }
    if (this.pinger === null) this.pinger = setInterval(() => this.sendIfOpen({ type: 'ping' }), PING_MS)
  }

  private stopPing() {
    if (this.pinger !== null) clearInterval(this.pinger)
    this.pinger = null
  }

  private rawSend(data: string | ArrayBuffer) {
    this.ws?.send(data)
    this.bytesSent += typeof data === 'string' ? data.length : data.byteLength
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** 연결돼 있을 때만 보낸다 (끊긴 동안 쌓아 두면 안 되는 신호) */
  sendIfOpen(msg: VisionClientMsg) {
    if (this.isOpen()) this.rawSend(JSON.stringify(msg))
  }

  /** PhoneRelay 호환: 휴대폰 페이지의 옛 phone-status 메시지는 서버 모드에서 쓰지 않으므로 무시한다 */
  send(_msg: unknown) {}

  alive() {}

  onFrameDropped(cb: () => void) {
    this.dropped = cb
  }

  health(maxTimerLagMs: number): RelayHealth {
    return { reconnects: this.reconnects, lastCloseAt: this.lastCloseAt, lastCloseCode: this.lastCloseCode, maxTimerLagMs }
  }

  /** JPEG 한 장을 4바이트 번호 머리말을 붙여 보낸다. 끊겼거나 버퍼가 차 있거나 100KB 를 넘으면 버리고 false */
  sendFrame(jpeg: ArrayBuffer): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES || jpeg.byteLength + 4 > MAX_FRAME_BYTES) {
      this.droppedFrames++
      this.dropped?.()
      return false
    }
    this.rawSend(packFrame(this.seq++, jpeg))
    this.sentFrames++
    return true
  }

  close() {
    this.closed = true
    this.stopPing()
    this.ws?.close()
  }
}
