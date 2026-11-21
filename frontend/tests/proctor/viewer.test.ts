import { describe, expect, it } from './expect.ts'
import { VIEW_CHANNELS, VIEW_ENCODING, isViewChannel, parseViewSignal, type ViewChannel, type ViewSignal } from '../../src/proctor/relay/viewerSignal.ts'
import { EMPTY_ROOM, MAX_VIEWERS_PER_PARTICIPANT, joinRoom, leaveRoom } from '../../src/proctor/relay/watchRoom.ts'
import { ViewerSender, type ViewSources } from '../../src/proctor/relay/viewerSender.ts'
import { WATCH_IDLE, reduceWatch, watchStatusText, type WatchState } from '../../src/proctor/watch/watchState.ts'

describe('감독관 시그널링 형식 검사', () => {
  it('채널은 휴대폰·웹캠·화면 공유 셋뿐이다', () => {
    expect([...VIEW_CHANNELS]).toEqual(['phone', 'webcam', 'screen'])
    expect(isViewChannel('webcam')).toBe(true)
    expect(isViewChannel('mic')).toBe(false)
    expect(isViewChannel(undefined)).toBe(false)
  })
  it('request·unavailable·offer·answer·candidate 만 받아들이고 알려진 필드만 남긴다', () => {
    expect(parseViewSignal({ kind: 'request', x: 1 })).toEqual({ kind: 'request' })
    expect(parseViewSignal({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' })
    expect(parseViewSignal({ kind: 'offer', sdp: 'v=0', evil: 1 })).toEqual({ kind: 'offer', sdp: 'v=0' })
    expect(parseViewSignal({ kind: 'candidate', candidate: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 } })).toEqual({
      kind: 'candidate',
      candidate: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: null },
    })
  })
  it('감독관 경로로는 휴대폰 제어 신호(torch·quality)나 틀린 값을 못 보낸다', () => {
    expect(parseViewSignal({ kind: 'torch', on: true })).toBeNull()
    expect(parseViewSignal({ kind: 'quality', mode: 'scan' })).toBeNull()
    expect(parseViewSignal({ kind: 'offer', sdp: '' })).toBeNull()
    expect(parseViewSignal({ kind: 'offer', sdp: 'a'.repeat(40_000) })).toBeNull()
    expect(parseViewSignal(null)).toBeNull()
    expect(parseViewSignal('offer')).toBeNull()
  })
  it('전송 화질 상한은 채널마다 있고 화면 공유는 낮은 프레임이다', () => {
    for (const c of VIEW_CHANNELS) expect(VIEW_ENCODING[c].maxBitrate).toBeLessThanOrEqual(500_000)
    expect(VIEW_ENCODING.screen.maxFramerate).toBeLessThanOrEqual(5)
  })
})

describe('응시자 한 명을 보는 감독관 수 상한', () => {
  it('정원까지 들어오고 그 뒤는 거절한다', () => {
    let room = EMPTY_ROOM
    for (let i = 0; i < MAX_VIEWERS_PER_PARTICIPANT; i++) {
      const r = joinRoom(room, `v${i}`)
      expect(r.result).toBe('joined')
      room = r.room
    }
    expect(room).toHaveLength(MAX_VIEWERS_PER_PARTICIPANT)
    const over = joinRoom(room, 'extra')
    expect(over.result).toBe('full')
    expect(over.room).toEqual(room)
  })
  it('이미 들어온 감독관이 다시 들어오면 자리를 더 쓰지 않는다', () => {
    const r1 = joinRoom(EMPTY_ROOM, 'a')
    expect(joinRoom(r1.room, 'a').result).toBe('already')
    expect(joinRoom(r1.room, 'a').room).toEqual(['a'])
  })
  it('나가면 자리가 생기고, 원래 목록은 바뀌지 않는다', () => {
    const full = joinRoom(joinRoom(EMPTY_ROOM, 'a', 2).room, 'b', 2).room
    const left = leaveRoom(full, 'a')
    expect(left).toEqual(['b'])
    expect(full).toEqual(['a', 'b'])
    expect(joinRoom(left, 'c', 2).result).toBe('joined')
    expect(leaveRoom(left, 'zzz')).toEqual(['b'])
  })
})

const channelsOf = (s: WatchState) => s.channels

describe('시청 상태 기계', () => {
  it('열면 연결 중, 서버가 watching 이면 시청 중, 닫으면 처음으로 돌아간다', () => {
    let s = reduceWatch(WATCH_IDLE, { type: 'open' })
    expect(s.phase).toBe('connecting')
    s = reduceWatch(s, { type: 'server', state: 'watching' })
    expect(s.phase).toBe('watching')
    s = reduceWatch(s, { type: 'close' })
    expect(s).toEqual(WATCH_IDLE)
  })
  it('채널별 상태가 따로 바뀐다 (휴대폰만 영상 없음)', () => {
    let s = reduceWatch(WATCH_IDLE, { type: 'open' })
    s = reduceWatch(s, { type: 'server', state: 'watching' })
    s = reduceWatch(s, { type: 'channel', channel: 'webcam', phase: 'live' })
    s = reduceWatch(s, { type: 'channel', channel: 'phone', phase: 'unavailable' })
    expect(channelsOf(s)).toEqual({ phone: 'unavailable', webcam: 'live', screen: 'waiting' })
    expect(watchStatusText(s)).toBe('영상 연결 중…')
    s = reduceWatch(s, { type: 'channel', channel: 'screen', phase: 'live' })
    s = reduceWatch(s, { type: 'channel', channel: 'phone', phase: 'live' })
    expect(watchStatusText(s)).toBeNull()
  })
  it('응시자 오프라인·권한 없음·정원 초과는 상태 문구를 보여 주고 채널을 초기화한다', () => {
    let s = reduceWatch(WATCH_IDLE, { type: 'open' })
    s = reduceWatch(s, { type: 'server', state: 'watching' })
    s = reduceWatch(s, { type: 'channel', channel: 'webcam', phase: 'live' })
    s = reduceWatch(s, { type: 'server', state: 'offline' })
    expect(s.phase).toBe('offline')
    expect(channelsOf(s).webcam).toBe('waiting')
    expect(watchStatusText(s)).toContain('연결돼 있지 않습니다')
    expect(watchStatusText(reduceWatch(s, { type: 'server', state: 'denied' }))).toContain('권한')
    expect(watchStatusText(reduceWatch(s, { type: 'server', state: 'full', message: '정원 초과' }))).toBe('정원 초과')
  })
  it('닫은 뒤에 늦게 도착한 메시지는 무시한다 (닫았는데 다시 열린 것처럼 보이지 않게)', () => {
    expect(reduceWatch(WATCH_IDLE, { type: 'server', state: 'watching' })).toEqual(WATCH_IDLE)
    expect(reduceWatch(WATCH_IDLE, { type: 'channel', channel: 'phone', phase: 'live' })).toEqual(WATCH_IDLE)
  })
})

// ── 응시자 PC 송신: RTCPeerConnection 을 가짜로 바꿔 열기·닫기·원본 변경 동작을 확인한다 ──
class FakePc {
  static all: FakePc[] = []
  closed = false
  transceivers: { encodings: unknown }[] = []
  localDescription: { sdp: string } | null = null
  onicecandidate: unknown = null
  constructor() {
    FakePc.all.push(this)
  }
  addTransceiver(_track: unknown, init: { sendEncodings?: unknown[] }) {
    this.transceivers.push({ encodings: init.sendEncodings })
  }
  async createOffer() {
    return { type: 'offer', sdp: `offer-${FakePc.all.indexOf(this)}` }
  }
  async setLocalDescription(d: { sdp: string }) {
    this.localDescription = d
  }
  close() {
    this.closed = true
  }
}

const fakeStream = (live = true) => ({ getVideoTracks: () => [{ readyState: live ? 'live' : 'ended' }] }) as unknown as MediaStream
const wait = () => new Promise((r) => setTimeout(r, 0))

async function withFakeRtc(fn: () => Promise<void>) {
  const g = globalThis as unknown as { RTCPeerConnection?: unknown }
  const prev = g.RTCPeerConnection
  g.RTCPeerConnection = FakePc
  FakePc.all = []
  try {
    await fn()
  } finally {
    g.RTCPeerConnection = prev
  }
}

describe('응시자 PC 영상 송신 (감독관이 열 때만)', () => {
  it('아무도 열지 않으면 연결이 하나도 생기지 않는다', async () => {
    await withFakeRtc(async () => {
      const sources: ViewSources = { phone: fakeStream(), webcam: fakeStream(), screen: fakeStream() }
      const sender = new ViewerSender(() => undefined, () => sources)
      sender.sync()
      await wait()
      expect(FakePc.all).toHaveLength(0)
      expect(sender.viewerCount()).toBe(0)
    })
  })
  it('감독관이 채널을 요청하면 그 채널만 화질 상한을 걸어 offer 를 보낸다', async () => {
    await withFakeRtc(async () => {
      const sent: { viewer: string; channel: ViewChannel; signal: ViewSignal }[] = []
      const sources: ViewSources = { phone: fakeStream(), webcam: fakeStream(), screen: fakeStream() }
      const sender = new ViewerSender((viewer, channel, signal) => sent.push({ viewer, channel, signal }), () => sources)
      sender.request('v1', 'webcam')
      await wait()
      expect(FakePc.all).toHaveLength(1)
      expect(FakePc.all[0].transceivers[0].encodings).toEqual([VIEW_ENCODING.webcam])
      expect(sent.map((m) => m.signal.kind)).toEqual(['offer'])
      expect(sent[0].viewer).toBe('v1')
      expect(sender.viewerCount()).toBe(1)
    })
  })
  it('보낼 영상이 없는 채널은 unavailable 을 알리고 연결을 만들지 않으며, 영상이 생기면 이어서 보낸다', async () => {
    await withFakeRtc(async () => {
      const sent: ViewSignal[] = []
      const sources: ViewSources = { phone: null, webcam: fakeStream(), screen: null }
      const sender = new ViewerSender((_v, _c, s) => sent.push(s), () => sources)
      sender.request('v1', 'phone')
      await wait()
      expect(sent).toEqual([{ kind: 'unavailable' }])
      expect(FakePc.all).toHaveLength(0)
      sources.phone = fakeStream() // 휴대폰이 연결돼 영상이 들어옴
      sender.sync()
      await wait()
      expect(FakePc.all).toHaveLength(1)
      expect(sent[sent.length - 1].kind).toBe('offer')
    })
  })
  it('원본 영상이 같으면 다시 맺지 않고, 바뀌면 그 채널만 다시 맺는다', async () => {
    await withFakeRtc(async () => {
      const sources: ViewSources = { phone: fakeStream(), webcam: fakeStream(), screen: null }
      const sender = new ViewerSender(() => undefined, () => sources)
      sender.request('v1', 'webcam')
      sender.request('v1', 'phone')
      await wait()
      expect(FakePc.all).toHaveLength(2)
      sender.sync()
      await wait()
      expect(FakePc.all).toHaveLength(2)
      sources.webcam = fakeStream() // 웹캠을 다시 열었다
      sender.sync()
      await wait()
      expect(FakePc.all).toHaveLength(3)
      expect(FakePc.all[0].closed).toBe(true) // 이전 웹캠 연결은 닫힘
      expect(FakePc.all[1].closed).toBe(false) // 휴대폰 연결은 그대로
    })
  })
  it('감독관이 나가면 그 감독관 전송만 닫히고 다른 감독관은 그대로다', async () => {
    await withFakeRtc(async () => {
      const sources: ViewSources = { phone: fakeStream(), webcam: fakeStream(), screen: fakeStream() }
      const sender = new ViewerSender(() => undefined, () => sources)
      for (const c of VIEW_CHANNELS) sender.request('v1', c)
      sender.request('v2', 'webcam')
      await wait()
      expect(FakePc.all).toHaveLength(4)
      expect(sender.viewerCount()).toBe(2)
      sender.drop('v1')
      expect(FakePc.all.filter((p) => p.closed)).toHaveLength(3)
      expect(sender.viewerCount()).toBe(1)
      sender.closeAll()
      expect(FakePc.all.every((p) => p.closed)).toBe(true)
      expect(sender.viewerCount()).toBe(0)
    })
  })
  it('끝난 영상 트랙은 보내지 않고 unavailable 로 알린다', async () => {
    await withFakeRtc(async () => {
      const sent: ViewSignal[] = []
      const sender = new ViewerSender((_v, _c, s) => sent.push(s), () => ({ phone: null, webcam: fakeStream(false), screen: null }))
      sender.request('v1', 'webcam')
      await wait()
      expect(sent).toEqual([{ kind: 'unavailable' }])
      expect(FakePc.all).toHaveLength(0)
    })
  })
})
