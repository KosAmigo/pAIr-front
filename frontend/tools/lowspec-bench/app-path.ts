// 실제 앱 코드(createPcBackend, frameLoop)로 감독 루프를 돌려 메인 스레드 부하와 분석 속도를 잰다.
import { PC_MIN_ANALYZE_INTERVAL_MS } from '../../src/proctor/core/frameBudget.ts'
import { perfVerdict, summarizePerf } from '../../src/proctor/check/perfCheck.ts'
import { measurePerf } from '../../src/proctor/check/perfProbe.ts'
import { frameLoop } from '../../src/proctor/vision/camera.ts'
import { createPcBackend } from '../../src/proctor/vision/visionBackendFactory.ts'

const FACE_IMAGE = 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg' // MediaPipe 공식 샘플 (얼굴 1명)
const WARMUP = 5
const params = new URLSearchParams(location.search)
const vision = params.get('vision') === 'main' ? 'main' : 'worker'
const secs = Number(params.get('secs') ?? 30)
const delegate = params.get('delegate') === 'gpu' ? 'GPU' : 'CPU'

const out = document.getElementById('out') as HTMLPreElement
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0
}
const r1 = (x: number) => Math.round(x * 10) / 10

async function makeFaceVideo(): Promise<HTMLVideoElement> {
  const blob = await (await fetch(FACE_IMAGE)).blob()
  const img = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext('2d')!
  let t = 0
  const draw = () => {
    t += 0.05
    ctx.fillStyle = '#222'
    ctx.fillRect(0, 0, 640, 480)
    const scale = Math.min(640 / img.width, 480 / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (640 - w) / 2 + Math.sin(t) * 2, (480 - h) / 2, w, h) // 프레임이 계속 갱신되도록 아주 조금 흔든다
    requestAnimationFrame(draw)
  }
  draw()
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.srcObject = canvas.captureStream(30)
  Object.assign(v.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', left: '0', top: '0' })
  document.body.appendChild(v)
  await v.play()
  while (v.readyState < 2) await new Promise((r) => setTimeout(r, 50))
  return v
}

async function run() {
  const result: Record<string, unknown> = { vision, secs, delegate, cores: navigator.hardwareConcurrency, search: location.search }
  try {
    out.textContent = '준비 중...'
    const video = await makeFaceVideo()
    const t0 = performance.now()
    let reason: string | null = null
    const backend = await createPcBackend({
      loadMainModels: async () => {
        const m = await import('../../src/proctor/vision/models.ts')
        const [face, pose, hand] = await Promise.all([m.createFaceLandmarker(), m.createPoseLandmarker(), m.createHandLandmarker()])
        return { face, pose, hand }
      },
      delegate,
      enabled: true,
      force: vision,
      onFallback: (r) => { reason = String((r as Error)?.message ?? r) },
    })
    // 메인 방식은 첫 분석에서 모델을 불러오므로 워밍업에 포함한다
    for (let i = 0; i < WARMUP; i++) await backend.analyzePc(video, performance.now())
    result.readyMs = Math.round(performance.now() - t0)
    result.backend = backend.kind
    result.fallbackReason = reason
    backend.resetPc()
    // 모델을 올린 직후의 정리 작업(컴파일·GC)이 측정에 섞이지 않게 잠시 쉰다
    await new Promise((r) => setTimeout(r, 3000))

    if (params.get('mode') === 'probe') {
      // 환경 점검의 자가 측정(measurePerf + perfVerdict)을 그대로 돌려 판정이 어떻게 나오는지 본다
      const sample = await measurePerf({ vision: backend, video, isCancelled: () => false })
      const verdict = perfVerdict(sample)
      result.probe = { summary: summarizePerf(sample), verdict }
      backend.dispose()
      ;(window as unknown as { __result: unknown }).__result = result
      out.textContent = JSON.stringify(result, null, 2)
      return
    }

    const analysisMs: number[] = []
    const frameDeltas: number[] = []
    const timerLag: number[] = []
    const longTasks: number[] = []
    let lastFaceCount = -1
    let running = true
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration))).observe({ entryTypes: ['longtask'] })
    } catch { /* 미지원 */ }
    let lastRaf = performance.now()
    const raf = (t: number) => { if (!running) return; frameDeltas.push(t - lastRaf); lastRaf = t; requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
    // 타이머가 얼마나 늦게 도는지 = 타이핑 같은 입력이 얼마나 밀리는지의 대용
    let expected = performance.now() + 10
    const lagTimer = setInterval(() => { const n = performance.now(); timerLag.push(Math.max(0, n - expected)); expected = n + 10 }, 10)

    const started = performance.now()
    await new Promise<void>((resolve) => {
      const stop = frameLoop(
        video,
        async (now) => {
          const s = performance.now()
          const f = await backend.analyzePc(video, now)
          analysisMs.push(performance.now() - s)
          lastFaceCount = f.faceCount
          out.textContent = `측정 중 ${Math.round((performance.now() - started) / 1000)}/${secs}초 · ${analysisMs.length}회`
          if (performance.now() - started >= secs * 1000) { stop(); resolve() }
        },
        { minIntervalMs: PC_MIN_ANALYZE_INTERVAL_MS },
      )
    })
    running = false
    clearInterval(lagTimer)
    const elapsed = (performance.now() - started) / 1000
    const fd = [...frameDeltas].sort((a, b) => a - b)
    result.analysis = { n: analysisMs.length, perSec: r1(analysisMs.length / elapsed), p50: r1(pct(analysisMs, 50)), p95: r1(pct(analysisMs, 95)), max: r1(Math.max(...analysisMs)) }
    result.facesDetected = lastFaceCount
    result.ui = {
      fps: r1(frameDeltas.length / elapsed),
      p95FrameMs: r1(pct(fd, 95)),
      over50ms: frameDeltas.filter((d) => d > 50).length,
      over100ms: frameDeltas.filter((d) => d > 100).length,
      frames: frameDeltas.length,
    }
    result.timerLagMs = { p50: r1(pct(timerLag, 50)), p95: r1(pct(timerLag, 95)), p99: r1(pct(timerLag, 99)), max: r1(Math.max(...timerLag)) }
    const blocked = longTasks.reduce((a, b) => a + b, 0)
    result.longTasks = { count: longTasks.length, totalMs: Math.round(blocked), blockedPct: r1((blocked / (elapsed * 1000)) * 100) }
    backend.dispose()
  } catch (e) {
    result.error = String((e as Error)?.message ?? e)
  }
  ;(window as unknown as { __result: unknown }).__result = result
  out.textContent = JSON.stringify(result, null, 2)
}

// 드라이버가 코어 제한을 건 뒤 시작할 수 있게, 자동 시작하지 않는다
;(window as unknown as { __start: () => Promise<void> }).__start = run
document.getElementById('start')!.addEventListener('click', () => void run())
