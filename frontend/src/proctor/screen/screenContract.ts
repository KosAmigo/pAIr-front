// 화면 공유 이벤트의 서버 계약 (한곳에 모음).
// 백엔드가 SCREEN 출처와 아래 세 유형(V25)을 받는다. 종류와 시각만 보내고 사진은 붙이지 않는다.
import type { CamViolation } from '../core/events.ts'

export type ScreenEventType = 'SCREEN_STOPPED' | 'SCREEN_PARTIAL' | 'SCREEN_RESTARTED'

const MESSAGES: Record<ScreenEventType, string> = {
  SCREEN_STOPPED: 'PC 화면 공유가 중단되었습니다',
  SCREEN_PARTIAL: '전체 화면이 아닌 창·탭만 공유했습니다',
  SCREEN_RESTARTED: 'PC 화면 공유를 다시 시작했습니다',
}

/** 화면 공유 이벤트. 사진은 붙이지 않는다. occurredAt: 서버 기준 epoch ms */
export function toScreenViolation(type: ScreenEventType, occurredAt: number): CamViolation {
  return {
    id: `SCREEN-${occurredAt}-${type}`,
    kind: type.toLowerCase(),
    type,
    source: 'SCREEN',
    message: MESSAGES[type],
    startedAt: occurredAt,
    ts: occurredAt,
    durationMs: 0,
  }
}
