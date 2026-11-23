// 휴대폰 송신 화질 모드 (PC → 서버 → 휴대폰). 서버가 짝에 현재 모드를 저장하고, 휴대폰이 (재)연결하면 phone-joined 직후 다시 보내 준다.
// 휴대폰은 서버가 보낸 값으로만 화질을 바꾼다(기본 watch). PC 는 책상 스캔 동안만 scan 을 요청한다.
import type { SendMode } from '../relay/phoneSenderCore.ts'

export type QualityMsg = { type: 'quality'; mode: SendMode }

/** 알 수 없는 값은 무시한다 (서버·휴대폰이 보낸 메시지는 믿지 않는다) */
export function parseQualityMode(v: unknown): SendMode | null {
  return v === 'scan' || v === 'watch' ? v : null
}

/** PC 가 마지막으로 요청한 모드를 기억해, 바뀔 때만 메시지를 만든다 */
export class PhoneQualityController {
  mode: SendMode = 'watch'

  /** 모드를 바꾼다. 바뀌었을 때만 보낼 메시지를 돌려준다 (서버 기본값이 watch 라 처음 watch 는 보낼 필요가 없다) */
  set(mode: SendMode): QualityMsg | null {
    if (mode === this.mode) return null
    this.mode = mode
    return { type: 'quality', mode }
  }

  /** PC 의 릴레이 연결이 (다시) 맺어진 뒤 현재 모드를 알린다. 서버는 짝에 이전 모드를 들고 있을 수 있어 watch 도 알려야 어긋나지 않는다 */
  resend(): QualityMsg {
    return { type: 'quality', mode: this.mode }
  }

  reset(): void {
    this.mode = 'watch'
  }
}
