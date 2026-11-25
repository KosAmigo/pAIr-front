// 단계별 안내 말풍선(코치마크). 화면의 요소(data-tour="...")를 밝게 비추고 옆에 설명 카드를 붙인다.
// 요소가 화면에 없으면 가운데 카드로만 보여 준다. 끝까지 보거나 닫으면 이 브라우저에 "봤음"을 기억한다.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from './cx'
import { Button } from './ui'

export type TourStep = {
  /** 비추는 요소의 data-tour 값. 없거나 화면에 없으면 가운데 카드 */
  target?: string
  title: string
  body: string
}

const SEEN_PREFIX = 'pair:tour-seen:'
const CARD_W = 340
const GAP = 14
const PAD = 6
const MARGIN = 12

export function hasSeenTour(key: string): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + key) === '1'
  } catch {
    return false
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + key, '1')
  } catch {
    /* 저장하지 못하면 다음에 다시 보일 뿐이다 */
  }
}

type Box = { top: number; left: number; width: number; height: number }
type Placement = 'bottom' | 'top' | 'right' | 'left' | 'center'

function targetBox(target?: string): Box | null {
  if (!target) return null
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** 카드가 들어갈 방향과 위치. 아래 → 위 → 오른쪽 → 왼쪽 순으로 자리가 되는 곳을 고른다 */
function place(box: Box, card: { w: number; h: number }, vw: number, vh: number): { placement: Placement; top: number; left: number } {
  const cx0 = box.left + box.width / 2
  const cy0 = box.top + box.height / 2
  const clampX = (x: number) => Math.min(Math.max(MARGIN, x), vw - card.w - MARGIN)
  const clampY = (y: number) => Math.min(Math.max(MARGIN, y), vh - card.h - MARGIN)
  if (box.top + box.height + PAD + GAP + card.h <= vh - MARGIN) return { placement: 'bottom', top: box.top + box.height + PAD + GAP, left: clampX(cx0 - card.w / 2) }
  if (box.top - PAD - GAP - card.h >= MARGIN) return { placement: 'top', top: box.top - PAD - GAP - card.h, left: clampX(cx0 - card.w / 2) }
  if (box.left + box.width + PAD + GAP + card.w <= vw - MARGIN) return { placement: 'right', top: clampY(cy0 - card.h / 2), left: box.left + box.width + PAD + GAP }
  if (box.left - PAD - GAP - card.w >= MARGIN) return { placement: 'left', top: clampY(cy0 - card.h / 2), left: box.left - PAD - GAP - card.w }
  return { placement: 'center', top: clampY(vh / 2 - card.h / 2), left: clampX(vw / 2 - card.w / 2) }
}

export function CoachTour({ steps, storageKey, onClose }: { steps: TourStep[]; storageKey: string; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [size, setSize] = useState({ w: CARD_W, h: 200 })
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const cardRef = useRef<HTMLDivElement>(null)
  const step = steps[index]
  const last = index === steps.length - 1

  const close = useCallback(() => {
    markSeen(storageKey)
    onClose()
  }, [storageKey, onClose])

  // 비출 요소를 화면 안으로 가져오고 위치를 다시 잰다
  const measure = useCallback(() => {
    setView({ w: window.innerWidth, h: window.innerHeight })
    setBox(targetBox(step?.target))
  }, [step?.target])

  useLayoutEffect(() => {
    if (step?.target) document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
  }, [step?.target, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useLayoutEffect(() => {
    const el = cardRef.current
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [index, box])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, steps.length])

  if (!step) return null
  const spot = box ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null
  const pos = box ? place(box, size, view.w, view.h) : { placement: 'center' as Placement, top: Math.max(MARGIN, view.h / 2 - size.h / 2), left: Math.max(MARGIN, view.w / 2 - size.w / 2) }
  const arrowCls: Record<Placement, string> = {
    bottom: '-top-1.5 border-t border-l',
    top: '-bottom-1.5 border-b border-r',
    right: '-left-1.5 border-b border-l',
    left: '-right-1.5 border-t border-r',
    center: 'hidden',
  }
  const arrowPos = (() => {
    if (!box || pos.placement === 'center') return {}
    if (pos.placement === 'bottom' || pos.placement === 'top') return { left: Math.min(Math.max(20, box.left + box.width / 2 - pos.left), size.w - 20) - 6 }
    return { top: Math.min(Math.max(20, box.top + box.height / 2 - pos.top), size.h - 20) - 6 }
  })()

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      {/* 바깥 클릭이 뒤 화면에 닿지 않게 막는 층. 비출 요소가 없으면 전체를 어둡게 한다 */}
      <div className={cx('absolute inset-0', !spot && 'bg-black/60')} onClick={(e) => e.stopPropagation()} />
      {spot && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/80 transition-[top,left,width,height] duration-200"
          style={{ ...spot, boxShadow: '0 0 0 9999px rgba(8, 8, 20, 0.6)' }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`사용 안내 ${index + 1} / ${steps.length}`}
        className="absolute rounded-xl border border-line bg-panel p-5 shadow-modal"
        style={{ top: pos.top, left: pos.left, width: CARD_W, maxWidth: view.w - MARGIN * 2 }}
      >
        <span aria-hidden className={cx('absolute size-3 rotate-45 border-line bg-panel', arrowCls[pos.placement])} style={arrowPos} />
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-[17px] leading-6 font-bold text-text">{step.title}</h2>
          <button type="button" aria-label="안내 닫기" onClick={close} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-6 break-keep text-text-muted">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="tnum font-mono text-[13px] text-text-faint">
            {index + 1} / {steps.length}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              이전
            </Button>
            <Button autoFocus size="sm" variant="primary" onClick={() => (last ? close() : setIndex((i) => i + 1))}>
              {last ? '완료' : '다음'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** 시험 환경 안내 단계. 시험 화면에서는 각 영역을 비추고, 대기실처럼 그 영역이 없는 화면에서는 가운데 카드로 보인다 */
export function examGuideSteps(opts: { proctoring: boolean }): TourStep[] {
  const steps: TourStep[] = [
    { target: 'timer', title: '남은 시간', body: '화면 위에 남은 시간이 표시돼요. 종료 시각이 되면 작업한 내용이 자동으로 제출돼요.' },
    { target: 'rail', title: '과제와 파일', body: '왼쪽 막대에서 과제 설명·요구사항과 파일 목록을 열 수 있어요. 먼저 과제를 꼼꼼히 읽어 보세요.' },
    { target: 'editor', title: '작업 영역', body: '파일을 열어 코드나 문서를 직접 작성해요. 개발 과제는 실행 버튼으로 빌드와 테스트를 돌려 결과를 볼 수 있어요.' },
    { target: 'chat', title: 'AI와 함께 풀기', body: '오른쪽 AI에게 질문하며 풀 수 있어요. AI와 나눈 대화는 기록돼 평가에 참고돼요.' },
    { target: 'submit', title: '제출하기', body: '다 풀면 제출을 누르세요. 제출하면 파일과 AI 대화가 잠기고, 이어서 후속 질문 3개에 답해요.' },
  ]
  if (opts.proctoring) {
    steps.push({
      target: 'camera',
      title: '카메라 감독',
      body: '시험 내내 노트북 카메라로 얼굴과 자세를 확인해요. 얼굴이 화면에서 벗어나거나, 여러 사람이 보이거나, 고개를 돌리거나, 시선이 5초 넘게 화면 밖을 향하면 기록돼요. 카메라를 가리지 말고 화면 정면을 봐 주세요. 영상은 저장하지 않고, 이상이 감지된 순간의 사진만 감독 기록에 남아요. 기록만으로 부정행위가 확정되지는 않아요.',
    })
  }
  const rules = opts.proctoring
    ? '전체 화면을 유지해 주세요. 다른 창이나 탭으로 이동하거나 창 전환 키(Alt+Tab, Win 키)를 누르면 기록돼요. 외부에서 복사한 내용을 붙여 넣는 것도 기록돼요. 기록만으로 부정행위가 확정되지는 않아요. '
    : ''
  steps.push({ title: '시험 중 지켜 주세요', body: `${rules}창이 닫히거나 연결이 끊겨도 5분 안에는 같은 링크로 다시 들어올 수 있어요. 5분이 지나면 링크가 만료되고, 끊긴 기록은 감독 기록에 남아요.` })
  return steps
}
