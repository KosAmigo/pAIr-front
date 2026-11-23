// 폰 릴레이 연결을 워커에서 돌리는 로직 (워커 껍데기와 분리해 node 에서 테스트한다).
// 모델 추론이 메인 스레드를 8~88초 막아도 WebSocket 과 heartbeat 는 워커에서 계속 돈다.
import type { ClientMsg, RelayHealth, ServerMsg } from './protocol.ts'

export type MainToWorker =
  | { kind: 'init'; pairCode: string }
  | { kind: 'send'; msg: ClientMsg }
  /** 휴대폰 JPEG 한 장 (binary). 서버는 최신 한 장만 PC 로 넘긴다 */
  | { kind: 'frame'; data: ArrayBuffer }
  /** 메인 스레드가 촬영 루프를 돌고 있다는 신호 (400ms 마다). 끊기면(앱 전환·화면 꺼짐) heartbeat 도 멈춘다 */
  | { kind: 'alive' }
  | { kind: 'close' }

export type WorkerToMain =
  | { kind: 'msg'; msg: ServerMsg }
  | { kind: 'open'; open: boolean }
  | { kind: 'health'; health: RelayHealth }
  /** 보내지 못해 버린 프레임이 있다 (메인의 변화 감지기가 그 변화를 다시 보내게 한다) */
  | { kind: 'dropped' }

/** 서버는 15초 무신호면 PC 에 stale 을 알린다. 그 안에 여러 번 닿도록 5초마다 */
export const HEARTBEAT_MS = 5000
/**
 * 촬영 루프(alive)가 이 시간 동안 없으면 heartbeat 를 멈춘다. 휴대폰이 다른 앱으로 전환돼 화면 촬영이 멈췄는데
 * 워커만 생존 신호를 보내면 서버가 끊김을 못 알아채기 때문이다. 촬영을 시작하기 전에는 이 검사를 하지 않는다.
 */
export const ALIVE_WINDOW_MS = 10_000

/** 워커가 쓰는 연결의 최소 모양 (RelaySocket 이 만족한다) */
export interface WorkerSocket {
  send(msg: ClientMsg): void
  sendIfOpen(msg: ClientMsg): void
  close(): void
  health(maxTimerLagMs: number): RelayHealth
  /** 프레임 전송. 연결이 끊겼거나 밀려 있으면 버린다 (쌓지 않는다) */
  sendFrame(data: ArrayBuffer): boolean
}

export interface WorkerDeps {
  createSocket: (hello: () => ClientMsg, onMessage: (m: ServerMsg) => void, onOpenChange: (open: boolean) => void) => WorkerSocket
  post: (m: WorkerToMain) => void
  now?: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

/** 워커로 들어오는 메시지를 처리하는 함수를 돌려준다 */
export function createRelayWorker(deps: WorkerDeps): (m: MainToWorker) => void {
  let socket: WorkerSocket | null = null
  let timer: unknown = null
  const now = deps.now ?? Date.now
  /** 촬영 루프가 마지막으로 살아 있다고 알린 시각. null 이면 아직 촬영 전 */
  let lastAlive: number | null = null

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
      timer = deps.setInterval(() => {
        if (lastAlive !== null && now() - lastAlive > ALIVE_WINDOW_MS) return
        created.sendIfOpen({ type: 'heartbeat' })
      }, HEARTBEAT_MS)
      return
    }
    if (m.kind === 'alive') {
      lastAlive = now()
      return
    }
    if (m.kind === 'frame') {
      if (socket && !socket.sendFrame(m.data)) deps.post({ kind: 'dropped' })
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
