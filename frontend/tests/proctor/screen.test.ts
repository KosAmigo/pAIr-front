import { test } from 'node:test'
import { expect } from './expect.ts'
import { BLUR_WIDTH, blurSize, classifySurface } from '../../src/proctor/screen/screenShare.ts'
import { toScreenViolation } from '../../src/proctor/screen/screenContract.ts'

test('전체 화면(monitor)만 full, 창·탭은 partial, 모르면 unknown', () => {
  expect(classifySurface('monitor')).toBe('full')
  expect(classifySurface('window')).toBe('partial')
  expect(classifySurface('browser')).toBe('partial')
  expect(classifySurface(undefined)).toBe('unknown')
})

test('흐린 사진은 가로 BLUR_WIDTH 로 줄이고 비율을 지킨다', () => {
  expect(blurSize(1920, 1080)).toEqual({ w: BLUR_WIDTH, h: 54 })
  expect(blurSize(0, 0)).toEqual({ w: 0, h: 0 })
})

test('화면 이벤트는 SCREEN 출처이고 종류와 시각만 담는다 (사진 없음)', () => {
  for (const type of ['SCREEN_STOPPED', 'SCREEN_PARTIAL', 'SCREEN_RESTARTED'] as const) {
    const v = toScreenViolation(type, 1000)
    expect(v.source).toBe('SCREEN')
    expect(v.type).toBe(type)
    expect(v.startedAt).toBe(1000)
    expect(v.snapshot).toBe(undefined)
  }
})
