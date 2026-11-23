// 휴대폰 프레임 한 장 분석: 손 모델 + 물체 감지(+ 켜진 화면 판별용 밝기). 메인 스레드와 휴대폰 Worker 가 같이 쓴다.
// 휴대폰은 변화가 있을 때만 프레임을 보내 프레임이 드물므로 물체 감지도 프레임마다 돈다(프레임 수 자체가 초당 몇 장 이하).
import type { HandLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import type { PhoneFeatures } from '../core/phoneRules.ts'
import { detectedObjects, phoneFeatures } from './features.ts'

export const LUMA_W = 64
export const LUMA_H = 48

export type PhoneModels = {
  hand: Pick<HandLandmarker, 'detectForVideo'>
  object: Pick<ObjectDetector, 'detectForVideo'>
}

/** 디코딩된 프레임 → 64×48 밝기(R 자리에 넣은 RGBA 배열). 캔버스가 있는 쪽(메인·Worker)이 만들어 넘긴다 */
export type LumaReader = (image: ImageBitmap) => Uint8ClampedArray

export class PhoneStepper {
  private readonly models: PhoneModels
  private readonly readLuma: LumaReader

  constructor(models: PhoneModels, readLuma: LumaReader) {
    this.models = models
    this.readLuma = readLuma
  }

  step(image: ImageBitmap, ts: number): PhoneFeatures {
    const hands = this.models.hand.detectForVideo(image, ts)
    const objects = this.models.object.detectForVideo(image, ts)
    const data = this.readLuma(image)
    return phoneFeatures(hands, detectedObjects(objects, image.width, image.height, { data, w: LUMA_W, h: LUMA_H }))
  }
}

/** 64×48 캔버스(OffscreenCanvas 가 있으면 그것, 없으면 DOM)로 밝기를 읽는 함수. 캔버스는 한 번만 만든다 */
export function makeLumaReader(): LumaReader {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(LUMA_W, LUMA_H) : Object.assign(document.createElement('canvas'), { width: LUMA_W, height: LUMA_H })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  return (image) => {
    if (!ctx) return new Uint8ClampedArray(LUMA_W * LUMA_H * 4)
    ctx.drawImage(image, 0, 0, LUMA_W, LUMA_H)
    const img = ctx.getImageData(0, 0, LUMA_W, LUMA_H)
    for (let i = 0; i < img.data.length; i += 4) img.data[i] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
    return img.data
  }
}
