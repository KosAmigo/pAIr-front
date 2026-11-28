// 관리자 회사 삭제: 회사 이름을 그대로 입력해야 버튼이 켜지고, 삭제하면 목록으로 돌아가 그 회사가 빠진다. 실패하면 창 안에 이유를 보여 준다.
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

const company = { id: 9, name: '아미고테크', businessNo: '123-45-67890', contact: '담당자', createdAt: '2026-11-01T00:00:00Z' }
const member = {
  id: 31, name: '김매니저', email: 'manager@amigo.test', role: 'MANAGER', status: 'ACTIVE',
  emailVerified: true, passwordChangeRequired: false, onboardingMailStatus: 'SENT',
}

async function setup(page: Page, deleteStatus = 200) {
  await mockApi(page)
  const calls: string[] = []
  let deleted = false
  await page.route((url) => url.pathname.startsWith('/api/admin/companies'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    calls.push(`${req.method()} ${path}`)
    if (path === '/api/admin/companies') return route.fulfill({ json: deleted ? [] : [company] })
    if (path === '/api/admin/companies/9' && req.method() === 'DELETE') {
      if (deleteStatus !== 200) return route.fulfill({ status: deleteStatus, json: { message: '진행 중인 회차가 있어 회사를 삭제할 수 없습니다. 회차가 끝난 뒤 다시 시도해 주세요.' } })
      deleted = true
      return route.fulfill({ json: { companyId: 9, withdrawnMembers: 1, canceledSessions: 0, revokedInvites: 0 } })
    }
    if (path === '/api/admin/companies/9') return route.fulfill({ json: { company, members: [member] } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/console/companies/9')
  return { calls }
}

test('회사 이름을 입력해야 삭제할 수 있고, 삭제하면 목록으로 돌아간다', async ({ page }) => {
  const { calls } = await setup(page)
  await page.getByRole('button', { name: '회사 삭제' }).click()
  const dialog = page.getByRole('dialog')
  const confirm = dialog.getByRole('button', { name: '회사 삭제' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/회사 이름/).fill('아미고')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/회사 이름/).fill('아미고테크')
  await confirm.click()

  await expect(page).toHaveURL(/\/console\/companies$/)
  expect(calls).toContain('DELETE /api/admin/companies/9')
  await expect(page.getByText('아미고테크')).toHaveCount(0)
})

test('진행 중 회차가 있어 거절되면 창 안에 이유를 보여 준다', async ({ page }) => {
  await setup(page, 409)
  await page.getByRole('button', { name: '회사 삭제' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/회사 이름/).fill('아미고테크')
  await dialog.getByRole('button', { name: '회사 삭제' }).click()

  await expect(dialog.getByRole('alert')).toContainText('진행 중인 회차')
  await expect(page).toHaveURL(/\/console\/companies\/9$/)
})
