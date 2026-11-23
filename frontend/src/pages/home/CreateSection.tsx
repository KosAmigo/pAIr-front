// DESIGN.md §7-1 ⑤ AI 과제 생성: 직군과 형태를 고르면 AI가 설명, 파일, 문항, 근거까지 초안을 만들고 사람이 검수해 공개한다.
// 오른쪽 그림은 콘솔의 "과제 만들기" 화면을 줄인 것. 화면에 들어오면 단계가 차례로 끝나고 초안 카드가 뜬다.
import { useRef } from 'react'
import { CircleCheck, ListChecks, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { TaskIcon } from '../../components/domainIcons'
import SectionHead, { Grad } from './SectionHead'
import Points from './Points'
import { floatCard, mockFrame } from './homeStyles'
import { GlowBorder } from '../../components/fx'
import { MOTION_OK, gsap, useGSAP } from './motion'

const STEPS = [
  { name: '과제 설명', result: '설명과 요구사항 3개', stream: '## 상황, 어제 21시부터 주문 API 응답이 8배 느려졌습니다' },
  { name: '작업 파일', result: '파일 6개', stream: 'OrderService.java, InventoryService.java, api.log' },
  { name: '문항', result: '객관식 1, 단답형 1, 서술형 1', stream: 'Q1 로그에서 처음 실패한 요청의 원인은?' },
  { name: '후속 질문', result: '3개', stream: 'F1 AI 답변 중 직접 확인한 것과 확인 방법' },
  { name: '근거 문서 연결', result: '문항마다 2개', stream: 'Q1 ← api.log 12행, 설계서 3쪽' },
]

const POINTS = [
  { icon: Sparkles, title: '고르기만 하면 초안', body: '직군, 과제 형태, 난이도, 시간과 참고 PDF를 넣으면 1~2분 안에 과제 하나가 통째로 만들어집니다.' },
  { icon: ListChecks, title: '문항과 근거까지 한 번에', body: '객관식, 단답형, 서술형 문항과 채점 기준, 문항마다 근거 문서 페이지까지 연결합니다.' },
  { icon: ShieldCheck, title: '사람이 검수하고 공개', body: '초안은 숨김 상태로 들어갑니다. 빠진 정답이나 근거를 점검한 뒤에만 공개할 수 있습니다.' },
]

export default function CreateSection() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const q = gsap.utils.selector(root)
        gsap.set(q('[data-step-done]'), { opacity: 0, scale: 0.5 })
        gsap.set(q('[data-step-result]'), { opacity: 0, x: 8 })
        gsap.set(q('[data-step-stream]'), { opacity: 0, height: 0 })
        gsap.set(q('[data-draft]'), { opacity: 0, y: 40, scale: 0.96 })
        gsap.set(q('[data-progress]'), { scaleX: 0, transformOrigin: 'left' })
        const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-gen]')[0], start: 'top 70%' } })
        STEPS.forEach((_, i) => {
          const at = i * 0.75
          tl.to(q(`[data-step-spin="${i}"]`), { opacity: 1, duration: 0.1 }, at)
            .to(q(`[data-step-stream="${i}"]`), { opacity: 1, height: 'auto', duration: 0.3 }, at)
            .to(q(`[data-step-spin="${i}"]`), { opacity: 0, duration: 0.1 }, at + 0.6)
            .to(q(`[data-step-stream="${i}"]`), { opacity: 0, height: 0, duration: 0.25 }, at + 0.6)
            .to(q(`[data-step-done="${i}"]`), { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, at + 0.6)
            .to(q(`[data-step-result="${i}"]`), { opacity: 1, x: 0, duration: 0.3 }, at + 0.65)
            .to(q('[data-progress]'), { scaleX: (i + 1) / STEPS.length, duration: 0.6, ease: 'power2.out' }, at + 0.1)
        })
        tl.to(q('[data-draft]'), { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'expo.out' }, '+=0.1')
        gsap.from(q('[data-point]'), { y: 32, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: q('[data-points]')[0], start: 'top 80%' } })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="create" className="relative pt-40 md:pl-[160px]">
      <div data-spine="create" aria-hidden className="h-0" />
      <SectionHead
        label="CREATE"
        title={
          <>
            과제도 <Grad>AI가</Grad> 만들고,
            <br />
            사람이 검수합니다
          </>
        }
        lead="문제를 만드는 데 며칠씩 걸리지 않습니다. AI가 초안을 만들면 담당자는 고치고 공개만 하면 됩니다."
      />

      <div className="mt-16 grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Points items={POINTS} className="lg:pt-6" />

        {/* 콘솔 "과제 만들기" 화면 축소판 */}
        <div data-gen className="relative" role="img" aria-label="AI가 과제 설명, 작업 파일, 문항, 후속 질문, 근거 문서를 차례로 만들고 검수 대기 초안이 만들어지는 화면">
          <GlowBorder className="rounded-[28px]">
          <div className={mockFrame}>
            <div className="h-1 bg-line">
              <div data-progress className="bg-brand-gradient h-full" />
            </div>
            <div className="flex items-center gap-3 border-b border-line px-6 py-4">
              <span className="font-mono text-[12px] font-semibold tracking-[0.08em] text-text-muted">NEW TASK</span>
              <span className="text-[15px] font-semibold text-text">장애 분석 │ 개발 │ 중급 │ 60분</span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-dim px-3 py-1 text-[13px] font-semibold text-brand">
                <Sparkles size={14} aria-hidden /> AI 초안
              </span>
            </div>
            <ol className="flex flex-col px-6 py-4">
              {STEPS.map((s, i) => (
                <li key={s.name} className="border-b border-line/70 py-2.5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="relative size-5 shrink-0">
                      <span className="absolute inset-0 rounded-full border-2 border-line-strong" />
                      <Loader2 data-step-spin={i} size={20} className="absolute inset-0 animate-spin text-brand opacity-0" aria-hidden />
                      <CircleCheck data-step-done={i} size={20} className="absolute inset-0 bg-panel text-signal" aria-hidden />
                    </span>
                    <span className="text-[15px] font-medium text-text">{s.name}</span>
                    <span data-step-result={i} className="tnum ml-auto font-mono text-[13px] text-text-muted">
                      {s.result}
                    </span>
                  </div>
                  <p data-step-stream={i} className="ml-8 overflow-hidden font-mono text-[12px] leading-6 text-text-muted">
                    {s.stream}
                    <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-brand align-middle" />
                  </p>
                </li>
              ))}
            </ol>
          </div>
          </GlowBorder>

          {/* 완성된 초안 카드: 그림 오른쪽 아래에 떠오른다 */}
          <div data-draft className={floatCard}>
            <div className="flex gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-caution/10 text-caution">
                <TaskIcon size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-text">주문 처리 장애 원인 분석</p>
                <p className="tnum font-mono text-[12px] text-text-muted">검수 대기 │ 파일 6 │ 문항 3</p>
              </div>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-signal">
              <CircleCheck size={14} aria-hidden /> 공개 전 점검 통과
            </p>
          </div>
        </div>
      </div>
      <div data-spine="create-end" aria-hidden className="absolute bottom-0 left-0" />
    </section>
  )
}
