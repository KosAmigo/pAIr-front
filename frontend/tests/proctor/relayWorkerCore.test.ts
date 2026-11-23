import { test } from 'node:test'
import { expect } from './expect.ts'
import type { ClientMsg, RelayHealth, ServerMsg } from '../../src/proctor/relay/protocol.ts'
import { ALIVE_WINDOW_MS, HEARTBEAT_MS, createRelayWorker, type WorkerSocket, type WorkerToMain } from '../../src/proctor/relay/relayWorkerCore.ts'

const HEALTH: RelayHealth = { reconnects: 2, lastCloseAt: 5, lastCloseCode: 1006, maxTimerLagMs: 0 }

function setup() {
  const sent: ClientMsg[] = []
  const frames: ArrayBuffer[] = []
  const clock = { now: 0 }
  const posted: WorkerToMain[] = []
  const state = { open: true, closed: false, tick: null as null | (() => void), intervalMs: 0, cleared: false, hello: null as null | (() => ClientMsg) }
  let emit: (m: ServerMsg) => void = () => undefined
  let emitOpen: (o: boolean) => void = () => undefined
  const socket: WorkerSocket = {
    send: (m) => sent.push(m),
    sendIfOpen: (m) => {
      if (state.open) sent.push(m)
    },
    close: () => {
      state.closed = true
    },
    health: () => HEALTH,
    sendFrame: (d) => frames.push(d),
  }
  const handle = createRelayWorker({
    createSocket: (hello, onMessage, onOpenChange) => {
      state.hello = hello
      emit = onMessage
      emitOpen = onOpenChange
      return socket
    },
    post: (m) => posted.push(m),
    now: () => clock.now,
    setInterval: (fn, ms) => {
      state.tick = fn
      state.intervalMs = ms
      return 7
    },
    clearInterval: () => {
      state.cleared = true
    },
  })
  return { handle, sent, frames, clock, posted, state, emit: (m: ServerMsg) => emit(m), emitOpen: (o: boolean) => emitOpen(o) }
}

test('init: 짝 코드로 hello-phone 을 만들고 heartbeat 타이머를 건다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  expect(t.state.hello?.()).toEqual({ type: 'hello-phone', pairCode: 'abc' })
  expect(t.state.intervalMs).toBe(HEARTBEAT_MS)
})

test('heartbeat: 타이머가 돌 때마다 연결돼 있으면 보낸다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.state.tick?.()
  expect(t.sent).toEqual([{ type: 'heartbeat' }])
})

test('heartbeat: 연결이 끊긴 동안에는 쌓아 두지 않는다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.state.open = false
  t.state.tick?.()
  expect(t.sent.length).toBe(0)
})

test('send: 메인이 보낸 메시지를 그대로 소켓에 넘긴다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.handle({ kind: 'send', msg: { type: 'phone-status', status: { sending: true, bytesSent: 0 } } })
  expect(t.sent.length).toBe(1)
})

test('서버 메시지와 열림 상태는 메인으로 전달하고, 열림 때 연결 이력도 보고한다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.emit({ type: 'phone-joined' })
  t.emitOpen(true)
  expect(t.posted).toEqual([
    { kind: 'msg', msg: { type: 'phone-joined' } },
    { kind: 'open', open: true },
    { kind: 'health', health: HEALTH },
  ])
})

test('init 을 두 번 받아도 소켓은 하나만 만든다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.state.hello = null
  t.handle({ kind: 'init', pairCode: 'zzz' })
  expect(t.state.hello).toBeNull()
})

test('close: 타이머를 멈추고 소켓을 닫는다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.handle({ kind: 'close' })
  expect(t.state.cleared).toBe(true)
  expect(t.state.closed).toBe(true)
})

test('heartbeat 는 5초마다 (서버가 15초 무신호를 응답 없음으로 본다)', () => {
  expect(HEARTBEAT_MS).toBe(5000)
})

test('frame: 메인이 보낸 JPEG 를 소켓의 프레임 전송으로 넘긴다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0, 1]).buffer
  t.handle({ kind: 'frame', data: buf })
  expect(t.frames).toHaveLength(1)
})

test('alive 를 한 번이라도 받은 뒤에는 메인 스레드가 멈춰 있으면(alive 가 끊기면) heartbeat 를 보내지 않는다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.handle({ kind: 'alive' })
  t.clock.now = ALIVE_WINDOW_MS - 1
  t.state.tick?.()
  expect(t.sent).toEqual([{ type: 'heartbeat' }])
  t.clock.now = ALIVE_WINDOW_MS + 1
  t.state.tick?.()
  expect(t.sent).toHaveLength(1)
})

test('alive 를 다시 받으면 heartbeat 를 이어 보낸다 (앱 전환에서 돌아온 경우)', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.handle({ kind: 'alive' })
  t.clock.now = ALIVE_WINDOW_MS + 5000
  t.handle({ kind: 'alive' })
  t.state.tick?.()
  expect(t.sent).toHaveLength(1)
})

test('alive 를 한 번도 받지 않았다면(촬영 시작 전) heartbeat 는 계속 보낸다', () => {
  const t = setup()
  t.handle({ kind: 'init', pairCode: 'abc' })
  t.clock.now = 10 * ALIVE_WINDOW_MS
  t.state.tick?.()
  expect(t.sent).toHaveLength(1)
})
