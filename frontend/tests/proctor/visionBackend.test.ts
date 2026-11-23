import { test } from 'node:test'
import { expect } from './expect.ts'
import { PcStepper, type PcModels } from '../../src/proctor/vision/pcStepper.ts'
import { BackendFatalError, FallbackBackend, MainBackend, type MainModels, type VisionBackend } from '../../src/proctor/vision/visionBackend.ts'
import { EnvStepper } from '../../src/proctor/vision/envStepper.ts'
import { createPcBackend } from '../../src/proctor/vision/visionBackendFactory.ts'
import { moduleFileset } from '../../src/proctor/vision/visionAssets.ts'
import { WorkerBackend, type WorkerLike } from '../../src/proctor/vision/workerBackend.ts'

// ── 가짜 모델: 호출 순서만 기록한다 ─────────────────────────────
function fakeModels(log: string[]): PcModels {
  return {
    face: { detectForVideo: () => (log.push('face'), { faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]], faceBlendshapes: [], facialTransformationMatrixes: [] }) as never },
    pose: { detectForVideo: () => (log.push('pose'), { landmarks: [], worldLandmarks: [], segmentationMasks: [], close() {} }) as never },
  }
}
const VIDEO = {} as HTMLVideoElement

function mainModels(log: string[]): MainModels {
  return {
    ...fakeModels(log),
    hand: { detectForVideo: () => (log.push('hand'), { landmarks: [[{ x: 0, y: 0, z: 0 }], [{ x: 1, y: 1, z: 0 }]] }) as never },
  }
}

test('PcStepper: 얼굴 3번에 포즈 1번을 번갈아 돌린다', () => {
  const log: string[] = []
  const stepper = new PcStepper(fakeModels(log))
  for (let i = 0; i < 8; i++) stepper.step(VIDEO, i * 100)
  expect(log).toEqual(['face', 'face', 'face', 'pose', 'face', 'face', 'face', 'pose'])
})

test('PcStepper: reset 하면 교대 순서가 처음(얼굴)부터 다시 시작한다', () => {
  const log: string[] = []
  const stepper = new PcStepper(fakeModels(log))
  for (let i = 0; i < 2; i++) stepper.step(VIDEO, i)
  stepper.reset()
  for (let i = 0; i < 4; i++) stepper.step(VIDEO, i)
  expect(log).toEqual(['face', 'face', 'face', 'face', 'face', 'pose'])
})

test('PcStepper: 얼굴 수를 특징값에 담는다', () => {
  const stepper = new PcStepper(fakeModels([]))
  expect(stepper.step(VIDEO, 0).faceCount).toBe(1)
})

test('moduleFileset: 모델마다 로더 주소가 달라야 한 Worker 에서 두 번째 모델도 만들어진다', () => {
  const face = moduleFileset('face')
  const pose = moduleFileset('pose')
  expect(face.wasmLoaderPath === pose.wasmLoaderPath).toBe(false)
  expect(face.wasmLoaderPath).toContain('vision_wasm_module_internal.js')
  expect(face.wasmBinaryPath).toBe(pose.wasmBinaryPath)
})

// ── 가짜 Worker ────────────────────────────────────────────────
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  sent: { msg: unknown; transfer?: Transferable[] }[] = []
  terminated = false
  postMessage(msg: unknown, transfer?: Transferable[]) {
    this.sent.push({ msg, transfer })
    this.onPost?.(msg)
  }
  terminate() {
    this.terminated = true
  }
  onPost: ((msg: unknown) => void) | null = null
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
  crash(message = '죽음') {
    this.onerror?.({ message } as ErrorEvent)
  }
}

/** init 에 바로 ready 로 답하는 Worker */
function readyWorker() {
  const w = new FakeWorker()
  w.onPost = (m) => {
    if ((m as { t: string }).t === 'init') queueMicrotask(() => w.reply({ t: 'ready', delegate: 'CPU', loadMs: 1 }))
  }
  return w
}

const FEATURES = { faceCount: 1, shoulders: null }

function stubBitmap() {
  let closed = false
  const bmp = { close: () => { closed = true } }
  ;(globalThis as { createImageBitmap?: unknown }).createImageBitmap = async () => bmp
  return () => closed
}

test('WorkerBackend: ready 를 받으면 만들어지고, 프레임을 transfer 로 보내 결과를 받는다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  expect(backend.kind).toBe('worker')
  const p = backend.analyzePc(VIDEO, 1234)
  await new Promise((r) => setTimeout(r, 0))
  const sent = w.sent[w.sent.length - 1]
  const msg = sent.msg as { t: string; id: number; ts: number }
  expect(msg.t).toBe('pc')
  expect(msg.ts).toBe(1234)
  expect(sent.transfer).toHaveLength(1)
  w.reply({ t: 'pc', id: msg.id, features: FEATURES, ms: 5 })
  expect(await p).toEqual(FEATURES)
})

test('WorkerBackend: 초기화 중 error 를 받으면 Worker 를 끄고 거절한다', async () => {
  const w = new FakeWorker()
  w.onPost = () => queueMicrotask(() => w.reply({ t: 'error', message: 'ModuleFactory not set.' }))
  let message = ''
  await WorkerBackend.create(() => w, 'CPU').catch((e: Error) => { message = e.message })
  expect(message).toBe('ModuleFactory not set.')
  expect(w.terminated).toBe(true)
})

test('WorkerBackend: 초기화가 시간 안에 안 끝나면 거절한다', async () => {
  const w = new FakeWorker()
  let message = ''
  await WorkerBackend.create(() => w, 'CPU', { initTimeoutMs: 20 }).catch((e: Error) => { message = e.message })
  expect(message).toContain('시간 초과')
  expect(w.terminated).toBe(true)
})

test('WorkerBackend: 실행 중 Worker 가 죽으면 기다리던 분석을 거절한다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  const p = backend.analyzePc(VIDEO, 1)
  await new Promise((r) => setTimeout(r, 0))
  w.crash('메모리 부족')
  let message = ''
  await p.catch((e: Error) => { message = e.message })
  expect(message).toContain('메모리 부족')
})

test('WorkerBackend: dispose 하면 Worker 를 끄고 기다리던 분석을 거절하고, 이후 호출도 거절한다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  const p = backend.analyzePc(VIDEO, 1)
  await new Promise((r) => setTimeout(r, 0))
  backend.dispose()
  expect(w.terminated).toBe(true)
  let rejected = 0
  await p.catch(() => { rejected++ })
  await backend.analyzePc(VIDEO, 2).catch(() => { rejected++ })
  expect(rejected).toBe(2)
})

test('WorkerBackend: 재보정(resetPc)을 Worker 에 알린다', async () => {
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  backend.resetPc()
  await tick()
  expect((w.sent[w.sent.length - 1].msg as { t: string }).t).toBe('pc-reset')
})

const tick = () => new Promise((r) => setTimeout(r, 0))
const sentTypes = (w: FakeWorker) => w.sent.map((s) => (s.msg as { t: string }).t)

test('WorkerBackend: Worker 가 응답 없이 멈추면 제한 시간 뒤 치명적 오류로 거절하고 닫는다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU', { analyzeTimeoutMs: 30 })
  let first: unknown = null
  await backend.analyzePc(VIDEO, 1).catch((e: unknown) => { first = e })
  expect(first instanceof BackendFatalError).toBe(true)
  expect((first as Error).message).toContain('응답 없음')
  expect(w.terminated).toBe(true)
  // 닫힌 뒤의 요청은 Worker 에 보내지 않고 바로 거절된다
  const before = w.sent.length
  let second: unknown = null
  await backend.analyzePc(VIDEO, 2).catch((e: unknown) => { second = e })
  expect(second instanceof BackendFatalError).toBe(true)
  expect(w.sent.length).toBe(before)
})

test('WorkerBackend: Worker 가 죽으면(onerror) 닫히고 이후 요청은 Worker 로 보내지 않는다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  w.crash('메모리 부족')
  expect(w.terminated).toBe(true)
  const before = w.sent.length
  let err: unknown = null
  await backend.analyzePc(VIDEO, 1).catch((e: unknown) => { err = e })
  expect(err instanceof BackendFatalError).toBe(true)
  expect(w.sent.length).toBe(before)
})

test('WorkerBackend: 프레임 하나의 오류는 그 요청만 거절하고 백엔드는 계속 쓴다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  const p1 = backend.analyzePc(VIDEO, 1)
  await tick()
  const id1 = (w.sent[w.sent.length - 1].msg as { id: number }).id
  w.reply({ t: 'error', id: id1, message: '이 프레임만 실패' })
  let err: unknown = null
  await p1.catch((e: unknown) => { err = e })
  expect(err instanceof BackendFatalError).toBe(false)
  expect((err as Error).message).toBe('이 프레임만 실패')
  expect(w.terminated).toBe(false)
  const p2 = backend.analyzePc(VIDEO, 2)
  await tick()
  w.reply({ t: 'pc', id: (w.sent[w.sent.length - 1].msg as { id: number }).id, features: FEATURES, ms: 1 })
  expect(await p2).toEqual(FEATURES)
})

test('WorkerBackend: 요청은 한 줄로 처리한다 (앞 분석이 끝나야 다음 프레임을 보내고, 재보정이 앞지르지 않는다)', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  const p1 = backend.analyzePc(VIDEO, 1)
  const p2 = backend.analyzePc(VIDEO, 2)
  backend.resetPc()
  await tick()
  expect(sentTypes(w).slice(1)).toEqual(['pc']) // init 다음 첫 분석만 나갔다
  w.reply({ t: 'pc', id: (w.sent[w.sent.length - 1].msg as { id: number }).id, features: FEATURES, ms: 1 })
  await p1
  await tick()
  expect(sentTypes(w).slice(1)).toEqual(['pc', 'pc'])
  w.reply({ t: 'pc', id: (w.sent[w.sent.length - 1].msg as { id: number }).id, features: FEATURES, ms: 1 })
  await p2
  await tick()
  expect(sentTypes(w).slice(1)).toEqual(['pc', 'pc', 'pc-reset'])
})

test('WorkerBackend: Worker 에 보내지 못하면 비트맵을 닫고 치명적 오류로 거절한다', async () => {
  const isClosed = stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  w.onPost = () => { throw new Error('DataCloneError') }
  let err: unknown = null
  await backend.analyzePc(VIDEO, 1).catch((e: unknown) => { err = e })
  expect(err instanceof BackendFatalError).toBe(true)
  expect(isClosed()).toBe(true)
  expect(w.terminated).toBe(true)
})

// ── FallbackBackend ───────────────────────────────────────────
function fakeBackend(kind: 'worker' | 'main', fail: boolean): VisionBackend & { calls: number; disposed: boolean } {
  return {
    kind,
    calls: 0,
    disposed: false,
    async analyzePc() {
      this.calls++
      if (fail) throw new BackendFatalError(`${kind} 실패`)
      return { faceCount: kind === 'worker' ? 1 : 2, shoulders: null }
    },
    resetPc() {},
    async analyzeEnv() {
      this.calls++
      if (fail) throw new BackendFatalError(`${kind} 실패`)
      return { faceCount: kind === 'worker' ? 1 : 2, shouldersVisible: false, handCount: 0 }
    },
    resetEnv() {},
    dispose() {
      this.disposed = true
    },
  }
}

test('FallbackBackend: 기본 백엔드가 실패하면 같은 프레임을 대체 백엔드로 다시 분석하고 알린다', async () => {
  const primary = fakeBackend('worker', true)
  const fallback = fakeBackend('main', false)
  const reasons: unknown[] = []
  const backend = new FallbackBackend(primary, () => fallback, (r) => reasons.push(r))
  expect((await backend.analyzePc(VIDEO, 0)).faceCount).toBe(2)
  expect(backend.kind).toBe('main')
  expect(primary.disposed).toBe(true)
  expect(reasons).toHaveLength(1)
  await backend.analyzePc(VIDEO, 1)
  expect(reasons).toHaveLength(1) // 한 번만 알린다
  expect(primary.calls).toBe(1)
})

test('FallbackBackend: 프레임 하나의 일시적 오류에는 갈아타지 않고 오류를 그대로 던진다', async () => {
  const primary = fakeBackend('worker', false)
  primary.analyzePc = async () => { throw new Error('이 프레임만 실패') }
  let switched = 0
  const backend = new FallbackBackend(primary, () => fakeBackend('main', false), () => switched++)
  let message = ''
  await backend.analyzePc(VIDEO, 0).catch((e: Error) => { message = e.message })
  expect(message).toBe('이 프레임만 실패')
  expect(switched).toBe(0)
  expect(backend.kind).toBe('worker')
})

test('FallbackBackend: 대체 백엔드까지 실패하면 그 오류를 던진다', async () => {
  const backend = new FallbackBackend(fakeBackend('worker', true), () => fakeBackend('main', true), () => {})
  let message = ''
  await backend.analyzePc(VIDEO, 0).catch((e: Error) => { message = e.message })
  expect(message).toBe('main 실패')
})

// ── 팩토리 ────────────────────────────────────────────────────
const base = { loadMainModels: async () => mainModels([]), delegate: 'CPU' as const, onFallback: () => {} }

test('createPcBackend: 켜져 있고 Worker 가 되면 Worker 를 쓴다', async () => {
  const backend = await createPcBackend({ ...base, enabled: true, force: null, makeWorker: () => readyWorker() })
  expect(backend.kind).toBe('worker')
})

test('createPcBackend: 꺼져 있으면 Worker 를 만들지 않고 메인을 쓴다', async () => {
  let made = 0
  const backend = await createPcBackend({ ...base, enabled: false, force: null, makeWorker: () => (made++, readyWorker()) })
  expect(backend.kind).toBe('main')
  expect(made).toBe(0)
})

test('createPcBackend: 주소로 main 을 고정하면 켜져 있어도 메인을 쓴다', async () => {
  const backend = await createPcBackend({ ...base, enabled: true, force: 'main', makeWorker: () => readyWorker() })
  expect(backend instanceof MainBackend).toBe(true)
})

test('createPcBackend: Worker 초기화가 실패하면 알리고 메인으로 넘어간다', async () => {
  const reasons: unknown[] = []
  const bad = () => {
    const w = new FakeWorker()
    w.onPost = () => queueMicrotask(() => w.reply({ t: 'error', message: '로더 실패' }))
    return w
  }
  const backend = await createPcBackend({ ...base, enabled: true, force: null, makeWorker: bad, onFallback: (r) => reasons.push(r) })
  expect(backend.kind).toBe('main')
  expect(reasons).toHaveLength(1)
})

test('createPcBackend: worker 로 고정하면 성공한 Worker 를 대체 없이 그대로 쓴다 (시험용)', async () => {
  const ok = await createPcBackend({ ...base, enabled: true, force: 'worker', makeWorker: () => readyWorker() })
  expect(ok.kind).toBe('worker')
  expect(ok instanceof FallbackBackend).toBe(false)
})

test('createPcBackend: worker 로 고정했는데 초기화가 실패하면 메인으로 숨기지 않고 오류를 던진다 (시험용)', async () => {
  const bad = () => {
    const w = new FakeWorker()
    w.onPost = () => queueMicrotask(() => w.reply({ t: 'error', message: '로더 실패' }))
    return w
  }
  let message = ''
  await createPcBackend({ ...base, enabled: true, force: 'worker', makeWorker: bad }).catch((e: Error) => { message = e.message })
  expect(message).toBe('로더 실패')
})

// ── 환경 점검(2단계) ───────────────────────────────────────────
function envModels(log: string[]) {
  const face = {
    detectForVideo: () => (log.push('face'), {
      faceLandmarks: [[{ x: 0.2, y: 0.3, z: 0 }, { x: 0.6, y: 0.8, z: 0 }]],
      faceBlendshapes: [],
      facialTransformationMatrixes: [],
    }) as never,
  }
  const pose = { detectForVideo: () => (log.push('pose'), { landmarks: [], worldLandmarks: [], segmentationMasks: [], close() {} }) as never }
  const hand = { detectForVideo: () => (log.push('hand'), { landmarks: [[{ x: 0, y: 0, z: 0 }], [{ x: 1, y: 1, z: 0 }]] }) as never }
  return { face, pose, hand }
}

test('EnvStepper: 단계에 필요한 모델만 돌린다', () => {
  const log: string[] = []
  const stepper = new EnvStepper(envModels(log))
  stepper.step(VIDEO, 0, { face: true })
  expect(log).toEqual(['face'])
  stepper.step(VIDEO, 1, { hand: true })
  expect(log).toEqual(['face', 'hand'])
})

test('EnvStepper: 포즈는 두 번에 한 번만 돌리고 reset 하면 처음부터 다시 센다', () => {
  const log: string[] = []
  const stepper = new EnvStepper(envModels(log))
  for (let i = 0; i < 4; i++) stepper.step(VIDEO, i, { pose: true })
  expect(log).toEqual(['pose', 'pose']) // 0번째, 2번째
  stepper.reset()
  stepper.step(VIDEO, 9, { pose: true })
  expect(log).toEqual(['pose', 'pose', 'pose'])
})

test('EnvStepper: 얼굴 상자와 손 수를 요약해 돌려준다', () => {
  const stepper = new EnvStepper(envModels([]))
  const f = stepper.step(VIDEO, 0, { face: true, hand: true })
  expect(f.faceCount).toBe(1)
  expect(f.handCount).toBe(2)
  expect(f.box).toEqual({ x: 0.2, y: 0.3, w: 0.6 - 0.2, h: 0.8 - 0.3 })
  expect(f.shouldersVisible).toBe(false)
})

test('EnvStepper: 손이 필요한데 손 모델이 없으면 오류', () => {
  const { face, pose } = envModels([])
  const stepper = new EnvStepper({ face, pose })
  let message = ''
  try { stepper.step(VIDEO, 0, { hand: true }) } catch (e) { message = (e as Error).message }
  expect(message).toContain('손 모델')
})

test('MainBackend: 모델은 처음 분석할 때 불러오고, 불러오기에 실패하면 다음에 다시 시도한다', async () => {
  let loads = 0
  let fail = true
  const backend = new MainBackend(async () => {
    loads++
    if (fail) throw new Error('다운로드 실패')
    return mainModels([])
  })
  expect(loads).toBe(0) // 만들 때는 불러오지 않는다
  await backend.analyzePc(VIDEO, 0).catch(() => {})
  expect(loads).toBe(1)
  fail = false
  expect((await backend.analyzeEnv(VIDEO, 1, { face: true })).faceCount).toBe(1)
  expect(loads).toBe(2)
  await backend.analyzePc(VIDEO, 2)
  expect(loads).toBe(2) // 한 번 성공하면 다시 불러오지 않는다
})

test('createPcBackend: Worker 가 잘 돌면 메인 모델을 불러오지 않는다', async () => {
  let loads = 0
  const backend = await createPcBackend({
    ...base,
    loadMainModels: async () => (loads++, mainModels([])),
    enabled: true,
    force: null,
    makeWorker: () => readyWorker(),
  })
  expect(backend.kind).toBe('worker')
  expect(loads).toBe(0)
})

test('WorkerBackend: 환경 점검 분석은 단계 정보(needs)와 함께 보내고 요약값을 받는다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  const p = backend.analyzeEnv(VIDEO, 77, { face: true, hand: true })
  await tick()
  const msg = w.sent[w.sent.length - 1].msg as { t: string; id: number; ts: number; needs: unknown }
  expect(msg.t).toBe('env')
  expect(msg.ts).toBe(77)
  expect(msg.needs).toEqual({ face: true, hand: true })
  const frame = { faceCount: 1, shouldersVisible: true, handCount: 2 }
  w.reply({ t: 'env', id: msg.id, frame, ms: 3 })
  expect(await p).toEqual(frame)
})

test('WorkerBackend: resetEnv 는 분석 사이 순서를 지켜 Worker 에 알린다', async () => {
  stubBitmap()
  const w = readyWorker()
  const backend = await WorkerBackend.create(() => w, 'CPU')
  const p = backend.analyzeEnv(VIDEO, 1, { face: true })
  backend.resetEnv()
  await tick()
  expect(sentTypes(w).slice(1)).toEqual(['env'])
  w.reply({ t: 'env', id: (w.sent[w.sent.length - 1].msg as { id: number }).id, frame: { faceCount: 0, shouldersVisible: false, handCount: 0 }, ms: 1 })
  await p
  await tick()
  expect(sentTypes(w).slice(1)).toEqual(['env', 'env-reset'])
})

test('FallbackBackend: 환경 점검 분석도 치명적 오류면 대체 백엔드로 갈아탄다', async () => {
  const fallback = fakeBackend('main', false)
  const backend = new FallbackBackend(fakeBackend('worker', true), () => fallback, () => {})
  expect((await backend.analyzeEnv(VIDEO, 0, { face: true })).faceCount).toBe(2)
  expect(backend.kind).toBe('main')
})
