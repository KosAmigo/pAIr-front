// 휴대폰 JPEG 프레임 송신 → 서버 중계(개발 릴레이) → PC 수신 흐름. 사전 테스트(연습) 화면은 입장 토큰 없이 짝을 맺는다.
// 가짜 카메라(--use-fake-device-for-media-stream)로 휴대폰 페이지가 실제로 프레임을 만들어 보낸다.
import { expect, test, type WebSocket as PwWebSocket } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

test('휴대폰 페이지가 JPEG 프레임을 보내고 PC 가 받는다 (서버 상한 안에서)', async ({ browser }) => {
  test.setTimeout(60_000)
  const ctx = await browser.newContext({ permissions: ['camera'] })
  const pc = await ctx.newPage()
  let pairCode = ''
  const received: number[] = []
  pc.on('websocket', (ws: PwWebSocket) => {
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string') {
        received.push((f.payload as Buffer).length)
        return
      }
      try {
        const m = JSON.parse(f.payload)
        if (m.type === 'paired') pairCode = m.pairCode
      } catch { /* 형식 아님 */ }
    })
  })
  await pc.goto('/practice')
  await expect.poll(() => pairCode, { timeout: 20_000 }).not.toBe('')

  const phone = await ctx.newPage()
  const sent: number[] = []
  const heartbeats: string[] = []
  phone.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      if (typeof f.payload === 'string') {
        if (f.payload.includes('"heartbeat"')) heartbeats.push(f.payload)
      } else sent.push((f.payload as Buffer).length)
    })
  })
  await phone.goto(`/proctor/phone?p=${pairCode}`)
  await phone.getByRole('button', { name: '보조 캠 시작' }).click()
  await expect(phone.getByText('사진 송신 중')).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(3)
  expect(Math.max(...sent)).toBeLessThanOrEqual(100_000)
  // 책상 스캔(scan) 모드 초기에는 큰 프레임, 해상도는 고정이라 크기가 크게 요동치지 않는다
  expect(Math.min(...sent)).toBeGreaterThan(500)
  // PC 쪽: 서버가 넘긴 JPEG 프레임(binary)을 받는다
  await expect.poll(() => received.length, { timeout: 20_000 }).toBeGreaterThan(1)
  expect(Math.max(...received)).toBeLessThanOrEqual(100_000)
  await pc.waitForTimeout(6_000)
  expect(heartbeats.length).toBeGreaterThanOrEqual(1)
  await ctx.close()
})
