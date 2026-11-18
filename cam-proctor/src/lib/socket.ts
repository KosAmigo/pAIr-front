import { WS_PATH, type ClientMsg, type ServerMsg } from '../shared/protocol'

/** 끊기면 자동 재연결하고, 끊긴 동안 보낸 메시지는 모아 뒀다 다시 보낸다. */
export class ProctorSocket {
  private ws: WebSocket | null = null
  private queue: string[] = []
  private closed = false
  private retry = 0
  /** 실제로 서버에 보낸 바이트 수 (영상 전송 대비 비교용) */
  bytesSent = 0

  constructor(
    private readonly hello: () => ClientMsg,
    private readonly onMessage: (msg: ServerMsg) => void,
    private readonly onOpenChange?: (open: boolean) => void,
  ) {
    this.connect()
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}${WS_PATH}`)
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
      try {
        this.onMessage(JSON.parse(e.data))
      } catch {
        /* 무시 */
      }
    }
    ws.onclose = () => {
      this.onOpenChange?.(false)
      if (this.closed) return
      const delay = Math.min(5000, 500 * 2 ** this.retry++)
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
    else this.queue.push(data)
  }

  close() {
    this.closed = true
    this.ws?.close()
  }
}
