import { expect, test } from '@playwright/test'
import type { AuthUser } from '../src/auth/auth'
import { mockApi } from './mock'

const cases: { role: AuthUser['role']; label: string | null; companyName: string | null }[] = [
  { role: 'USER', label: null, companyName: null },
  { role: 'MANAGER', label: '담당자', companyName: '테스트 기업' },
  { role: 'PROCTOR', label: '감독관', companyName: null },
  { role: 'ADMIN', label: '관리자', companyName: '관리 기업' },
]

for (const { role, label, companyName } of cases) {
  test(`마이페이지 기본 정보: ${role}`, async ({ page }) => {
    const user: AuthUser = {
      id: 98765, email: 'profile@example.test', name: '테스트 회원', role,
      companyId: 87654, companyName, emailVerified: true, passwordChangeRequired: false,
    }
    await mockApi(page, user)
    await page.route('**/api/credits', (route) => route.fulfill({ json: { balance: 0 } }))
    await page.goto('/mypage')

    const profile = page.locator('section').filter({ has: page.getByRole('heading', { name: '기본 정보' }) })
    await expect(profile.getByText('테스트 회원', { exact: true })).toBeVisible()
    await expect(profile.getByText(user.email, { exact: true })).toBeVisible()
    await expect(profile.getByText('회원 번호', { exact: true })).toHaveCount(0)
    await expect(profile.getByText('기업 번호', { exact: true })).toHaveCount(0)
    await expect(profile.getByText(String(user.id), { exact: true })).toHaveCount(0)
    await expect(profile.getByText(String(user.companyId), { exact: true })).toHaveCount(0)
    if (label === null) {
      await expect(profile.getByText('역할', { exact: true })).toHaveCount(0)
    } else {
      await expect(profile.getByText('역할', { exact: true })).toBeVisible()
      await expect(profile.getByText(label, { exact: true })).toBeVisible()
      await expect(profile.getByText(role, { exact: true })).toHaveCount(0)
    }
    if (companyName === null) {
      await expect(profile.getByText('기업명', { exact: true })).toHaveCount(0)
    } else {
      await expect(profile.getByText('기업명', { exact: true })).toBeVisible()
      await expect(profile.getByText(companyName, { exact: true })).toBeVisible()
    }
    if (role === 'ADMIN') {
      await expect(page.getByText('관리자 계정은 탈퇴할 수 없습니다.')).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: '회원 탈퇴' })).toBeVisible()
    }
    const storedUser = await page.evaluate(() => JSON.parse(localStorage.getItem('pair.auth')!).user)
    expect(storedUser).toMatchObject(user)
  })
}
