import { describe, expect, it } from './expect.ts'
import { CamOutbox, MAX_PENDING_CLIPS } from '../../src/proctor/api/camOutbox.ts'
import { ProctorApiError, type ClipFrameRequest, type ProctorEventRequest } from '../../src/proctor/api/proctorApi.ts'
import type { CamViolation } from '../../src/proctor/core/events.ts'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const viol = (id: string): CamViolation => ({ id, kind: 'phone_detected', type: 'PHONE', source: 'PC_CAM', message: 'm', startedAt: 1, ts: 2, durationMs: 0 })
const frames: ClipFrameRequest[] = [{ source: 'PC_CAM', offsetMs: -1000, image: 'data:image/jpeg;base64,AAAA' }]

function setup(opts: { eventFail?: () => Error | null; clipFail?: () => Error | null } = {}) {
  const log: string[] = []
  const sentEvents: ProctorEventRequest[] = []
  const sentClips: { clientId: string; frames: ClipFrameRequest[] }[] = []
  const box = new CamOutbox(
    'inv',
    async (_i, e) => {
      const err = opts.eventFail?.()
      if (err) throw err
      log.push(`event:${e.clientId}`)
      sentEvents.push(e)
    },
    mem(),
    async (_i, clientId, f) => {
      const err = opts.clipFail?.()
      if (err) throw err
      log.push(`clip:${clientId}`)
      sentClips.push({ clientId, frames: f })
    },
  )
  return { box, log, sentEvents, sentClips }
}

describe('CamOutbox 증거 구간', () => {
  it('record 는 이벤트의 clientId 를 돌려주고, 같은 clientId 로 구간을 이벤트 뒤에 올린다', async () => {
    const t = setup()
    const { clientId, done } = t.box.record(viol('a'))
    await done
    t.box.attachClip(clientId, frames)
    await t.box.flush()
    expect(t.log).toEqual([`event:${clientId}`, `clip:${clientId}`])
  })

  it('이벤트가 아직 못 올라간 동안에는 구간도 보내지 않고, 이벤트가 올라간 뒤에 보낸다', async () => {
    let fail = true
    const t = setup({ eventFail: () => (fail ? new ProctorApiError('x', 0) : null) })
    const { clientId, done } = t.box.record(viol('a'))
    await done
    t.box.attachClip(clientId, frames)
    await t.box.flush()
    expect(t.sentClips).toHaveLength(0)
    fail = false
    await t.box.flush()
    expect(t.log).toEqual([`event:${clientId}`, `clip:${clientId}`])
  })

  it('구간 업로드가 네트워크 오류면 남겨 두었다가 다시 보낸다', async () => {
    let fail = true
    const t = setup({ clipFail: () => (fail ? new ProctorApiError('x', 0) : null) })
    const { clientId, done } = t.box.record(viol('a'))
    await done
    t.box.attachClip(clientId, frames)
    await t.box.flush()
    expect(t.sentClips).toHaveLength(0)
    expect(t.box.pendingClips).toBe(1)
    fail = false
    await t.box.flush()
    expect(t.sentClips).toHaveLength(1)
    expect(t.box.pendingClips).toBe(0)
  })

  it('구간을 서버가 거절(4xx)하면 버린다', async () => {
    const t = setup({ clipFail: () => new ProctorApiError('no', 404) })
    const { clientId, done } = t.box.record(viol('a'))
    await done
    t.box.attachClip(clientId, frames)
    await t.box.flush()
    expect(t.box.pendingClips).toBe(0)
  })

  it('쌓인 구간이 상한을 넘으면 가장 오래된 것부터 버린다 (메모리 보호)', async () => {
    const t = setup({ clipFail: () => new ProctorApiError('x', 0) })
    for (let i = 0; i < MAX_PENDING_CLIPS + 2; i++) t.box.attachClip(`c${i}`, frames)
    await t.box.flush()
    expect(t.box.pendingClips).toBe(MAX_PENDING_CLIPS)
  })

  it('빈 구간은 올리지 않는다', () => {
    const t = setup()
    t.box.attachClip('x', [])
    expect(t.box.pendingClips).toBe(0)
  })

  it('기존 enqueue 는 그대로 동작한다', async () => {
    const t = setup()
    await t.box.enqueue(viol('a'))
    expect(t.sentEvents).toHaveLength(1)
  })
})

describe('재시도 대상', () => {
  it('요청 과다(429)·시간 초과(408)는 다시 보내고, 다른 4xx 는 버린다', () => {
    expect(new ProctorApiError('x', 429).retryable).toBe(true)
    expect(new ProctorApiError('x', 408).retryable).toBe(true)
    expect(new ProctorApiError('x', 413).retryable).toBe(false)
    expect(new ProctorApiError('x', 404).retryable).toBe(false)
  })
})
