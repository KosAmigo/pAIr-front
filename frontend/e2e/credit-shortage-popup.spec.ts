// 과제 목록에서 도전을 눌렀는데 크레딧이 모자라면(서버 402) 화면을 넘기지 않고 그 자리에 창을 띄운다.
// 충분하면 응시를 만든 뒤 바로 응시 화면으로 간다. 새 탭·직군 링크로 /exam/new 에 들어와도 같은 창을 쓴다.
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

const USER = { id: 7, email: 'user@example.test', name: '응시자', role: 'USER' as const, companyId: null, companyName: null, emailVerified: true }
const TASKS = [{ id: 'order-deadlock', type: 'dev', title: '주문 처리 장애 원인 분석', minutes: 60, status: 'OPEN' }]
const SHORTAGE = '크레딧이 부족합니다. 필요: 10, 잔액: 5'

async function setup(page: Page, balance: number) {
  await mockApi(page, USER)
  const starts: string[] = []
  await page.route((url) => url.pathname === '/api/credits', (route) => route.fulfill({ json: { balance } }))
  await page.route((url) => url.pathname === '/api/attempts', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    starts.push(route.request().postDataJSON().taskId)
    return balance < 10
      ? route.fulfill({ status: 402, json: { message: SHORTAGE } })
      : route.fulfill({ json: { attemptId: 'a-new' } })
  })
  await page.route((url) => url.pathname === '/api/tasks' || url.pathname.startsWith('/api/tasks/'), (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/tasks') return route.fulfill({ json: TASKS })
    return route.fulfill({
      json: { ...TASKS[0], description: ['어제 21시부터 주문 생성이 간헐적으로 멈췄습니다.'], requirements: [], notes: [], followUps: [], openFile: 'Main.java', editableFile: null },
    })
  })
  return { starts }
}

test('크레딧이 모자라면 과제 목록에 그대로 머물고 충전 안내 창을 띄운다', async ({ page }) => {
  const { starts } = await setup(page, 5)
  await page.goto('/tasks')
  await page.getByRole('link', { name: /지금 도전하기/ }).click()

  const dialog = page.getByRole('dialog', { name: '크레딧이 부족합니다' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('필요: 10, 잔액: 5')
  await expect(page).toHaveURL(/\/tasks$/)
  expect(starts).toEqual(['order-deadlock'])

  // 닫으면 목록 그대로, 충전하러 가기는 충전 화면으로
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('link', { name: /지금 도전하기/ }).click()
  await page.getByRole('dialog').getByRole('link', { name: '충전하러 가기' }).click()
  await expect(page).toHaveURL(/\/credits$/)
})

test('크레딧이 충분하면 응시를 만들고 바로 응시 화면으로 간다', async ({ page }) => {
  const { starts } = await setup(page, 100)
  await page.goto('/tasks')
  await page.getByRole('link', { name: /지금 도전하기/ }).click()

  await expect(page).toHaveURL(/\/exam\/a-new$/)
  expect(starts).toEqual(['order-deadlock'])
})

test('/exam/new 로 바로 들어와도 큰 오류 화면 대신 같은 창을 띄우고, 닫으면 과제 목록으로 간다', async ({ page }) => {
  await setup(page, 5)
  await page.goto('/exam/new?task=order-deadlock')

  const dialog = page.getByRole('dialog', { name: '크레딧이 부족합니다' })
  await expect(dialog).toContainText('필요: 10, 잔액: 5')
  await dialog.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page).toHaveURL(/\/tasks$/)
})
