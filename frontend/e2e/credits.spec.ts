import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

test('구매 내역의 상태를 한글로 표시하고 주문별 작업은 유지한다', async ({ page }) => {
  await mockApi(page)
  const statuses = ['READY', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED', 'CONFIRMING', 'WAITING_FOR_DEPOSIT', 'NEW_STATUS', 'REFUNDING']
  const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  await page.route((url) => url.pathname.startsWith('/api/credits'), async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/api/credits') return json({ balance: 1000 })
    if (path === '/api/credits/products') return json([])
    if (path === '/api/credits/ledger') return json({ content: [], number: 0, totalPages: 1, last: true })
    if (path === '/api/credits/purchases/order-2/refund') return json({
      purchaseId: 2, orderId: 'order-2', credits: 1000, amountKrw: 4990,
      status: 'REFUNDED', createdAt: '2026-11-24T01:00:00Z', paidAt: null, refundedAt: '2026-11-24T02:00:00Z',
    })
    if (path === '/api/credits/purchases') return json({
      content: statuses.map((status, index) => ({
        purchaseId: index + 1, orderId: `order-${index + 1}`, credits: 1000, amountKrw: 4990,
        status, createdAt: '2026-11-24T01:00:00Z', paidAt: null, refundedAt: null, refundableUntil: status === 'PAID' ? until : null,
      })),
      number: 0, totalPages: 1, last: true,
    })
    return route.abort()
  })
  await page.goto('/credits')
  await expect(page.getByText('결제 후 7일 안에, 구매한 크레딧만큼 잔액이 남아 있으면 전액 환불할 수 있습니다.')).toBeVisible()
  await expect(page.getByText('모의 환불', { exact: false })).toHaveCount(0)
  await expect(page.getByText('자동 웹훅이 없으므로', { exact: false })).toHaveCount(0)
  await expect(page.getByText('잔액이 부족하면 환불할 수 없습니다.', { exact: false })).toHaveCount(0)
  const rows = page.getByRole('heading', { name: '구매 내역' }).locator('..').getByRole('listitem')
  await expect(rows).toHaveCount(statuses.length)
  for (const [index, label] of ['결제 전', '완료', '실패', '취소', '환불', '승인 확인 중', '입금 대기', '알 수 없는 상태 (NEW_STATUS)', '환불 처리 중'].entries()) {
    await expect(rows.nth(index)).toContainText(`· ${label}`)
    await expect(rows.nth(index)).not.toContainText(`order-${index + 1}`)
    await expect(rows.nth(index)).not.toContainText('주문번호')
  }
  await expect(rows.nth(0).getByRole('button', { name: '주문 취소' })).toBeVisible()
  await expect(rows.nth(1).getByRole('button', { name: '환불', exact: true })).toBeVisible()
  await expect(rows.nth(1)).toContainText('까지 환불 가능')
  await expect(rows.nth(8).getByRole('button', { name: '환불 다시 확인' })).toBeVisible()
  await expect(page.getByRole('button', { name: '환불', exact: true })).toHaveCount(1)
  await expect(rows.nth(5).getByRole('button', { name: '재확인' })).toBeVisible()
  await expect(rows.nth(6).getByRole('button', { name: '재확인' })).toBeVisible()
  page.once('dialog', (dialog) => { expect(dialog.message()).toContain('4,990원 결제를 전액 취소합니다'); void dialog.accept() })
  const refundRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/api/credits/purchases/order-2/refund' && request.method() === 'POST',
  )
  await rows.nth(1).getByRole('button', { name: '환불', exact: true }).click()
  await refundRequest
  await expect(page.getByRole('status').filter({ hasText: '결제가 취소되어 환불되었습니다.' })).toBeVisible()
})

test('환불 기한(결제 후 168시간)이 지난 주문에는 환불 버튼이 없다', async ({ page }) => {
  await mockApi(page)
  await page.route((url) => url.pathname.startsWith('/api/credits'), async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/api/credits') return json({ balance: 1000 })
    if (path === '/api/credits/products') return json([])
    if (path === '/api/credits/ledger') return json({ content: [], number: 0, totalPages: 1, last: true })
    if (path === '/api/credits/purchases') return json({
      content: [{ purchaseId: 1, orderId: 'order-1', credits: 1000, amountKrw: 4990, status: 'PAID', createdAt: '2026-11-10T01:00:00Z',
        paidAt: '2026-11-10T01:00:00Z', refundedAt: null, refundableUntil: new Date(Date.now() - 60_000).toISOString() }],
      number: 0, totalPages: 1, last: true,
    })
    return route.abort()
  })
  await page.goto('/credits')
  const rows = page.getByRole('heading', { name: '구매 내역' }).locator('..').getByRole('listitem')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('· 완료')
  await expect(rows.first().getByRole('button')).toHaveCount(0)
  await expect(rows.first()).not.toContainText('환불 가능')
})

/** 승인·재확인이 오류로 끝나는 주문 하나. 오류 뒤 조회하면 after 상태로 보인다 */
async function mockPaymentError(page: Page, before: string, after: string, status: number) {
  await mockApi(page)
  let current = before
  await page.route((url) => url.pathname.startsWith('/api/credits'), async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (data: unknown, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/api/credits') return json({ balance: 1000 })
    if (path === '/api/credits/products') return json([])
    if (path === '/api/credits/ledger') return json({ content: [], number: 0, totalPages: 1, last: true })
    if (path.endsWith('/confirm') || path.endsWith('/recover')) {
      current = after
      return json({ message: '서버 안내' }, status)
    }
    if (path === '/api/credits/purchases') return json({
      content: [{ purchaseId: 1, orderId: 'order-1', credits: 1000, amountKrw: 4990, status: current,
        createdAt: '2026-11-24T01:00:00Z', paidAt: null, refundedAt: null }],
      number: 0, totalPages: 1, last: true,
    })
    return route.abort()
  })
}

const RETURN_URL = '/credits?payment=success&orderId=order-1&paymentKey=pay-1&amount=4990'

test('승인 실패가 확정되면 실패를 안내하고 다시 요청을 권하지 않는다', async ({ page }) => {
  await mockPaymentError(page, 'READY', 'FAILED', 409)
  await page.goto(RETURN_URL)
  await expect(page.getByRole('alert')).toContainText('결제가 승인되지 않아 크레딧이 지급되지 않았습니다.')
  await expect(page.getByText('승인 결과를 확인하지 못했습니다', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '승인 다시 요청' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '구매 내역' })).toBeVisible()
  await expect(page.getByRole('button', { name: '승인 다시 요청' })).toHaveCount(0)
})

test('승인 결과를 모르면 다시 요청할 수 있다', async ({ page }) => {
  await mockPaymentError(page, 'READY', 'CONFIRMING', 503)
  await page.goto(RETURN_URL)
  await expect(page.getByRole('alert')).toContainText('승인 결과를 확인하지 못했습니다: 서버 안내')
  await expect(page.getByRole('button', { name: '승인 다시 요청' })).toBeVisible()
})

test('재확인에서 실패가 확정되면 실패를 안내한다', async ({ page }) => {
  await mockPaymentError(page, 'CONFIRMING', 'FAILED', 409)
  await page.goto('/credits')
  await page.getByRole('button', { name: '재확인' }).click()
  await expect(page.getByRole('alert')).toContainText('결제가 승인되지 않아 크레딧이 지급되지 않았습니다.')
  await expect(page.getByRole('button', { name: '재확인' })).toHaveCount(0)
})
