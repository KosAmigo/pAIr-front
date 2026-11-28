// 관리자 과제 삭제: 검수 전(숨김) 과제만 지울 수 있고, 확인창에서 한 번 더 묻는다.
// 성공하면 목록으로 돌아가 그 과제가 빠지고, 공개 중이면 버튼이 꺼지며, 409 는 창 안에 이유를 보여 준다.
import { expect, test, type Page } from '@playwright/test'
import { mockApi, TASKS } from './mock'

async function setup(page: Page, deleteStatus = 204, message = '') {
  const api = await mockApi(page)
  const calls: string[] = []
  let deleted = false
  await page.route(
    (url) => url.pathname.startsWith('/api/console/tasks'),
    async (route) => {
      const req = route.request()
      const path = new URL(req.url()).pathname
      if (path === '/api/console/tasks/D1' && req.method() === 'DELETE') {
        calls.push(`DELETE ${path}`)
        if (deleteStatus !== 204) return route.fulfill({ status: deleteStatus, contentType: 'application/json', body: JSON.stringify({ message }) })
        deleted = true
        return route.fulfill({ status: 204 })
      }
      if (path === '/api/console/tasks') return route.fulfill({ json: TASKS.filter((t) => !(deleted && t.id === 'D1')) })
      return route.fallback()
    },
  )
  return { api, calls }
}

test('검수 전 과제는 확인창을 거쳐 삭제되고, 목록으로 돌아가 그 과제가 빠진다', async ({ page }) => {
  const { calls } = await setup(page)
  await page.goto('/console/tasks/D1')
  const del = page.getByRole('button', { name: '삭제', exact: true })
  await expect(del).toBeEnabled()
  await del.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('검수 전 로그 파서')
  await expect(dialog).toContainText('되돌릴 수 없어요. 문항·자료·PDF가 모두 지워져요.')
  // 기본 포커스는 취소 버튼
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused()
  expect(calls).toHaveLength(0)

  await dialog.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page).toHaveURL(/\/console\/tasks$/)
  expect(calls).toEqual(['DELETE /api/console/tasks/D1'])
  await expect(page.getByRole('heading', { name: '검수 전 로그 파서' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '검수 전 매출 보고서' })).toBeVisible()
})

test('취소하면 아무것도 지우지 않는다', async ({ page }) => {
  const { calls } = await setup(page)
  await page.goto('/console/tasks/D1')
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '취소' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/console\/tasks\/D1$/)
  expect(calls).toHaveLength(0)
})

test('공개 중인 과제는 삭제 버튼이 꺼지고 이유를 툴팁으로 알려 준다', async ({ page }) => {
  await setup(page)
  await page.goto('/console/tasks/A1')
  await expect(page.getByRole('button', { name: '숨기기' })).toBeVisible()
  const del = page.getByRole('button', { name: /^삭제/ })
  await expect(del).toBeDisabled()
  await expect(page.getByTitle('공개 중인 과제는 먼저 숨겨야 지울 수 있어요')).toBeVisible()
})

test('지울 수 없으면(409) 서버 메시지를 창 안에 그대로 보여 주고 화면에 남는다', async ({ page }) => {
  const msg = '응시 기록이 있는 과제는 삭제할 수 없습니다.'
  await setup(page, 409, msg)
  await page.goto('/console/tasks/D1')
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText(msg)
  await expect(page).toHaveURL(/\/console\/tasks\/D1$/)
})

test('삭제된 과제를 가리키는 완료 작업은 링크 없이 삭제된 과제로 보인다', async ({ page }) => {
  const { api } = await setup(page)
  api.seedJobs([
    { jobId: 'a1', status: 'DONE', step: '완료', taskCode: null, passed: true, checks: [], error: null, mode: 'NOW', topic: '지운 주제', track: 'DEV', minutes: 40, createdAt: new Date().toISOString() },
    { jobId: 'a2', status: 'DONE', step: '완료', taskCode: 'N7', taskDeleted: true, passed: true, checks: [], error: null, mode: 'NOW', topic: '플래그 주제', track: 'DEV', minutes: 40, createdAt: new Date().toISOString() },
  ])
  await page.goto('/console/tasks/generating?job=a1')
  const detail = page.getByRole('region', { name: '작업 상세' })
  await expect(detail.getByTestId('task-deleted')).toContainText('삭제된 과제')
  await expect(detail.getByRole('link', { name: /검수하기|미리보기/ })).toHaveCount(0)
  await page.goto('/console/tasks/generating?job=a2')
  await expect(page.getByRole('region', { name: '작업 상세' }).getByRole('link', { name: /검수하기|미리보기/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '지운 주제 자세히 보기' }).locator('[role=status]')).toHaveText('삭제된 과제')
})
