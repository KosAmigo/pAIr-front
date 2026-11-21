// 개발 릴레이의 감독관 시청 중계: 가짜 백엔드 + 실제 WebSocket 으로 열기·정원·시그널링·닫기를 확인한다.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after } from 'node:test'
import { WebSocket } from 'ws'
import { describe, expect, it } from './expect.ts'

const INVITE = 'A'.repeat(43)
const EMAIL = 'a@example.com'
const TITLE = '1차 시험'

const backend = createServer((req, res) => {
  const url = req.url ?? ''
  res.setHeader('Content-Type', 'application/json')
  if (url.startsWith('/api/entry/')) {
    res.end(JSON.stringify({ email: EMAIL, sessionTitle: TITLE }))
  } else if (url === '/api/console/sessions/7') {
    if (req.headers['x-pair-role'] !== 'PROCTOR') {
      res.statusCode = 403
      res.end('{}')
    } else res.end(JSON.stringify({ session: { title: TITLE }, participants: [{ id: 3, email: EMAIL }, { id: 4, email: 'other@example.com' }] }))
  } else {
    res.statusCode = 404
    res.end('{}')
  }
})
await new Promise<void>((r) => backend.listen(0, r))
process.env.PAIR_BACKEND_URL = `http://localhost:${(backend.address() as AddressInfo).port}`
const { proctorRelay } = await import('../../server/proctorRelay.ts')

const relayHttp: Server = createServer()
await new Promise<void>((r) => relayHttp.listen(0, r))
const relayPort = (relayHttp.address() as AddressInfo).port
const plugin = proctorRelay() as unknown as { configureServer: (s: unknown) => void }
plugin.configureServer({ httpServer: relayHttp, config: { server: { port: relayPort } } })
const url = `ws://localhost:${relayPort}/ws/proctor`

type Msg = { type: string; [k: string]: unknown }
const all: Client[] = []

class Client {
  ws = new WebSocket(url)
  got: Msg[] = []
  ready = new Promise<void>((r) => this.ws.once('open', () => r()))
  constructor() {
    this.ws.on('message', (d) => this.got.push(JSON.parse(String(d)) as Msg))
    all.push(this)
  }
  async send(m: object) {
    await this.ready
    this.ws.send(JSON.stringify(m))
  }
  async next(type: string, ms = 1500): Promise<Msg> {
    const end = Date.now() + ms
    while (Date.now() < end) {
      const i = this.got.findIndex((m) => m.type === type)
      if (i >= 0) return this.got.splice(i, 1)[0]
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`${type} 메시지가 오지 않음`)
  }
  async none(type: string, ms = 200) {
    await new Promise((r) => setTimeout(r, ms))
    expect(this.got.some((m) => m.type === type)).toBe(false)
  }
  close() {
    this.ws.close()
  }
}

const proctorAuth = { 'X-Pair-User-Id': '1', 'X-Pair-Role': 'PROCTOR', 'X-Pair-Company-Id': '1' }
const watch = (participantId = 3) => ({ type: 'watch', sessionId: 7, participantId, auth: proctorAuth })

async function pcClient(): Promise<Client> {
  const pc = new Client()
  await pc.send({ type: 'hello-pc', invite: INVITE })
  await pc.next('paired')
  return pc
}

describe('개발 릴레이 감독관 시청 중계', () => {
  it('열면 응시자 PC 에 세 채널 요청이 가고, 시그널링이 서로 전달되고, 닫으면 viewer-gone 이 간다', async () => {
    const pc = await pcClient()
    const viewer = new Client()
    await viewer.send(watch())
    expect((await viewer.next('watch-state')).state).toBe('watching')
    const reqs = [await pc.next('viewer-request'), await pc.next('viewer-request'), await pc.next('viewer-request')]
    expect(reqs.map((r) => r.channel).sort()).toEqual(['phone', 'screen', 'webcam'])
    const id = reqs[0].viewer as string

    await pc.send({ type: 'view-rtc', viewer: id, channel: 'webcam', signal: { kind: 'offer', sdp: 'v=0' } })
    const offer = await viewer.next('view-rtc')
    expect(offer.channel).toBe('webcam')
    expect(offer.signal).toEqual({ kind: 'offer', sdp: 'v=0' })
    await viewer.send({ type: 'view-rtc', channel: 'webcam', signal: { kind: 'answer', sdp: 'v=1' } })
    const answer = await pc.next('view-rtc')
    expect(answer.viewer).toBe(id)
    expect(answer.signal).toEqual({ kind: 'answer', sdp: 'v=1' })

    await viewer.send({ type: 'unwatch' })
    expect((await pc.next('viewer-gone')).viewer).toBe(id)
    // 닫은 뒤에는 PC 의 신호가 감독관에게 가지 않는다
    await pc.send({ type: 'view-rtc', viewer: id, channel: 'webcam', signal: { kind: 'candidate', candidate: { candidate: 'c' } } })
    await viewer.none('view-rtc')
    viewer.close()
    pc.close()
  })

  it('감독관 연결이 끊기면 응시자 PC 에 viewer-gone 이 가서 전송이 멈춘다', async () => {
    const pc = await pcClient()
    const viewer = new Client()
    await viewer.send(watch())
    const id = (await pc.next('viewer-request')).viewer as string
    viewer.close()
    expect((await pc.next('viewer-gone')).viewer).toBe(id)
    pc.close()
  })

  it('한 응시자를 동시에 볼 수 있는 감독관은 상한까지다', async () => {
    const pc = await pcClient()
    const a = new Client()
    const b = new Client()
    const c = new Client()
    for (const v of [a, b]) {
      await v.send(watch())
      expect((await v.next('watch-state')).state).toBe('watching')
    }
    await c.send(watch())
    expect((await c.next('watch-state')).state).toBe('full')
    await a.send({ type: 'unwatch' })
    await pc.next('viewer-gone')
    const d = new Client()
    await d.send(watch())
    expect((await d.next('watch-state')).state).toBe('watching')
    for (const v of [a, b, c, d, pc]) v.close()
  })

  it('권한이 없으면 denied, 응시자가 없으면 offline 이다', async () => {
    const pc = await pcClient()
    const noAuth = new Client()
    await noAuth.send({ type: 'watch', sessionId: 7, participantId: 3, auth: { 'X-Pair-Role': 'APPLICANT' } })
    expect((await noAuth.next('watch-state')).state).toBe('denied')
    await pc.none('viewer-request')

    const absent = new Client()
    await absent.send(watch(4)) // 입장한 PC 가 없는 참가자
    expect((await absent.next('watch-state')).state).toBe('offline')
    await pc.none('viewer-request')

    const wrongId = new Client()
    await wrongId.send(watch(99))
    expect((await wrongId.next('watch-state')).state).toBe('denied')
    for (const v of [noAuth, absent, wrongId, pc]) v.close()
  })

  it('응시자 PC 가 끊기면 감독관에게 offline, 다시 붙으면 watching 과 영상 요청이 다시 간다', async () => {
    const pc = await pcClient()
    const viewer = new Client()
    await viewer.send(watch())
    await viewer.next('watch-state')
    pc.close()
    expect((await viewer.next('watch-state')).state).toBe('offline')
    const pc2 = await pcClient()
    expect((await viewer.next('watch-state')).state).toBe('watching')
    expect((await pc2.next('viewer-request')).channel !== undefined).toBe(true)
    viewer.close()
    pc2.close()
  })

  it('형식이 틀린 시그널링은 전달하지 않는다', async () => {
    const pc = await pcClient()
    const viewer = new Client()
    await viewer.send(watch())
    await pc.next('viewer-request')
    await viewer.send({ type: 'view-rtc', channel: 'webcam', signal: { kind: 'torch', on: true } })
    await viewer.send({ type: 'view-rtc', channel: 'mic', signal: { kind: 'request' } })
    await pc.none('view-rtc')
    viewer.close()
    pc.close()
  })
})

// 서버를 닫아야 테스트 프로세스가 끝난다
after(() => {
  for (const c of all) c.ws.terminate()
  relayHttp.closeAllConnections?.()
  relayHttp.close()
  backend.closeAllConnections?.()
  backend.close()
})
