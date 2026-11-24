// 회차 화면의 "점검 미통과" 탭: 점검에 실패한 채 입장한 응시자를 모아 보여 주고, 진행 중이 아닐 때는 점검 결과·안내 보내기를 연다.
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

const session = {
  id: 9, companyId: 1, title: '12월 점검 회차', startsAt: '2026-11-20T01:00:00Z', endsAt: '2026-11-20T03:00:00Z', proctoring: true, phase: 'ENDED',
  taskIds: [], participants: 1, entered: 1, submitted: 1, canceledAt: null, unreviewedEvents: 0, createdAt: '2026-11-01T00:00:00Z',
}
const participant = {
  id: 31, name: '박응시', email: 'park@example.test', inviteStatus: 'SENT', inviteError: null, invitedAt: '2026-11-19T00:00:00Z', remindedAt: null,
  enteredAt: '2026-11-20T00:55:00Z', startedAt: '2026-11-20T01:01:00Z', submittedAt: '2026-11-20T02:30:00Z', attempts: {}, linkExpired: false,
}
const failure = {
  participantId: 31, name: '박응시', email: 'park@example.test', enteredAt: '2026-11-20T00:55:00Z', checkedAt: '2026-11-20T00:54:00Z',
  failed: [{ id: 'light', label: '밝기', detail: '너무 어둡습니다' }, { id: 'desk', label: '책상 위', detail: '스캔 실패' }], noticeSent: false,
}

async function setup(page: Page, failures: unknown[]) {
  await mockApi(page)
  await page.route((url) => url.pathname.startsWith('/api/console/sessions/9'), async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/console/sessions/9', '')
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '') return json({ session, serverNow: '2026-11-21T00:00:00Z', closedAt: null, participants: [participant] })
    if (path === '/env-check-failures') return json(failures)
    if (path === '/participants/31/env-check') return json({ source: 'SAVED', updatedAt: '2026-11-20T00:54:00Z', result: { pc: { items: [{ id: 'light', label: '밝기', status: 'fail', detail: '너무 어둡습니다' }] } } })
    return json([])
  })
  await page.goto('/console/sessions/9?tab=envfail')
}

test('점검에 실패한 채 입장한 응시자와 실패 항목을 보여 준다', async ({ page }) => {
  await setup(page, [failure])
  await expect(page.getByRole('heading', { name: '점검 미통과 입장자' })).toBeVisible()
  await expect(page.getByText('박응시', { exact: true })).toBeVisible()
  await expect(page.getByText('너무 어둡습니다')).toBeVisible()
  await expect(page.getByText('스캔 실패')).toBeVisible()
  await expect(page.getByText('안 보냄')).toBeVisible()
})

test('진행 중이 아닌 회차에서는 행을 누르면 점검 결과와 안내 보내기가 열린다', async ({ page }) => {
  await setup(page, [failure])
  await page.getByRole('button', { name: '박응시 점검 결과 보기' }).click()
  await expect(page.getByRole('region', { name: '환경 점검과 안내' })).toBeVisible()
})

test('실패 입장자가 없으면 빈 상태를 보여 준다', async ({ page }) => {
  await setup(page, [])
  await expect(page.getByText('점검에 실패한 채 입장한 응시자가 없습니다.')).toBeVisible()
})
