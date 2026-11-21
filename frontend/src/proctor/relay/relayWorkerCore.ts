// 폰 릴레이 연결을 워커에서 돌리는 로직 (워커 껍데기와 분리해 node 에서 테스트한다).
// 모델 추론이 메인 스레드를 8~88초 막아도 WebSocket 과 heartbeat 는 워커에서 계속 돈다.
import type { ClientMsg, RelayHealth, ServerMsg } from './protocol.ts'

export type MainToWorker =
  | { kind: 'init'; pairCode: string }
  | { kind: 'send'; msg: ClientMsg }
  | { kind: 'close' }

export type WorkerToMain =
  | { kind: 'msg'; msg: ServerMsg }
  | { kind: 'open'; open: boolean }
  | { kind: 'health'; health: RelayHealth }

export const HEARTBEAT_MS = 1000

/** 워커가 쓰는 연결의 최소 모양 (RelaySocket 이 만족한다) */
export interface WorkerSocket {
  send(msg: ClientMsg): void
  sendIfOpen(msg: ClientMsg): void
  close(): void
  health(maxTimerLagMs: number): RelayHealth
}

export interface WorkerDeps {
  createSocket: (hello: () => ClientMsg, onMessage: (m: ServerMsg) => void, onOpenChange: (open: boolean) => void) => WorkerSocket
  post: (m: WorkerToMain) => void
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

/** 워커로 들어오는 메시지를 처리하는 함수를 돌려준다 */
export function createRelayWorker(deps: WorkerDeps): (m: MainToWorker) => void {
  let socket: WorkerSocket | null = null
  let timer: unknown = null

  const reportHealth = () => {
    if (socket) deps.post({ kind: 'health', health: socket.health(0) })
  }

  return (m) => {
    if (m.kind === 'init') {
      if (socket) return
      const created = deps.createSocket(
        () => ({ type: 'hello-phone', pairCode: m.pairCode }),
        (msg) => deps.post({ kind: 'msg', msg }),
        (open) => {
          deps.post({ kind: 'open', open })
          reportHealth()
        },
      )
      socket = created
      timer = deps.setInterval(() => created.sendIfOpen({ type: 'heartbeat' }), HEARTBEAT_MS)
      return
    }
    if (m.kind === 'send') {
      socket?.send(m.msg)
      return
    }
    if (timer !== null) deps.clearInterval(timer)
    timer = null
    socket?.close()
    socket = null
  }
}
