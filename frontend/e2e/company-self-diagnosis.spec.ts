import { expect, test, type Page } from '@playwright/test'
import type { AuthUser } from '../src/auth/auth'
import { mockApi } from './mock'

const userOf = (role: AuthUser['role']): AuthUser => ({
  id: 5, email: 'member@example.test', name: '테스트 회원', role,
  companyId: role === 'MANAGER' || role === 'PROCTOR' ? 1 : null,
  companyName: role === 'MANAGER' || role === 'PROCTOR' ? '테스트 기업' : null,
  emailVerified: true, passwordChangeRequired: false,
})

async function setup(page: Page, role: AuthUser['role']) {
  await mockApi(page, userOf(role))
  await page.route((url) => url.pathname === '/api/credits', (route) => route.fulfill({ json: { balance: 100 } }))
  await page.route((url) => url.pathname === '/api/tasks', (route) => route.fulfill({ json: [] }))
  await page.route((url) => url.pathname === '/api/console/sessions', (route) => route.fulfill({ json: [] }))
}

for (const role of ['MANAGER', 'PROCTOR'] as const) {
  test(`${role}는 자가진단·크레딧 화면 주소로 들어가면 콘솔로 이동한다`, async ({ page }) => {
    await setup(page, role)
    for (const path of ['/tasks', '/credits', '/dashboard', '/review']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/console\/sessions$/)
    }
    await page.goto('/tasks')
    await expect(page.getByText('기업 계정은 자가진단과 크레딧을 이용할 수 없습니다')).toBeVisible()
  })

  test(`${role}의 마이페이지에는 자가진단 메뉴와 크레딧·충전이 보이지 않는다`, async ({ page }) => {
    await setup(page, role)
    await page.goto('/mypage')
    await expect(page.getByRole('heading', { name: '기본 정보' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '자가진단 메뉴' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '충전' })).toHaveCount(0)
    await expect(page.getByText('크레딧', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '콘솔' })).toBeVisible()
  })
}

for (const role of ['USER', 'ADMIN'] as const) {
  test(`${role}는 자가진단·크레딧 화면을 그대로 쓴다`, async ({ page }) => {
    await setup(page, role)
    await page.goto('/mypage')
    await expect(page.getByRole('navigation', { name: '자가진단 메뉴' })).toBeVisible()
    // 관리자는 크레딧 제한 없이 쓰므로 머리에 충전 버튼과 잔액이 없다
    const banner = page.getByRole('banner').first()
    await expect(banner.getByRole('link', { name: '충전' })).toHaveCount(role === 'ADMIN' ? 0 : 1)
    await expect(banner.getByText('크레딧', { exact: true })).toHaveCount(role === 'ADMIN' ? 0 : 1)
    await page.goto('/tasks')
    await expect(page).toHaveURL(/\/tasks$/)
    await page.goto('/credits')
    await expect(page).toHaveURL(/\/credits$/)
  })
}
