// 프론트 ↔ 백엔드 경계: 이벤트 유형 변환, 아웃박스 재전송 규칙, 실전 맥락, 서버 시각 보정
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { CamOutbox, toRequest } from '../../src/proctor/api/camOutbox.ts'
import { ProctorApiError, serverOffsetFrom, type ProctorEventRequest } from '../../src/proctor/api/proctorApi.ts'
import { eventTypeOf, toCamViolation, type CamViolation } from '../../src/proctor/core/events.ts'
import { PC_RULES } from '../../src/proctor/core/pcRules.ts'
import { PHONE_RULES } from '../../src/proctor/core/phoneRules.ts'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

const violation = (over: Partial<CamViolation> = {}): CamViolation => ({
  id: 'v1',
  kind: 'no_face',
  type: 'NO_FACE',
  source: 'PC_CAM',
  message: '얼굴이 화면에 보이지 않습니다',
  startedAt: Date.parse('2026-12-01T06:12:03.120Z'),
  ts: Date.parse('2026-12-01T06:12:05.220Z'),
  durationMs: 2100,
  detail: { faceCount: 0 },
  snapshot: 'data:image/jpeg;base64,/9j/',
  ...over,
})

describe('이벤트 유형 변환', () => {
  it('PC·휴대폰 규칙은 모두 백엔드 유형으로 바뀐다 (빠진 규칙이 있으면 이벤트가 버려진다)', () => {
    for (const r of [...PC_RULES, ...PHONE_RULES]) assert.notEqual(eventTypeOf(r.kind), null, `${r.kind} 매핑 없음`)
  })

  it('휴대폰 화면 이탈·끊김·응답 없음은 PHONE_DISCONNECTED', () => {
    for (const k of ['phone_hidden', 'phone_disconnected', 'phone_stale']) assert.equal(eventTypeOf(k), 'PHONE_DISCONNECTED')
  })

  it('모르는 규칙은 null 이라 보내지 않는다', () => {
    assert.equal(eventTypeOf('unknown_rule'), null)
    assert.equal(toCamViolation({ kind: 'unknown_rule', message: '', startedAt: 0, ts: 0, durationMs: 0 }, 'PC_CAM', undefined), null)
  })

  it('서버 시각 보정을 이벤트 시각에 더한다', () => {
    const fired = { kind: 'no_face', message: 'x', startedAt: performance.now(), ts: performance.now(), durationMs: 2000 }
    const plain = toCamViolation(fired, 'PC_CAM', undefined)!
    const shifted = toCamViolation(fired, 'PC_CAM', undefined, undefined, 60_000)!
    assert.ok(Math.abs(shifted.startedAt - plain.startedAt - 60_000) < 50)
  })

  it('전송 형식: 시각은 ISO 문자열, 출처·사진 유지', () => {
    const r = toRequest(violation())
    assert.equal(r.startedAt, '2026-12-01T06:12:03.120Z')
    assert.equal(r.source, 'PC_CAM')
    assert.equal(r.type, 'NO_FACE')
    assert.ok(r.snapshot?.startsWith('data:image/jpeg'))
  })

  it('이벤트마다 고유값(clientId)을 붙이고, 같은 이벤트를 다시 보내도 값이 같다 (서버 중복 방지)', async () => {
    assert.notEqual(toRequest(violation()).clientId, toRequest(violation()).clientId)

    const seen: Array<string | undefined> = []
    let fail = true
    const send = async (_i: string, e: ProctorEventRequest) => {
      seen.push(e.clientId)
      if (fail) throw new ProctorApiError('down', 0)
    }
    const box = new CamOutbox('inv', send, new MemoryStorage())
    await box.enqueue(violation())
    fail = false
    await box.flush()
    assert.equal(seen.length, 2)
    assert.ok(seen[0])
    assert.equal(seen[0], seen[1])
  })
})

describe('카메라 이벤트 아웃박스', () => {
  let storage: MemoryStorage
  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('보내면 비우고, 보낸 바이트를 센다', async () => {
    const sent: ProctorEventRequest[] = []
    const box = new CamOutbox('inv', async (_i, e) => sent.push(e), storage)
    await box.enqueue(violation())
    assert.equal(sent.length, 1)
    assert.equal(box.pending, 0)
    assert.ok(box.bytesSent > 0)
    assert.equal(storage.getItem('pair:cam-outbox:inv'), null)
  })

  it('네트워크 오류·5xx 는 남겨 뒀다가 다음에 다시 보낸다 (새로 고쳐도 남는다)', async () => {
    let fail = true
    const sent: ProctorEventRequest[] = []
    const send = async (_i: string, e: ProctorEventRequest) => {
      if (fail) throw new ProctorApiError('down', 0)
      sent.push(e)
    }
    const box = new CamOutbox('inv', send, storage)
    await box.enqueue(violation({ id: 'a' }))
    await box.enqueue(violation({ id: 'b' }))
    assert.equal(box.pending, 2)

    fail = false
    const reloaded = new CamOutbox('inv', send, storage)
    assert.equal(reloaded.pending, 2)
    await reloaded.flush()
    assert.equal(sent.length, 2)
    assert.equal(reloaded.pending, 0)
  })

  it('4xx(시험 시간 밖 등)는 다시 보내도 같으므로 버리고 다음 이벤트로 넘어간다', async () => {
    const sent: string[] = []
    let first = true
    const send = async (_i: string, e: ProctorEventRequest) => {
      if (first) {
        first = false
        throw new ProctorApiError('이벤트 시각이 시험 시간 밖입니다.', 400)
      }
      sent.push(e.type)
    }
    const box = new CamOutbox('inv', send, storage)
    await box.enqueue(violation({ type: 'NO_FACE' }))
    await box.enqueue(violation({ type: 'MULTI_FACE' }))
    assert.deepEqual(sent, ['MULTI_FACE'])
    assert.equal(box.pending, 0)
  })

  it('동시에 여러 번 보내도 순서대로 한 번씩만 보낸다', async () => {
    const sent: string[] = []
    const box = new CamOutbox('inv', async (_i, e) => {
      await new Promise((r) => setTimeout(r, 5))
      sent.push(e.type)
    }, storage)
    await Promise.all([box.enqueue(violation({ type: 'NO_FACE' })), box.enqueue(violation({ type: 'HEAD_TURN' })), box.flush()])
    assert.deepEqual(sent, ['NO_FACE', 'HEAD_TURN'])
  })

  it('재시도 판단: 네트워크 오류와 5xx 만', () => {
    assert.equal(new ProctorApiError('', 0).retryable, true)
    assert.equal(new ProctorApiError('', 503).retryable, true)
    assert.equal(new ProctorApiError('', 400).retryable, false)
    assert.equal(new ProctorApiError('', 404).retryable, false)
  })
})

describe('서버 시각 보정', () => {
  it('왕복 시간의 가운데를 기준으로 서버와의 차이를 잰다', () => {
    // 내 시계가 서버보다 10초 늦고, 요청~응답에 200ms 걸린 경우
    const requestedAt = 1_000_000
    const receivedAt = 1_000_200
    const serverNow = new Date(1_000_100 + 10_000).toISOString()
    assert.equal(serverOffsetFrom(serverNow, requestedAt, receivedAt), 10_000)
  })
})

describe('실전 맥락 (자가진단과 구분)', () => {
  beforeEach(() => {
    const s = new MemoryStorage()
    Object.defineProperty(globalThis, 'sessionStorage', { value: s, configurable: true })
  })

  it('입장 링크로 시작한 응시만 실전이다. 다른 응시 ID(자가진단)는 null', async () => {
    const { readLiveExam, saveLiveExam, clearLiveExam, secondsLeft } = await import('../../src/proctor/liveExam.ts')
    saveLiveExam({
      invite: 'A'.repeat(43),
      title: 't',
      startsAt: '2026-12-01T06:00:00Z',
      endsAt: '2026-12-01T07:00:00Z',
      proctoring: true,
      attempts: { 'order-deadlock': 'att-1' },
      serverOffsetMs: 0,
    })
    assert.equal(readLiveExam('att-1')?.proctoring, true)
    assert.equal(readLiveExam('att-self-diagnosis'), null)
    assert.equal(secondsLeft(readLiveExam('att-1')!, Date.parse('2026-12-01T06:59:00Z')), 60)
    clearLiveExam()
    assert.equal(readLiveExam('att-1'), null)
  })

  it('초대 토큰은 시험이 끝나도 그 응시에만 남고, 응시 API 요청에만 붙는다', async () => {
    const { inviteForAttempt, saveLiveExam, clearLiveExam } = await import('../../src/proctor/liveExam.ts')
    const { inviteHeaders } = await import('../../src/api.ts')
    const base = { title: 't', startsAt: '2026-12-01T06:00:00Z', endsAt: '2026-12-01T07:00:00Z', proctoring: false, serverOffsetMs: 0 }
    saveLiveExam({ ...base, invite: 'B'.repeat(43), attempts: { a: '101', b: '102' } })
    saveLiveExam({ ...base, invite: 'C'.repeat(43), attempts: { a: '201' } })
    clearLiveExam()
    assert.equal(inviteForAttempt('102'), 'B'.repeat(43))
    assert.equal(inviteForAttempt('201'), 'C'.repeat(43))
    assert.equal(inviteForAttempt('999'), null)
    assert.deepEqual(inviteHeaders('/api/attempts/101/file?path=x'), { 'X-Pair-Invite': 'B'.repeat(43) })
    assert.deepEqual(inviteHeaders('/api/attempts/201'), { 'X-Pair-Invite': 'C'.repeat(43) })
    assert.deepEqual(inviteHeaders('/api/attempts/999'), {})
    assert.deepEqual(inviteHeaders('/api/attempts'), {})
    assert.deepEqual(inviteHeaders('/api/console/sessions/101'), {})
    assert.deepEqual(inviteHeaders('https://evil.example/api/attempts/101'), {})
  })

  it('저장된 값이 깨져 있으면 실전으로 보지 않는다', async () => {
    const { readLiveExam } = await import('../../src/proctor/liveExam.ts')
    globalThis.sessionStorage.setItem('pair:live-exam', '{"invite":1}')
    assert.equal(readLiveExam('att-1'), null)
  })
})
