// 규칙 엔진 경고 → 서버로 보내는 감독 이벤트.
// cam-proctor 규칙 이름(kind)을 백엔드 이벤트 유형(type)으로 바꾸는 표가 여기 하나에만 있다.
import type { Fired } from './RuleEngine.ts'

/** 백엔드 proctor_events.type (명세 §1-7) */
export type ProctorEventType =
  | 'NO_FACE' | 'MULTI_FACE' | 'HEAD_TURN' | 'HEAD_DOWN' | 'GAZE_AWAY' | 'TORSO_SHIFT' | 'TORSO_TURN'
  | 'HAND_MISSING' | 'HAND_MOVED' | 'ARM_MOVE' | 'PHONE' | 'EXTRA_SCREEN' | 'BOOK' | 'PHONE_DISCONNECTED'

export type CamSource = 'PC_CAM' | 'PHONE_CAM'

const KIND_TO_TYPE: Record<string, ProctorEventType> = {
  no_face: 'NO_FACE',
  multi_face: 'MULTI_FACE',
  head_turn: 'HEAD_TURN',
  head_down: 'HEAD_DOWN',
  gaze_away: 'GAZE_AWAY',
  torso_shift: 'TORSO_SHIFT',
  torso_turn: 'TORSO_TURN',
  hand_missing: 'HAND_MISSING',
  hand_moved: 'HAND_MOVED',
  arm_move: 'ARM_MOVE',
  phone_detected: 'PHONE',
  extra_screen: 'EXTRA_SCREEN',
  book_detected: 'BOOK',
  // 폰에서 감독 화면을 벗어남·연결 끊김·응답 없음은 모두 "휴대폰 캠 끊김"으로 본다
  phone_hidden: 'PHONE_DISCONNECTED',
  phone_disconnected: 'PHONE_DISCONNECTED',
  phone_stale: 'PHONE_DISCONNECTED',
}

export function eventTypeOf(kind: string): ProctorEventType | null {
  return KIND_TO_TYPE[kind] ?? null
}

/** 화면 표시와 전송에 쓰는 카메라 경고 1건. 시각은 epoch ms */
export interface CamViolation {
  id: string
  kind: string
  type: ProctorEventType
  source: CamSource
  message: string
  startedAt: number
  ts: number
  durationMs: number
  detail?: Record<string, number | string | boolean>
  /** JPEG data URL (전송 뒤에는 지워도 된다) */
  snapshot?: string
}

let seq = 0

/**
 * 규칙 엔진 경고를 전송용 이벤트로. 규칙 엔진은 performance.now() 기준이라 epoch ms 로 바꾼다.
 * 서버 시각 보정(offsetMs)을 더해서, 응시자 PC 시계가 틀려도 서버 기준 시각으로 보낸다.
 */
export function toCamViolation(
  f: Fired,
  source: CamSource,
  snapshot: string | undefined,
  detail?: CamViolation['detail'],
  serverOffsetMs = 0,
): CamViolation | null {
  const type = eventTypeOf(f.kind)
  if (!type) return null
  const offset = Date.now() - performance.now() + serverOffsetMs
  const ts = Math.round(f.ts + offset)
  return {
    id: `${source}-${ts}-${seq++}`,
    kind: f.kind,
    type,
    source,
    message: f.message,
    startedAt: Math.round(f.startedAt + offset),
    ts,
    durationMs: Math.round(f.durationMs),
    detail,
    snapshot,
  }
}

/** 영상 스트리밍을 했다면 썼을 양 (720p 기준 1.5Mbps 가정, 백엔드 결과 지표와 같은 값) */
export const VIDEO_BYTES_PER_SEC = (1.5 * 1_000_000) / 8

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
