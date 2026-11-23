import { describe, expect, it } from './expect.ts'
import { phoneDropEvent } from '../../src/proctor/core/phoneLink.ts'
import { SCAN_FALLBACK_MS, frameSizeFor, modeAt } from '../../src/proctor/relay/phoneSenderCore.ts'

describe('phoneDropEvent', () => {
  it('연결돼 있다가 끊기면 phone_disconnected', () => {
    expect(phoneDropEvent('connected', 'disconnected')).toBe('phone_disconnected')
  })
  it('연결돼 있다가 응답 없음이면 phone_stale', () => {
    expect(phoneDropEvent('connected', 'stale')).toBe('phone_stale')
  })
  it('응답 없음 뒤에 끊김으로 바뀌어도 이벤트는 하나만 (두 번째는 만들지 않는다)', () => {
    expect(phoneDropEvent('stale', 'disconnected')).toBeNull()
  })
  it('처음부터 연결이 없던 상태(disconnected → disconnected)는 이벤트가 아니다', () => {
    expect(phoneDropEvent('disconnected', 'disconnected')).toBeNull()
  })
  it('다시 연결되는 것은 이벤트가 아니다', () => {
    expect(phoneDropEvent('stale', 'connected')).toBeNull()
    expect(phoneDropEvent('disconnected', 'connected')).toBeNull()
  })
})

describe('frameSizeFor', () => {
  it('평소(watch)는 긴 변 512 로 고정, 가로·세로 방향을 따른다', () => {
    expect(frameSizeFor(1280, 720, 'watch')).toEqual({ w: 512, h: 288 })
    expect(frameSizeFor(720, 1280, 'watch')).toEqual({ w: 288, h: 512 })
  })
  it('책상 스캔(scan)은 긴 변 1280', () => {
    expect(frameSizeFor(1920, 1080, 'scan')).toEqual({ w: 1280, h: 720 })
  })
  it('카메라보다 큰 크기로 키우지 않는다', () => {
    expect(frameSizeFor(640, 480, 'scan')).toEqual({ w: 640, h: 480 })
  })
  it('같은 입력이면 같은 크기 (해상도 고정)', () => {
    expect(frameSizeFor(1280, 720, 'watch')).toEqual(frameSizeFor(1280, 720, 'watch'))
  })
})

describe('modeAt', () => {
  it('시작 직후는 scan, 정해진 시간이 지나면 watch (PC 의 화질 요청이 없어도 돌아온다)', () => {
    expect(modeAt(0, null)).toBe('scan')
    expect(modeAt(SCAN_FALLBACK_MS - 1, null)).toBe('scan')
    expect(modeAt(SCAN_FALLBACK_MS, null)).toBe('watch')
  })
  it('PC 가 화질을 요청하면 그 값을 따른다', () => {
    expect(modeAt(10, 'watch')).toBe('watch')
    expect(modeAt(SCAN_FALLBACK_MS * 10, 'scan')).toBe('scan')
  })
})
