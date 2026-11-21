import { describe, expect, it } from './expect.ts'
import { SCAN_MIN_WIDTH, waitForNewStream, waitForScanResolution } from '../../src/proctor/check/deskScan.ts'

const fakeVideo = (width: number) => ({ videoWidth: width }) as unknown as HTMLVideoElement

describe('waitForNewStream (스캔 도중 휴대폰 영상이 끊겼다 돌아올 때)', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  it('이전과 다른 영상이 오면 그 영상을 돌려준다', async () => {
    let current: { id: string } | null = null
    setTimeout(() => (current = b), 150)
    expect(await waitForNewStream(() => current, a, () => false, 3000, 20)).toBe(b)
  })
  it('같은 영상이 그대로이거나 없으면 시간이 지난 뒤 null', async () => {
    const begin = Date.now()
    expect(await waitForNewStream(() => a, a, () => false, 200, 20)).toBeNull()
    expect(Date.now() - begin >= 150).toBe(true)
  })
  it('취소되면 바로 null', async () => {
    const begin = Date.now()
    expect(await waitForNewStream(() => null, a, () => true, 3000, 20)).toBeNull()
    expect(Date.now() - begin < 500).toBe(true)
  })
})

describe('waitForScanResolution', () => {
  it('이미 충분한 해상도면 바로 돌려준다', async () => {
    expect(await waitForScanResolution(fakeVideo(1920), () => false, 50)).toBe(1920)
  })
  it('해상도가 안 올라오면 시간이 지난 뒤 그대로 진행한다', async () => {
    const begin = Date.now()
    const w = await waitForScanResolution(fakeVideo(640), () => false, 300)
    expect(w).toBe(640)
    expect(Date.now() - begin >= 250).toBe(true)
  })
  it('도중에 해상도가 올라오면 기다림을 끝낸다', async () => {
    const v = { videoWidth: 640 }
    setTimeout(() => (v.videoWidth = SCAN_MIN_WIDTH), 250)
    expect(await waitForScanResolution(v as unknown as HTMLVideoElement, () => false, 3000)).toBe(SCAN_MIN_WIDTH)
  })
  it('취소되면 바로 끝낸다', async () => {
    const begin = Date.now()
    await waitForScanResolution(fakeVideo(100), () => true, 3000)
    expect(Date.now() - begin < 500).toBe(true)
  })
})
