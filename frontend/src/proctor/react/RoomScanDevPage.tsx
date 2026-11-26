// 방 360도 스캔 개발 페이지: /dev/room-scan (개발 모드에서만 라우트가 있다). 휴대폰 브라우저로 연다.
// 가로 12칸(시작 각도 기준 상대 각도) → 세로 5단계(beta) 순서로 찍는다. 센서가 없거나 거부되면 사진 6장 수동 모드.
// 분석은 개발용 프록시 /vision-dev/v1/scan (Bearer 키는 프록시가 붙인다). 결과가 나빠도 막지 않는다.
// 판정·계산은 check/roomScan.ts 의 순수 함수.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, RotateCcw, ScanLine } from 'lucide-react'
import { Button } from '../../components/ui'
import {
  DEFAULT_CAPTURE,
  H_NAMES,
  H_SLOTS,
  HINT_TEXT,
  MANUAL_SLOTS,
  PHOTO_MAX_SIDE,
  V_LABELS,
  V_NAMES,
  allFilled,
  decideScanMode,
  fitSize,
  laplacianVariance,
  meanBrightness,
  nextJpegQuality,
  normalizeBox,
  pickHorizontal,
  pickVertical,
  reasonText,
  relativeAngle,
  rotationSpeed,
  slotLabel,
  toGrayscale,
  type CaptureConfig,
  type Hint,
  type ScanMode,
  type ScanResponse,
  type SensorPermission,
} from '../check/roomScan.ts'

type Photo = { blob: Blob; url: string; at: number; bytes: number; angle: number | null; sharpness: number | null; brightness: number | null; source: 'sensor' | 'manual' }
type Phase = 'idle' | 'starting' | 'scanning'

/** 테스트·현장 조정용: ?speed=25&sharp=30&bright=50 */
function configFromQuery(): CaptureConfig {
  const p = new URLSearchParams(window.location.search)
  const num = (k: string, d: number) => (p.get(k) !== null && !Number.isNaN(Number(p.get(k))) ? Number(p.get(k)) : d)
  return {
    maxRotationDegPerSec: num('speed', DEFAULT_CAPTURE.maxRotationDegPerSec),
    minSharpness: num('sharp', DEFAULT_CAPTURE.minSharpness),
    minBrightness: num('bright', DEFAULT_CAPTURE.minBrightness),
  }
}

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> }

/** iOS 는 버튼 동작 안에서만 부를 수 있다. 두 요청을 await 없이 함께 시작한다 */
async function requestSensorPermission(): Promise<SensorPermission> {
  const o = (window as unknown as { DeviceOrientationEvent?: PermissionApi }).DeviceOrientationEvent
  const m = (window as unknown as { DeviceMotionEvent?: PermissionApi }).DeviceMotionEvent
  if (!o) return 'unsupported'
  const asks = [o, m].filter((x): x is Required<PermissionApi> => typeof x?.requestPermission === 'function').map((x) => x.requestPermission())
  if (asks.length === 0) return 'granted' // Android 등: 권한 창이 없다 (값이 안 오면 2초 뒤 수동)
  try {
    const res = await Promise.all(asks)
    return res.every((r) => r === 'granted') ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

export default function RoomScanDevPage() {
  const cfg = useMemo(() => configFromQuery(), [])
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const smallRef = useRef<HTMLCanvasElement | null>(null)
  const bigRef = useRef<HTMLCanvasElement | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<ScanMode>('waiting')
  const [permission, setPermission] = useState<SensorPermission>('unknown')
  const [photos, setPhotos] = useState<Record<string, Photo>>({})
  const [retake, setRetake] = useState<string | null>(null)
  const [hint, setHint] = useState<Hint | null>(null)
  const [live, setLive] = useState({ rel: 0, beta: 0, speed: 0 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [resultError, setResultError] = useState('')

  // 센서 최신 값은 이벤트마다 리렌더하지 않도록 ref 에 둔다
  const sensor = useRef({ alpha: null as number | null, beta: null as number | null, startAlpha: null as number | null, speed: 0, lastAt: null as number | null })
  const startedAt = useRef(0)
  const capturing = useRef(false)
  const photosRef = useRef(photos)
  const retakeRef = useRef(retake)
  const modeRef = useRef<ScanMode>('waiting')
  const permissionRef = useRef<SensorPermission>('unknown')
  useEffect(() => {
    photosRef.current = photos
    retakeRef.current = retake
  }, [photos, retake])

  const manual = mode === 'manual'
  const names = useMemo(() => (manual ? MANUAL_SLOTS.map((s) => s.name) : [...H_NAMES, ...V_NAMES]), [manual])
  const complete = allFilled(names, photos)

  /** 지금 찍어야 하는 칸의 비어 있음 표 (다시 찍기 중이면 그 칸만 빈 것으로) */
  const filledOf = useCallback((list: readonly string[]) => list.map((n) => (retakeRef.current ? n !== retakeRef.current : photosRef.current[n] !== undefined)), [])

  const grabQuality = useCallback(() => {
    const v = videoRef.current
    if (!v || v.videoWidth === 0) return null
    const c = (smallRef.current ??= document.createElement('canvas'))
    const w = 160
    const h = Math.max(3, Math.round((w * v.videoHeight) / v.videoWidth))
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(v, 0, 0, w, h)
    const gray = toGrayscale(ctx.getImageData(0, 0, w, h).data, w, h)
    return { sharpness: laplacianVariance(gray, w, h), brightness: meanBrightness(gray) }
  }, [])

  /** 현재 화면을 긴 변 960px JPEG(400KB 이하)로 */
  const shoot = useCallback(async (): Promise<{ blob: Blob } | null> => {
    const v = videoRef.current
    if (!v || v.videoWidth === 0) return null
    const { w, h } = fitSize(v.videoWidth, v.videoHeight, PHOTO_MAX_SIDE)
    const c = (bigRef.current ??= document.createElement('canvas'))
    c.width = w
    c.height = h
    c.getContext('2d')?.drawImage(v, 0, 0, w, h)
    let q: number | null = 0.85
    let blob: Blob | null = null
    while (q !== null) {
      blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q ?? 0.85))
      if (!blob) return null
      q = nextJpegQuality(q, blob.size)
    }
    return blob ? { blob } : null
  }, [])

  const store = useCallback(
    async (name: string, source: Photo['source'], q: { sharpness: number | null; brightness: number | null }, angle: number | null) => {
      if (capturing.current) return
      capturing.current = true
      try {
        const shot = await shoot()
        if (!shot) return
        const photo: Photo = { blob: shot.blob, url: URL.createObjectURL(shot.blob), at: Date.now(), bytes: shot.blob.size, angle, source, ...q }
        setPhotos((prev) => {
          if (prev[name]) URL.revokeObjectURL(prev[name].url)
          return { ...prev, [name]: photo }
        })
        setResult(null)
        if (retakeRef.current === name) setRetake(null)
        if (navigator.vibrate) navigator.vibrate(40)
      } finally {
        capturing.current = false
      }
    },
    [shoot],
  )

  // 센서 이벤트
  useEffect(() => {
    if (phase !== 'scanning') return
    const onOri = (e: DeviceOrientationEvent) => {
      if (e.alpha === null && e.beta === null) return
      const s = sensor.current
      s.alpha = e.alpha
      s.beta = e.beta
      if (s.startAlpha === null && e.alpha !== null) s.startAlpha = e.alpha
      s.lastAt = performance.now()
    }
    const onMotion = (e: DeviceMotionEvent) => {
      sensor.current.speed = rotationSpeed(e.rotationRate)
    }
    window.addEventListener('deviceorientation', onOri)
    window.addEventListener('devicemotion', onMotion)
    return () => {
      window.removeEventListener('deviceorientation', onOri)
      window.removeEventListener('devicemotion', onMotion)
    }
  }, [phase])

  // 판정 루프 (100ms)
  useEffect(() => {
    if (phase !== 'scanning') return
    const timer = window.setInterval(() => {
      const s = sensor.current
      const now = performance.now()
      const next = decideScanMode({
        permission: permissionRef.current,
        sinceStartMs: now - startedAt.current,
        sinceLastSampleMs: s.lastAt === null ? null : now - s.lastAt,
      })
      if (next !== modeRef.current) {
        modeRef.current = next
        setMode(next)
      }
      if (next !== 'sensor' || s.alpha === null || s.beta === null || s.startAlpha === null) return
      const rel = relativeAngle(s.alpha, s.startAlpha)
      setLive({ rel, beta: s.beta, speed: s.speed })
      if (capturing.current) return
      const rt = retakeRef.current
      const hFilled = filledOf(H_NAMES)
      const vFilled = filledOf(V_NAMES)
      const hDone = hFilled.every(Boolean)
      // 가로를 다 채우기 전에는 가로만, 다 채우면 세로 (다시 찍기면 그 칸의 종류)
      const stage: 'h' | 'v' = rt ? (rt.startsWith('h') ? 'h' : 'v') : hDone ? 'v' : 'h'
      if (stage === 'v' && vFilled.every(Boolean)) {
        setHint(null)
        return
      }
      // 칸 안에 들어왔을 때만 사진 품질을 잰다 (가벼운 계산이지만 매번 할 필요는 없다)
      const probe = pickHorizontalOrVertical(stage, rel, s.beta, s.speed, hFilled, vFilled, cfg, null)
      if (!probe.inWindow) {
        setHint(null)
        return
      }
      const q = grabQuality()
      const res = pickHorizontalOrVertical(stage, rel, s.beta, s.speed, hFilled, vFilled, cfg, q)
      setHint(res.hint)
      if (res.slot !== null) {
        const name = stage === 'h' ? H_NAMES[res.slot] : V_NAMES[res.slot]
        void store(name, 'sensor', q ?? { sharpness: null, brightness: null }, stage === 'h' ? rel : s.beta)
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [phase, cfg, filledOf, grabQuality, store])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  useEffect(() => stopCamera, [])

  const start = async () => {
    setError('')
    setPhase('starting')
    // 권한 요청은 버튼 동작 안에서 가장 먼저 부른다 (iOS)
    const perm = await requestSensorPermission()
    permissionRef.current = perm
    setPermission(perm)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      streamRef.current = stream
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        await v.play().catch(() => undefined)
      }
    } catch (e) {
      setError(`카메라를 열 수 없어요: ${e instanceof Error ? e.message : String(e)}`)
      setPhase('idle')
      return
    }
    sensor.current = { alpha: null, beta: null, startAlpha: null, speed: 0, lastAt: null }
    startedAt.current = performance.now()
    modeRef.current = 'waiting'
    setMode('waiting')
    setPhase('scanning')
  }

  const reset = () => {
    Object.values(photosRef.current).forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos({})
    setRetake(null)
    setResult(null)
    setResultError('')
    setHint(null)
    stopCamera()
    setPhase('idle')
    setMode('waiting')
  }

  /** 수동 모드 셔터: 첫 빈 칸(다시 찍기면 그 칸)을 찍는다 */
  const manualTarget = manual ? (retake ?? MANUAL_SLOTS.find((s) => !photos[s.name])?.name ?? null) : null
  const shutter = () => {
    if (!manualTarget) return
    void store(manualTarget, 'manual', grabQuality() ?? { sharpness: null, brightness: null }, null)
  }

  const analyze = async () => {
    setBusy(true)
    setResult(null)
    setResultError('')
    try {
      const form = new FormData()
      for (const n of names) form.append('images', photos[n].blob, `${n}.jpg`)
      const r = await fetch('/vision-dev/v1/scan', { method: 'POST', body: form })
      if (!r.ok) throw new Error(`서버 응답 ${r.status}`)
      setResult((await r.json()) as ScanResponse)
    } catch (e) {
      setResultError(`분석에 실패했어요: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** 그 칸의 사진만 지우고 다시 찍게 한다 (센서 모드면 그 방향을 다시 겨냥, 수동이면 셔터) */
  const startRetake = (name: string) => {
    setPhotos((prev) => {
      if (prev[name]) URL.revokeObjectURL(prev[name].url)
      const { [name]: _gone, ...rest } = prev
      return rest
    })
    setRetake(name)
    setResult(null)
    if (phase !== 'scanning') void start()
  }

  const warnNames = new Set(result?.verdict.reasons.flatMap((r) => r.names) ?? [])
  const hDone = H_NAMES.every((n) => photos[n])
  const nearestH = Math.round(live.rel / (360 / H_SLOTS)) % H_SLOTS

  return (
    <main className="mobile-layout mx-auto flex min-h-full max-w-md flex-col gap-4 bg-bg p-4 pb-24 text-text">
      <header className="flex items-center gap-2">
        <ScanLine className="size-5 text-brand" aria-hidden />
        <h1 className="text-lg font-bold text-balance">방 360도 스캔 (개발용)</h1>
      </header>

      <section className="relative overflow-hidden rounded-2xl bg-black" aria-label="카메라">
        <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" data-testid="video" />
        {phase !== 'scanning' && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 text-center text-sm font-semibold text-white">
            {phase === 'starting' ? '카메라와 센서를 준비하고 있어요' : '스캔 시작을 누르면 카메라와 방향 센서를 사용해요'}
          </div>
        )}
        {phase === 'scanning' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 p-3">
            <p className="rounded-xl bg-black/65 px-3 py-2 text-center text-sm font-bold text-white" aria-live="polite" data-testid="guide">
              {guideText({ mode, hint, manualTarget, hDone, vDone: V_NAMES.every((n) => photos[n]), retake })}
            </p>
          </div>
        )}
      </section>

      {error && <p className="rounded-xl bg-alert/10 px-3 py-2 text-sm font-semibold text-alert">{error}</p>}

      {phase === 'idle' && (
        <Button variant="primary" onClick={start} className="h-12 text-base font-bold" data-testid="start">
          스캔 시작
        </Button>
      )}

      {phase === 'scanning' && !manual && (
        <section className="flex flex-col items-center gap-3">
          <ProgressRing filled={H_NAMES.map((n) => !!photos[n])} current={mode === 'sensor' ? nearestH : -1} />
          <div className="flex flex-wrap justify-center gap-1.5" data-testid="v-steps">
            {V_NAMES.map((n, i) => (
              <span key={n} className={`rounded-full px-2.5 py-1 text-xs font-bold ${photos[n] ? 'bg-signal text-on-accent' : 'bg-panel-raised text-text-muted'}`}>
                {V_LABELS[i]}
              </span>
            ))}
          </div>
          <p className="font-mono text-xs text-text-faint tabular-nums">
            rel {live.rel.toFixed(0)}° · beta {live.beta.toFixed(0)}° · rot {live.speed.toFixed(0)}°/s
          </p>
        </section>
      )}

      {phase === 'scanning' && manual && (
        <section className="flex flex-col items-center gap-3">
          <p className="text-sm font-semibold text-text-muted text-pretty" data-testid="manual-note">
            {permission === 'denied' ? '방향 센서를 쓸 수 없어서' : '센서 값이 들어오지 않아서'} 사진 6장을 안내대로 찍는 방식으로 바꿨어요.
          </p>
          <button
            type="button"
            onClick={shutter}
            disabled={!manualTarget}
            className="grid size-16 place-items-center rounded-full bg-brand text-on-accent transition-transform active:scale-95 disabled:bg-line-strong"
            aria-label="사진 찍기"
            data-testid="shutter"
          >
            <Camera className="size-7" aria-hidden />
          </button>
        </section>
      )}

      {(phase === 'scanning' || Object.keys(photos).length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">
            찍은 사진{' '}
            <span className="font-mono text-text-muted tabular-nums" data-testid="count">
              {names.filter((n) => photos[n]).length}/{names.length}
            </span>
          </h2>
          <ul className="grid grid-cols-4 gap-1.5">
            {names.map((n) => (
              <li key={n} className="relative aspect-square overflow-hidden rounded-lg bg-panel-raised" data-testid={`slot-${n}`} data-filled={photos[n] ? 'yes' : 'no'}>
                {photos[n] && (
                  <>
                    <img src={photos[n].url} alt={slotLabel(n)} className="size-full object-cover" />
                    <ThumbBoxes name={n} result={result} url={photos[n].url} />
                  </>
                )}
                <span className={`absolute bottom-0 left-0 rounded-tr-md px-1 font-mono text-[10px] font-semibold ${warnNames.has(n) ? 'bg-alert text-on-accent' : 'bg-black/60 text-white'}`}>{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {complete && (
        <Button variant="primary" onClick={analyze} disabled={busy} className="h-12 text-base font-bold" data-testid="analyze">
          {busy ? '분석하는 중이에요' : '분석'}
        </Button>
      )}
      {!complete && phase !== 'idle' && (
        <Button disabled className="h-12 text-base font-bold" data-testid="analyze-disabled">
          분석 (모든 칸을 채우면 켜져요)
        </Button>
      )}

      {resultError && (
        <p className="rounded-xl bg-alert/10 px-3 py-2 text-sm font-semibold text-alert" data-testid="result-error">
          {resultError}
        </p>
      )}

      {result && (
        <section className="flex flex-col gap-3 rounded-2xl bg-panel p-4" data-testid="result" aria-live="polite">
          {result.verdict.status === 'PASS' ? (
            <p className="text-base font-bold text-signal" data-testid="verdict-pass">
              통과했어요. 방에 이상한 물건이 보이지 않아요
            </p>
          ) : (
            <>
              <p className="text-base font-bold text-caution" data-testid="verdict-warn">
                확인이 필요해요
              </p>
              <ul className="flex flex-col gap-3">
                {result.verdict.reasons.map((r) => (
                  <li key={r.code} className="flex flex-col gap-2" data-testid={`reason-${r.code}`}>
                    <p className="text-sm font-semibold text-pretty">{reasonText(r.code)}</p>
                    <div className="flex flex-wrap gap-2">
                      {r.names.map((n) => (
                        <div key={n} className="flex w-24 flex-col gap-1">
                          <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-panel-raised">
                            {photos[n] && <img src={photos[n].url} alt={slotLabel(n)} className="size-full object-cover" />}
                            <ThumbBoxes name={n} result={result} url={photos[n]?.url ?? ''} force />
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => startRetake(n)} data-testid={`retake-${n}`}>
                            <RotateCcw className="size-3.5" aria-hidden /> 다시 찍기
                          </Button>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-muted text-pretty">경고가 있어도 시험은 볼 수 있어요. 감독관이 사진을 확인해요.</p>
            </>
          )}
          {result.ms !== undefined && <p className="font-mono text-xs text-text-faint tabular-nums">{result.ms} ms</p>}
        </section>
      )}

      {Object.keys(photos).length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-panel p-3" data-testid="log">
          <h2 className="text-sm font-bold">기록 (개발용)</h2>
          <table className="w-full text-left font-mono text-[11px] tabular-nums">
            <thead className="text-text-faint">
              <tr>
                <th>name</th>
                <th>angle</th>
                <th>KB</th>
                <th>sharp</th>
                <th>bright</th>
              </tr>
            </thead>
            <tbody>
              {names
                .filter((n) => photos[n])
                .map((n) => (
                  <tr key={n}>
                    <td>{n}</td>
                    <td>{photos[n].angle === null ? '-' : `${photos[n].angle.toFixed(0)}°`}</td>
                    <td>{(photos[n].bytes / 1024).toFixed(0)}</td>
                    <td>{photos[n].sharpness?.toFixed(0) ?? '-'}</td>
                    <td>{photos[n].brightness?.toFixed(0) ?? '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {result && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-panel-sunken p-2 font-mono text-[10px]" data-testid="raw">
              {JSON.stringify(result, null, 1)}
            </pre>
          )}
          <Button variant="secondary" onClick={reset} data-testid="reset">
            처음부터 다시
          </Button>
        </section>
      )}
    </main>
  )
}

function pickHorizontalOrVertical(
  stage: 'h' | 'v',
  rel: number,
  beta: number,
  speed: number,
  hFilled: boolean[],
  vFilled: boolean[],
  cfg: CaptureConfig,
  q: { sharpness: number; brightness: number } | null,
) {
  const quality = { speed, sharpness: q?.sharpness ?? null, brightness: q?.brightness ?? null }
  return stage === 'h' ? pickHorizontal(rel, { filled: hFilled, quality, cfg }) : pickVertical(beta, { filled: vFilled, quality, cfg })
}

function guideText(a: { mode: ScanMode; hint: Hint | null; manualTarget: string | null; hDone: boolean; vDone: boolean; retake: string | null }): string {
  if (a.mode === 'waiting') return '센서를 확인하고 있어요'
  if (a.mode === 'manual') {
    const slot = MANUAL_SLOTS.find((s) => s.name === a.manualTarget)
    return slot ? slot.prompt : '모두 찍었어요. 분석을 눌러 주세요'
  }
  if (a.hint) return HINT_TEXT[a.hint]
  if (a.retake) return `${slotLabel(a.retake)} 쪽을 다시 비춰 주세요`
  if (!a.hDone) return '선 채로 천천히 한 바퀴 돌아 주세요'
  if (!a.vDone) return '이제 바닥에서 천장까지 천천히 들어 올려 주세요'
  return '모두 찍었어요. 분석을 눌러 주세요'
}

/** 12칸 진행 원: 채운 칸은 초록, 지금 향하는 칸은 보라, 빈 칸은 회색 */
function ProgressRing({ filled, current }: { filled: boolean[]; current: number }) {
  const r = 44
  const c = 52
  return (
    <svg viewBox="0 0 104 104" className="size-28" role="img" aria-label={`가로 ${filled.filter(Boolean).length}/12칸`} data-testid="ring">
      {filled.map((f, i) => {
        const a0 = ((i * 30 - 13) * Math.PI) / 180
        const a1 = ((i * 30 + 13) * Math.PI) / 180
        const pt = (a: number) => `${c + r * Math.sin(a)},${c - r * Math.cos(a)}`
        const color = f ? 'var(--color-signal)' : i === current ? 'var(--color-brand)' : 'var(--color-line-strong)'
        return <path key={i} d={`M${pt(a0)} A${r},${r} 0 0 1 ${pt(a1)}`} stroke={color} strokeWidth="9" strokeLinecap="round" fill="none" data-filled={f ? 'yes' : 'no'} />
      })}
      <text x={c} y={c + 5} textAnchor="middle" className="fill-text text-[15px] font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {filled.filter(Boolean).length}/12
      </text>
    </svg>
  )
}

/** 분석 결과의 box 를 사진 위에 그린다 (경고 칸만) */
function ThumbBoxes({ name, result, url, force }: { name: string; result: ScanResponse | null; url: string; force?: boolean }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!url) return
    const img = new Image()
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }, [url])
  const item = result?.items.find((i) => i.name === name)
  const warn = result?.verdict.reasons.some((r) => r.names.includes(name))
  if (!item || !size || !(force || warn)) return null
  return (
    <>
      {item.objects.map((o, i) => {
        const [x0, y0, x1, y1] = normalizeBox(o.box, size.w, size.h)
        return (
          <span
            key={i}
            className="absolute border-2 border-alert"
            style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }}
            data-testid="box"
          >
            <span className="absolute -top-4 left-0 whitespace-nowrap bg-alert px-1 font-mono text-[9px] font-semibold text-on-accent">{o.label}</span>
          </span>
        )
      })}
    </>
  )
}
