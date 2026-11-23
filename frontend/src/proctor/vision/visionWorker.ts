// 분석 Worker. 얼굴·포즈 모델을 여기서 돌리고, 규칙 엔진·환경 점검이 쓰는 작은 요약값만 메인으로 돌려준다.
// 손 모델은 환경 점검의 손목 단계에서 처음 필요할 때 불러온다.
import { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Delegate } from './delegate.ts'
import { EnvStepper, type EnvModels } from './envStepper.ts'
import { faceLandmarkerOptions, handLandmarkerOptions, poseLandmarkerOptions } from './modelOptions.ts'
import { PcStepper } from './pcStepper.ts'
import { moduleFileset } from './visionAssets.ts'
import type { FromWorker, ToWorker } from './workerProtocol.ts'

const post = (m: FromWorker) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m)
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

let delegate: Delegate = 'CPU'
let pcStepper: PcStepper | null = null
let envStepper: EnvStepper | null = null
let face: FaceLandmarker | null = null
let pose: PoseLandmarker | null = null
let hand: HandLandmarker | null = null
/** EnvStepper 가 읽는 모델 묶음. 손 모델이 늦게 생기면 여기에 채운다 */
const envModels: EnvModels = { face: { detectForVideo: () => { throw new Error('얼굴 모델이 준비되지 않았습니다') } }, pose: { detectForVideo: () => { throw new Error('포즈 모델이 준비되지 않았습니다') } } }

async function init(d: Delegate) {
  const started = performance.now()
  delegate = d
  face = await FaceLandmarker.createFromOptions(moduleFileset('face'), faceLandmarkerOptions(d))
  pose = await PoseLandmarker.createFromOptions(moduleFileset('pose'), poseLandmarkerOptions(d))
  envModels.face = face
  envModels.pose = pose
  pcStepper = new PcStepper({ face, pose })
  envStepper = new EnvStepper(envModels)
  post({ t: 'ready', delegate: d, loadMs: performance.now() - started })
}

/** 손 모델은 처음 필요할 때 한 번만 만든다 (요청은 메인이 한 줄로 보내므로 겹치지 않는다) */
async function ensureHand() {
  if (hand) return
  hand = await HandLandmarker.createFromOptions(moduleFileset('hand'), handLandmarkerOptions(delegate))
  envModels.hand = hand
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data
  if (m.t === 'init') {
    try {
      await init(m.delegate)
    } catch (err) {
      face?.close()
      pose?.close()
      face = null
      pose = null
      post({ t: 'error', message: messageOf(err) })
    }
  } else if (m.t === 'pc-reset') {
    pcStepper?.reset()
  } else if (m.t === 'env-reset') {
    envStepper?.reset()
  } else if (m.t === 'pc') {
    try {
      if (!pcStepper) throw new Error('Worker 모델이 아직 준비되지 않았습니다')
      const started = performance.now()
      const features = pcStepper.step(m.bitmap, m.ts)
      post({ t: 'pc', id: m.id, features, ms: performance.now() - started })
    } catch (err) {
      post({ t: 'error', id: m.id, message: messageOf(err) })
    } finally {
      m.bitmap.close()
    }
  } else if (m.t === 'env') {
    try {
      if (!envStepper) throw new Error('Worker 모델이 아직 준비되지 않았습니다')
      if (m.needs.hand) await ensureHand()
      const started = performance.now()
      const frame = envStepper.step(m.bitmap, m.ts, m.needs)
      post({ t: 'env', id: m.id, frame, ms: performance.now() - started })
    } catch (err) {
      post({ t: 'error', id: m.id, message: messageOf(err) })
    } finally {
      m.bitmap.close()
    }
  }
}
