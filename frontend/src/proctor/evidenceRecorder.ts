// 이벤트 앞뒤 증거 구간 보관·업로드 예약.
// 웹캠 프레임만 시간 기준 링 버퍼(core/frameRing.ts)에 두었다가, 이벤트가 나면 약 5초 뒤(뒤 4초 수집이 끝난 직후)
// 앞 8초·뒤 4초를 골라 한 번 올린다. 휴대폰 프레임은 모으지도 올리지도 않는다 (2026-11-24 결정). 연속 업로드는 없다. 프레임은 브라우저 메모리에만 있다.
import type { ClipFrameRequest } from './api/proctorApi.ts'
import { CLIP_UPLOAD_DELAY_MS, FrameRing } from './core/frameRing.ts'

type Attach = (clientId: string, frames: ClipFrameRequest[]) => unknown
type Job = { clientId: string; anchor: number; attach: Attach; timer: unknown }

type Options = {
  delayMs?: number
  /** 테스트용 타이머 */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
}

export class EvidenceRecorder {
  private readonly pc = new FrameRing<string>()
  private jobs = new Map<string, Job>()
  private readonly delayMs: number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (id: unknown) => void

  constructor(opts: Options = {}) {
    this.delayMs = opts.delayMs ?? CLIP_UPLOAD_DELAY_MS
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
  }

  /** 웹캠 사진 한 장 (JPEG data URL). at: epoch ms */
  pushPc(at: number, image: string): void {
    this.pc.push(at, image)
  }

  /** 이 이벤트(anchor: epoch ms)의 증거 구간을 delayMs 뒤에 attach 로 넘긴다 */
  schedule(clientId: string, anchor: number, attach: Attach): void {
    const job: Job = { clientId, anchor, attach, timer: null }
    job.timer = this.setTimer(() => void this.run(clientId), this.delayMs)
    this.jobs.set(clientId, job)
  }

  /** 예약된 구간을 기다리지 않고 지금 모두 넘긴다 (시험 종료). 이미 쌓인 프레임으로 만든다 */
  async flushPending(): Promise<void> {
    await Promise.all([...this.jobs.keys()].map((id) => this.run(id)))
  }

  /** 예약과 보관 프레임을 비운다 */
  clear(): void {
    this.jobs.forEach((j) => this.clearTimer(j.timer))
    this.jobs = new Map()
    this.pc.clear()
  }

  sizes(): { pc: number } {
    return { pc: this.pc.size }
  }

  private async run(clientId: string): Promise<void> {
    const job = this.jobs.get(clientId)
    if (!job) return
    this.jobs.delete(clientId)
    this.clearTimer(job.timer)
    try {
      const frames = this.collect(job.anchor)
      if (frames.length > 0) await job.attach(clientId, frames)
    } catch (e) {
      // 사진 변환·업로드 예약이 실패해도 시험은 계속된다. 이 구간만 버려진다
      console.warn('증거 구간을 준비하지 못했습니다:', e instanceof Error ? e.message : e)
    }
  }

  private collect(anchor: number): ClipFrameRequest[] {
    return this.pc.select(anchor).map((p) => ({ source: 'PC_CAM', offsetMs: p.offsetMs, image: p.data }))
  }
}
