import { describe, expect, it } from './expect.ts'
import { PHONE_VIDEO_MAX_BITRATE, SCAN_VIDEO_MAX_BITRATE, iceServersFrom, videoEncoding } from '../../src/proctor/relay/peerLink.ts'
import { parseRtcSignal } from '../../src/proctor/relay/rtcSignal.ts'

describe('parseRtcSignal', () => {
  it('request 를 받아들이고 다른 필드는 버린다', () => {
    expect(parseRtcSignal({ kind: 'request', extra: 1 })).toEqual({ kind: 'request' })
  })
  it('quality 는 scan·watch 만, torch 는 불리언만 받아들인다', () => {
    expect(parseRtcSignal({ kind: 'quality', mode: 'scan', x: 1 })).toEqual({ kind: 'quality', mode: 'scan' })
    expect(parseRtcSignal({ kind: 'quality', mode: 'watch' })).toEqual({ kind: 'quality', mode: 'watch' })
    expect(parseRtcSignal({ kind: 'quality', mode: 'ultra' })).toEqual(null)
    expect(parseRtcSignal({ kind: 'quality' })).toEqual(null)
    expect(parseRtcSignal({ kind: 'torch', on: true })).toEqual({ kind: 'torch', on: true })
    expect(parseRtcSignal({ kind: 'torch', on: 'yes' })).toEqual(null)
  })
  it('offer·answer 는 sdp 가 있어야 하고 알려진 필드만 남긴다', () => {
    expect(parseRtcSignal({ kind: 'offer', sdp: 'v=0', evil: true })).toEqual({ kind: 'offer', sdp: 'v=0' })
    expect(parseRtcSignal({ kind: 'answer', sdp: '' })).toEqual(null)
    expect(parseRtcSignal({ kind: 'answer', sdp: 5 })).toEqual(null)
  })
  it('너무 큰 sdp 는 거절한다', () => {
    expect(parseRtcSignal({ kind: 'offer', sdp: 'a'.repeat(40_000) })).toEqual(null)
  })
  it('candidate 는 문자열이어야 한다', () => {
    expect(parseRtcSignal({ kind: 'candidate', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } })).toEqual({
      kind: 'candidate',
      candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: null },
    })
    expect(parseRtcSignal({ kind: 'candidate', candidate: { candidate: 3 } })).toEqual(null)
    expect(parseRtcSignal({ kind: 'candidate' })).toEqual(null)
  })
  it('모르는 종류와 객체가 아닌 값은 거절한다', () => {
    expect(parseRtcSignal({ kind: 'nope' })).toEqual(null)
    expect(parseRtcSignal('offer')).toEqual(null)
    expect(parseRtcSignal(null)).toEqual(null)
  })
})

describe('iceServersFrom', () => {
  it('설정이 없으면 STUN 만 쓴다', () => {
    expect(iceServersFrom({}).length).toBe(1)
  })
  it('TURN 주소가 있으면 STUN 뒤에 붙인다', () => {
    const servers = iceServersFrom({ VITE_TURN_URL: 'turn:a.example:3478, turns:a.example:5349', VITE_TURN_USERNAME: 'u', VITE_TURN_CREDENTIAL: 'c' })
    expect(servers.length).toBe(2)
    expect(servers[1]).toEqual({ urls: ['turn:a.example:3478', 'turns:a.example:5349'], username: 'u', credential: 'c' })
  })
})

describe('videoEncoding', () => {
  it('스캔 모드는 감시 모드보다 비트레이트가 높고 해상도를 줄이지 않는다', () => {
    const scan = videoEncoding('scan')
    const watch = videoEncoding('watch')
    expect(scan.maxBitrate).toBe(SCAN_VIDEO_MAX_BITRATE)
    expect(watch.maxBitrate).toBe(PHONE_VIDEO_MAX_BITRATE)
    expect(scan.maxBitrate > watch.maxBitrate).toBe(true)
    expect(scan.scaleResolutionDownBy).toBe(1)
  })
})
