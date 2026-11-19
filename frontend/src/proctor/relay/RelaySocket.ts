import { RELAY_PATH, type ClientMsg, type ServerMsg } from './protocol.ts'

/** 릴레이 주소. 백엔드가 다른 호스트면 VITE_PROCTOR_RELAY_URL (예: wss://api.pair.test/ws/proctor) */
function relayUrl(): string {
  const fromEnv = import.meta.env?.VITE_PROCTOR_RELAY_URL as string | undefined
  if (fromEnv) return fromEnv
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${RELAY_PATH}`
}

const MAX_RETRY_DELAY_MS = 5000
const MAX_QUEUE = 200

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
  /** 실제로 보낸 바이트 수 (영상 전송 대비 비교용) */
  bytesSent = 0

  constructor(hello: () => ClientMsg, onMessage: (msg: ServerMsg) => void, onOpenChange?: (open: boolean) => void) {
    this.hello = hello
    this.onMessage = onMessage
    this.onOpenChange = onOpenChange
    this.connect()
  }

  private connect() {
    const ws = new WebSocket(relayUrl())
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.raw(JSON.stringify(this.hello()))
      const pending = this.queue
      this.queue = []
      pending.forEach((p) => this.raw(p))
      this.onOpenChange?.(true)
    }
    ws.onmessage = (e) => {
      let msg: ServerMsg
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg
      } catch {
        return // 형식이 틀린 메시지는 버린다
      }
      if (msg.type === 'error') this.closed = true
      this.onMessage(msg)
    }
    ws.onclose = () => {
      this.onOpenChange?.(false)
      if (this.closed) return
      const delay = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** this.retry++)
      setTimeout(() => this.connect(), delay)
    }
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
