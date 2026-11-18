// 감독 릴레이 서버 (Vite dev/preview 서버에 붙는 플러그인).
// - PC가 세션을 만들고, 폰은 QR의 세션ID+토큰으로 같은 세션에 붙는다.
// - 폰이 보낸 경고는 PC로 중계하고, 사진은 디스크에 저장했다가 보관 기간이 지나면 지운다.
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, createReadStream } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join, normalize, resolve } from 'node:path'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Connect, Plugin } from 'vite'
import { WebSocketServer, WebSocket } from 'ws'
import type { ClientMsg, ServerMsg, Violation } from '../src/shared/protocol'
import { WS_PATH } from '../src/shared/protocol'

const DATA_DIR = resolve(process.cwd(), 'data')
const SNAP_DIR = join(DATA_DIR, 'snapshots')
const EVENTS_FILE = join(DATA_DIR, 'events.jsonl')
/** 개발 서버가 재시작돼도 QR(세션ID·토큰)이 계속 유효하도록 저장 */
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')
/** 사진 보관 기간. 기본 7일 */
const RETENTION_MS = Number(process.env.SNAPSHOT_RETENTION_HOURS ?? 24 * 7) * 3600_000
const PHONE_STALE_MS = 6000

interface Session {
  id: string
  token: string
  pc?: WebSocket
  phone?: WebSocket
  lastPhoneSeen: number
  phoneState: 'connected' | 'disconnected' | 'stale'
  /** 폰이 감시를 시작했는지. 모델 로딩 중엔 화면이 멈춰 신호가 끊길 수 있어 응답 없음 판정을 하지 않는다 */
  phoneMonitoring: boolean
  events: Violation[]
}

const sessions = new Map<string, Session>()

function loadSessions() {
  try {
    const saved: { id: string; token: string }[] = JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'))
    for (const { id, token } of saved) {
      sessions.set(id, { id, token, lastPhoneSeen: 0, phoneState: 'disconnected', phoneMonitoring: false, events: [] })
    }
  } catch {
    /* 처음 실행 */
  }
}

function saveSessions() {
  mkdirSync(DATA_DIR, { recursive: true })
  const list = [...sessions.values()].slice(-50).map(({ id, token }) => ({ id, token }))
  writeFileSync(SESSIONS_FILE, JSON.stringify(list))
}

loadSessions()

function log(...args: unknown[]) {
  console.log(`[relay ${new Date().toLocaleTimeString("ko-KR")}]`, ...args)
}

function send(ws: WebSocket | undefined, msg: ServerMsg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function lanIps(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) out.push(ni.address)
    }
  }
  return out
}

function saveSnapshot(sessionId: string, v: Violation): string | undefined {
  const m = v.snapshot?.match(/^data:image\/jpeg;base64,(.+)$/)
  if (!m) return undefined
  const dir = join(SNAP_DIR, sessionId)
  mkdirSync(dir, { recursive: true })
  const file = `${v.ts}-${v.source}-${v.kind}.jpg`
  writeFileSync(join(dir, file), Buffer.from(m[1], 'base64'))
  return `/snapshots/${sessionId}/${file}`
}

function record(session: Session, v: Violation) {
  const snapshotUrl = saveSnapshot(session.id, v)
  const stored: Violation = { ...v, snapshot: snapshotUrl }
  session.events.push(stored)
  mkdirSync(DATA_DIR, { recursive: true })
  appendFileSync(EVENTS_FILE, JSON.stringify({ sessionId: session.id, ...stored }) + '\n')
  send(session.pc, { type: 'violation', violation: stored })
}

function systemViolation(session: Session, kind: string, message: string) {
  const now = Date.now()
  record(session, { id: `${now}-${kind}`, source: 'phone', kind, message, startedAt: now, ts: now, durationMs: 0 })
}

function setPhoneState(session: Session, state: Session['phoneState']) {
  if (session.phoneState === state) return
  session.phoneState = state
  send(session.pc, { type: 'peer', phone: state })
}

export function purgeOldSnapshots(now = Date.now()) {
  if (!existsSync(SNAP_DIR)) return 0
  let removed = 0
  for (const sid of readdirSync(SNAP_DIR)) {
    const dir = join(SNAP_DIR, sid)
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (now - statSync(p).mtimeMs > RETENTION_MS) {
        rmSync(p)
        removed++
      }
    }
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true })
  }
  return removed
}

function handleConnection(ws: WebSocket, origin: (ip: string) => string) {
  let session: Session | undefined
  let role: 'pc' | 'phone' | undefined

  ws.on('message', (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }

    if (msg.type === 'hello-pc') {
      session = (msg.sessionId && sessions.get(msg.sessionId)) || undefined
      if (!session) {
        session = {
          id: randomBytes(4).toString('hex'),
          token: randomBytes(12).toString('base64url'),
          lastPhoneSeen: 0,
          phoneState: 'disconnected',
          phoneMonitoring: false,
          events: [],
        }
        sessions.set(session.id, session)
        saveSessions()
      }
      role = 'pc'
      session.pc = ws
      const phoneUrls = lanIps().map(
        (ip) => `${origin(ip)}/?role=phone&s=${session!.id}&t=${session!.token}`,
      )
      send(ws, { type: 'session', sessionId: session.id, token: session.token, phoneUrls })
      send(ws, { type: 'peer', phone: session.phoneState })
      return
    }

    if (msg.type === 'hello-phone') {
      const s = sessions.get(msg.sessionId)
      log('폰 hello', msg.sessionId, s ? (s.token === msg.token ? '토큰 일치' : '토큰 불일치') : '세션 없음(서버 재시작 후 예전 QR?)')
      if (!s || s.token !== msg.token) {
        send(ws, { type: 'error', message: '세션 정보가 올바르지 않습니다. PC 화면의 QR을 다시 찍어 주세요.' })
        ws.close()
        return
      }
      if (s.phone && s.phone !== ws) s.phone.close()
      session = s
      role = 'phone'
      s.phone = ws
      s.phoneMonitoring = false
      s.lastPhoneSeen = Date.now()
      send(ws, { type: 'phone-joined' })
      setPhoneState(s, 'connected')
      return
    }

    if (!session || !role) return

    if (msg.type === 'violation') {
      // 출처는 클라이언트가 아니라 연결 역할로 확정한다
      record(session, { ...msg.violation, source: role })
      if (role === 'phone') session.lastPhoneSeen = Date.now()
      return
    }

    if (msg.type === 'phone-status' && role === 'phone') {
      session.lastPhoneSeen = Date.now()
      session.phoneMonitoring = msg.status.calibrated
      setPhoneState(session, 'connected')
      send(session.pc, { type: 'phone-status', status: msg.status })
    }
  })

  ws.on('close', () => {
    if (!session) return
    if (role === 'phone' && session.phone === ws) {
      session.phone = undefined
      setPhoneState(session, 'disconnected')
      systemViolation(session, 'phone_disconnected', '보조 카메라(휴대폰) 연결이 끊겼습니다')
    }
    if (role === 'pc' && session.pc === ws) session.pc = undefined
  })
}

function serveSnapshots(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (url.includes('role=phone')) log('폰 페이지 요청', req.socket.remoteAddress, req.headers['user-agent'])
    if (url.startsWith('/snapshots/')) {
      const p = normalize(join(SNAP_DIR, decodeURIComponent(url.slice('/snapshots/'.length).split('?')[0])))
      if (!p.startsWith(SNAP_DIR) || !existsSync(p)) {
        res.statusCode = 404
        res.end()
        return
      }
      res.setHeader('Content-Type', 'image/jpeg')
      createReadStream(p).pipe(res)
      return
    }
    const m = url.match(/^\/api\/sessions\/([0-9a-f]+)\/events/)
    if (m) {
      const s = sessions.get(m[1])
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(s?.events ?? []))
      return
    }
    next()
  }
}

function attach(httpServer: HttpServer | null, port: number, https: boolean, middlewares: Connect.Server) {
  if (!httpServer) return
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 })
  const origin = (ip: string) => `${https ? 'https' : 'http'}://${ip}:${port}`
  wss.on('connection', (ws) => handleConnection(ws, origin))
  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith(WS_PATH)) return // Vite HMR 등은 그대로 둔다
    log('WS 연결 시도', req.socket.remoteAddress)
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  middlewares.use(serveSnapshots())

  const timer = setInterval(() => {
    const now = Date.now()
    for (const s of sessions.values()) {
      if (s.phone && s.phoneMonitoring && s.phoneState === 'connected' && now - s.lastPhoneSeen > PHONE_STALE_MS) {
        setPhoneState(s, 'stale')
        systemViolation(s, 'phone_stale', '보조 카메라에서 신호가 오지 않습니다 (화면 꺼짐·앱 전환 의심)')
      }
    }
  }, 2000)
  const purgeTimer = setInterval(() => purgeOldSnapshots(), 3600_000)
  purgeOldSnapshots()
  httpServer.on('close', () => {
    clearInterval(timer)
    clearInterval(purgeTimer)
    wss.close()
  })
}

export function relayPlugin(): Plugin {
  return {
    name: 'cam-proctor-relay',
    configureServer(server) {
      attach(server.httpServer as HttpServer | null, server.config.server.port ?? 5174, !!server.config.server.https, server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.httpServer as HttpServer, server.config.preview.port ?? 5174, !!server.config.preview.https, server.middlewares)
    },
  }
}
