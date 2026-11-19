import { useEffect, useRef } from 'react'
import { duration, ms, shouldAnimate } from '../../lib/motion'

const TOKENS = ['--color-brand', '--color-brand-blue', '--color-branch-3', '--color-branch-2', '--color-stage-brand']
const COUNT = 90

/**
 * 브랜드 색 입자가 한 번 터지는 축하 연출 (DESIGN.md §3.7). 제출 완료, 리포트 첫 열람에만.
 * fire 가 true 가 되는 순간 한 번 터진다. 꾸밈이라 움직임 줄이기·저사양에서는 그리지 않는다.
 * origin: 화면 비율 좌표(0–1). 기본은 화면 가운데 조금 위.
 */
export function Particles({ fire, origin = { x: 0.5, y: 0.4 } }: { fire: boolean; origin?: { x: number; y: number } }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!fire || !canvas || !shouldAnimate()) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    const css = getComputedStyle(document.documentElement)
    const colors = TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean)
    const ox = origin.x * W
    const oy = origin.y * H
    const parts = Array.from({ length: COUNT }, () => {
      const a = Math.random() * Math.PI * 2
      const v = 4 + Math.random() * 9
      return {
        x: ox,
        y: oy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 4,
        r: 2 + Math.random() * 3.5,
        rot: Math.random() * Math.PI,
        c: colors[Math.floor(Math.random() * colors.length)],
        sq: Math.random() > 0.5,
      }
    })
    const total = ms(duration.pulse)
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = (now - start) / total
      ctx.clearRect(0, 0, W, H)
      if (p >= 1) return
      ctx.globalAlpha = 1 - p * p
      for (const q of parts) {
        q.vy += 0.28
        q.vx *= 0.985
        q.x += q.vx
        q.y += q.vy
        q.rot += 0.1
        ctx.fillStyle = q.c
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.rot)
        if (q.sq) ctx.fillRect(-q.r, -q.r / 2, q.r * 2, q.r)
        else {
          ctx.beginPath()
          ctx.arc(0, 0, q.r, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, W, H)
    }
  }, [fire, origin.x, origin.y])
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />
}
