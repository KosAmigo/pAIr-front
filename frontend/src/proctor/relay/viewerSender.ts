// 응시자 PC → 감독관 영상 송신 (5단계). 감독관이 그 응시자를 열었을 때만 연결을 만들고, 닫으면 모두 정리한다.
// 감독관 한 명 × 채널 하나마다 WebRTC 연결 하나. 휴대폰 영상은 PC 가 이미 받고 있는 스트림을 그대로 다시 보낸다
// (휴대폰이 감독관에게 직접 보내지 않으므로 휴대폰 부하·전력이 늘지 않고, 휴대폰은 감독관이 누구인지 알 필요가 없다).
// 영상은 서버를 지나지 않고 저장되지 않는다. 분석·이벤트 기록·연결 감시와는 별개의 연결이라 서로 영향을 주지 않는다.
import { iceServersFrom, CandidateQueue } from './peerLink.ts'
import { VIEW_ENCODING, type ViewChannel, type ViewSignal } from './viewerSignal.ts'

export type ViewSources = Record<ViewChannel, MediaStream | null>
type SendView = (viewer: string, channel: ViewChannel, signal: ViewSignal) => void

type Entry = {
  viewer: string
  channel: ViewChannel
  /** 지금 이 연결이 싣고 있는 영상 (원본이 바뀌면 다시 맺는다) */
  stream: MediaStream | null
  pc: RTCPeerConnection | null
  queue: CandidateQueue
}

const keyOf = (viewer: string, channel: ViewChannel) => `${viewer}|${channel}`

export class ViewerSender {
  private readonly entries = new Map<string, Entry>()
  private readonly send: SendView
  private readonly sources: () => ViewSources

  constructor(send: SendView, sources: () => ViewSources) {
    this.send = send
    this.sources = sources
  }

  /** 지금 보고 있는 감독관 수 */
  viewerCount(): number {
    return new Set([...this.entries.values()].map((e) => e.viewer)).size
  }

  /** 감독관이 이 채널 영상을 보려 한다 (처음, 또는 연결 실패 뒤 다시) */
  request(viewer: string, channel: ViewChannel) {
    const key = keyOf(viewer, channel)
    const entry = this.entries.get(key) ?? { viewer, channel, stream: null, pc: null, queue: new CandidateQueue() }
    this.entries.set(key, entry)
    void this.open(entry)
  }

  async handle(viewer: string, channel: ViewChannel, signal: ViewSignal) {
    const entry = this.entries.get(keyOf(viewer, channel))
    if (!entry) return
    if (signal.kind === 'request') {
      void this.open(entry)
      return
    }
    const pc = entry.pc
    if (!pc) return
    try {
      if (signal.kind === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        await entry.queue.flush(pc)
      } else if (signal.kind === 'candidate') {
        await entry.queue.add(pc, signal.candidate)
      }
    } catch {
      this.closePeer(entry) // 감독관이 request 로 다시 요청한다
    }
  }

  /** 그 감독관이 닫았거나 연결이 끊겼다: 그 감독관에게 가는 전송을 모두 멈춘다 */
  drop(viewer: string) {
    for (const [key, entry] of this.entries) {
      if (entry.viewer !== viewer) continue
      this.closePeer(entry)
      this.entries.delete(key)
    }
  }

  /** 릴레이가 끊겨 감독관들이 사라졌을 수 있거나 시험이 끝났을 때 */
  closeAll() {
    for (const entry of this.entries.values()) this.closePeer(entry)
    this.entries.clear()
  }

  /** 원본 영상(웹캠·휴대폰·화면)이 바뀌었을 수 있다: 달라진 채널만 다시 맺고, 없어졌으면 감독관에게 알린다 */
  sync() {
    if (this.entries.size === 0) return
    const sources = this.sources()
    for (const entry of this.entries.values()) {
      if (sources[entry.channel] !== entry.stream) void this.open(entry)
    }
  }

  private async open(entry: Entry) {
    this.closePeer(entry)
    const stream = this.sources()[entry.channel]
    entry.stream = stream
    const tracks = stream?.getVideoTracks().filter((t) => t.readyState === 'live') ?? []
    if (!stream || tracks.length === 0) {
      this.send(entry.viewer, entry.channel, { kind: 'unavailable' })
      return
    }
    const pc = new RTCPeerConnection({ iceServers: iceServersFrom(import.meta.env ?? {}) })
    entry.pc = pc
    for (const track of tracks) {
      // 화면 공유는 글자가 보이도록 선명도를 우선한다
      if (entry.channel === 'screen') track.contentHint = 'detail'
      // 송신 화질 상한은 협상 때 건다 (감독관이 열 때만 켜지므로 PC 부하는 상한 × 감독관 수)
      pc.addTransceiver(track, { direction: 'sendonly', streams: [stream], sendEncodings: [VIEW_ENCODING[entry.channel]] })
    }
    pc.onicecandidate = (e) => {
      if (!e.candidate || entry.pc !== pc) return
      const c = e.candidate
      this.send(entry.viewer, entry.channel, {
        kind: 'candidate',
        candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment },
      })
    }
    try {
      await pc.setLocalDescription(await pc.createOffer())
      const sdp = pc.localDescription?.sdp
      if (sdp && entry.pc === pc) this.send(entry.viewer, entry.channel, { kind: 'offer', sdp })
    } catch {
      if (entry.pc === pc) this.closePeer(entry)
    }
  }

  private closePeer(entry: Entry) {
    entry.pc?.close()
    entry.pc = null
    entry.queue.clear()
  }
}
