export type PaymentReturn =
  | { kind: 'success'; orderId: string; paymentKey: string; amount: number }
  | { kind: 'failure'; orderId: string | null; message: string }
  | { kind: 'invalid' }
  | { kind: 'none' }

export function parsePaymentReturn(search: string): PaymentReturn {
  const params = new URLSearchParams(search)
  const result = params.get('payment')
  if (!result) return { kind: 'none' }
  const orderId = params.get('orderId')
  if (result === 'failure') return { kind: 'failure', orderId, message: params.get('message') || '결제 인증이 취소되었거나 실패했습니다.' }
  const paymentKey = params.get('paymentKey')
  const rawAmount = params.get('amount')
  if (result !== 'success' || !orderId || !paymentKey || !rawAmount || !/^[1-9]\d*$/.test(rawAmount)) return { kind: 'invalid' }
  const amount = Number(rawAmount)
  if (!Number.isSafeInteger(amount)) return { kind: 'invalid' }
  return { kind: 'success', orderId, paymentKey, amount }
}

export function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'READY': return '결제 전'
    case 'PAID': return '완료'
    case 'FAILED': return '실패'
    case 'CANCELED': return '취소'
    case 'REFUNDED': return '환불'
    case 'CONFIRMING': return '승인 확인 중'
    case 'WAITING_FOR_DEPOSIT': return '입금 대기'
    default: return `알 수 없는 상태 (${status})`
  }
}

export function paymentStatusMessage(status: string): string {
  switch (status) {
    case 'PAID': return '결제가 승인되어 크레딧이 지급되었습니다.'
    case 'CONFIRMING': return '결제 확인 중입니다. 구매 내역에서 다시 확인해 주세요.'
    case 'WAITING_FOR_DEPOSIT': return '입금 대기 중입니다. 크레딧은 아직 지급되지 않았습니다. 구매 내역에서 다시 확인해 주세요.'
    case 'READY': return '아직 결제가 완료되지 않았습니다.'
    case 'REFUNDED': return '테스트 환불 처리된 주문입니다.'
    case 'CANCELED': return '취소된 주문입니다.'
    default: return `주문 상태: ${status}. 크레딧 지급 여부를 구매 내역에서 확인해 주세요.`
  }
}

export function requireTestClientKey(key: string | undefined): string {
  if (!key || !/^test_ck_[A-Za-z0-9]+$/.test(key)) {
    throw new Error('토스 API 개별 연동 테스트 클라이언트 키(test_ck_)를 설정해 주세요. 라이브 키와 위젯 키는 사용할 수 없습니다.')
  }
  return key
}

type PaymentOptions = {
  method: 'CARD'
  amount: { currency: 'KRW'; value: number }
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
}
type TossPaymentsFactory = (key: string) => {
  payment: (options: { customerKey: string }) => { requestPayment: (options: PaymentOptions) => Promise<void> }
}

declare global {
  interface Window { TossPayments?: TossPaymentsFactory }
}

let scriptPromise: Promise<void> | null = null
export function loadPaymentSdk(): Promise<void> {
  if (window.TossPayments) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://js.tosspayments.com/v2/standard'
    script.onload = () => window.TossPayments ? resolve() : reject(new Error('결제 SDK를 초기화하지 못했습니다.'))
    script.onerror = () => {
      script.remove()
      reject(new Error('결제 SDK를 불러오지 못했습니다.'))
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    scriptPromise = null
    throw error
  })
  return scriptPromise
}

export async function openPayment(key: string, customerKey: string, order: { orderId: string; credits: number; amountKrw: number }): Promise<void> {
  requireTestClientKey(key)
  await loadPaymentSdk()
  if (!window.TossPayments) throw new Error('결제 SDK를 초기화하지 못했습니다.')
  const successUrl = new URL('/credits', window.location.origin)
  successUrl.searchParams.set('payment', 'success')
  const failUrl = new URL('/credits', window.location.origin)
  failUrl.searchParams.set('payment', 'failure')
  await window.TossPayments(key).payment({ customerKey }).requestPayment({
    method: 'CARD',
    amount: { currency: 'KRW', value: order.amountKrw },
    orderId: order.orderId,
    orderName: `pAIr 크레딧 ${order.credits.toLocaleString()}개`,
    successUrl: successUrl.toString(),
    failUrl: failUrl.toString(),
  })
}
