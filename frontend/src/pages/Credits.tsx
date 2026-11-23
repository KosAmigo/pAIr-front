import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth/auth'
import { AuthRequestError } from '../auth/authApi'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ErrorState } from '../components/ErrorState'
import { useCredits } from '../data/credits'
import { cancelReadyPurchase, confirmPurchase, creditsApi, type CreditProduct, type LedgerEntry, type Page, type Purchase } from '../credits/creditsApi'
import { openPayment, parsePaymentReturn, paymentStatusMessage, requireTestClientKey, type PaymentReturn } from '../credits/payment'

type SuccessReturn = Extract<PaymentReturn, { kind: 'success' }>
const number = (value: number) => value.toLocaleString('ko-KR')
const date = (value: string) => new Date(value).toLocaleString('ko-KR')
const message = (error: unknown) => {
  if ((error instanceof ApiError || error instanceof AuthRequestError) && error.status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.'
  if (error instanceof SyntaxError) return '서버 응답을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.'
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return '요청을 처리하지 못했습니다.'
}
const storageKey = (userId: number) => `pair-credit-payment-${userId}`

function storedReturn(userId: number): SuccessReturn | null {
  const value = sessionStorage.getItem(storageKey(userId))
  if (!value) return null
  const parsed = parsePaymentReturn(value)
  return parsed.kind === 'success' ? parsed : null
}

function saveReturn(userId: number, result: SuccessReturn) {
  sessionStorage.setItem(storageKey(userId), new URLSearchParams({
    payment: 'success', orderId: result.orderId, paymentKey: result.paymentKey, amount: String(result.amount),
  }).toString())
}

const button = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold text-text transition-colors hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${button} bg-brand-gradient text-on-accent`

export default function Credits() {
  const { user } = useAuth()
  const userId = user!.id
  const { state: balance, refresh: refreshBalance } = useCredits()
  const location = useLocation()
  const navigate = useNavigate()
  const [products, setProducts] = useState<CreditProduct[] | null>(null)
  const [purchases, setPurchases] = useState<Page<Purchase> | null>(null)
  const [ledger, setLedger] = useState<Page<LedgerEntry> | null>(null)
  const [purchasePage, setPurchasePage] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const callbackRef = useRef(false)
  const [pending, setPending] = useState<SuccessReturn | null>(() => storedReturn(userId))
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => {
    void refreshBalance()
    setRevision((value) => value + 1)
  }, [refreshBalance])

  useEffect(() => {
    let active = true
    Promise.all([creditsApi.products(), creditsApi.purchases(purchasePage), creditsApi.ledger(ledgerPage)])
      .then(([nextProducts, nextPurchases, nextLedger]) => {
        if (!active) return
        setProducts(nextProducts)
        setPurchases(nextPurchases)
        setLedger(nextLedger)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(message(error))
      })
    return () => { active = false }
  }, [purchasePage, ledgerPage, revision])

  const clearPending = useCallback(() => {
    sessionStorage.removeItem(storageKey(userId))
    setPending(null)
  }, [userId])

  const confirm = useCallback(async (result: SuccessReturn) => {
    setBusy(true)
    try {
      const order = await confirmPurchase(result.orderId, result.paymentKey, result.amount)
      setNotice(paymentStatusMessage(order.status))
      if (order.status !== 'READY') clearPending()
      refresh()
    } catch (error) {
      setActionError(`승인 결과를 확인하지 못했습니다: ${message(error)} 구매 내역에서 주문 상태를 확인하거나 재확인해 주세요.`)
      refresh()
    } finally {
      setBusy(false)
    }
  }, [clearPending, refresh])

  useEffect(() => {
    const result = parsePaymentReturn(location.search)
    if (result.kind === 'none' || callbackRef.current) return
    callbackRef.current = true
    if (result.kind === 'invalid') {
      navigate('/credits', { replace: true })
      setActionError('결제 결과 정보가 올바르지 않습니다. 구매 내역에서 주문 상태를 확인해 주세요.')
      return
    }
    if (result.kind === 'success') {
      saveReturn(userId, result)
      setPending(result)
      navigate('/credits', { replace: true })
      void confirm(result)
      return
    }
    navigate('/credits', { replace: true })
    setActionError(result.message)
    if (result.orderId) {
      setBusy(true)
      void cancelReadyPurchase(result.orderId).then((order) => {
        setNotice(order.status === 'CANCELED' ? '결제 인증 실패 후 주문이 취소되었습니다.' : paymentStatusMessage(order.status))
      }).catch((error: unknown) => {
        setActionError(`${result.message} 주문 취소 여부를 확인하지 못했습니다: ${message(error)} 구매 내역을 확인해 주세요.`)
      }).finally(() => { setBusy(false); refresh() })
    }
  }, [location.search, navigate, userId, confirm, refresh])

  async function perform(action: () => Promise<void>) {
    if (busyRef.current || busy) return
    busyRef.current = true
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await action()
    } catch (error) {
      setActionError(message(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function buy(product: CreditProduct) {
    void perform(async () => {
      const key = requireTestClientKey(import.meta.env.VITE_TOSS_CLIENT_KEY)
      const order = await creditsApi.create(product.credits)
      if (order.status !== 'READY' || !order.orderId || !Number.isSafeInteger(order.amountKrw) || order.amountKrw <= 0) {
        refresh()
        throw new Error('생성된 주문을 결제할 수 없습니다. 구매 내역에서 상태를 확인해 주세요.')
      }
      try {
        await openPayment(key, crypto.randomUUID(), order)
      } catch (error) {
        try {
          const canceled = await cancelReadyPurchase(order.orderId)
          setNotice(canceled.status === 'CANCELED' ? '결제창이 닫혀 주문을 취소했습니다.' : paymentStatusMessage(canceled.status))
        } catch (cancelError) {
          setNotice(`주문 취소 여부를 확인하지 못했습니다: ${message(cancelError)} 구매 내역을 확인해 주세요.`)
        }
        refresh()
        throw error
      }
    })
  }

  function orderAction(order: Purchase, action: 'recover' | 'cancel' | 'refund') {
    if (action === 'refund' && !window.confirm('토스 결제 취소 없이 서비스 내 크레딧만 회수됩니다. 테스트 환불을 진행할까요?')) return
    void perform(async () => {
      try {
        const updated = await creditsApi[action](order.orderId)
        setNotice(paymentStatusMessage(updated.status))
        if (pending?.orderId === order.orderId && updated.status !== 'READY') clearPending()
      } finally {
        refresh()
      }
    })
  }

  return (
    <SelfShell header={<PageHeader label="CREDITS" title="크레딧 충전" />}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-line bg-panel p-6">
          <p className="label">MY CREDITS</p>
          <h2 className="mt-2 text-lg font-bold text-text">현재 잔액</h2>
          <p className="tnum mt-2 text-3xl font-bold text-brand" role="status">
            {balance.status === 'ready' ? `${number(balance.balance)} 크레딧` : balance.status === 'loading' ? '조회 중' : '조회 실패'}
          </p>
          {balance.status === 'error' && <button className={`${button} mt-3`} onClick={() => void refreshBalance()}>잔액 다시 조회</button>}
          <p className="mt-3 text-sm text-text-muted">테스트 결제만 지원하며 실제 금전 결제는 발생하지 않습니다.</p>
        </section>

        {notice && <p role="status" className="rounded-lg border border-brand/30 bg-brand-dim p-4 text-text">{notice}</p>}
        {actionError && <p role="alert" className="rounded-lg border border-alert/30 bg-alert/8 p-4 text-text">{actionError}</p>}
        {pending && (
          <div className="rounded-lg border border-line bg-panel p-4 text-sm text-text">
            승인 결과가 확인되지 않은 주문이 있습니다. 구매 내역에서 재확인하거나 승인을 다시 요청하세요.
            <button disabled={busy} className={`${button} ml-3`} onClick={() => void perform(() => confirm(pending))}>승인 다시 요청</button>
          </div>
        )}
        {loadError ? <ErrorState message={loadError} onRetry={refresh} /> : !products || !purchases || !ledger ? (
          <p role="status" className="py-8 text-text-muted">크레딧 정보를 불러오는 중입니다.</p>
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-xl font-bold text-text">충전 상품</h2>
              {products.length === 0 ? <p className="text-text-muted">구매 가능한 상품이 없습니다.</p> : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {products.map((product) => (
                    <div key={product.credits} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
                      <h3 className="tnum text-lg font-bold text-text">{number(product.credits)} 크레딧</h3>
                      <p className="tnum text-text-muted">{number(product.amountKrw)}원</p>
                      <button className={primary} disabled={busy} onClick={() => buy(product)}>테스트 결제</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-xl border border-line bg-panel p-5">
              <h2 className="text-xl font-bold text-text">구매 내역</h2>
              <p className="mt-2 text-sm text-text-muted">모의 환불은 토스 결제 취소 없이 서비스 내 크레딧만 회수되는 테스트용 기능입니다. 잔액이 부족하면 환불할 수 없습니다.</p>
              <p className="mt-1 text-sm text-text-muted">입금 대기 또는 승인 확인 중인 주문은 크레딧이 지급된 것이 아닙니다. 자동 웹훅이 없으므로 재확인해 주세요.</p>
              {purchases.content.length === 0 ? <p className="py-6 text-text-muted">구매 내역이 없습니다.</p> : (
                <ul className="mt-4 divide-y divide-line">
                  {purchases.content.map((order) => (
                    <li key={order.orderId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div>
                        <p className="tnum font-semibold text-text">{number(order.credits)} 크레딧 · {number(order.amountKrw)}원</p>
                        <p className="mt-1 text-sm text-text-muted">{date(order.createdAt)} · {order.status} · 주문번호 {order.orderId}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(order.status === 'CONFIRMING' || order.status === 'WAITING_FOR_DEPOSIT') && <button className={button} disabled={busy} onClick={() => orderAction(order, 'recover')}>재확인</button>}
                        {order.status === 'READY' && <button className={button} disabled={busy} onClick={() => orderAction(order, 'cancel')}>주문 취소</button>}
                        {order.status === 'PAID' && <button className={button} disabled={busy} onClick={() => orderAction(order, 'refund')}>모의 환불</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Pager page={purchasePage} last={purchases.last} onChange={setPurchasePage} label="구매 내역" />
            </section>
            <section className="rounded-xl border border-line bg-panel p-5">
              <h2 className="text-xl font-bold text-text">크레딧 적립·사용 내역</h2>
              {ledger.content.length === 0 ? <p className="py-6 text-text-muted">크레딧 내역이 없습니다.</p> : (
                <ul className="mt-4 divide-y divide-line">
                  {ledger.content.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div><p className="font-semibold text-text">{entry.reason}</p><p className="mt-1 text-sm text-text-muted">{date(entry.createdAt)}</p></div>
                      <div className="tnum text-right"><p className="font-semibold text-text">{entry.amount > 0 ? '+' : ''}{number(entry.amount)}</p><p className="text-sm text-text-muted">잔액 {number(entry.balanceAfter)}</p></div>
                    </li>
                  ))}
                </ul>
              )}
              <Pager page={ledgerPage} last={ledger.last} onChange={setLedgerPage} label="크레딧 내역" />
            </section>
          </>
        )}
      </div>
    </SelfShell>
  )
}

function Pager({ page, last, onChange, label }: { page: number; last: boolean; onChange: (page: number) => void; label: string }) {
  return <nav aria-label={`${label} 페이지`} className="mt-3 flex items-center gap-3">
    <button className={button} disabled={page === 0} onClick={() => onChange(page - 1)}>이전</button>
    <span className="tnum text-sm text-text-muted">{page + 1}</span>
    <button className={button} disabled={last} onClick={() => onChange(page + 1)}>다음</button>
  </nav>
}
