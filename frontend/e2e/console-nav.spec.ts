// 콘솔 사이드바 접기/펼치기 (DESIGN.md §7-9-0): 216px ↔ 72px 아이콘 레일, 상태 기억, 접은 상태의 툴팁·검수 대기 점·메뉴 이동.
import { expect, test } from '@playwright/test'
import { mockApi } from './mock'

const width = async (page: import('@playwright/test').Page) => Math.round((await page.getByRole('complementary', { name: '콘솔 메뉴' }).boundingBox())!.width)

test('사이드바를 접고 펼친다: 폭, aria-expanded, 새로고침 뒤에도 유지', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await page.goto('/console/tasks')
  const toggle = page.getByRole('button', { name: '사이드바 접기' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(216)
  await expect(page.getByText('CONSOLE', { exact: true })).toBeVisible()

  await toggle.click() // 키보드로도 조작된다(버튼)
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(72)
  await expect(page.getByText('CONSOLE', { exact: true })).toHaveCSS('opacity', '0') // 자리는 그대로, 글자만 투명

  await page.reload()
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(72)

  await page.getByRole('button', { name: '사이드바 펼치기' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(216)
  await page.reload()
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(216)
})

test('접은 상태: 이름 툴팁, 검수 대기 점, 메뉴 이동, 활성 표시', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await page.addInitScript(() => localStorage.setItem('pair.consoleNavCollapsed', '1'))
  await page.goto('/console/tasks')
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(72)
  const nav = page.getByRole('navigation', { name: '콘솔 메뉴 항목' })
  // 글자는 화면 읽기용으로만 남고, 마우스를 올리면 이름이 툴팁(title)으로 나온다
  await expect(nav.getByRole('link', { name: /^과제/ })).toHaveAttribute('title', '과제')
  await expect(nav.getByRole('link', { name: '회차' })).toHaveAttribute('title', '회차')
  // 검수 대기 2개 → 숫자 알약 대신 점 + 읽기용 글
  await expect(nav.getByTestId('menu-dot')).toHaveCount(1)
  await expect(nav.getByRole('link', { name: /검수 대기 2개/ })).toBeVisible()
  // 접은 채로 이동하고, 활성 메뉴 판이 따라온다
  await nav.getByRole('link', { name: '회차' }).click()
  await expect(page).toHaveURL(/\/console\/sessions/)
  await expect(nav.getByRole('link', { name: '회차' })).toHaveAttribute('aria-current', 'page')
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(72)
})

test('아이콘은 가만히: 펼침·접힘·전환 중에도 메뉴 아이콘·로고·아래 아바타의 x·y가 같고, 사이드바는 왼쪽 고정에 폭만 변한다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await page.goto('/console/tasks')
  const aside = page.getByRole('complementary', { name: '콘솔 메뉴' })
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(216)
  const pos = async () => {
    const icon = await aside.getByRole('link', { name: /^과제/ }).locator('svg').first().boundingBox()
    const icon2 = await aside.getByRole('link', { name: '회차' }).locator('svg').first().boundingBox()
    const logo = await aside.getByRole('link', { name: 'pAIr 처음으로' }).locator('svg').boundingBox()
    const box = await aside.boundingBox()
    const r = (b: { x: number; y: number } | null) => [Math.round(b!.x * 2) / 2, Math.round(b!.y * 2) / 2]
    return { icon: r(icon), icon2: r(icon2), logo: r(logo), left: Math.round(box!.x), top: Math.round(box!.y) }
  }
  const open = await pos()
  // 접는 동안 여러 번 재 본다: 아이콘·로고 위치는 한 번도 안 변하고 사이드바 left 도 그대로
  await page.getByRole('button', { name: '사이드바 접기' }).click()
  for (let i = 0; i < 8; i++) {
    const mid = await pos()
    expect(mid).toEqual(open)
    await page.waitForTimeout(30)
  }
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(72)
  expect(await pos()).toEqual(open)
  // 아이콘은 72px 레일의 가운데 (x 36 ± 1)
  expect(Math.abs(open.icon[0] + 9 - 36)).toBeLessThanOrEqual(1)
  // 아래 아바타(소속 원)도 같은 x
  const avatar = aside.locator('span.glass-stage').first()
  const a1 = (await avatar.boundingBox())!
  await page.getByRole('button', { name: '사이드바 펼치기' }).click()
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(216)
  const a2 = (await avatar.boundingBox())!
  expect([a2.x, a2.y]).toEqual([a1.x, a1.y])
})

test('활성 표시: 왼쪽 막대가 없고, 접으면 판이 아이콘 가운데의 정사각형에 가깝다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await page.addInitScript(() => localStorage.setItem('pair.consoleNavCollapsed', '1'))
  await page.goto('/console/tasks')
  const plate = page.getByTestId('menu-active')
  await expect(plate).toBeVisible()
  expect(await plate.locator('*').count()).toBe(0) // 안에 막대 같은 것이 없다
  await expect.poll(async () => Math.round((await plate.boundingBox())!.width), { timeout: 15_000 }).toBe(48)
  const p = (await plate.boundingBox())!
  const icon = (await page.getByRole('navigation', { name: '콘솔 메뉴 항목' }).getByRole('link', { name: /^과제/ }).locator('svg').first().boundingBox())!
  expect(Math.abs(p.x + p.width / 2 - (icon.x + icon.width / 2))).toBeLessThanOrEqual(1) // 아이콘이 판의 가운데
  expect(Math.abs(p.width - p.height)).toBeLessThanOrEqual(6)
})

test('채점 툴도 콘솔 셸 안에 있다: 왼쪽 메뉴·상단 바가 보이고 채점 툴이 활성', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  // 채점 툴이 쓰는 API 만 가볍게 채운다
  await page.route('**/api/grader/rubric', (r) => r.fulfill({ json: { items: [], checks: [], defaults: { judgeRepeat: 1, parallel: 1 } } }))
  await page.route('**/api/grader/**', (r) => (r.request().url().endsWith('/rubric') ? r.fallback() : r.fulfill({ json: [] })))
  await page.goto('/grader')
  await expect(page.getByRole('complementary', { name: '콘솔 메뉴' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '콘솔 메뉴 항목' }).getByRole('link', { name: '채점 툴' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('navigation', { name: '현재 위치' })).toContainText('채점 툴')
  // 접어도 같은 셸
  await page.getByRole('button', { name: '사이드바 접기' }).click()
  await expect.poll(() => width(page), { timeout: 15_000 }).toBe(72)
})
