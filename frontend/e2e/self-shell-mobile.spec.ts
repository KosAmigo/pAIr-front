import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

// 휴대폰 폭에서 자가진단 화면(SelfShell)이 옆으로 밀리지 않는지, 데스크톱 배치는 그대로인지 본다
const USER = { id: 7, email: 'user@example.test', name: '응시자', role: 'USER' as const, companyId: null, companyName: null, emailVerified: true }
const page0 = { content: [], number: 0, totalPages: 1, last: true }
const TASKS = [
  { id: 'A1', type: 'dev', title: '주문 취소 후 재고가 두 번 복구되는 문제를 찾아 고치기', minutes: 40, status: 'OPEN' },
  { id: 'A2', type: 'dev', title: '쿠폰 할인 계산', minutes: 60, status: 'CLOSED' },
]
const RESPONSES: Record<string, unknown> = {
  '/api/credits': { balance: 12500 },
  '/api/credits/products': [{ credits: 1000, amountKrw: 4990 }, { credits: 15000, amountKrw: 49990 }],
  '/api/credits/ledger': page0,
  '/api/credits/purchases': page0,
  '/api/tasks': TASKS,
}
const taskDetail = (path: string) => ({
  ...TASKS.find((t) => path === `/api/tasks/${t.id}`),
  description: ['취소 이벤트가 두 번 와도 재고는 한 번만 복구되어야 합니다. 원인을 찾아 고치고 테스트로 보여 주세요.'],
  requirements: [], notes: [], followUps: [], openFile: 'Main.java', editableFile: null,
})

async function open(page: Page, path: string) {
  await mockApi(page, USER)
  await page.route((url) => url.pathname in RESPONSES || url.pathname.startsWith('/api/tasks/'), (route) => {
    const p = new URL(route.request().url()).pathname
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPONSES[p] ?? taskDetail(p)) })
  })
  await page.goto(path)
  await expect(page.getByRole('navigation', { name: '자가진단 메뉴' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('status').filter({ hasText: '12,500' })).toBeVisible()
  if (path === '/tasks') await expect(page.getByText('쿠폰 할인 계산').first()).toBeVisible()
}

test.describe('휴대폰 폭(375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const path of ['/tasks', '/dashboard', '/review', '/reports', '/credits', '/mypage']) {
    test(`${path} 화면이 옆으로 넘치지 않는다`, async ({ page }) => {
      await open(page, path)
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth
        const main = document.querySelector('main')!
        const wide = [...document.querySelectorAll('header *')]
          .filter((el) => el.getBoundingClientRect().right > width + 1)
          .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ').slice(0, 3).join('.')}`)
        return { page: document.documentElement.scrollWidth - width, main: main.scrollWidth - main.clientWidth, wide }
      })
      expect(overflow).toEqual({ page: 0, main: 0, wide: [] })
    })
  }
})

test('데스크톱 폭에서는 탭이 머리 한 줄 안에 그대로 있다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page, '/tasks')
  const header = await page.getByRole('banner').first().boundingBox()
  const nav = await page.getByRole('navigation', { name: '자가진단 메뉴' }).boundingBox()
  expect(header!.height).toBe(56)
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(header!.y + header!.height)
  await expect(page.getByRole('banner').getByText('크레딧', { exact: true })).toBeVisible()
  await expect(page.getByText('SELF-CHECK')).toBeVisible()
})
