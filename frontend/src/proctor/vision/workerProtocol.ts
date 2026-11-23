// 메인 ↔ 분석 Worker 메시지. 요청은 한 번에 하나만 보내고 id 로 짝을 맞춘다.
import type { PcFeatures } from '../core/pcRules.ts'
import type { Delegate } from './delegate.ts'
import type { EnvFrameInfo, EnvNeeds } from './envStepper.ts'

export type ToWorker =
  | { t: 'init'; delegate: Delegate }
  | { t: 'pc'; id: number; ts: number; bitmap: ImageBitmap }
  | { t: 'pc-reset' }
  | { t: 'env'; id: number; ts: number; bitmap: ImageBitmap; needs: EnvNeeds }
  | { t: 'env-reset' }

export type FromWorker =
  | { t: 'ready'; delegate: Delegate; loadMs: number }
  | { t: 'pc'; id: number; features: PcFeatures; ms: number }
  | { t: 'env'; id: number; frame: EnvFrameInfo; ms: number }
  | { t: 'error'; id?: number; message: string }
