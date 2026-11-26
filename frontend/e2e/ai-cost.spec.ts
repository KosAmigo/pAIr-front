import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'
import type { AuthUser } from '../src/auth/auth'

const manager: AuthUser = {
  id: 2, email: 'manager@example.test', name: '매니저', role: 'MANAGER',
  companyId: 1, companyName: '회사', emailVerified: true, passwordChangeRequired: false,
}

const session = {
  id: 7, companyId: 1, title: '비용 확인 회차', startsAt: '2030-01-01T01:00:00Z', endsAt: '2030-01-01T03:00:00Z',
  proctoring: false, phase: 'UPCOMING', taskIds: [], participants: 0, entered: 0, submitted: 0,
  canceledAt: null, unreviewedEvents: 0, createdAt: '2026-01-01T00:00:00Z',
}

const cost = {
  sessionId: 7, attempts: 4, totalUsd: 1.7, perAttemptUsd: 0.425,
  chat: { calls: 2, inputTokens: 1_000_000, outputTokens: 200_000, cachedTokens: 0, usd: 0.2,
    models: [{ model: 'claude-haiku-5-5', calls: 2, inputTokens: 1_000_000, outputTokens: 200_000, cachedTokens: 0, usd: 0.2 }] },
  scoring: { calls: 3, inputTokens: 1_000_010, outputTokens: 100_010, cachedTokens: 300_000, usd: 1.5,
    models: [
      { model: 'gpt-6.1-terra', calls: 2, inputTokens: 1_000_000, outputTokens: 100_000, cachedTokens: 300_000, usd: 1.5 },
      { model: 'mystery-model', calls: 1, inputTokens: 10, outputTokens: 10, cachedTokens: 0, usd: null },
    ] },
  unpricedModels: ['mystery-model'],
}

async function setup(page: Page, user?: AuthUser) {
  await mockApi(page, user)
  await page.route((url) => url.pathname === '/api/credits', (route) => route.fulfill({ json: { balance: 0 } }))
  await page.route((url) => url.pathname === '/api/console/sessions/7', (route) =>
    route.fulfill({ json: { session, serverNow: new Date().toISOString(), closedAt: null, participants: [] } }))
  const costCalls: string[] = []
  await page.route((url) => url.pathname === '/api/console/sessions/7/ai-cost', (route) => {
    costCalls.push(route.request().method())
    return route.fulfill({ json: cost })
  })
  return costCalls
}

test('관리자는 회차 개요에서 AI 비용(용도별·모델별·단가 없는 모델)을 본다', async ({ page }) => {
  const costCalls = await setup(page)
  await page.goto('/console/sessions/7')

  const card = page.getByRole('region', { name: 'AI 비용' })
  await expect(card.getByText('$1.70', { exact: true })).toBeVisible()
  await expect(card.getByText('응시 4건 · 1건당 $0.4250')).toBeVisible()
  const chat = card.getByRole('row', { name: /AI 채팅/ })
  await expect(chat).toContainText('2회')
  await expect(chat).toContainText('100.0만')
  await expect(chat).toContainText('$0.2000')
  await expect(card.getByRole('row', { name: /채점/ })).toContainText('$1.50')
  await card.getByText('모델별 보기').click()
  await expect(card.getByText('gpt-6.1-terra')).toBeVisible()
  await expect(card.getByText('단가 없음')).toBeVisible()
  await expect(card.getByRole('note')).toContainText('mystery-model')  // 개발 모드(StrictMode)에서는 화면이 두 번 그려져 같은 조회를 두 번 할 수 있다. 조회만 했는지 본다
  expect(costCalls.length).toBeGreaterThan(0)
  expect(new Set(costCalls)).toEqual(new Set(['GET']))
})

test('매니저에게는 AI 비용이 보이지 않고 요청도 보내지 않는다', async ({ page }) => {
  const costCalls = await setup(page, manager)
  await page.goto('/console/sessions/7')
  await expect(page.getByText('비용 확인 회차').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'AI 비용' })).toHaveCount(0)
  expect(costCalls).toEqual([])
})
