import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

test('구매 내역의 상태를 한글로 표시하고 주문별 작업은 유지한다', async ({ page }) => {
  await mockApi(page)
  const statuses = ['READY', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED', 'CONFIRMING', 'WAITING_FOR_DEPOSIT', 'NEW_STATUS']
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
        status, createdAt: '2026-11-24T01:00:00Z', paidAt: null, refundedAt: null,
      })),
      number: 0, totalPages: 1, last: true,
    })
    return route.abort()
  })
  await page.goto('/credits')
  await expect(page.getByText('모의 환불 기능', { exact: true })).toBeVisible()
  await expect(page.getByText('자동 웹훅이 없으므로', { exact: false })).toHaveCount(0)
  await expect(page.getByText('잔액이 부족하면 환불할 수 없습니다.', { exact: false })).toHaveCount(0)
  const rows = page.getByRole('heading', { name: '구매 내역' }).locator('..').getByRole('listitem')
  await expect(rows).toHaveCount(statuses.length)
  for (const [index, label] of ['결제 전', '완료', '실패', '취소', '환불', '승인 확인 중', '입금 대기', '알 수 없는 상태 (NEW_STATUS)'].entries()) {
    await expect(rows.nth(index)).toContainText(`· ${label}`)
    await expect(rows.nth(index)).not.toContainText(`order-${index + 1}`)
    await expect(rows.nth(index)).not.toContainText('주문번호')
  }
  await expect(rows.nth(0).getByRole('button', { name: '주문 취소' })).toBeVisible()
  await expect(rows.nth(1).getByRole('button', { name: '모의 환불' })).toBeVisible()
  await expect(rows.nth(5).getByRole('button', { name: '재확인' })).toBeVisible()
  await expect(rows.nth(6).getByRole('button', { name: '재확인' })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  const refundRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/api/credits/purchases/order-2/refund' && request.method() === 'POST',
  )
  await rows.nth(1).getByRole('button', { name: '모의 환불' }).click()
  await refundRequest
  await expect(page.getByRole('status').filter({ hasText: '테스트 환불 처리된 주문입니다.' })).toBeVisible()
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
