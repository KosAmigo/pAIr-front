// 방 360도 스캔 개발 페이지(/dev/room-scan): 가짜 카메라 + 가짜 센서 이벤트로 12+5칸이 차는지,
// 수동 모드(센서 없음)로 6칸이 차는지, 분석 응답(WARN/PASS)을 가로채 경고 문장·다시 찍기가 나오는지 본다. 스크린샷은 남기지 않는다.
import { expect, test, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

// 가짜 카메라 영상은 단색에 가까워 선명도가 낮고 어두울 수 있으므로 기준을 풀고, 속도 기준만 남겨 둔다
const URL = '/dev/room-scan?sharp=0&bright=0&speed=25'

async function sendOrientation(page: Page, alpha: number, beta: number, rotation = 0) {
  await page.evaluate(
    ({ alpha, beta, rotation }) => {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { rotationRate: { alpha: rotation, beta: 0, gamma: 0 } }))
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha, beta, gamma: 0 }))
    },
    { alpha, beta, rotation },
  )
}

/** 센서 이벤트를 계속 쏘면서 해당 칸이 찰 때까지 기다린다 */
async function aim(page: Page, slot: string, alpha: number, beta: number) {
  await expect
    .poll(
      async () => {
        await sendOrientation(page, alpha, beta)
        return page.getByTestId(`slot-${slot}`).getAttribute('data-filled')
      },
      { timeout: 8000, intervals: [120] },
    )
    .toBe('yes')
}

const mockScan = (page: Page, body: unknown, seen?: { names: string[] }) =>
  page.route('**/vision-dev/v1/scan', async (route) => {
    const raw = route.request().postDataBuffer()?.toString('latin1') ?? ''
    if (seen) seen.names = [...raw.matchAll(/name="images"; filename="([^"]+)"/g)].map((m) => m[1])
    await route.fulfill({ json: body })
  })

const START_ALPHA = 100
const V_BETAS = [15, 45, 80, 115, 150]

test('센서 모드: 가로 12칸 + 세로 5칸이 차야 분석이 켜지고, WARN 이면 경고와 다시 찍기가 나온다', async ({ page }) => {
  test.setTimeout(90_000)
  const seen = { names: [] as string[] }
  const warn = {
    items: [
      { name: 'h03', persons: 0, phones: 1, monitors: 0, laptops: 0, books: 0, tablets: 0, objects: [{ label: 'cell phone', score: 0.9, box: [0.1, 0.2, 0.5, 0.6] }] },
    ],
    summary: {},
    verdict: { status: 'WARN', reasons: [{ code: 'PHONE', names: ['h03'] }] },
    ms: 812,
  }
  // 데스크톱 크롬은 방향 센서 권한을 거부로 돌려주므로, iOS 처럼 허용하는 권한 창을 흉내 낸다
  await page.addInitScript(() => {
    for (const E of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
      ;(E as unknown as { requestPermission: () => Promise<string> }).requestPermission = () => Promise.resolve('granted')
    }
  })
  await mockScan(page, warn, seen)
  await page.goto(URL)
  await page.getByTestId('start').click()
  await expect(page.getByTestId('guide')).toBeVisible() // 센서 리스너가 붙은 뒤에 이벤트를 쏜다
  await sendOrientation(page, START_ALPHA, 90)

  // 빠른 회전은 안 찍고 안내한다
  await expect.poll(async () => { await sendOrientation(page, START_ALPHA, 90, 120); return page.getByTestId('guide').innerText() }, { timeout: 5000 }).toContain('너무 빨라요')
  await expect(page.getByTestId('slot-h00')).toHaveAttribute('data-filled', 'no')

  for (let i = 0; i < 12; i++) await aim(page, `h${String(i).padStart(2, '0')}`, (START_ALPHA + i * 30) % 360, 90)
  await expect(page.getByTestId('analyze-disabled')).toBeVisible()
  for (let i = 0; i < 5; i++) await aim(page, `v${i}`, START_ALPHA, V_BETAS[i])

  await expect(page.getByTestId('count')).toHaveText('17/17')
  await page.getByTestId('analyze').click()
  await expect(page.getByTestId('verdict-warn')).toBeVisible()
  await expect(page.getByTestId('reason-PHONE')).toContainText('휴대폰이 보여요. 치우고 다시 찍어 주세요')
  await expect(page.getByTestId('box').first()).toBeVisible()
  expect(seen.names).toHaveLength(17)
  expect(seen.names).toContain('h03.jpg')

  // 다시 찍기: 그 칸만 비고, 다시 겨냥하면 채워진다
  await page.getByTestId('retake-h03').click()
  await expect(page.getByTestId('slot-h03')).toHaveAttribute('data-filled', 'no')
  await expect(page.getByTestId('slot-h04')).toHaveAttribute('data-filled', 'yes')
  await aim(page, 'h03', (START_ALPHA + 90) % 360, 90)
  await expect(page.getByTestId('analyze')).toBeVisible()
})

test('수동 모드: 센서 값이 안 오면 2초 뒤 사진 6장 방식으로 바뀌고, 6장을 찍으면 분석이 켜진다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockScan(page, { items: [], summary: {}, verdict: { status: 'PASS', reasons: [] }, ms: 300 })
  await page.goto(URL)
  await page.getByTestId('start').click()
  await expect(page.getByTestId('manual-note')).toBeVisible({ timeout: 6000 })
  await expect(page.getByTestId('guide')).toContainText('정면')
  for (const n of ['m_front', 'm_left', 'm_back', 'm_right', 'm_floor', 'm_ceiling']) {
    await expect(page.getByTestId('analyze')).toHaveCount(0)
    await page.getByTestId('shutter').click()
    await expect(page.getByTestId(`slot-${n}`)).toHaveAttribute('data-filled', 'yes')
  }
  await expect(page.getByTestId('count')).toHaveText('6/6')
  await page.getByTestId('analyze').click()
  await expect(page.getByTestId('verdict-pass')).toBeVisible()
})

test('권한을 거부하면 바로 수동 모드', async ({ page }) => {
  await page.addInitScript(() => {
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    D.requestPermission = () => Promise.resolve('denied')
  })
  await page.goto(URL)
  await page.getByTestId('start').click()
  await expect(page.getByTestId('manual-note')).toContainText('방향 센서를 쓸 수 없어서')
})
