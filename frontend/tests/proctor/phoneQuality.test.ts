import { describe, expect, it } from './expect.ts'
import { PhoneQualityController, parseQualityMode } from '../../src/proctor/core/phoneQuality.ts'

describe('parseQualityMode', () => {
  it('watch·scan 만 받고 모르는 값은 무시한다', () => {
    expect(parseQualityMode('scan')).toBe('scan')
    expect(parseQualityMode('watch')).toBe('watch')
    expect(parseQualityMode('hd')).toBeNull()
    expect(parseQualityMode(undefined)).toBeNull()
  })
})

describe('PhoneQualityController (PC 쪽)', () => {
  it('책상 스캔 시작에 scan, 끝나면 watch 메시지를 만든다', () => {
    const c = new PhoneQualityController()
    expect(c.set('scan')).toEqual({ type: 'quality', mode: 'scan' })
    expect(c.set('watch')).toEqual({ type: 'quality', mode: 'watch' })
  })
  it('같은 모드를 다시 요청하면 보내지 않는다', () => {
    const c = new PhoneQualityController()
    expect(c.set('watch')).toBeNull() // 서버 기본값이 watch 라 처음 watch 는 보낼 필요가 없다
    c.set('scan')
    expect(c.set('scan')).toBeNull()
  })
  it('PC 의 릴레이 연결이 (다시) 맺어지면 현재 모드를 알린다 (서버가 이전 모드를 들고 있어도 어긋나지 않게)', () => {
    const c = new PhoneQualityController()
    expect(c.resend()).toEqual({ type: 'quality', mode: 'watch' })
    c.set('scan')
    expect(c.resend()).toEqual({ type: 'quality', mode: 'scan' })
  })
  it('reset 하면 평소(watch)로 돌아간다 (새 연결·시험 종료)', () => {
    const c = new PhoneQualityController()
    c.set('scan')
    c.reset()
    expect(c.mode).toBe('watch')
    expect(c.set('scan')).toEqual({ type: 'quality', mode: 'scan' })
  })
})
