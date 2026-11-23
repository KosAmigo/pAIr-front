import { RELAY_PATH, type ClientMsg, type RelayHealth, type ServerMsg } from './protocol.ts'

/** 릴레이 주소. 백엔드가 다른 호스트면 VITE_PROCTOR_RELAY_URL (예: wss://api.pair.test/ws/proctor) */
function relayUrl(): string {
  const fromEnv = import.meta.env?.VITE_PROCTOR_RELAY_URL as string | undefined
  if (fromEnv) return fromEnv
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${RELAY_PATH}`
}

const MAX_RETRY_DELAY_MS = 5000
const MAX_QUEUE = 200
/** 전송 대기 바이트가 프레임 서너 장(약 14KB × 4)을 넘으면 새 프레임은 버린다 */
const MAX_BUFFERED_BYTES = 60_000

/**
 * 끊기면 자동 재연결하고, 끊긴 동안 보낸 메시지는 모아 뒀다 다시 보낸다.
 * 서버가 error 를 보내면(토큰·짝 코드가 틀림) 재연결해도 소용없으므로 멈춘다.
 */
export class RelaySocket {
  private ws: WebSocket | null = null
  private queue: string[] = []
  private closed = false
  private retry = 0
  private readonly hello: () => ClientMsg
  private readonly onMessage: (msg: ServerMsg) => void
  private readonly onOpenChange?: (open: boolean) => void
  private readonly onBinary?: (data: ArrayBuffer) => void
  /** 실제로 보낸 바이트 수 (영상 전송 대비 비교용) */
  bytesSent = 0
  private reconnects = 0
  private lastCloseAt = 0
  private lastCloseCode = 0
  private opened = false

  constructor(hello: () => ClientMsg, onMessage: (msg: ServerMsg) => void, onOpenChange?: (open: boolean) => void, onBinary?: (data: ArrayBuffer) => void) {
    this.onBinary = onBinary
    this.hello = hello
    this.onMessage = onMessage
    this.onOpenChange = onOpenChange
    this.connect()
  }

  private connect() {
    const ws = new WebSocket(relayUrl())
    this.ws = ws
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      if (this.opened) this.reconnects++
      this.opened = true
      this.retry = 0
      this.raw(JSON.stringify(this.hello()))
      const pending = this.queue
      this.queue = []
      pending.forEach((p) => this.raw(p))
      this.onOpenChange?.(true)
    }
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') {
        // 휴대폰 JPEG 프레임 (서버가 최신 한 장만 넘긴다)
        if (e.data instanceof ArrayBuffer) this.onBinary?.(e.data)
        return
      }
      let msg: ServerMsg
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg
      } catch {
        return // 형식이 틀린 메시지는 버린다
      }
      if (msg.type === 'error') this.closed = true
      this.onMessage(msg)
    }
    ws.onclose = (e) => {
      this.lastCloseAt = Date.now()
      this.lastCloseCode = e.code
      this.onOpenChange?.(false)
      if (this.closed) return
      const delay = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** this.retry++)
      setTimeout(() => this.connect(), delay)
    }
  }

  /** 폰 연결 이력. phone-status 에 실어 PC·릴레이 로그에서 끊김 시각을 맞춰 본다 */
  health(maxTimerLagMs: number): RelayHealth {
    return { reconnects: this.reconnects, lastCloseAt: this.lastCloseAt, lastCloseCode: this.lastCloseCode, maxTimerLagMs }
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** 연결돼 있을 때만 보낸다 (끊긴 동안 쌓아 두면 안 되는 heartbeat 용) */
  sendIfOpen(msg: ClientMsg) {
    if (this.isOpen()) this.raw(JSON.stringify(msg))
  }

  /** 휴대폰 페이지가 워커 없이 이 소켓을 직접 쓸 때의 자리 맞춤 (생존 신호 게이팅은 워커에서만 한다) */
  alive() {}

  /** 프레임(binary) 전송. 끊겼거나 보내는 쪽 버퍼가 차 있으면 버린다 (오래된 프레임을 쌓지 않는다) */
  sendFrame(data: ArrayBuffer) {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES) return
    ws.send(data)
    this.bytesSent += data.byteLength
  }

  private raw(data: string) {
    this.ws?.send(data)
    this.bytesSent += data.length
  }

  send(msg: ClientMsg) {
    const data = JSON.stringify(msg)
    if (this.ws?.readyState === WebSocket.OPEN) this.raw(data)
    else if (this.queue.length < MAX_QUEUE) this.queue.push(data)
  }

  close() {
    this.closed = true
    this.ws?.close()
  }
}
