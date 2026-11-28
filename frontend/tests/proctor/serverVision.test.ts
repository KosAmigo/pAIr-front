import { describe, expect, it } from './expect.ts'
import { serverVisionActive } from '../../src/proctor/features.ts'
import { CONSENT_VERSION, CONSENT_VERSION_LEGACY, cameraConsent } from '../../src/proctor/consentText.ts'
import {
  DEFAULT_RATE,
  FRAME_HEADER_BYTES,
  backoffMs,
  checkItemsFrom,
  checkPassed,
  closeAction,
  hintTexts,
  intervalMsOf,
  linkVerdict,
  normalizeRate,
  p95,
  packFrame,
  parseVisionMsg,
} from '../../src/proctor/core/visionContract.ts'
import { retentionNotice } from '../../src/pages/console/evidenceView.ts'

describe('serverVisionActive (스위치 둘 다 켜져야 서버 모드)', () => {
  it('빌드 스위치가 꺼져 있으면 회차 플래그가 켜져도 옛 동작', () => {
    expect(serverVisionActive({ serverVision: true }, false)).toBe(false)
  })
  it('회차 플래그가 없거나 꺼져 있으면 옛 동작 (옛 백엔드 호환)', () => {
    expect(serverVisionActive({}, true)).toBe(false)
    expect(serverVisionActive({ serverVision: false }, true)).toBe(false)
    expect(serverVisionActive(null, true)).toBe(false)
  })
  it('둘 다 켜지면 서버 모드', () => {
    expect(serverVisionActive({ serverVision: true }, true)).toBe(true)
  })
})

describe('동의 문구', () => {
  it('서버 모드는 v3, 아니면 기존 v2 문구', () => {
    expect(CONSENT_VERSION).toBe('v3')
    expect(cameraConsent(true).version).toBe('v3')
    expect(cameraConsent(false).version).toBe(CONSENT_VERSION_LEGACY)
    expect(cameraConsent(false).body).toContain('이 브라우저 안에서만 분석')
  })
  it('v3 문구는 설계 §13 의 핵심 내용을 담는다', () => {
    const b = cameraConsent(true).body
    for (const k of ['대한민국 밖', 'RunPod', '초당 1장', '시험 종료 3일 뒤', '삭제 1일 전부터', '3일씩 최대 2번', '최대 9일', '사진으로 검토', '표시되지 않으며', '사진을 직접 확인', '감독 중단']) expect(b).toContain(k)
    // 서버 모드에서 거짓이 되는 옛 문장이 남으면 안 된다
    expect(b.includes('이 브라우저 안에서만')).toBe(false)
    expect(b.includes('7일')).toBe(false)
  })
})

describe('parseVisionMsg (모르는 메시지·깨진 메시지는 버린다)', () => {
  it('ready·status·peer·pong 을 읽는다', () => {
    expect(parseVisionMsg('{"type":"ready","mode":"exam","vision":"up","rate":{"fps":1,"maxEdge":400,"quality":0.55}}')).toEqual({
      type: 'ready',
      mode: 'exam',
      vision: 'up',
      rate: { fps: 1, maxEdge: 400, quality: 0.55 },
    })
    expect(parseVisionMsg('{"type":"status","vision":"down","phone":"connected"}')).toEqual({ type: 'status', vision: 'down', phone: 'connected' })
    expect(parseVisionMsg('{"type":"peer","phone":"stale"}')).toEqual({ type: 'peer', phone: 'stale' })
    expect(parseVisionMsg('{"type":"pong"}')).toEqual({ type: 'pong' })
  })
  it('check 는 items·hints·holdMs·passed 를 읽고 모르는 항목은 버린다', () => {
    const m = parseVisionMsg('{"type":"check","items":{"keyboard":true,"mouse":false,"x":1},"hints":["KEYBOARD_LEFT",5],"holdMs":1200,"passed":false}')
    expect(m).toEqual({ type: 'check', check: { items: { keyboard: true, mouse: false }, hints: ['KEYBOARD_LEFT'], holdMs: 1200, passed: false } })
  })
  it('error 는 code 를 읽는다', () => {
    expect(parseVisionMsg('{"type":"error","code":"FRAME_TOO_LARGE","message":"큼"}')).toEqual({ type: 'error', code: 'FRAME_TOO_LARGE', message: '큼' })
  })
  it('형식이 틀리거나 모르는 종류면 null', () => {
    expect(parseVisionMsg('not json')).toBeNull()
    expect(parseVisionMsg('{"type":"mystery"}')).toBeNull()
    expect(parseVisionMsg('{"type":"check"}')).toBeNull()
    expect(parseVisionMsg(new ArrayBuffer(4))).toBeNull()
  })
})

describe('닫기 코드별 동작 (계약 §3-1)', () => {
  it('토큰 오류·잘못된 요청·교체는 재연결하지 않는다', () => {
    for (const c of [4400, 4401, 4409]) expect(closeAction(c)).toBe('stop')
  })
  it('4403 은 서버 모드 불가면 PC 분석 경로로, 동의 필요면 동의 화면으로', () => {
    expect(closeAction(4403, 'VISION_DISABLED')).toBe('fallback-legacy')
    expect(closeAction(4403)).toBe('fallback-legacy')
    expect(closeAction(4403, 'CONSENT_REQUIRED')).toBe('consent')
  })
  it('4429 는 5초 뒤, 그 밖(4500·네트워크 끊김)은 지수 재연결', () => {
    expect(closeAction(4429)).toBe('retry-5s')
    expect(closeAction(4500)).toBe('retry-backoff')
    expect(closeAction(1006)).toBe('retry-backoff')
    expect([0, 1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
  })
})

describe('전송 간격·화질 (서버 rate 지시)', () => {
  it('기본은 초당 1장', () => {
    expect(intervalMsOf(DEFAULT_RATE.webcam)).toBe(1000)
  })
  it('범위를 벗어난 지시는 안전한 범위로 맞춘다 (fps 0.5~2)', () => {
    const r = normalizeRate({ fps: 30, quality: 2, maxEdge: 99999 }, DEFAULT_RATE.webcam)
    expect(r.fps).toBe(2)
    expect(r.quality).toBe(0.9)
    expect(r.maxEdge).toBe(1280)
    expect(normalizeRate({ fps: 0.1 }, DEFAULT_RATE.webcam).fps).toBe(0.5)
  })
  it('숫자가 아닌 값은 이전 값을 유지한다', () => {
    expect(normalizeRate({ fps: 'a' }, { fps: 1.5, maxEdge: 400, quality: 0.6 }).fps).toBe(1.5)
  })
})

describe('packFrame (4바이트 번호 머리말)', () => {
  it('번호를 앞에 붙이고 JPEG 는 그대로 둔다', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 2]).buffer
    const out = new Uint8Array(packFrame(258, jpeg))
    expect(out.length).toBe(FRAME_HEADER_BYTES + 4)
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 1, 2])
    expect([out[4], out[5], out[6]]).toEqual([0xff, 0xd8, 0xff])
  })
})

describe('입장 점검 체크리스트', () => {
  const none = { items: {}, hints: [], holdMs: 0, passed: false }
  it('휴대폰이 연결되기 전에는 모두 대기', () => {
    expect(checkItemsFrom(null, false).every((i) => i.status === 'pending')).toBe(true)
  })
  it('항목 id 는 점검 JSON 의 phone_* 이다', () => {
    expect(checkItemsFrom(none, true).map((i) => i.id)).toEqual(['phone_keyboard', 'phone_mouse', 'phone_hand_left', 'phone_hand_right', 'phone_desk'])
  })
  it('판정이 없으면 확인 중, 실패 항목에는 조치 문장', () => {
    const items = checkItemsFrom({ ...none, items: { keyboard: false, leftHand: true } }, true)
    expect(items.find((i) => i.id === 'phone_keyboard')?.status).toBe('fail')
    expect(items.find((i) => i.id === 'phone_keyboard')?.detail).toContain('휴대폰을 키보드가 화면 안에 들어오도록')
    expect(items.find((i) => i.id === 'phone_hand_left')?.status).toBe('pass')
    expect(items.find((i) => i.id === 'phone_mouse')?.status).toBe('running')
  })
  it('위치 힌트 코드는 키보드 조치에 덧붙이고, 모르는 코드는 무시한다', () => {
    const d = checkItemsFrom({ ...none, items: { keyboard: false }, hints: ['KEYBOARD_LEFT', 'SOMETHING_NEW'] }, true)[0].detail
    expect(d).toContain('왼쪽에 치우쳐')
    expect(hintTexts(['SOMETHING_NEW'])).toEqual([])
  })
  it('서버가 passed 로 판정하고 모든 항목이 참이어야 통과 (한 손뿐이면 통과 아님)', () => {
    const all = { keyboard: true, mouse: true, leftHand: true, rightHand: true, desk: true }
    expect(checkPassed({ items: all, hints: [], holdMs: 3200, passed: true })).toBe(true)
    expect(checkPassed({ items: all, hints: [], holdMs: 1000, passed: false })).toBe(false)
    expect(checkPassed({ items: { ...all, rightHand: false }, hints: [], holdMs: 3200, passed: true })).toBe(false)
    expect(checkPassed(null)).toBe(false)
  })
})

describe('업로드 지연 점검', () => {
  it('p95', () => {
    expect(p95([])).toBeNull()
    expect(p95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(100)
  })
  it('빠르면 통과, 느리면 주의, 응답이 없으면 실패', () => {
    expect(linkVerdict({ rttMs: [80, 90, 100], sent: 3, lost: 0 }).status).toBe('pass')
    expect(linkVerdict({ rttMs: [900, 800], sent: 2, lost: 0 }).status).toBe('warn')
    expect(linkVerdict({ rttMs: [], sent: 10, lost: 10 }).status).toBe('fail')
    expect(linkVerdict({ rttMs: [2000], sent: 1, lost: 0 }).status).toBe('fail')
  })
})

describe('콘솔 보관·연장 표시 (서버 응답 값을 쓴다)', () => {
  const DAY = 24 * 3600 * 1000
  const at = (ms: number) => new Date(Date.now() + ms).toISOString()
  const base = { expiresAt: at(12 * 3600 * 1000), extensionsUsed: 0, maxExtensions: 2, extensionDays: 3, canExtend: true }
  it('삭제 예정까지 남은 시간이 연장 가능 시점 안이면 강조한다 (서버 추론 1일, 기존 2일)', () => {
    expect(retentionNotice(base, Date.now(), 1).tone).toBe('caution')
    const far = { ...base, expiresAt: at(1.5 * DAY) }
    expect(retentionNotice(far, Date.now(), 1).tone).toBe('neutral')
    expect(retentionNotice(far, Date.now(), 2).tone).toBe('caution')
  })
  it('연장 버튼이 꺼진 이유 문장에 응답의 일수·횟수를 쓴다', () => {
    expect(retentionNotice({ ...base, canExtend: false }, Date.now(), 1).extendHint).toContain('1일 전부터')
    expect(retentionNotice({ ...base, canExtend: false, extensionsUsed: 2 }, Date.now(), 1).extendHint).toContain('최대 2번')
  })
})
