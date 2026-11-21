import { test } from 'node:test'
import { expect } from './expect.ts'
import { PC_MIN_ANALYZE_INTERVAL_MS, PHONE_MIN_ANALYZE_INTERVAL_MS, nextAllowedAt } from '../../src/proctor/core/frameBudget.ts'

test('분석이 빠르면 최소 간격(초당 5회)만 둔다', () => {
  expect(nextAllowedAt(1000, 30, PHONE_MIN_ANALYZE_INTERVAL_MS)).toBe(1000 + PHONE_MIN_ANALYZE_INTERVAL_MS)
})

test('분석이 느리면 걸린 시간만큼 쉬어 점유율을 절반 이하로 묶는다', () => {
  expect(nextAllowedAt(1000, 400, PHONE_MIN_ANALYZE_INTERVAL_MS)).toBe(1800)
})

test('PC 웹캠 감독은 초당 최대 10회만 분석하고, 규칙의 가장 짧은 지속 시간(1초)보다 훨씬 촘촘하다', () => {
  expect(PC_MIN_ANALYZE_INTERVAL_MS).toBe(100)
  expect(PC_MIN_ANALYZE_INTERVAL_MS < 1000 / 3).toBe(true)
  // 빠른 PC: 최소 간격만 둔다. 느린 PC: 걸린 시간의 두 배로 늘려 점유율을 절반 이하로 묶는다
  expect(nextAllowedAt(0, 20, PC_MIN_ANALYZE_INTERVAL_MS)).toBe(100)
  expect(nextAllowedAt(0, 90, PC_MIN_ANALYZE_INTERVAL_MS)).toBe(180)
})
