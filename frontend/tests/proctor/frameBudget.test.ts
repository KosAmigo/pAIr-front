import { test } from 'node:test'
import { expect } from './expect.ts'
import { PHONE_MIN_ANALYZE_INTERVAL_MS, nextAllowedAt } from '../../src/proctor/core/frameBudget.ts'

test('분석이 빠르면 최소 간격(초당 5회)만 둔다', () => {
  expect(nextAllowedAt(1000, 30, PHONE_MIN_ANALYZE_INTERVAL_MS)).toBe(1000 + PHONE_MIN_ANALYZE_INTERVAL_MS)
})

test('분석이 느리면 걸린 시간만큼 쉬어 점유율을 절반 이하로 묶는다', () => {
  expect(nextAllowedAt(1000, 400, PHONE_MIN_ANALYZE_INTERVAL_MS)).toBe(1800)
})
