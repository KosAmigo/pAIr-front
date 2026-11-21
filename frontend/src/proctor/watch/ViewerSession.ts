// 감독관 브라우저 쪽 영상 시청 연결 (5단계). 응시자 한 명을 열 때 만들고, 닫으면 close() 로 모두 정리한다.
// 영상은 응시자 PC 에서 WebRTC 로 직접 오고, 이 브라우저는 보여 주기만 한다 (저장하지 않는다).
import { getAuthHeaders } from '../../api.ts'
import { CandidateQueue, iceServersFrom } from '../relay/peerLink.ts'
import type { ServerMsg } from '../relay/protocol.ts'
import { RelaySocket } from '../relay/RelaySocket.ts'
import { VIEW_CHANNELS, type ViewChannel, type ViewSignal } from '../relay/viewerSignal.ts'
import type { WatchEvent } from './watchState.ts'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
/** 응시자 PC 가 꺼져 있거나 아직 입장 전이면 이 간격으로 다시 열어 본다 */
const OFFLINE_RETRY_MS = 5000

type Peer = { pc: RTCPeerConnection | null; queue: CandidateQueue; retries: number; retryTimer: number | null }

export type ViewerSessionTarget = { sessionId: number; participantId: number }

export class ViewerSession {
  private readonly relay: RelaySocket
  private readonly peers: Record<ViewChannel, Peer> = {
    phone: newPeer(),
    webcam: newPeer(),
    screen: newPeer(),
  }
  private offlineTimer: number | null = null
  private closed = false
  private readonly target: ViewerSessionTarget
  private readonly onEvent: (e: WatchEvent) => void
  private readonly onStream: (channel: ViewChannel, stream: MediaStream | null) => void

  constructor(target: ViewerSessionTarget, onEvent: (e: WatchEvent) => void, onStream: (channel: ViewChannel, stream: MediaStream | null) => void) {
    this.target = target
    this.onEvent = onEvent
    this.onStream = onStream
    // 연결이 끊겼다 돌아오면 hello(=watch)를 다시 보내 같은 응시자를 이어서 본다
    this.relay = new RelaySocket(
      () => ({ type: 'watch', sessionId: target.sessionId, participantId: target.participantId, auth: getAuthHeaders() }),
      (msg) => this.onMessage(msg),
    )
  }

  /** 영상을 닫는다: 서버에 unwatch 를 보내 응시자 PC 의 전송을 멈추고, 이 브라우저의 연결도 모두 닫는다 */
  close() {
    if (this.closed) return
    this.closed = true
    this.clearOfflineTimer()
    this.relay.sendIfOpen({ type: 'unwatch' })
    this.relay.close()
    for (const c of VIEW_CHANNELS) this.closePeer(c, true)
  }

  private onMessage(msg: ServerMsg) {
    if (this.closed) return
    if (msg.type === 'watch-state') {
      this.onEvent({ type: 'server', state: msg.state, message: msg.message })
      this.clearOfflineTimer()
      if (msg.state !== 'watching') for (const c of VIEW_CHANNELS) this.closePeer(c, true)
      if (msg.state === 'offline') this.offlineTimer = window.setTimeout(() => this.reopen(), OFFLINE_RETRY_MS)
      // 권한 없음·정원 초과·오류는 다시 시도해도 같다. 연결을 닫고 감독관이 다시 열도록 한다
      if (msg.state === 'denied' || msg.state === 'full' || msg.state === 'error') this.relay.close()
    } else if (msg.type === 'view-rtc') {
      void this.handle(msg.channel, msg.signal)
    }
  }

  /** 응시자 PC 가 없었던 동안 다시 열어 본다 (watch 를 다시 보낸다) */
  private reopen() {
    this.offlineTimer = null
    if (this.closed) return
    this.relay.send({ type: 'watch', sessionId: this.target.sessionId, participantId: this.target.participantId, auth: getAuthHeaders() })
  }

  private clearOfflineTimer() {
    if (this.offlineTimer !== null) window.clearTimeout(this.offlineTimer)
    this.offlineTimer = null
  }

  private send(channel: ViewChannel, signal: ViewSignal) {
    this.relay.send({ type: 'view-rtc', channel, signal })
  }

  private async handle(channel: ViewChannel, signal: ViewSignal) {
    const peer = this.peers[channel]
    try {
      if (signal.kind === 'unavailable') {
        this.closePeer(channel, true)
        this.onEvent({ type: 'channel', channel, phase: 'unavailable' })
      } else if (signal.kind === 'offer') {
        await this.answer(channel, signal.sdp)
      } else if (signal.kind === 'candidate' && peer.pc) {
        await peer.queue.add(peer.pc, signal.candidate)
      }
    } catch {
      this.fail(channel)
    }
  }

  private async answer(channel: ViewChannel, sdp: string) {
    this.closePeer(channel, false)
    const peer = this.peers[channel]
    this.onEvent({ type: 'channel', channel, phase: 'connecting' })
    const pc = new RTCPeerConnection({ iceServers: iceServersFrom(import.meta.env ?? {}) })
    peer.pc = pc
    pc.onicecandidate = (e) => {
      if (!e.candidate || peer.pc !== pc) return
      const c = e.candidate
      this.send(channel, { kind: 'candidate', candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } })
    }
    pc.ontrack = (e) => {
      if (peer.pc !== pc) return
      this.onStream(channel, e.streams[0] ?? new MediaStream([e.track]))
      this.onEvent({ type: 'channel', channel, phase: 'live' })
    }
    pc.onconnectionstatechange = () => {
      if (peer.pc !== pc || this.closed) return
      if (pc.connectionState === 'connected') peer.retries = 0
      else if (pc.connectionState === 'failed') this.fail(channel)
    }
    await pc.setRemoteDescription({ type: 'offer', sdp })
    await peer.queue.flush(pc)
    await pc.setLocalDescription(await pc.createAnswer())
    const local = pc.localDescription?.sdp
    if (local && peer.pc === pc) this.send(channel, { kind: 'answer', sdp: local })
  }

  /** 연결이 실패하면 몇 번 다시 요청한다. 계속 안 되면 "끊겼습니다"로 둔다 */
  private fail(channel: ViewChannel) {
    const peer = this.peers[channel]
    this.closePeer(channel, true)
    if (this.closed) return
    if (peer.retries >= MAX_RETRIES) {
      this.onEvent({ type: 'channel', channel, phase: 'failed' })
      return
    }
    peer.retries += 1
    this.onEvent({ type: 'channel', channel, phase: 'connecting' })
    peer.retryTimer = window.setTimeout(() => {
      peer.retryTimer = null
      if (!this.closed) this.send(channel, { kind: 'request' })
    }, RETRY_DELAY_MS)
  }

  private closePeer(channel: ViewChannel, clearStream: boolean) {
    const peer = this.peers[channel]
    if (peer.retryTimer !== null) window.clearTimeout(peer.retryTimer)
    peer.retryTimer = null
    peer.pc?.close()
    peer.pc = null
    peer.queue.clear()
    if (clearStream) this.onStream(channel, null)
  }
}

function newPeer(): Peer {
  return { pc: null, queue: new CandidateQueue(), retries: 0, retryTimer: null }
}
