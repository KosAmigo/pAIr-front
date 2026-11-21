import { test } from 'node:test'
import { expect } from './expect.ts'
import { BLUR_WIDTH, blurSize, classifySurface } from '../../src/proctor/screen/screenShare.ts'
import { SCREEN_EVENTS_ACCEPTED, toScreenViolation } from '../../src/proctor/screen/screenContract.ts'

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

test('화면 이벤트는 SCREEN 출처이고 서버가 받기 전에는 전송이 꺼져 있다', () => {
  const v = toScreenViolation('SCREEN_STOPPED', 1000, 'data:image/jpeg;base64,xx')
  expect(v.source).toBe('SCREEN')
  expect(v.type).toBe('SCREEN_STOPPED')
  expect(v.snapshot).toBe('data:image/jpeg;base64,xx')
  expect(SCREEN_EVENTS_ACCEPTED).toBe(false)
})
