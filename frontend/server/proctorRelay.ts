// 개발용 휴대폰 보조 캠 릴레이 (Vite 개발 서버 플러그인). pAIr-docs/API/실전시험_감독_API.md §2 를 그대로 구현한다.
// 운영에서는 팀원 백엔드가 같은 동작을 WebSocket 으로 제공한다. 이 파일은 로컬 개발·시연용.
//  - PC 는 초대 토큰으로 붙고, 서버가 짝 코드(초대 토큰과 다른 값)를 발급해 QR 주소를 돌려준다.
//  - 폰 알림은 저장하지 않고 PC 로 넘긴다 (PC 가 저장). 점검 사진은 PC 가 백엔드 env-scan 에 직접 올린다.
//  - 휴대폰은 영상이 아니라 JPEG 프레임(binary)을 보낸다. 서버는 최신 한 장만 PC 로 그대로 넘기고 분석·저장·로그는 하지 않는다.
//  - 운영 중계(pAIr-back ProctorRelayHandler)와 같은 한도: 프레임 100KB, 휴대폰 1대 초당 5장(넘으면 폐기), JPEG 시작 바이트 검사.
//  - 폰 연결이 끊기거나 15초간 신호가 없으면 PC 에 peer 메시지(disconnected | stale)만 알린다. PHONE_DISCONNECTED 이벤트는
//    운영 중계처럼 서버가 저장하지 않고 PC 가 자기 아웃박스로 올린다.
//  - 개발 전용: PC 가 보낸 quality 화질 요청을 휴대폰에 전달한다 (운영 중계는 아직 전달하지 않는다).
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { Duplex } from 'node:stream'
import type { Plugin } from 'vite'
import { WebSocket, WebSocketServer } from 'ws'
import { parseRtcSignal } from '../src/proctor/relay/rtcSignal.ts'
import { VIEW_CHANNELS, isViewChannel, parseViewSignal } from '../src/proctor/relay/viewerSignal.ts'
import { EMPTY_ROOM, MAX_VIEWERS_PER_PARTICIPANT, joinRoom, leaveRoom, type WatchRoom } from '../src/proctor/relay/watchRoom.ts'
import { PHONE_STALE_MS, isPhoneStale } from './phoneStale.ts'
import { RELAY_LOG_FILE, mask, relayLog } from './relayLog.ts'

const RELAY_PATH = '/ws/proctor'
const BACKEND = (process.env.PAIR_BACKEND_URL ?? 'http://localhost:8180').replace(/\/$/, '')
const MAX_PAYLOAD = 2 * 1024 * 1024
/** 운영 중계(RelayLimits)와 같은 값 */
const MAX_FRAME_BYTES = 100_000
const MAX_FRAMES_PER_SEC = 5
/** 전송 대기가 이만큼 쌓인 PC 에는 프레임을 보내지 않는다 (오래된 프레임을 쌓지 않고 최신만) */
const MAX_PC_BUFFERED = 120_000
const INVITE = /^[A-Za-z0-9_-]{43}$/
/** 사전 테스트(연습) 키. 이 브라우저가 만든 값이라 백엔드에 확인하지 않고, 어떤 기록도 저장하지 않는다 */
const PRACTICE_KEY = /^practice-[a-f0-9]{42}$/

type PeerState = 'connected' | 'disconnected' | 'stale'
type Pair = {
  invite: string
  /** 사전 테스트 짝: 백엔드에 이벤트를 저장하지 않는다 */
  practice?: boolean
  code: string
  pc?: WebSocket
  phone?: WebSocket
  phoneState: PeerState
  lastPhoneSeen: number
  /** 폰이 감시를 시작했는지 (모델 로딩 중 멈춤을 응답 없음으로 오인하지 않게) */
  phoneMonitoring: boolean
  lastHealthKey?: string
  /** 입장 정보(회차 이름·이메일): 개발 릴레이가 감독관이 고른 응시자와 이 짝을 맞춰 보려고 쓴다 (아래 resolveWatchTarget) */
  email?: string
  sessionTitle?: string
  /** 지금 이 응시자의 영상을 보고 있는 감독관 (정원은 MAX_VIEWERS_PER_PARTICIPANT) */
  room: WatchRoom
  viewers: Map<string, WebSocket>
}

/** 메시지는 클라이언트가 보낸 값이라 필요한 필드만 꺼내 쓴다 */
type Incoming = {
  type?: unknown
  invite?: unknown
  pairCode?: unknown
  violation?: Record<string, unknown>
  status?: Record<string, unknown>
  signal?: unknown
  mode?: unknown
  channel?: unknown
  viewer?: unknown
  sessionId?: unknown
  participantId?: unknown
  auth?: unknown
}

type Watching = { pair: Pair; viewerId: string }

const byInvite = new Map<string, Pair>()
const byCode = new Map<string, Pair>()

const log = relayLog
/** 폰 메시지 사이가 이보다 벌어지면 진단 로그에 남긴다 (stale 기준 6초의 절반) */
const GAP_LOG_MS = 3000
let nextConnId = 1

function send(ws: WebSocket | undefined, msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

/** WSL·Docker·VM 가상 어댑터는 휴대폰이 닿지 못하므로 건너뛴다 */
const VIRTUAL_ADAPTER = /vethernet|wsl|docker|vmware|virtualbox|vbox|hyper-v|loopback|tailscale|zerotier|bluetooth/i

function lanIp(): string | null {
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) return ni.address
    }
  }
  return null
}

const PRIVATE_HOST = /^(localhost|127\.|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i
const SAFE_HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$/

/** PC 가 터널(공인 주소)로 접속했다면 휴대폰도 같은 주소로 보낸다. localhost·사설 IP 로 접속했으면 null */
function requestOrigin(req: IncomingMessage): string | null {
  const first = (v: string | string[] | undefined) => String(Array.isArray(v) ? v[0] : (v ?? '')).split(',')[0].trim()
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host)
  if (!SAFE_HOST.test(host) || PRIVATE_HOST.test(host)) return null
  return `${first(req.headers['x-forwarded-proto']) === 'http' ? 'http' : 'https'}://${host}`
}

type EntryIdentity = { email?: string; sessionTitle?: string }

/** 입장 토큰이 맞으면 응시자 이름표(이메일·회차 이름)를 돌려준다. 틀리면 null */
async function inviteIdentity(invite: string): Promise<EntryIdentity | null> {
  if (!INVITE.test(invite)) return null
  try {
    const res = await fetch(`${BACKEND}/api/entry/${encodeURIComponent(invite)}`)
    if (!res.ok) return null
    const info = (await res.json().catch(() => null)) as { email?: unknown; sessionTitle?: unknown } | null
    return { email: typeof info?.email === 'string' ? info.email : undefined, sessionTitle: typeof info?.sessionTitle === 'string' ? info.sessionTitle : undefined }
  } catch {
    log('백엔드에 연결할 수 없습니다:', BACKEND)
    return null
  }
}

// ── 감독관 영상 시청 (5단계) ──
// 감독관은 hello 없이 watch 로 붙는다. 영상은 응시자 PC → 감독관 브라우저로 직접 가고(WebRTC) 이 서버는 view-rtc 시그널링만 넘긴다.
// 영상은 서버에 저장되지 않는다.
//
// 임시 방식 (개발 릴레이 전용): 콘솔은 응시자의 입장 토큰을 모르고 (회차 ID, 참가자 ID) 만 안다.
//  ① 감독관의 로그인 헤더로 백엔드 콘솔 API 를 불러 권한을 확인하고 (401·403·404 이면 거절), 참가자의 이메일·회차 이름을 얻는다.
//  ② 입장 토큰으로 붙은 PC 중 같은 이메일·회차 이름인 짝을 그 응시자로 본다.
// 운영 백엔드는 참가자 ID ↔ 입장 토큰을 DB 로 직접 알고, WebSocket 연결의 로그인 정보(쿠키·토큰)로 PROCTOR·MANAGER·ADMIN 의
// 같은 회사 회차 권한을 확인해야 한다. 이 코드는 그 확인의 대용품이다 (pAIr-docs/API/실전시험_감독_API.md 6-11).
const FORWARD_AUTH_HEADERS = new Set(['x-pair-user-id', 'x-pair-role', 'x-pair-company-id', 'authorization'])

function pickAuthHeaders(auth: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof auth !== 'object' || auth === null) return out
  for (const [k, v] of Object.entries(auth as Record<string, unknown>)) {
    if (FORWARD_AUTH_HEADERS.has(k.toLowerCase()) && typeof v === 'string' && v.length < 4096) out[k] = v
  }
  return out
}

type WatchTarget = { ok: true; email: string; title: string } | { ok: false; state: 'denied' | 'error'; message: string }

async function resolveWatchTarget(sessionId: number, participantId: number, auth: unknown): Promise<WatchTarget> {
  try {
    const res = await fetch(`${BACKEND}/api/console/sessions/${sessionId}`, { headers: pickAuthHeaders(auth) })
    if (res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, state: 'denied', message: '이 응시자의 영상을 볼 권한이 없습니다.' }
    if (!res.ok) return { ok: false, state: 'error', message: `권한 확인에 실패했습니다 (${res.status}).` }
    const d = (await res.json()) as { session?: { title?: unknown }; participants?: { id?: unknown; email?: unknown }[] }
    const p = d.participants?.find((x) => x.id === participantId)
    if (!p || typeof p.email !== 'string' || typeof d.session?.title !== 'string') return { ok: false, state: 'denied', message: '응시자를 찾을 수 없습니다.' }
    return { ok: true, email: p.email, title: d.session.title }
  } catch {
    return { ok: false, state: 'error', message: '백엔드에 연결할 수 없어 권한을 확인하지 못했습니다.' }
  }
}

function findPairByIdentity(email: string, title: string): Pair | undefined {
  for (const p of byInvite.values()) if (!p.practice && p.email === email && p.sessionTitle === title) return p
  return undefined
}

/** 감독관 viewer 에게 응시자 PC 가 영상을 보내도록 요청한다 (채널마다) */
function requestViewerVideo(pair: Pair, viewer: string) {
  for (const channel of VIEW_CHANNELS) send(pair.pc, { type: 'viewer-request', viewer, channel })
}

function pcIsUp(pair: Pair): boolean {
  return pair.pc?.readyState === WebSocket.OPEN
}

/** 운영 중계는 끊김 이벤트를 저장하지 않는다 (PC 가 peer 메시지를 보고 올린다). 개발 릴레이도 같게 로그만 남긴다 */
function systemEvent(pair: Pair, kind: string, message: string) {
  log(`${mask(pair.code)} ${kind}: ${message} (이벤트는 PC 가 peer 메시지로 올린다)`)
}

function setPhoneState(pair: Pair, state: PeerState, reason: string) {
  if (pair.phoneState === state) return
  log(`peer ${mask(pair.code)} 폰 ${pair.phoneState} → ${state} (${reason})`)
  pair.phoneState = state
  send(pair.pc, { type: 'peer', phone: state })
}

/** 폰이 보낸 메시지를 받을 때마다 호출. 직전 수신과 벌어진 시간이 길면 기록한다 */
function touchPhone(pair: Pair, connId: number, type: unknown) {
  const now = Date.now()
  const gap = now - pair.lastPhoneSeen
  if (pair.lastPhoneSeen > 0 && gap > GAP_LOG_MS) {
    log(`폰 신호 간격 ${gap}ms (conn#${connId}, ${mask(pair.code)}, 메시지 ${String(type)}, 감시중 ${pair.phoneMonitoring})`)
  }
  pair.lastPhoneSeen = now
}

/** 폰이 보고한 재연결 횟수·타이머 지연이 달라졌을 때만 남긴다 */
function logPhoneHealth(pair: Pair, relay: { reconnects?: unknown; lastCloseAt?: unknown; lastCloseCode?: unknown; maxTimerLagMs?: unknown } | undefined) {
  if (!relay) return
  const key = `${relay.reconnects}|${Math.floor(Number(relay.maxTimerLagMs) / 1000)}`
  if (pair.lastHealthKey === key) return
  pair.lastHealthKey = key
  const closedAt = typeof relay.lastCloseAt === 'number' && relay.lastCloseAt > 0 ? new Date(relay.lastCloseAt).toISOString() : '-'
  log(`폰 보고 ${mask(pair.code)}: 재연결 ${String(relay.reconnects)}회, 마지막 닫힘 ${closedAt} code ${String(relay.lastCloseCode)}, 타이머 최대 지연 ${String(relay.maxTimerLagMs)}ms`)
}

function handle(ws: WebSocket, phoneOrigin: () => string) {
  let pair: Pair | undefined
  let role: 'pc' | 'phone' | undefined
  const connId = nextConnId++
  const openedAt = Date.now()
  /** 이 연결이 감독관으로서 보고 있는 응시자 (감독관 연결은 pair·role 을 쓰지 않는다) */
  let watching: Watching | undefined
  /** watch 를 처리하는 동안(권한 확인 await) 새 watch·unwatch 가 오면 이전 것을 버리기 위한 번호 */
  let watchSeq = 0

  const stopWatch = () => {
    watchSeq++
    if (!watching) return
    const { pair: target, viewerId } = watching
    watching = undefined
    target.room = leaveRoom(target.room, viewerId)
    target.viewers.delete(viewerId)
    send(target.pc, { type: 'viewer-gone', viewer: viewerId })
    log(`unwatch ${viewerId} 짝 ${mask(target.code)} (남은 감독관 ${target.room.length})`)
  }

  const startWatch = async (msg: Incoming) => {
    stopWatch()
    const seq = watchSeq
    const sessionId = msg.sessionId
    const participantId = msg.participantId
    if (!Number.isSafeInteger(sessionId) || !Number.isSafeInteger(participantId)) {
      send(ws, { type: 'watch-state', state: 'error', message: '시청 대상이 올바르지 않습니다.' })
      return
    }
    const target = await resolveWatchTarget(sessionId as number, participantId as number, msg.auth)
    if (seq !== watchSeq || ws.readyState !== WebSocket.OPEN) return // 기다리는 사이 닫았거나 다른 응시자로 바꿈
    if (!target.ok) {
      send(ws, { type: 'watch-state', state: target.state, message: target.message })
      return
    }
    const found = findPairByIdentity(target.email, target.title)
    if (!found) {
      // 응시자가 아직 입장 전이거나 PC 가 연결돼 있지 않다. 나중에 연결돼도 이어지지 않는다 (감독관이 다시 열면 된다)
      send(ws, { type: 'watch-state', state: 'offline' })
      return
    }
    const viewerId = `v${connId}`
    const joined = joinRoom(found.room, viewerId)
    if (joined.result === 'full') {
      log(`watch 거절(정원 ${MAX_VIEWERS_PER_PARTICIPANT}명) ${viewerId} 짝 ${mask(found.code)}`)
      send(ws, { type: 'watch-state', state: 'full', message: `이 응시자는 이미 감독관 ${MAX_VIEWERS_PER_PARTICIPANT}명이 보고 있습니다. 잠시 뒤 다시 시도해 주세요.` })
      return
    }
    found.room = joined.room
    found.viewers.set(viewerId, ws)
    watching = { pair: found, viewerId }
    log(`watch ${viewerId} 짝 ${mask(found.code)} (감독관 ${found.room.length}명, PC ${pcIsUp(found) ? '연결됨' : '끊김'})`)
    if (pcIsUp(found)) {
      send(ws, { type: 'watch-state', state: 'watching' })
      requestViewerVideo(found, viewerId)
    } else {
      send(ws, { type: 'watch-state', state: 'offline' })
    }
  }

  /** 이 휴대폰의 최근 1초 프레임 수 (상한 초과분은 버린다) */
  let frameWindowStart = 0
  let frameCount = 0

  ws.on('message', async (raw, isBinary) => {
    if (isBinary) {
      if (role !== 'phone' || !pair) return
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.concat(raw as Buffer[])
      if (buf.length < 4 || buf.length > MAX_FRAME_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8) return
      const now = Date.now()
      touchPhone(pair, connId, 'frame')
      if (pair.phoneState !== 'connected') setPhoneState(pair, 'connected', '프레임 수신으로 복구')
      if (now - frameWindowStart >= 1000) {
        frameWindowStart = now
        frameCount = 0
      }
      if (++frameCount > MAX_FRAMES_PER_SEC) return
      const pc = pair.pc
      if (pc && pc.readyState === WebSocket.OPEN && pc.bufferedAmount <= MAX_PC_BUFFERED) pc.send(buf, { binary: true })
      return
    }
    let msg: Incoming
    try {
      msg = JSON.parse(String(raw)) as Incoming
    } catch {
      return
    }

    if (msg.type === 'hello-pc' && typeof msg.invite === 'string') {
      const practice = (msg as { practice?: unknown }).practice === true && PRACTICE_KEY.test(msg.invite)
      const identity = practice ? {} : await inviteIdentity(msg.invite)
      if (!identity) {
        send(ws, { type: 'error', message: '입장 링크가 올바르지 않습니다.' })
        ws.close()
        return
      }
      pair = byInvite.get(msg.invite)
      if (!pair) {
        pair = {
          invite: msg.invite,
          code: randomBytes(18).toString('base64url'),
          phoneState: 'disconnected',
          lastPhoneSeen: 0,
          phoneMonitoring: false,
          practice,
          room: EMPTY_ROOM,
          viewers: new Map(),
        }
        byInvite.set(pair.invite, pair)
        byCode.set(pair.code, pair)
      }
      pair.email = identity.email
      pair.sessionTitle = identity.sessionTitle
      if (pair.pc && pair.pc !== ws) {
        log(`hello-pc 가 이전 PC 연결을 닫음 (conn#${connId}, invite ${mask(msg.invite)})`)
        pair.pc.close()
      }
      role = 'pc'
      pair.pc = ws
      log(`hello-pc conn#${connId} invite ${mask(msg.invite)} 짝 ${mask(pair.code)} 폰 ${pair.phoneState}`)
      send(ws, { type: 'paired', pairCode: pair.code, phoneUrl: `${phoneOrigin()}/proctor/phone?p=${pair.code}` })
      send(ws, { type: 'peer', phone: pair.phoneState })
      // PC 가 새로 붙거나 다시 붙었는데 이미 보고 있는 감독관이 있으면 영상 전송을 다시 요청한다
      for (const [viewerId, viewerWs] of pair.viewers) {
        send(viewerWs, { type: 'watch-state', state: 'watching' })
        requestViewerVideo(pair, viewerId)
      }
      return
    }

    // 감독관: 응시자 영상 열기·닫기 (hello 없이 붙는다)
    if (msg.type === 'watch') {
      await startWatch(msg)
      return
    }
    if (msg.type === 'unwatch') {
      stopWatch()
      return
    }

    // 감독관 ↔ 응시자 PC 영상 시그널링 (감독관 → PC 는 viewer 번호를 붙여, PC → 감독관은 그 번호로 찾아 넘긴다)
    if (msg.type === 'view-rtc') {
      const signal = parseViewSignal(msg.signal)
      if (!isViewChannel(msg.channel) || !signal) return
      if (watching) send(watching.pair.pc, { type: 'view-rtc', channel: msg.channel, signal, viewer: watching.viewerId })
      else if (role === 'pc' && pair && typeof msg.viewer === 'string') send(pair.viewers.get(msg.viewer), { type: 'view-rtc', channel: msg.channel, signal })
      return
    }

    if (msg.type === 'hello-phone' && typeof msg.pairCode === 'string') {
      const p = byCode.get(msg.pairCode)
      if (!p) {
        send(ws, { type: 'error', message: '연결 정보가 올바르지 않습니다. PC 화면의 QR 을 다시 찍어 주세요.' })
        ws.close()
        return
      }
      if (p.phone && p.phone !== ws) {
        log(`같은 짝 ${mask(p.code)} 로 폰이 다시 붙어 이전 연결을 닫음 (새 conn#${connId}, 이전 상태 ${p.phoneState})`)
        p.phone.close()
      }
      pair = p
      role = 'phone'
      p.phone = ws
      p.phoneMonitoring = false
      p.lastPhoneSeen = Date.now()
      log(`hello-phone conn#${connId} 짝 ${mask(p.code)}`)
      send(ws, { type: 'phone-joined' })
      setPhoneState(p, 'connected', `hello-phone conn#${connId}`)
      return
    }

    if (!pair || !role) return

    // WebRTC 시그널링은 양방향으로 그대로 넘긴다 (영상은 이 서버를 지나지 않는다)
    if (msg.type === 'rtc') {
      const signal = parseRtcSignal(msg.signal)
      if (!signal) return
      if (role === 'phone') touchPhone(pair, connId, 'rtc')
      send(role === 'pc' ? pair.phone : pair.pc, { type: 'rtc', signal })
      return
    }

    // 개발 전용: PC 의 화질 요청을 휴대폰에 전달한다
    if (role === 'pc' && msg.type === 'quality' && (msg.mode === 'scan' || msg.mode === 'watch')) {
      send(pair.phone, { type: 'quality', mode: msg.mode })
      return
    }

    // 그 밖에는 폰이 보낸 것만 PC 로 넘긴다
    if (role !== 'phone') return
    touchPhone(pair, connId, msg.type)
    if (pair.phoneState !== 'connected') setPhoneState(pair, 'connected', `${String(msg.type)} 수신으로 복구`)

    switch (msg.type) {
      case 'phone-alert':
        // 휴대폰 알림은 저장하지 않고 넘기기만 한다. PC 가 자기 아웃박스에 저장한다 (1단계: 분석·저장은 응시자 쪽)
        if (msg.violation) send(pair.pc, { type: 'phone-alert', violation: { ...msg.violation, snapshot: undefined } })
        break
      case 'phone-status':
        pair.phoneMonitoring = msg.status?.sending === true
        logPhoneHealth(pair, msg.status?.relay as Parameters<typeof logPhoneHealth>[1])
        send(pair.pc, msg)
        break
      case 'heartbeat':
        break // 수신만으로 lastPhoneSeen 이 갱신된다 (워커가 메인 스레드와 무관하게 보낸다)
      default:
        break
    }
  })

  ws.on('error', (err) => log(`WebSocket 오류 conn#${connId} 역할 ${role ?? '미정'}: ${err.message}`))

  ws.on('close', (code, reason) => {
    const sinceSeen = pair && role === 'phone' ? `, 마지막 폰 수신 ${Date.now() - pair.lastPhoneSeen}ms 전` : ''
    log(
      `close conn#${connId} 역할 ${role ?? '미정'} code ${code} reason "${reason.toString()}" 연결 ${Math.round((Date.now() - openedAt) / 1000)}초 유지` +
        `${sinceSeen}${pair && role === 'phone' && pair.phone !== ws ? ' (이미 새 연결로 교체됨)' : ''}`,
    )
    stopWatch()
    if (!pair) return
    if (role === 'phone' && pair.phone === ws) {
      pair.phone = undefined
      setPhoneState(pair, 'disconnected', `WebSocket close code ${code}`)
      systemEvent(pair, 'phone_disconnected', '보조 카메라(휴대폰) 연결이 끊겼습니다')
    }
    if (role === 'pc' && pair.pc === ws) {
      pair.pc = undefined
      for (const viewerWs of pair.viewers.values()) send(viewerWs, { type: 'watch-state', state: 'offline' })
    }
  })
}

function attach(httpServer: HttpServer | null, port: number, https: boolean) {
  if (!httpServer) return
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
  // 다른 네트워크(LTE 등)의 휴대폰이 붙으려면 공인 주소가 필요하다.
  // 우선순위: PAIR_PUBLIC_ORIGIN 환경변수 → PC 가 터널 주소로 접속했으면 그 주소 → 같은 와이파이용 사설 IP
  const publicOrigin = (process.env.PAIR_PUBLIC_ORIGIN ?? '').replace(/\/$/, '')
  const lanOrigin = () => `${https ? 'https' : 'http'}://${lanIp() ?? 'localhost'}:${port}`
  wss.on('connection', (ws, req: IncomingMessage) => handle(ws, () => publicOrigin || requestOrigin(req) || lanOrigin()))
  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith(RELAY_PATH)) return // Vite HMR 등은 그대로 둔다
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  const timer = setInterval(() => {
    const now = Date.now()
    for (const p of byInvite.values()) {
      if (isPhoneStale({ hasSocket: !!p.phone, monitoring: p.phoneMonitoring, state: p.phoneState, lastSeen: p.lastPhoneSeen, now })) {
        log(`stale 판정 ${mask(p.code)}: 마지막 폰 수신 후 ${now - p.lastPhoneSeen}ms (기준 ${PHONE_STALE_MS}ms), ws.readyState ${p.phone?.readyState}`)
        setPhoneState(p, 'stale', '감시 중 무신호')
        systemEvent(p, 'phone_stale', '보조 카메라에서 신호가 오지 않습니다 (화면 꺼짐·앱 전환 의심)')
      }
    }
  }, 2000)
  httpServer.on('close', () => {
    clearInterval(timer)
    wss.close()
  })
  log(`대기 중 ${RELAY_PATH} → 백엔드 ${BACKEND} (진단 로그 파일 ${RELAY_LOG_FILE})`)
}

export function proctorRelay(): Plugin {
  return {
    name: 'pair-proctor-relay',
    configureServer(server) {
      attach(server.httpServer as HttpServer | null, server.config.server.port ?? 5173, !!server.config.server.https)
    },
    configurePreviewServer(server) {
      attach(server.httpServer as HttpServer, server.config.preview.port ?? 4173, !!server.config.preview.https)
    },
  }
}
