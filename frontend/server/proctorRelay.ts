// 개발용 휴대폰 보조 캠 릴레이 (Vite 개발 서버 플러그인). pAIr-docs/API/실전시험_감독_API.md §2 를 그대로 구현한다.
// 운영에서는 팀원 백엔드가 같은 동작을 WebSocket 으로 제공한다. 이 파일은 로컬 개발·시연용.
//  - PC 는 초대 토큰으로 붙고, 서버가 짝 코드(초대 토큰과 다른 값)를 발급해 QR 주소를 돌려준다.
//  - 폰 경고는 백엔드 감독 이벤트 API 로 저장하고 PC 에 전달한다. 점검 사진은 저장하지 않고 PC 로만 넘긴다.
//  - 폰 연결이 끊기거나 감시 중 6초간 신호가 없으면 PHONE_DISCONNECTED 를 남긴다.
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { Duplex } from 'node:stream'
import type { Plugin } from 'vite'
import { WebSocket, WebSocketServer } from 'ws'

const RELAY_PATH = '/ws/proctor'
const BACKEND = (process.env.PAIR_BACKEND_URL ?? 'http://localhost:8180').replace(/\/$/, '')
const PHONE_STALE_MS = 6000
const MAX_PAYLOAD = 2 * 1024 * 1024
const INVITE = /^[A-Za-z0-9_-]{43}$/

type PeerState = 'connected' | 'disconnected' | 'stale'
type Pair = {
  invite: string
  code: string
  pc?: WebSocket
  phone?: WebSocket
  phoneState: PeerState
  lastPhoneSeen: number
  /** 폰이 감시를 시작했는지 (모델 로딩 중 멈춤을 응답 없음으로 오인하지 않게) */
  phoneMonitoring: boolean
}

/** 메시지는 클라이언트가 보낸 값이라 필요한 필드만 꺼내 쓴다 */
type Incoming = { type?: unknown; invite?: unknown; pairCode?: unknown; violation?: Record<string, unknown>; status?: Record<string, unknown> }

const byInvite = new Map<string, Pair>()
const byCode = new Map<string, Pair>()

function log(...args: unknown[]) {
  console.log(`[proctor-relay ${new Date().toLocaleTimeString('ko-KR')}]`, ...args)
}

function send(ws: WebSocket | undefined, msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function lanIp(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) return ni.address
    }
  }
  return null
}

async function inviteIsValid(invite: string): Promise<boolean> {
  if (!INVITE.test(invite)) return false
  try {
    const res = await fetch(`${BACKEND}/api/entry/${encodeURIComponent(invite)}`)
    return res.ok
  } catch {
    log('백엔드에 연결할 수 없습니다:', BACKEND)
    return false
  }
}

/** 폰 이벤트를 백엔드에 저장. 시작 전·시험 시간 밖이면 백엔드가 400 으로 거절한다 (그대로 둔다) */
async function record(pair: Pair, v: Record<string, unknown>) {
  const type = typeof v.type === 'string' ? v.type : null
  const startedAt = typeof v.startedAt === 'number' ? new Date(v.startedAt).toISOString() : null
  if (!type || !startedAt) return
  try {
    const res = await fetch(`${BACKEND}/api/entry/${encodeURIComponent(pair.invite)}/proctor-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        source: 'PHONE_CAM',
        startedAt,
        durationMs: typeof v.durationMs === 'number' ? Math.max(0, Math.round(v.durationMs)) : 0,
        detail: typeof v.detail === 'object' && v.detail !== null ? v.detail : undefined,
        snapshot: typeof v.snapshot === 'string' ? v.snapshot : undefined,
      }),
    })
    if (!res.ok && res.status !== 400) log('폰 이벤트 저장 실패', res.status)
  } catch {
    log('폰 이벤트 저장 실패 (백엔드 연결 안 됨)')
  }
}

function systemEvent(pair: Pair, kind: string, message: string) {
  const now = Date.now()
  const v = { id: `relay-${now}`, kind, type: 'PHONE_DISCONNECTED', source: 'PHONE_CAM', message, startedAt: now, ts: now, durationMs: 0 }
  void record(pair, v)
  send(pair.pc, { type: 'violation', violation: v })
}

function setPhoneState(pair: Pair, state: PeerState) {
  if (pair.phoneState === state) return
  pair.phoneState = state
  send(pair.pc, { type: 'peer', phone: state })
}

function handle(ws: WebSocket, phoneOrigin: () => string) {
  let pair: Pair | undefined
  let role: 'pc' | 'phone' | undefined

  ws.on('message', async (raw) => {
    let msg: Incoming
    try {
      msg = JSON.parse(String(raw)) as Incoming
    } catch {
      return
    }

    if (msg.type === 'hello-pc' && typeof msg.invite === 'string') {
      if (!(await inviteIsValid(msg.invite))) {
        send(ws, { type: 'error', message: '입장 링크가 올바르지 않습니다.' })
        ws.close()
        return
      }
      pair = byInvite.get(msg.invite)
      if (!pair) {
        pair = { invite: msg.invite, code: randomBytes(18).toString('base64url'), phoneState: 'disconnected', lastPhoneSeen: 0, phoneMonitoring: false }
        byInvite.set(pair.invite, pair)
        byCode.set(pair.code, pair)
      }
      if (pair.pc && pair.pc !== ws) pair.pc.close()
      role = 'pc'
      pair.pc = ws
      send(ws, { type: 'paired', pairCode: pair.code, phoneUrl: `${phoneOrigin()}/proctor/phone?p=${pair.code}` })
      send(ws, { type: 'peer', phone: pair.phoneState })
      return
    }

    if (msg.type === 'hello-phone' && typeof msg.pairCode === 'string') {
      const p = byCode.get(msg.pairCode)
      if (!p) {
        send(ws, { type: 'error', message: '연결 정보가 올바르지 않습니다. PC 화면의 QR 을 다시 찍어 주세요.' })
        ws.close()
        return
      }
      if (p.phone && p.phone !== ws) p.phone.close()
      pair = p
      role = 'phone'
      p.phone = ws
      p.phoneMonitoring = false
      p.lastPhoneSeen = Date.now()
      send(ws, { type: 'phone-joined' })
      setPhoneState(p, 'connected')
      return
    }

    // 짝이 정해진 뒤에는 폰이 보낸 것만 PC 로 넘긴다 (PC → 폰 방향 메시지는 없다)
    if (!pair || role !== 'phone') return
    pair.lastPhoneSeen = Date.now()
    if (pair.phoneState !== 'connected') setPhoneState(pair, 'connected')

    switch (msg.type) {
      case 'violation':
        if (msg.violation) {
          void record(pair, msg.violation)
          send(pair.pc, { type: 'violation', violation: { ...msg.violation, snapshot: undefined } })
        }
        break
      case 'phone-status':
        pair.phoneMonitoring = msg.status?.calibrated === true
        send(pair.pc, msg)
        break
      case 'scan-frame':
      case 'check-report':
        send(pair.pc, msg)
        break
      default:
        break
    }
  })

  ws.on('close', () => {
    if (!pair) return
    if (role === 'phone' && pair.phone === ws) {
      pair.phone = undefined
      setPhoneState(pair, 'disconnected')
      systemEvent(pair, 'phone_disconnected', '보조 카메라(휴대폰) 연결이 끊겼습니다')
    }
    if (role === 'pc' && pair.pc === ws) pair.pc = undefined
  })
}

function attach(httpServer: HttpServer | null, port: number, https: boolean) {
  if (!httpServer) return
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
  const phoneOrigin = () => `${https ? 'https' : 'http'}://${lanIp() ?? 'localhost'}:${port}`
  wss.on('connection', (ws) => handle(ws, phoneOrigin))
  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith(RELAY_PATH)) return // Vite HMR 등은 그대로 둔다
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  const timer = setInterval(() => {
    const now = Date.now()
    for (const p of byInvite.values()) {
      if (p.phone && p.phoneMonitoring && p.phoneState === 'connected' && now - p.lastPhoneSeen > PHONE_STALE_MS) {
        setPhoneState(p, 'stale')
        systemEvent(p, 'phone_stale', '보조 카메라에서 신호가 오지 않습니다 (화면 꺼짐·앱 전환 의심)')
      }
    }
  }, 2000)
  httpServer.on('close', () => {
    clearInterval(timer)
    wss.close()
  })
  log(`대기 중 ${RELAY_PATH} → 백엔드 ${BACKEND}`)
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
