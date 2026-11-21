import { test } from 'node:test'
import { expect } from './expect.ts'
import { PHONE_STALE_MS, isPhoneStale } from '../../server/phoneStale.ts'

const base = { hasSocket: true, monitoring: true, state: 'connected' as const, lastSeen: 1000, now: 1000 }

test('추론이 8초 멈춘 정도(재현 로그)는 stale 이 아니다', () => {
  expect(isPhoneStale({ ...base, now: 1000 + 8200 })).toBe(false)
})

test('기준을 넘기면 stale 이다', () => {
  expect(isPhoneStale({ ...base, now: 1000 + PHONE_STALE_MS + 1 })).toBe(true)
})

test('감시 전·소켓 없음·이미 stale 이면 판정하지 않는다', () => {
  const late = 1000 + PHONE_STALE_MS + 1
  expect(isPhoneStale({ ...base, now: late, monitoring: false })).toBe(false)
  expect(isPhoneStale({ ...base, now: late, hasSocket: false })).toBe(false)
  expect(isPhoneStale({ ...base, now: late, state: 'stale' })).toBe(false)
})
