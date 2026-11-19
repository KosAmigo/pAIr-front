---
name: lenis-smooth-scroll
description: How Lenis smooth scrolling is wired in this project (home page only) — GSAP ticker sync, ScrollTrigger updates, reduced motion, sharing the instance through LenisContext, programmatic scrollTo, and cleanup. Use when touching Lenis, smooth scroll, scroll-linked effects on the home page, or adding scroll behavior to another page.
---

# Lenis smooth scroll (pAIr)

Lenis 1.3 runs **only on the home page** (`frontend/src/pages/Home.tsx`). Home is lazy-loaded, so Lenis and GSAP stay out of the work-screen bundle. Do not add Lenis to work screens (self-check, exam, console) — they use native scroll.

## Setup (already in Home.tsx)

```tsx
useEffect(() => {
  if (prefersReducedMotion()) return            // reduced motion → no Lenis, native scroll
  const l = new Lenis({ lerp: 0.1 })
  l.on('scroll', ScrollTrigger.update)          // keep ScrollTrigger in sync
  const tick = (t: number) => l.raf(t * 1000)   // gsap.ticker gives seconds, Lenis wants ms
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)                   // no catch-up jumps after a frame drop
  lenis.current = l
  return () => { gsap.ticker.remove(tick); l.destroy(); lenis.current = null }
}, [])
```

Rules:
- Drive Lenis from **`gsap.ticker`**, never a second `requestAnimationFrame` loop.
- Create it in `useEffect` and **destroy it on unmount** (route change away from `/`).
- `home.css` holds Lenis' required CSS (`html.lenis`, `.lenis-smooth`, `.lenis-stopped`). Keep it.
- No scroll snap and no ScrollTrigger `pin` on the home page (DESIGN.md §7-1, decided 2026-11-18/19).

## Sharing the instance

The instance exists only after mount, so it is shared as a **ref** through `LenisContext` (`pages/home/motion.ts`):

```tsx
const lenisRef = useLenis()            // RefObject<Lenis | null> | null
scrollToId(lenisRef, 'replay')         // smooth with Lenis, instant scrollIntoView without
```

Always read `.current` at call time and handle `null` (reduced motion or not yet mounted).

## Reading scroll position

- For scroll-linked visuals prefer **ScrollTrigger** (`scrub`, `start`/`end`) — it already receives Lenis updates.
- For per-frame custom work (e.g. the Spine line), read `getBoundingClientRect()` inside a `requestAnimationFrame` loop or ScrollTrigger callback; it works with or without Lenis.
- After layout changes (fonts loaded, images), call `ScrollTrigger.refresh()`.

## Modals and nested scrollers

- Opening a modal on the home page: `lenisRef.current?.stop()`, and `start()` on close.
- An inner scrollable box must carry `data-lenis-prevent` so Lenis does not hijack its wheel events.

## Reduced motion

`prefersReducedMotion()` → no Lenis at all. Every GSAP effect is created inside `gsap.matchMedia().add(MOTION_OK, …)` so content is fully visible without motion.
