// DESIGN.md §7-1 ① 시험 화면 데모. 실제 응시 화면을 줄인 가짜 창이다 (정적 마크업 + 타이핑).
// 12초 주기로: 코드 타이핑 → AI 대화 → 테스트 통과. 화면 밖이면 멈추고, 움직임을 끄면 마지막 장면에서 멈춘다.
import { useEffect, useRef, useState } from 'react'
import { Bot, Files, Play, Hammer, CornerDownLeft } from 'lucide-react'
import { TaskIcon } from '../../components/domainIcons'
import { cx } from '../../components/cx'
import { prefersReducedMotion } from './motion'

type Tok = [string, string?]
const K = 'text-code-keyword'
const N = 'text-code-number'
const T = 'text-code-type'
const M = 'text-code-method'
const F = 'text-code-field'
const C = 'text-text-faint italic'

const CODE: Tok[][] = [
  [['@Transactional', N]],
  [['public ', K], ['Order', T], [' '], ['createOrder', M], ['('], ['Long', T], [' userId, '], ['List', T], ['<'], ['Item', T], ['> items) {']],
  [['    '], ['Order', T], [' order = '], ['Order', T], ['.'], ['create', M], ['(userId);']],
  [['    '], ['// 재고를 먼저 잠그고 차감한다', C]],
  [['    '], ['for', K], [' ('], ['Item', T], [' item : items) {']],
  [['        '], ['inventory', F], ['.'], ['reserveWithLock', M], ['(item.'], ['productId', M], ['(), item.'], ['qty', M], ['());']],
  [['    }']],
  [['    '], ['return', K], [' '], ['orderRepository', F], ['.'], ['save', M], ['(order);']],
  [['}']],
]
const TOTAL_CHARS = CODE.reduce((n, l) => n + l.reduce((m, [t]) => m + t.length, 0) + 1, 0)

const Q1 = '동시에 같은 상품을 주문하면 재고가 음수가 될 수 있나요?'
const A1 = '네, 두 요청이 같은 재고를 함께 읽으면 초과 판매가 생겨요. reserve 에 비관적 락을 거는 방법을 제안할게요.'
const Q2 = '좋아요. 락 이름을 reserveWithLock 으로 바꿔 주세요.'

/** 앞에서부터 n글자만 남긴 코드 줄 (줄바꿈도 한 글자로 센다) */
function sliceCode(n: number) {
  let left = n
  return CODE.map((line) => {
    const out: { text: string; cls?: string }[] = []
    for (const [text, cls] of line) {
      if (left <= 0) break
      const take = text.slice(0, left)
      out.push({ text: take, cls })
      left -= take.length
    }
    left -= 1
    return out
  })
}

const LOOP = 12000
const CODE_MS = 18 // 글자당
const A1_START = 2600
const A1_MS = 28

export default function DemoWindow({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(() => (prefersReducedMotion() ? LOOP - 1 : 0))

  useEffect(() => {
    if (prefersReducedMotion()) return
    let visible = false
    let id = 0
    const start = () => {
      if (id || !visible || document.hidden) return
      id = window.setInterval(() => setT((v) => (v + 50) % LOOP), 50)
    }
    const stop = () => {
      window.clearInterval(id)
      id = 0
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) start()
      else stop()
    })
    if (ref.current) io.observe(ref.current)
    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const typed = Math.min(TOTAL_CHARS, Math.floor(t / CODE_MS))
  const codeDone = typed >= TOTAL_CHARS
  const a1 = A1.slice(0, Math.max(0, Math.floor((t - A1_START) / A1_MS)))
  const showQ1 = t > 1200
  const showQ2 = t > 7200
  const running = t > 8400 && t < 9600
  const passed = t >= 9600
  const remain = 38 * 60 + 12 - Math.floor(t / 1000)

  const lines = sliceCode(typed)
  const caretLine = Math.max(0, lines.reduce((last, l, i) => (l.length > 0 ? i : last), 0))

  return (
    <div
      ref={ref}
      aria-label="응시 화면 미리보기: 코드를 작성하고 AI에게 묻고 테스트를 통과하는 장면"
      role="img"
      className={cx('overflow-hidden rounded-[28px] border border-line bg-panel text-left shadow-lg', className)}
    >
      {/* 창 머리 */}
      <div className="flex h-11 items-center gap-3 border-b border-line bg-panel px-4">
        <span className="flex gap-1.5" aria-hidden>
          <i className="size-3 rounded-full bg-line-strong" />
          <i className="size-3 rounded-full bg-line-strong" />
          <i className="size-3 rounded-full bg-line-strong" />
        </span>
        <span className="ml-2 text-[14px] font-semibold text-text">주문 API 장애 원인 분석</span>
        <span className="rounded-sm bg-info/10 px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] text-info">SELF-CHECK</span>
        <span className="tnum mx-auto font-mono text-[15px] font-semibold text-text">
          {String(Math.floor(remain / 3600)).padStart(2, '0')}:{String(Math.floor((remain % 3600) / 60)).padStart(2, '0')}:
          {String(remain % 60).padStart(2, '0')}
        </span>
        <span className="rounded-md bg-brand-gradient px-3 py-1 text-[12px] font-semibold text-on-accent">제출</span>
      </div>

      <div className="grid h-[440px] grid-cols-[44px_1fr_300px] max-lg:grid-cols-[44px_1fr]">
        {/* 레일 */}
        <div className="flex flex-col items-center gap-3 border-r border-line bg-panel pt-3 text-text-faint" aria-hidden>
          <span className="relative text-brand">
            <Files size={18} />
          </span>
          <TaskIcon size={18} />
          <Bot size={18} className="mt-auto mb-3" />
        </div>

        {/* 에디터 + 결과 */}
        <div className="flex min-w-0 flex-col bg-panel-sunken">
          <div className="flex h-9 items-end gap-1 border-b border-line px-2">
            <span className="relative rounded-t-md border-x border-t border-line bg-panel-sunken px-3 py-1.5 font-mono text-[12px] text-text">
              <i className="absolute inset-x-0 top-0 h-0.5 bg-brand" aria-hidden />
              OrderService.java
            </span>
            <span className="px-3 py-1.5 font-mono text-[12px] text-text-faint">InventoryService.java</span>
          </div>
          <pre className="min-h-0 flex-1 overflow-hidden py-3 font-mono text-[13px] leading-[22px]">
            {lines.map((l, i) => (
              <div key={i} className={cx('flex', i === caretLine && !codeDone && 'bg-panel-raised')}>
                <span className="w-10 shrink-0 pr-3 text-right text-text-faint select-none">{i + 1}</span>
                <span className="whitespace-pre text-text">
                  {l.map((s, j) => (
                    <span key={j} className={s.cls}>
                      {s.text}
                    </span>
                  ))}
                  {i === caretLine && <span className="demo-caret" aria-hidden />}
                </span>
              </div>
            ))}
          </pre>
          <div className="h-[118px] shrink-0 border-t border-line bg-panel">
            <div className="flex h-9 items-center gap-2 border-b border-line px-3">
              <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-text-muted">OUTPUT</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-0.5 text-[11px] font-semibold text-text">
                <Hammer size={12} /> 빌드
              </span>
              <span className={cx('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-semibold text-on-accent bg-brand-gradient', running && 'animate-pulse')}>
                <Play size={12} /> 테스트 실행
              </span>
            </div>
            <div className="space-y-1 px-3 py-2 font-mono text-[12px] leading-5">
              {t > 8400 && <div className="text-text-faint">$ ./gradlew test</div>}
              {running && <div className="text-text-muted">테스트 실행 중...</div>}
              {passed && (
                <>
                  <div className="text-signal">✓ OrderServiceTest 12 passed, 0 failed</div>
                  <div className="text-signal">BUILD SUCCESSFUL in 3s</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* AI 대화 */}
        <div className="flex min-w-0 flex-col border-l border-line bg-panel max-lg:hidden">
          <div className="flex h-9 items-center border-b border-line px-3 font-mono text-[11px] font-medium tracking-[0.08em] text-text-muted">AI ASSISTANT</div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 text-[13px] leading-5">
            {showQ1 && (
              <div className="ml-6 rounded-md bg-panel-raised px-3 py-2 text-text">
                <span className="mb-0.5 block font-mono text-[11px] text-text-faint">#T07</span>
                {Q1}
              </div>
            )}
            {a1 && (
              <div className="border-l-2 border-info pl-3 text-text">
                <span className="mb-0.5 flex items-center gap-1 font-mono text-[11px] text-text-faint">
                  <Bot size={12} className="text-info" /> #T08
                </span>
                {a1}
                {a1.length < A1.length && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-info align-middle" />}
              </div>
            )}
            {showQ2 && (
              <div className="ml-6 rounded-md bg-panel-raised px-3 py-2 text-text">
                <span className="mb-0.5 block font-mono text-[11px] text-text-faint">#T09</span>
                {Q2}
              </div>
            )}
          </div>
          <div className="m-3 flex items-center rounded-md border border-line-strong px-3 py-2 text-[12px] text-text-faint">
            AI에게 질문하기
            <span className="ml-auto inline-flex h-6 items-center rounded-sm border border-b-[3px] border-line-strong px-1.5">
              <CornerDownLeft size={12} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
