// DESIGN.md §7-1 초기화면(소개 무대). 스크롤하며 pAIr를 자랑하는 페이지.
// 이 파일과 home/ 폴더는 App.tsx에서 lazy 로 불러, GSAP·Lenis가 작업 화면 번들에 섞이지 않게 한다.
import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import './home/home.css'
import CreateSection from './home/CreateSection'
import Hero from './home/Hero'
import HomeFooter from './home/HomeFooter'
import HomeHeader from './home/HomeHeader'
import LiveSection from './home/LiveSection'
import ProctorSection from './home/ProctorSection'
import ReplaySection from './home/ReplaySection'
import ReportSection from './home/ReportSection'
import ShaderBackground from './home/ShaderBackground'
import Spine from './home/Spine'
import { LenisContext, MOTION_OK, ScrollTrigger, gsap, prefersReducedMotion, useGSAP } from './home/motion'

export default function Home() {
  const lenis = useRef<Lenis | null>(null)
  const page = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)

  // Lenis 부드러운 스크롤 (초기화면에서만). GSAP 시계에 묶어 ScrollTrigger와 맞춘다.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const l = new Lenis({ lerp: 0.1 })
    l.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => l.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    lenis.current = l
    return () => {
      gsap.ticker.remove(tick)
      l.destroy()
      lenis.current = null
    }
  }, [])

  // 섹션 머리 공통 등장: 줄 단위로 아래에서 올라온다
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
          gsap.from(el.children, {
            y: 32,
            opacity: 0,
            duration: 0.7,
            stagger: 0.08,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 82%' },
          })
        })
      })
      // 폰트가 늦게 오면 높이가 바뀌므로 다시 잰다
      document.fonts?.ready.then(() => ScrollTrigger.refresh())
    },
    { scope: page },
  )

  return (
    <LenisContext.Provider value={lenis}>
      <div ref={page} className="home-root relative min-h-full overflow-x-clip bg-bg">
        <div className="aurora" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="home-dots" aria-hidden />
        <ShaderBackground className="absolute inset-x-0 top-0 z-0 h-screen min-h-[720px]" />

        <HomeHeader />

        <main className="relative z-10">
          <div ref={content} className="relative mx-auto max-w-[1264px] px-8">
            <Spine rootRef={content} />
            <Hero />
            <ReplaySection />
            <ReportSection />
            <LiveSection />
            <CreateSection />
            <ProctorSection />
          </div>
        </main>

        <HomeFooter />
      </div>
    </LenisContext.Provider>
  )
}
