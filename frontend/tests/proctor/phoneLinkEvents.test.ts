import { describe, expect, it } from './expect.ts'
import { phoneDropEvent } from '../../src/proctor/core/phoneLink.ts'
import { frameSizeFor, modeAt } from '../../src/proctor/relay/phoneSenderCore.ts'

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
  it('서버가 알려 주기 전에는 평소(watch)이고, 시간이 지나도 스스로 바꾸지 않는다', () => {
    expect(modeAt(null)).toBe('watch')
  })
  it('서버가 보낸 quality.mode 를 그대로 따른다', () => {
    expect(modeAt('scan')).toBe('scan')
    expect(modeAt('watch')).toBe('watch')
  })
})

import { PHONE_FRAME_TIMEOUT_MS, phoneFramesFresh } from '../../src/proctor/core/phoneLink.ts'

describe('phoneFramesFresh', () => {
  it('마지막 프레임 이후 20초 안이면 신선하다 (연결만 되고 프레임이 없는 상태를 잡는 기준)', () => {
    expect(phoneFramesFresh(1000, 1000 + PHONE_FRAME_TIMEOUT_MS - 1)).toBe(true)
    expect(phoneFramesFresh(1000, 1000 + PHONE_FRAME_TIMEOUT_MS)).toBe(false)
  })
})
