import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Coins } from 'lucide-react'
import { cx } from '../components/cx'
import { CountUp, GlowBorder, RevealGroup, RevealItem } from '../components/fx'
import { ApiError } from '../api'
import { useAuth } from '../auth/auth'
import { AuthRequestError } from '../auth/authApi'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ErrorState } from '../components/ErrorState'
import { useCredits } from '../data/credits'
import { cancelReadyPurchase, confirmPurchase, creditsApi, isFailedPurchase, type CreditProduct, type LedgerEntry, type Page, type Purchase } from '../credits/creditsApi'
import { ledgerReasonLabel, openPayment, parsePaymentReturn, paymentStatusLabel, paymentStatusMessage, requireTestClientKey, type PaymentReturn } from '../credits/payment'

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
      if (order.status === 'FAILED') setActionError(paymentStatusMessage(order.status))
      else setNotice(paymentStatusMessage(order.status))
      if (order.status !== 'READY') clearPending()
      refresh()
    } catch (error) {
      if (await isFailedPurchase(result.orderId)) {
        setActionError(paymentStatusMessage('FAILED'))
        clearPending()
      } else {
        setActionError(`승인 결과를 확인하지 못했습니다: ${message(error)} 구매 내역에서 주문 상태를 확인하거나 재확인해 주세요.`)
      }
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
    if (action === 'refund' && order.status === 'PAID'
      && !window.confirm(`${number(order.credits)} 크레딧을 회수하고 ${number(order.amountKrw)}원 결제를 전액 취소합니다. 환불할까요?`)) return
    void perform(async () => {
      try {
        const updated = await creditsApi[action](order.orderId)
        setNotice(paymentStatusMessage(updated.status))
        if (pending?.orderId === order.orderId && updated.status !== 'READY') clearPending()
      } catch (error) {
        if (action !== 'recover' || !(await isFailedPurchase(order.orderId))) throw error
        if (pending?.orderId === order.orderId) clearPending()
        throw new Error(paymentStatusMessage('FAILED'), { cause: error })
      } finally {
        refresh()
      }
    })
  }

  // 상품마다 1크레딧 값. 가장 싼 상품에 "가장 알뜰" 표시
  const unitPrices = (products ?? []).map((p) => p.amountKrw / p.credits)
  const bestUnit = unitPrices.length > 1 ? Math.min(...unitPrices) : null

  return (
    <SelfShell header={<PageHeader label="CREDITS" title="크레딧 충전" />}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-8">
        {/* 잔액: 이 화면의 주인공 카드 */}
        <GlowBorder className="rounded-2xl">
          <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-7 shadow-sm">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="label">MY CREDITS</p>
                <h2 className="mt-1 text-[15px] font-semibold text-text-muted">현재 잔액</h2>
                <p className="mt-2 flex items-baseline gap-2" role="status">
                  {balance.status === 'ready' ? (
                    <>
                      <CountUp value={balance.balance} grouping className="tnum font-mono text-[44px] leading-none font-bold text-brand" />
                      <span className="text-[18px] font-semibold text-text">크레딧</span>
                    </>
                  ) : (
                    <span className="text-[22px] font-semibold text-text-muted">{balance.status === 'loading' ? '조회 중' : '조회 실패'}</span>
                  )}
                </p>
                {balance.status === 'error' && <button className={`${button} mt-3`} onClick={() => void refreshBalance()}>잔액 다시 조회</button>}
              </div>
              <ul className="flex flex-wrap gap-2 text-[13px] text-text-muted" aria-label="크레딧을 쓰는 곳">
                {['자가진단 응시 시작', 'AI 채팅', '복기 롤백'].map((use) => (
                  <li key={use} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-panel-raised/60 px-3">
                    <Coins size={14} className="text-text-faint" aria-hidden />{use}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </GlowBorder>

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
              <p className="label">TOP UP</p>
              <h2 className="mt-1 mb-4 text-xl font-bold text-text">충전 상품</h2>
              {products.length === 0 ? <p className="text-text-muted">구매 가능한 상품이 없습니다.</p> : (
                <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {products.map((product) => {
                    const unit = product.amountKrw / product.credits
                    const best = bestUnit != null && unit === bestUnit
                    return (
                      <RevealItem key={product.credits}>
                        <div className={cx(
                          'relative flex h-full flex-col gap-4 rounded-xl border bg-panel p-5 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md',
                          best ? 'border-brand/40' : 'border-line',
                        )}>
                          {best && <span className="absolute top-4 right-4 rounded-sm bg-brand-dim px-2 py-0.5 text-[12px] font-semibold text-brand">가장 알뜰</span>}
                          <div>
                            <p className="tnum font-mono text-[28px] leading-none font-bold text-text">{number(product.credits)}</p>
                            <p className="mt-1 text-[13px] text-text-muted">크레딧</p>
                          </div>
                          <div className="mt-auto">
                            <p className="tnum text-[18px] font-semibold text-text">{number(product.amountKrw)}원</p>
                            <p className="tnum text-[12px] text-text-muted">1크레딧당 {unit.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}원</p>
                          </div>
                          <button className={primary} disabled={busy} onClick={() => buy(product)}>결제</button>
                        </div>
                      </RevealItem>
                    )
                  })}
                </RevealGroup>
              )}
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
                <p className="label">PURCHASES</p>
                <h2 className="mt-1 text-xl font-bold text-text">구매 내역</h2>
                <p className="mt-1 text-sm text-text-muted">결제 후 7일 안에, 구매한 크레딧만큼 잔액이 남아 있으면 전액 환불할 수 있습니다.</p>
                {purchases.content.length === 0 ? <p className="py-6 text-text-muted">구매 내역이 없습니다.</p> : (
                  <ul className="mt-3 divide-y divide-line">
                    {purchases.content.map((order) => (
                      <li key={order.orderId} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden className={cx('h-2.5 w-2.5 shrink-0 rounded-full', statusDot(order.status))} />
                          <div className="min-w-0">
                            <p className="tnum font-semibold text-text">{number(order.credits)} 크레딧 · {number(order.amountKrw)}원</p>
                            <p className="mt-0.5 text-sm text-text-muted">
                              {date(order.createdAt)} · {paymentStatusLabel(order.status)}
                              {refundable(order) && <> · {date(order.refundableUntil!)}까지 환불 가능</>}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(order.status === 'CONFIRMING' || order.status === 'WAITING_FOR_DEPOSIT') && <button className={button} disabled={busy} onClick={() => orderAction(order, 'recover')}>재확인</button>}
                          {order.status === 'READY' && <button className={button} disabled={busy} onClick={() => orderAction(order, 'cancel')}>주문 취소</button>}
                          {refundable(order) && <button className={button} disabled={busy} onClick={() => orderAction(order, 'refund')}>환불</button>}
                          {order.status === 'REFUNDING' && <button className={button} disabled={busy} onClick={() => orderAction(order, 'refund')}>환불 다시 확인</button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Pager page={purchasePage} last={purchases.last} onChange={setPurchasePage} label="구매 내역" />
              </section>
              <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
                <p className="label">HISTORY</p>
                <h2 className="mt-1 text-xl font-bold text-text">크레딧 적립·사용 내역</h2>
                {ledger.content.length === 0 ? <p className="py-6 text-text-muted">크레딧 내역이 없습니다.</p> : (
                  <ul className="mt-3 divide-y divide-line">
                    {ledger.content.map((entry) => {
                      const gain = entry.amount > 0
                      return (
                        <li key={entry.id} className="flex items-center justify-between gap-3 py-3.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <span aria-hidden className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full', gain ? 'bg-signal/12 text-signal' : 'bg-panel-raised text-text-muted')}>
                              {gain ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-text">{ledgerReasonLabel(entry.reason)}</p>
                              <p className="mt-0.5 text-sm text-text-muted">{date(entry.createdAt)}</p>
                            </div>
                          </div>
                          <div className="tnum shrink-0 text-right">
                            <p className={cx('font-mono font-semibold', gain ? 'text-signal' : 'text-text')}>{gain ? '+' : ''}{number(entry.amount)}</p>
                            <p className="text-[12px] text-text-muted">잔액 {number(entry.balanceAfter)}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <Pager page={ledgerPage} last={ledger.last} onChange={setLedgerPage} label="크레딧 내역" />
              </section>
            </div>
          </>
        )}
      </div>
    </SelfShell>
  )
}

/** 구매 상태 점 색: 완료 = 성공색, 실패 = 경고색, 진행 중 = 주의색, 나머지 = 흐린 회색 */
/** 결제 완료이고 환불 기한(결제 승인 + 168시간) 전인 주문. 잔액 확인은 서버가 한다 */
function refundable(order: Purchase) {
  return order.status === 'PAID' && !!order.refundableUntil && Date.parse(order.refundableUntil) > Date.now()
}

function statusDot(status: string) {
  if (status === 'PAID') return 'bg-signal'
  if (status === 'FAILED') return 'bg-alert'
  if (status === 'READY' || status === 'CONFIRMING' || status === 'WAITING_FOR_DEPOSIT' || status === 'REFUNDING') return 'bg-caution'
  return 'bg-text-faint'
}

function Pager({ page, last, onChange, label }: { page: number; last: boolean; onChange: (page: number) => void; label: string }) {
  if (page === 0 && last) return null // 한 쪽뿐이면 페이지 넘김을 보여 주지 않는다
  return <nav aria-label={`${label} 페이지`} className="mt-3 flex items-center gap-3">
    <button className={button} disabled={page === 0} onClick={() => onChange(page - 1)}>이전</button>
    <span className="tnum text-sm text-text-muted">{page + 1}</span>
    <button className={button} disabled={last} onClick={() => onChange(page + 1)}>다음</button>
  </nav>
}
