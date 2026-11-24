import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'
import type { AuthUser } from '../src/auth/auth'

const manager: AuthUser = {
  id: 2, email: 'manager@example.test', name: '매니저', role: 'MANAGER',
  companyId: 1, companyName: '회사', emailVerified: true, passwordChangeRequired: false,
}

const session = {
  id: 7, companyId: 1, title: '예정된 시험', startsAt: '2030-01-01T01:00:00Z', endsAt: '2030-01-01T03:00:00Z',
  proctoring: true, phase: 'UPCOMING', taskIds: [], participants: 0, entered: 0, submitted: 0,
  canceledAt: null, unreviewedEvents: 0, createdAt: '2026-01-01T00:00:00Z',
}

async function setup(page: Page, user?: AuthUser) {
  await mockApi(page, user)
  await page.route((url) => url.pathname === '/api/credits', (route) =>
    route.fulfill({ json: { balance: 0 } }))
}

test('ADMIN은 회차 생성 링크를 볼 수 없지만 기존 회차를 조회하고 관리할 수 있다', async ({ page }) => {
  await setup(page)
  await page.route((url) => url.pathname === '/api/console/sessions', (route) =>
    route.fulfill({ json: [session] }))
  await page.route((url) => url.pathname === '/api/console/sessions/7', (route) =>
    route.fulfill({ json: { session, serverNow: new Date().toISOString(), closedAt: null, participants: [] } }))

  await page.goto('/console/sessions')
  await expect(page.getByText('예정된 시험')).toBeVisible()
  await expect(page.locator('a[href="/console/sessions/new"]')).toHaveCount(0)
  await page.getByRole('button', { name: /진행 중/ }).first().click()
  await expect(page.getByText('지금 진행 중인 회차가 없습니다.')).toBeVisible()
  await expect(page.getByRole('link', { name: '회차 만들기' })).toHaveCount(0)
  await page.goto('/console/sessions/7')
  await expect(page.getByRole('button', { name: '회차 수정' })).toBeVisible()
  await expect(page.getByRole('button', { name: '회차 취소' })).toBeVisible()
})

test('ADMIN은 생성 URL 직접 접근과 새로고침 시 회차 목록으로 이동한다', async ({ page }) => {
  await setup(page)
  await page.goto('/console/sessions/new')
  await expect(page).toHaveURL(/\/console\/sessions$/)
  await expect(page.getByRole('status').filter({ hasText: '회차 생성 권한이 없습니다' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '회차 만들기' })).toHaveCount(0)

  await page.evaluate(() => history.replaceState(null, '', '/console/sessions/new'))
  await page.reload()
  await expect(page).toHaveURL(/\/console\/sessions$/)
  await expect(page.getByRole('status').filter({ hasText: '회차 생성 권한이 없습니다' })).toBeVisible()
  await expect(page.locator('a[href="/console/sessions/new"]')).toHaveCount(0)
})

test('MANAGER는 목록에서 회차 생성으로 이동하고 생성할 수 있다', async ({ page }) => {
  await setup(page, manager)
  const requests: unknown[] = []
  await page.route((url) => url.pathname === '/api/console/sessions', async (route) => {
    if (route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON())
      return route.fulfill({ json: session })
    }
    return route.fulfill({ json: [] })
  })
  await page.route((url) => url.pathname === '/api/console/sessions/7', (route) =>
    route.fulfill({ json: { session, serverNow: new Date().toISOString(), closedAt: null, participants: [] } }))

  await page.goto('/console/sessions')
  await expect(page.getByText('예정된 회차가 없습니다.')).toBeVisible()
  await expect(page.getByRole('link', { name: '회차 만들기' })).toHaveCount(2)
  await page.getByRole('link', { name: '회차 만들기' }).first().click()
  await expect(page).toHaveURL(/\/console\/sessions\/new$/)
  await expect(page.getByRole('heading', { name: '회차 만들기' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '회차 만들기' })).toBeVisible()
  await page.getByRole('checkbox', { name: /실전 환불 정책 분석/ }).click()
  await page.getByLabel('회차 이름').fill('새 시험')
  await page.getByRole('button', { name: '회차 만들기' }).click()
  await expect(page).toHaveURL(/\/console\/sessions\/7\?tab=participants$/)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ title: '새 시험', taskIds: ['C1'] })
})

test('PROCTOR는 생성 URL에 접근할 수 없다', async ({ page }) => {
  await setup(page, { ...manager, role: 'PROCTOR' })
  await page.goto('/console/sessions/new')
  await expect(page).toHaveURL(/\/console\/sessions$/)
  await expect(page.getByRole('status').filter({ hasText: '회차 생성 권한이 없습니다' })).toBeVisible()
  await expect(page.getByRole('link', { name: '회차 만들기' })).toHaveCount(0)
})
