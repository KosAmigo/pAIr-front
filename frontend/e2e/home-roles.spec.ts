// 홈 화면의 콘솔·자가진단 버튼은 역할에 맞는 것만 보인다. 관리자는 크레딧 제한이 없어 잔액을 보여 주지 않는다.
import { expect, test, type Page } from '@playwright/test'
import type { AuthUser } from '../src/auth/auth'
import { mockApi } from './mock'

const userOf = (role: AuthUser['role']): AuthUser => ({
  id: 3, email: `${role.toLowerCase()}@example.test`, name: role, role,
  companyId: role === 'MANAGER' || role === 'PROCTOR' ? 1 : null,
  companyName: role === 'MANAGER' || role === 'PROCTOR' ? '회사' : null,
  emailVerified: true, passwordChangeRequired: false,
})

async function home(page: Page, role?: AuthUser['role']) {
  if (role) {
    await mockApi(page, userOf(role))
    await page.route((url) => url.pathname === '/api/credits', (route) => route.fulfill({ json: { balance: 120, unlimited: role === 'ADMIN' } }))
  }
  await page.goto('/')
  await expect(page.getByRole('link', { name: '응시 환경 테스트' })).toBeVisible()
  const header = page.locator('header').first()
  return {
    console: header.getByRole('link', { name: '콘솔' }),
    self: page.getByRole('link', { name: /자가진단 시작/ }),
  }
}

test('로그인 전: 콘솔과 자가진단 둘 다 보인다', async ({ page }) => {
  const b = await home(page)
  await expect(b.console).toBeVisible()
  await expect(b.self.first()).toBeVisible()
})

test('일반 회원: 자가진단만 보이고 콘솔은 없다', async ({ page }) => {
  const b = await home(page, 'USER')
  await expect(b.console).toHaveCount(0)
  await expect(b.self.first()).toBeVisible()
})

for (const role of ['MANAGER', 'PROCTOR'] as const) {
  test(`기업 계정(${role}): 콘솔만 보이고 자가진단 시작은 없다`, async ({ page }) => {
    const b = await home(page, role)
    await expect(b.console).toBeVisible()
    await expect(b.self).toHaveCount(0)
  })
}

test('관리자: 콘솔과 자가진단 둘 다 보인다', async ({ page }) => {
  const b = await home(page, 'ADMIN')
  await expect(b.console).toBeVisible()
  await expect(b.self.first()).toBeVisible()
})

test('관리자는 자가진단 화면에서 크레딧 잔액과 충전 버튼이 보이지 않는다', async ({ page }) => {
  await mockApi(page, userOf('ADMIN'))
  await page.route((url) => url.pathname === '/api/credits', (route) => route.fulfill({ json: { balance: 0, unlimited: true } }))
  await page.route((url) => url.pathname === '/api/attempts', (route) => route.fulfill({ json: [] }))
  await page.goto('/mypage')
  await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible()
  await expect(page.getByText('크레딧', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '충전' })).toHaveCount(0)
})

test('일반 회원은 자가진단 화면에서 크레딧 잔액과 충전 버튼이 보인다', async ({ page }) => {
  await mockApi(page, userOf('USER'))
  await page.route((url) => url.pathname === '/api/credits', (route) => route.fulfill({ json: { balance: 120, unlimited: false } }))
  await page.goto('/mypage')
  await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible()
  await expect(page.getByText('크레딧', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '충전' })).toBeVisible()
})
