// 휴대폰 분석 Worker. 웹캠 분석 Worker(visionWorker.ts)와 별개라서 한쪽 지연·실패가 다른 쪽에 번지지 않는다.
// 휴대폰이 보낸 JPEG 를 여기서 디코딩(createImageBitmap)해 손·물체를 분석하고, 작은 요약값만 메인으로 돌려준다.
import { HandLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import type { Delegate } from './delegate.ts'
import { handLandmarkerOptions, objectDetectorOptions } from './modelOptions.ts'
import type { PhoneFromWorker, PhoneToWorker } from './phoneBackend.ts'
import { PhoneStepper, makeLumaReader } from './phoneStepper.ts'
import { moduleFileset } from './visionAssets.ts'

const post = (m: PhoneFromWorker) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m)
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

let hand: HandLandmarker | null = null
let object: ObjectDetector | null = null
let stepper: PhoneStepper | null = null

async function init(delegate: Delegate) {
  const started = performance.now()
  // 한 Worker 에서 모델 둘을 만들 때는 모델마다 다른 instance 이름이 필요하다 (visionAssets.ts)
  hand = await HandLandmarker.createFromOptions(moduleFileset('phone-hand'), handLandmarkerOptions(delegate))
  object = await ObjectDetector.createFromOptions(moduleFileset('phone-object'), objectDetectorOptions(delegate))
  stepper = new PhoneStepper({ hand, object }, makeLumaReader())
  post({ t: 'ready', delegate, loadMs: performance.now() - started })
}

self.onmessage = async (e: MessageEvent<PhoneToWorker>) => {
  const m = e.data
  if (m.t === 'init') {
    try {
      await init(m.delegate)
    } catch (err) {
      hand?.close()
      object?.close()
      hand = null
      object = null
      post({ t: 'error', message: messageOf(err) })
    }
    return
  }
  try {
    if (!stepper) throw new Error('휴대폰 분석 모델이 아직 준비되지 않았습니다')
    const bitmap = await createImageBitmap(new Blob([m.jpeg], { type: 'image/jpeg' }))
    try {
      const started = performance.now()
      const features = stepper.step(bitmap, m.ts)
      post({ t: 'frame', id: m.id, features, ms: performance.now() - started })
    } finally {
      bitmap.close()
    }
  } catch (err) {
    post({ t: 'error', id: m.id, message: messageOf(err) })
  }
}
