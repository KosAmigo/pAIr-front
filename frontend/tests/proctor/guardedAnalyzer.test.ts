import { test } from 'node:test'
import { expect } from './expect.ts'
import { guardedAnalyzer } from '../../src/proctor/vision/guardedAnalyzer.ts'

const F = { faceCount: 1, shoulders: null }

function setup(opts: { analyze: (now: number) => Promise<typeof F>; current?: () => boolean; maxFailures?: number }) {
  const fails: unknown[] = []
  let gaveUp = 0
  const run = guardedAnalyzer({
    isCurrent: opts.current ?? (() => true),
    analyze: opts.analyze,
    maxFailures: opts.maxFailures ?? 3,
    onFail: (e) => fails.push(e),
    onGiveUp: () => gaveUp++,
  })
  return { run, fails, gaveUp: () => gaveUp }
}

test('guardedAnalyzer: 지금 감독의 결과는 그대로 돌려준다', async () => {
  const { run } = setup({ analyze: async () => F })
  expect(await run(1)).toEqual(F)
})

test('guardedAnalyzer: 분석이 끝났을 때 이미 다른 감독으로 바뀌었으면 결과를 버린다', async () => {
  let current = true
  const { run } = setup({
    analyze: async () => {
      current = false // 분석 도중 재보정·중지
      return F
    },
    current: () => current,
  })
  expect(await run(1)).toBeNull()
})

test('guardedAnalyzer: 이전 감독의 오류는 알리지도 세지도 않는다', async () => {
  const { run, fails, gaveUp } = setup({ analyze: async () => { throw new Error('x') }, current: () => false, maxFailures: 1 })
  expect(await run(1)).toBeNull()
  expect(fails).toHaveLength(0)
  expect(gaveUp()).toBe(0)
})

test('guardedAnalyzer: 한두 번 실패는 건너뛰고, 연달아 maxFailures 번 실패하면 포기를 알린다', async () => {
  const { run, fails, gaveUp } = setup({ analyze: async () => { throw new Error('실패') } })
  expect(await run(1)).toBeNull()
  expect(await run(2)).toBeNull()
  expect(gaveUp()).toBe(0)
  expect(await run(3)).toBeNull()
  expect(gaveUp()).toBe(1)
  expect(fails).toHaveLength(3)
})

test('guardedAnalyzer: 성공하면 연속 실패 횟수를 처음부터 센다', async () => {
  let n = 0
  const { run, gaveUp } = setup({
    analyze: async () => {
      n++
      if (n === 3) return F // 실패, 실패, 성공, 실패, 실패 → 포기하지 않는다
      throw new Error('실패')
    },
  })
  for (let i = 0; i < 5; i++) await run(i)
  expect(gaveUp()).toBe(0)
})
