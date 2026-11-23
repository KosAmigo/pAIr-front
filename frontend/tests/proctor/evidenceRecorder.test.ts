import { describe, expect, it } from './expect.ts'
import type { ClipFrameRequest } from '../../src/proctor/api/proctorApi.ts'
import { EvidenceRecorder } from '../../src/proctor/evidenceRecorder.ts'

const jpegBlob = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9])], { type: 'image/jpeg' })
const tick = () => new Promise((r) => setTimeout(r, 0))

function setup() {
  const timers: { fn: () => void; ms: number; id: number }[] = []
  let nextId = 1
  const rec = new EvidenceRecorder({
    delayMs: 5000,
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.push({ fn, ms, id })
      return id
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id)
      if (i >= 0) timers.splice(i, 1)
    },
  })
  const attached: { clientId: string; frames: ClipFrameRequest[] }[] = []
  const attach = (clientId: string, frames: ClipFrameRequest[]) => void attached.push({ clientId, frames })
  return { rec, timers, attached, attach }
}

describe('EvidenceRecorder', () => {
  it('이벤트 약 5초 뒤에 앞 8초·뒤 4초 구간을 웹캠·휴대폰 순으로 묶어 올린다', async () => {
    const t = setup()
    for (let s = 0; s <= 14; s++) t.rec.pushPc(1000 * s, `data:image/jpeg;base64,pc${s}`)
    for (let s = 0; s <= 14; s++) t.rec.pushPhone(1000 * s, jpegBlob(s))
    t.rec.schedule('evt-1', 9000, t.attach)
    expect(t.timers).toHaveLength(1)
    expect(t.timers[0].ms).toBe(5000)
    t.timers[0].fn()
    await tick()
    await tick()
    expect(t.attached).toHaveLength(1)
    const frames = t.attached[0].frames
    const pc = frames.filter((f) => f.source === 'PC_CAM')
    const phone = frames.filter((f) => f.source === 'PHONE_CAM')
    expect(pc.length > 0 && pc.length <= 12).toBe(true)
    expect(phone.length > 0 && phone.length <= 12).toBe(true)
    expect(frames.length <= 24).toBe(true)
    expect(frames.every((f) => f.offsetMs >= -8000 && f.offsetMs <= 4000)).toBe(true)
    expect(phone[0].image.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('이벤트 시각 이후 4초를 넘는 프레임은 넣지 않는다 (업로드 지연 동안 쌓인 것 포함)', async () => {
    const t = setup()
    for (let s = 0; s <= 20; s++) t.rec.pushPc(1000 * s, `data:image/jpeg;base64,pc${s}`)
    t.rec.schedule('evt-1', 5000, t.attach)
    t.timers[0].fn()
    await tick()
    await tick()
    expect(t.attached[0].frames.every((f) => f.offsetMs <= 4000)).toBe(true)
  })

  it('휴대폰이 없어도(프레임이 없어도) 웹캠 프레임만으로 올린다', async () => {
    const t = setup()
    t.rec.pushPc(1000, 'data:image/jpeg;base64,pc')
    t.rec.schedule('evt-1', 2000, t.attach)
    t.timers[0].fn()
    await tick()
    await tick()
    expect(t.attached[0].frames.map((f) => f.source)).toEqual(['PC_CAM'])
  })

  it('프레임이 하나도 없으면 올리지 않는다', async () => {
    const t = setup()
    t.rec.schedule('evt-1', 2000, t.attach)
    t.timers[0].fn()
    await tick()
    await tick()
    expect(t.attached).toHaveLength(0)
  })

  it('flushPending: 아직 안 올린 구간을 기다리지 않고 지금 올린다 (시험 종료)', async () => {
    const t = setup()
    t.rec.pushPc(1000, 'data:image/jpeg;base64,pc')
    t.rec.schedule('a', 2000, t.attach)
    t.rec.schedule('b', 3000, t.attach)
    await t.rec.flushPending()
    expect(t.attached.map((x) => x.clientId)).toEqual(['a', 'b'])
    expect(t.timers).toHaveLength(0)
  })

  it('clear: 예약과 보관 프레임을 모두 비운다', async () => {
    const t = setup()
    t.rec.pushPc(1000, 'data:image/jpeg;base64,pc')
    t.rec.schedule('a', 2000, t.attach)
    t.rec.clear()
    expect(t.timers).toHaveLength(0)
    expect(t.rec.sizes()).toEqual({ pc: 0, phone: 0 })
  })
})
