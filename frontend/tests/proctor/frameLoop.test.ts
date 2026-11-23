import { test } from 'node:test'
import { expect } from './expect.ts'
import { frameLoop } from '../../src/proctor/vision/camera.ts'

// 숨은 탭 경로(setTimeout 100ms)를 타도록 문서를 흉내 낸다. rAF 는 쓰이지 않는다.
;(globalThis as { document?: unknown }).document = { visibilityState: 'hidden' }

function fakeVideo() {
  return { readyState: 2, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('frameLoop: 비동기 onFrame 은 겹쳐 실행되지 않고 끝나면 다음 프레임으로 이어진다', async () => {
  const video = fakeVideo()
  let active = 0
  let maxActive = 0
  let calls = 0
  const stop = frameLoop(video, async () => {
    active++
    maxActive = Math.max(maxActive, active)
    calls++
    video.currentTime += 1 // 새 프레임
    await sleep(150) // 타이머 간격(100ms)보다 오래 걸리는 분석
    active--
  })
  await sleep(700)
  stop()
  expect(maxActive).toBe(1)
  expect(calls).toBeGreaterThanOrEqual(2)
})

test('frameLoop: 비동기 onFrame 이 거절돼도 onError 로 알리고 루프는 이어진다', async () => {
  const video = fakeVideo()
  let calls = 0
  const errors: unknown[] = []
  const stop = frameLoop(
    video,
    async () => {
      calls++
      video.currentTime += 1
      if (calls === 1) throw new Error('분석 실패')
    },
    { onError: (e) => errors.push(e) },
  )
  await sleep(450)
  stop()
  expect(errors).toHaveLength(1)
  expect(calls).toBeGreaterThanOrEqual(2)
})

test('frameLoop: 멈추면 진행 중이던 분석이 끝나도 더 호출하지 않는다', async () => {
  const video = fakeVideo()
  let calls = 0
  const stop = frameLoop(video, async () => {
    calls++
    video.currentTime += 1
    await sleep(120)
  })
  await sleep(160) // 첫 분석이 진행 중
  stop()
  const before = calls
  await sleep(500)
  expect(calls).toBe(before)
})

test('frameLoop: 동기 onFrame 은 예전처럼 동작한다', async () => {
  const video = fakeVideo()
  let calls = 0
  const stop = frameLoop(video, () => {
    calls++
    video.currentTime += 1
  })
  await sleep(450)
  stop()
  expect(calls).toBeGreaterThanOrEqual(3)
})
