// 화면 공유 이벤트의 서버 계약 (한곳에 모음).
// 2026-11-21 확인: 백엔드 proctor-events 는 source 가 BROWSER/PC_CAM/PHONE_CAM 뿐이고, 화면 공유 유형·SCREEN 출처가 없다.
// 백엔드가 SCREEN 출처와 아래 유형을 받게 되면 SCREEN_EVENTS_ACCEPTED 만 true 로 바꾸면 전송이 켜진다.
import type { CamViolation } from '../core/events.ts'

export const SCREEN_EVENTS_ACCEPTED = false

export type ScreenEventType = 'SCREEN_STOPPED' | 'SCREEN_PARTIAL'

const MESSAGES: Record<ScreenEventType, string> = {
  SCREEN_STOPPED: 'PC 화면 공유가 중단되었습니다',
  SCREEN_PARTIAL: '전체 화면이 아닌 창·탭만 공유했습니다',
}

/** 화면 공유 이벤트. 사진(흐림)은 이벤트 순간 화면이 있을 때만 붙는다. occurredAt: 서버 기준 epoch ms */
export function toScreenViolation(type: ScreenEventType, occurredAt: number, blurredSnapshot?: string): CamViolation {
  return {
    id: `SCREEN-${occurredAt}-${type}`,
    kind: type.toLowerCase(),
    type,
    source: 'SCREEN',
    message: MESSAGES[type],
    startedAt: occurredAt,
    ts: occurredAt,
    durationMs: 0,
    snapshot: blurredSnapshot,
  }
}
