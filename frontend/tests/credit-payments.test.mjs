import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { cancelReadyPurchase, confirmPurchase, creditsApi } from '../src/credits/creditsApi.ts'
import { openPayment, parsePaymentReturn, paymentStatusMessage, requireTestClientKey } from '../src/credits/payment.ts'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
const originalWindow = globalThis.window
const purchase = (status = 'READY', extra = {}) => ({
  purchaseId: 1, orderId: 'order-1', credits: 1000, amountKrw: 4990, status,
  createdAt: '2026-01-01', paidAt: null, refundedAt: null, ...extra,
})
const page = (content, last = true) => ({ content, last, number: 0, totalPages: 1 })

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalStorage
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

function session() {
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: 'token-a', user: { id: 1, role: 'USER' } }) }
}

test('only test API individual integration client keys are accepted', () => {
  assert.equal(requireTestClientKey('test_ck_abc123'), 'test_ck_abc123')
  for (const key of [undefined, 'live_ck_abc', 'test_gck_abc', 'test_sk_abc', 'test_ck_']) {
    assert.throws(() => requireTestClientKey(key), /테스트 클라이언트 키/)
  }
})

test('redirect parameters are parsed strictly and waiting states are never called paid', () => {
  assert.deepEqual(parsePaymentReturn('?payment=success&orderId=order-1&paymentKey=pk&amount=4990'), {
    kind: 'success', orderId: 'order-1', paymentKey: 'pk', amount: 4990,
  })
  for (const amount of ['0', '-1', '1.5', '12abc', '9007199254740992']) {
    assert.equal(parsePaymentReturn(`?payment=success&orderId=a&paymentKey=b&amount=${amount}`).kind, 'invalid')
  }
  assert.equal(parsePaymentReturn('?payment=failure&message=취소').kind, 'failure')
  assert.match(paymentStatusMessage('WAITING_FOR_DEPOSIT'), /아직 지급되지/)
  assert.doesNotMatch(paymentStatusMessage('CONFIRMING'), /지급되었습니다/)
})

test('payment SDK receives the server order amount and test callback URLs', async () => {
  let received
  globalThis.window = {
    location: { origin: 'http://localhost:5173' },
    TossPayments: (key) => {
      assert.equal(key, 'test_ck_abc123')
      return { payment: ({ customerKey }) => {
        assert.equal(customerKey, 'd5b19d2a-b414-4ee1-9c27-caf608e71eba')
        return { requestPayment: async (options) => { received = options } }
      } }
    },
  }
  await openPayment('test_ck_abc123', 'd5b19d2a-b414-4ee1-9c27-caf608e71eba', purchase())
  assert.equal(received.orderId, 'order-1')
  assert.deepEqual(received.amount, { currency: 'KRW', value: 4990 })
  assert.equal(received.method, 'CARD')
  assert.equal(received.successUrl, 'http://localhost:5173/credits?payment=success')
  assert.equal(received.failUrl, 'http://localhost:5173/credits?payment=failure')
})

test('products and purchase endpoints use authenticated backend responses', async () => {
  session()
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('/products')) return Response.json([{ credits: 2200, amountKrw: 9990 }])
    return Response.json(purchase())
  }
  assert.deepEqual(await creditsApi.products(), [{ credits: 2200, amountKrw: 9990 }])
  await creditsApi.create(2200)
  await creditsApi.refund('order/1')
  assert.deepEqual(JSON.parse(requests[1].options.body), { credits: 2200 })
  assert.equal(requests[2].url, '/api/credits/purchases/order%2F1/refund')
  assert.equal(requests[2].options.headers.Authorization, 'Bearer token-a')
  globalThis.fetch = async () => Response.json([{ credits: 0, amountKrw: 1 }])
  await assert.rejects(creditsApi.products(), /상품 목록 응답/)
})

test('confirm validates amount against paginated server orders and deduplicates concurrent requests', async () => {
  session()
  const requests = []
  let release
  const wait = new Promise((resolve) => { release = resolve })
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    if (url.includes('page=0')) return Response.json(page([], false))
    if (url.includes('page=1')) return Response.json(page([purchase()]))
    await wait
    return Response.json(purchase('PAID'))
  }
  const first = confirmPurchase('order-1', 'pk', 4990)
  const second = confirmPurchase('order-1', 'pk', 4990)
  assert.equal(first, second)
  release()
  assert.equal((await first).status, 'PAID')
  assert.equal(requests.length, 3)
  assert.equal(requests[2].url, '/api/credits/purchases/order-1/confirm')
  assert.deepEqual(JSON.parse(requests[2].options.body), { paymentKey: 'pk', amount: 4990 })
  requests.length = 0
  await assert.rejects(confirmPurchase('order-1', 'pk', 4991), /금액이 주문 금액과 일치하지/)
  assert.equal(requests.length, 2)
})

test('confirming orders use recovery, and completed orders do not confirm again', async () => {
  session()
  for (const status of ['CONFIRMING', 'PAID', 'WAITING_FOR_DEPOSIT']) {
    const calls = []
    globalThis.fetch = async (url) => {
      calls.push(url)
      return Response.json(url.includes('/recover') ? purchase('PAID') : page([purchase(status)]))
    }
    const result = await confirmPurchase('order-1', 'pk', 4990)
    assert.equal(calls.length, status === 'CONFIRMING' ? 2 : 1)
    if (status === 'CONFIRMING') assert.match(calls[1], /\/recover$/)
    else assert.equal(result.status, status)
  }
})

test('failure cancellation only calls cancel for READY orders', async () => {
  session()
  for (const status of ['READY', 'CONFIRMING', 'PAID']) {
    const calls = []
    globalThis.fetch = async (url) => {
      calls.push(url)
      return Response.json(url.endsWith('/cancel') ? purchase('CANCELED') : page([purchase(status)]))
    }
    const result = await cancelReadyPurchase('order-1')
    assert.equal(calls.length, status === 'READY' ? 2 : 1)
    assert.equal(result.status, status === 'READY' ? 'CANCELED' : status)
  }
})

test('backend refund errors and network errors remain visible', async () => {
  session()
  globalThis.fetch = async () => Response.json({ message: '크레딧 잔액이 부족합니다.' }, { status: 409 })
  await assert.rejects(creditsApi.refund('order-1'), /잔액이 부족/)
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(confirmPurchase('order-1', 'pk', 4990), /백엔드에 연결/)
})
