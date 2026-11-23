import { describe, expect, it } from './expect.ts'
import type { PhoneFeatures } from '../../src/proctor/core/phoneRules.ts'
import { BackendFatalError } from '../../src/proctor/vision/visionBackend.ts'
import {
  FallbackPhoneBackend,
  PhoneWorkerBackend,
  type PhoneVisionBackend,
  type PhoneWorkerLike,
} from '../../src/proctor/vision/phoneBackend.ts'

const FEATURES: PhoneFeatures = { hands: [{ x: 0.5, y: 0.5 }], objects: [] }
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer

type Sent = { t: string; id?: number }
function fakeWorker(script: (w: FakeWorker, m: Sent) => void) {
  const w: FakeWorker = {
    sent: [],
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage(m: unknown) {
      this.sent.push(m as Sent)
      script(this, m as Sent)
    },
    terminate() {
      this.terminated = true
    },
    reply(m: unknown) {
      this.onmessage?.({ data: m } as MessageEvent)
    },
  }
  return w
}
type FakeWorker = PhoneWorkerLike & { sent: Sent[]; terminated: boolean; reply(m: unknown): void }

const okScript = (w: FakeWorker, m: Sent) => {
  if (m.t === 'init') w.reply({ t: 'ready', delegate: 'CPU', loadMs: 5 })
  if (m.t === 'frame') w.reply({ t: 'frame', id: m.id, features: FEATURES, ms: 7 })
}

describe('PhoneWorkerBackend', () => {
  it('준비되면 프레임을 보내고 요약값을 돌려받는다', async () => {
    const w = fakeWorker(okScript)
    const b = await PhoneWorkerBackend.create(() => w, 'CPU')
    expect(b.kind).toBe('worker')
    const f = await b.analyze(jpeg(), 10)
    expect(f).toEqual(FEATURES)
  })

  it('초기화 중 오류가 오면 만들기를 거절하고 Worker 를 끈다', async () => {
    const w = fakeWorker((ww, m) => {
      if (m.t === 'init') ww.reply({ t: 'error', message: '모델 실패' })
    })
    let err: unknown
    await PhoneWorkerBackend.create(() => w, 'CPU').catch((e: unknown) => (err = e))
    expect(String(err)).toContain('모델 실패')
    expect(w.terminated).toBe(true)
  })

  it('프레임 하나의 오류는 그 요청만 거절하고 백엔드는 계속 쓴다', async () => {
    let n = 0
    const w = fakeWorker((ww, m) => {
      if (m.t === 'init') ww.reply({ t: 'ready', delegate: 'CPU', loadMs: 1 })
      if (m.t === 'frame') ww.reply(++n === 1 ? { t: 'error', id: m.id, message: '깨진 JPEG' } : { t: 'frame', id: m.id, features: FEATURES, ms: 1 })
    })
    const b = await PhoneWorkerBackend.create(() => w, 'CPU')
    let err: unknown
    await b.analyze(jpeg(), 1).catch((e: unknown) => (err = e))
    expect(err instanceof BackendFatalError).toBe(false)
    expect(await b.analyze(jpeg(), 2)).toEqual(FEATURES)
  })

  it('응답이 없으면 BackendFatalError 로 닫는다', async () => {
    const w = fakeWorker((ww, m) => {
      if (m.t === 'init') ww.reply({ t: 'ready', delegate: 'CPU', loadMs: 1 })
    })
    const b = await PhoneWorkerBackend.create(() => w, 'CPU', { analyzeTimeoutMs: 20 })
    let err: unknown
    await b.analyze(jpeg(), 1).catch((e: unknown) => (err = e))
    expect(err instanceof BackendFatalError).toBe(true)
    expect(w.terminated).toBe(true)
  })

  it('dispose 뒤 호출은 바로 거절된다', async () => {
    const b = await PhoneWorkerBackend.create(() => fakeWorker(okScript), 'CPU')
    b.dispose()
    let err: unknown
    await b.analyze(jpeg(), 1).catch((e: unknown) => (err = e))
    expect(err instanceof BackendFatalError).toBe(true)
  })
})

describe('FallbackPhoneBackend', () => {
  const stub = (kind: 'worker' | 'main', fn: () => Promise<PhoneFeatures>): PhoneVisionBackend & { disposed: boolean } => ({
    kind,
    disposed: false,
    analyze: fn,
    dispose() {
      this.disposed = true
    },
  })

  it('기본 백엔드가 못 쓰게 되면 한 번 메인으로 갈아타고 같은 요청을 다시 한다', async () => {
    const primary = stub('worker', () => Promise.reject(new BackendFatalError('죽음')))
    const main = stub('main', () => Promise.resolve(FEATURES))
    let reason: unknown
    const b = new FallbackPhoneBackend(primary, () => main, (r) => (reason = r))
    expect(await b.analyze(jpeg(), 1)).toEqual(FEATURES)
    expect(b.kind).toBe('main')
    expect(primary.disposed).toBe(true)
    expect(String(reason)).toContain('죽음')
  })

  it('일시적 실패는 갈아타지 않고 그대로 던진다', async () => {
    const primary = stub('worker', () => Promise.reject(new Error('프레임 오류')))
    const b = new FallbackPhoneBackend(primary, () => stub('main', () => Promise.resolve(FEATURES)), () => undefined)
    let err: unknown
    await b.analyze(jpeg(), 1).catch((e: unknown) => (err = e))
    expect(String(err)).toContain('프레임 오류')
    expect(b.kind).toBe('worker')
  })
})
