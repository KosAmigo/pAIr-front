import { test } from 'node:test'
import { expect } from './expect.ts'
import { GATE_INITIAL, GRACE_MS, allUp, missingChannels, stepGate, type ChannelUp, type GateState } from '../../src/proctor/core/connectionPolicy.ts'

const UP: ChannelUp = { webcam: true, phone: true, screen: true }
const run = (state: GateState, up: ChannelUp, now: number) => stepGate(state, up, now)

test('세 채널이 모두 연결돼야 응시를 시작할 수 있다', () => {
  expect(allUp(UP)).toBe(true)
  expect(allUp({ ...UP, screen: false })).toBe(false)
  expect(missingChannels({ webcam: false, phone: true, screen: false })).toEqual(['webcam', 'screen'])
})

test('모두 연결돼 있으면 ok', () => {
  expect(run(GATE_INITIAL, UP, 0).gate.status).toBe('ok')
})

test('끊기면 유예 중이고 남은 시간이 줄어든다', () => {
  const a = run(GATE_INITIAL, { ...UP, phone: false }, 1000)
  expect(a.gate.status).toBe('grace')
  expect(a.gate.missing).toEqual(['phone'])
  expect(a.gate.graceLeftMs).toBe(GRACE_MS)
  const b = run(a.state, { ...UP, phone: false }, 1000 + 5000)
  expect(b.gate.status).toBe('grace')
  expect(b.gate.graceLeftMs).toBe(GRACE_MS - 5000)
})

test('유예 안에 복구되면 끊김으로 치지 않는다', () => {
  const a = run(GATE_INITIAL, { ...UP, screen: false }, 0)
  const b = run(a.state, { ...UP, screen: false }, GRACE_MS - 1)
  expect(b.gate.status).toBe('grace')
  const c = run(b.state, UP, GRACE_MS)
  expect(c.gate.status).toBe('ok')
  expect(c.state.lostAt).toEqual({})
  // 복구 뒤 다시 끊기면 유예는 처음부터 센다
  const d = run(c.state, { ...UP, screen: false }, GRACE_MS + 10)
  expect(d.gate.graceLeftMs).toBe(GRACE_MS)
})

test('유예를 넘기면 막히고, 막히는 순간에만 newlyExpired 에 나온다', () => {
  const a = run(GATE_INITIAL, { ...UP, webcam: false }, 0)
  const b = run(a.state, { ...UP, webcam: false }, GRACE_MS)
  expect(b.gate.status).toBe('blocked')
  expect(b.gate.newlyExpired).toEqual(['webcam'])
  const c = run(b.state, { ...UP, webcam: false }, GRACE_MS + 1000)
  expect(c.gate.status).toBe('blocked')
  expect(c.gate.newlyExpired).toEqual([])
})

test('막힌 뒤 일부만 돌아오면 계속 막혀 있고, 모두 돌아오면 이어서 응시한다', () => {
  let s = run(GATE_INITIAL, { webcam: false, phone: false, screen: true }, 0)
  s = run(s.state, { webcam: false, phone: false, screen: true }, GRACE_MS)
  expect(s.gate.status).toBe('blocked')
  s = run(s.state, { webcam: true, phone: false, screen: true }, GRACE_MS + 100)
  expect(s.gate.status).toBe('blocked')
  expect(s.gate.missing).toEqual(['phone'])
  s = run(s.state, UP, GRACE_MS + 200)
  expect(s.gate.status).toBe('ok')
  expect(s.state.blocked).toBe(false)
})

test('막힌 상태에서 다른 채널이 새로 끊겨도 차단은 유지된다', () => {
  let s = run(GATE_INITIAL, { ...UP, phone: false }, 0)
  s = run(s.state, { ...UP, phone: false }, GRACE_MS)
  s = run(s.state, { webcam: false, phone: true, screen: true }, GRACE_MS + 50)
  expect(s.gate.status).toBe('blocked')
})
