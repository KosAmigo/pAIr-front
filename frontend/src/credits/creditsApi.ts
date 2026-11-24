import { call } from '../api.ts'

export type CreditProduct = { credits: number; amountKrw: number }
export type Purchase = {
  purchaseId: number
  orderId: string
  credits: number
  amountKrw: number
  status: string
  createdAt: string
  paidAt: string | null
  refundedAt: string | null
}
export type LedgerEntry = {
  id: number
  amount: number
  balanceAfter: number
  reason: string
  attemptId: string | null
  turnId: number | null
  purchaseId: number | null
  createdAt: string
}
export type Page<T> = { content: T[]; number: number; totalPages: number; last: boolean }

const orderPath = (orderId: string) => `/api/credits/purchases/${encodeURIComponent(orderId)}`

function validProducts(value: unknown): CreditProduct[] {
  if (!Array.isArray(value) || !value.every((item: unknown) =>
    typeof item === 'object' && item !== null &&
    'credits' in item && typeof item.credits === 'number' && Number.isSafeInteger(item.credits) && item.credits > 0 &&
    'amountKrw' in item && typeof item.amountKrw === 'number' && Number.isSafeInteger(item.amountKrw) && item.amountKrw > 0
  )) throw new Error('상품 목록 응답이 올바르지 않습니다.')
  return value
}

export const creditsApi = {
  products: async () => validProducts(await call<unknown>('GET', '/api/credits/products')),
  purchases: (page: number) => call<Page<Purchase>>('GET', `/api/credits/purchases?page=${page}&size=20`),
  ledger: (page: number) => call<Page<LedgerEntry>>('GET', `/api/credits/ledger?page=${page}&size=20`),
  create: (credits: number) => call<Purchase>('POST', '/api/credits/purchases', { credits }),
  confirm: (orderId: string, paymentKey: string, amount: number) =>
    call<Purchase>('POST', `${orderPath(orderId)}/confirm`, { paymentKey, amount }),
  recover: (orderId: string) => call<Purchase>('POST', `${orderPath(orderId)}/recover`),
  cancel: (orderId: string) => call<Purchase>('POST', `${orderPath(orderId)}/cancel`),
  refund: (orderId: string) => call<Purchase>('POST', `${orderPath(orderId)}/refund`),
}

export async function findPurchase(orderId: string): Promise<Purchase> {
  let page = 0
  for (;;) {
    const result = await creditsApi.purchases(page)
    if (!Array.isArray(result.content) || typeof result.last !== 'boolean') {
      throw new Error('구매 내역 응답이 올바르지 않습니다.')
    }
    const order = result.content.find((item) => item.orderId === orderId)
    if (order) return order
    if (result.last) throw new Error('해당 주문을 찾을 수 없습니다. 로그인 계정을 확인해 주세요.')
    page += 1
  }
}

const confirmations = new Map<string, Promise<Purchase>>()

export function confirmPurchase(orderId: string, paymentKey: string, amount: number): Promise<Purchase> {
  const key = JSON.stringify([orderId, paymentKey, amount])
  const existing = confirmations.get(key)
  if (existing) return existing
  const pending = confirmPurchaseOnce(orderId, paymentKey, amount)
  confirmations.set(key, pending)
  void pending.finally(() => confirmations.delete(key)).catch(() => {})
  return pending
}

async function confirmPurchaseOnce(orderId: string, paymentKey: string, amount: number): Promise<Purchase> {
  const order = await findPurchase(orderId)
  if (order.amountKrw !== amount) {
    throw new Error('결제 금액이 주문 금액과 일치하지 않습니다. 승인을 요청하지 않았습니다.')
  }
  if (order.status === 'CONFIRMING') return creditsApi.recover(orderId)
  if (order.status !== 'READY') return order
  return creditsApi.confirm(orderId, paymentKey, amount)
}

/** 승인 요청이 오류로 끝났을 때 실패가 확정된 주문인지 확인한다. 조회도 안 되면 결과를 모르는 것이므로 false */
export async function isFailedPurchase(orderId: string): Promise<boolean> {
  try {
    return (await findPurchase(orderId)).status === 'FAILED'
  } catch {
    return false
  }
}

export async function cancelReadyPurchase(orderId: string): Promise<Purchase> {
  const order = await findPurchase(orderId)
  return order.status === 'READY' ? creditsApi.cancel(orderId) : order
}
