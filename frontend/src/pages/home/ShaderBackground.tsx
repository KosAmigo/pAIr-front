// DESIGN.md §4.3 히어로 WebGL 셰이더 배경. 브랜드 색이 천천히 흐르고, 커서 쪽으로 빛이 살짝 휜다.
// three.js 는 히어로 글자가 먼저 그려진 뒤 동적으로 불러온다(초기화면 청크와도 따로).
// 대체 화면: WebGL2 없음, 움직임 줄이기, 저사양, 첫 프레임이 1초 안에 안 나옴 → 정적 CSS 그라데이션.
import { useEffect, useRef, useState } from 'react'
import { cx } from '../../components/cx'
import { isLowEnd, prefersReduced } from '../../lib/motion'

// 글자 대비를 지키려고 가장 어두운 색도 #C4B5FD 이상 밝게 둔다 (§4.3)
const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;
varying vec2 vUv;

vec3 c0 = vec3(0.965, 0.965, 0.984); // bg #F6F6FB
vec3 c1 = vec3(0.769, 0.710, 0.992); // #C4B5FD 연보라
vec3 c2 = vec3(0.749, 0.827, 0.996); // #BFD3FE 연파랑
vec3 c3 = vec3(0.961, 0.816, 0.996); // #F5D0FE 연분홍

float blob(vec2 p, vec2 c, float r) { return smoothstep(r, 0.0, length(p - c)); }

void main() {
  vec2 uv = vUv;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.06;
  vec2 m = uMouse * vec2(uRes.x / uRes.y, 1.0);
  // 커서 쪽으로 최대 6% 휜다
  p += (m - p) * 0.06 * smoothstep(0.9, 0.0, length(m - p));
  float a = uRes.x / uRes.y;
  float b1 = blob(p, vec2(a * (0.2 + 0.12 * sin(t * 1.3)), 0.75 + 0.1 * cos(t * 1.1)), 0.75);
  float b2 = blob(p, vec2(a * (0.82 + 0.1 * cos(t * 0.9)), 0.62 + 0.14 * sin(t * 1.4)), 0.7);
  float b3 = blob(p, vec2(a * (0.5 + 0.2 * sin(t * 0.7)), 0.25 + 0.1 * sin(t * 1.7)), 0.6);
  vec3 col = c0;
  col = mix(col, c1, b1 * 0.85);
  col = mix(col, c2, b2 * 0.8);
  col = mix(col, c3, b3 * 0.6);
  // 제목 뒤(가운데 위쪽)는 바탕색 쪽으로 밝힌다
  float center = smoothstep(0.55, 0.0, length((uv - vec2(0.5, 0.62)) * vec2(1.4, 1.0)));
  col = mix(col, c0, center * 0.55);
  gl_FragColor = vec4(col, 1.0);
}
`
const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

function canUseWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

export default function ShaderBackground({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  // 처음부터 GL 을 못 쓰는 환경이면 대체 화면으로 시작한다
  const [startMode] = useState<'pending' | 'fallback'>(() =>
    prefersReduced() || isLowEnd() || !canUseWebGL2() ? 'fallback' : 'pending',
  )
  const [mode, setMode] = useState<'pending' | 'gl' | 'fallback'>(startMode)

  useEffect(() => {
    if (startMode === 'fallback') return
    let disposed = false
    let cleanup = () => {}
    const failTimer = window.setTimeout(() => !disposed && setMode((m) => (m === 'gl' ? m : 'fallback')), 1000)

    import('three').then((THREE) => {
      const el = host.current
      if (disposed || !el) return
      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      const scene = new THREE.Scene()
      const camera = new THREE.Camera()
      const uniforms = {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      }
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms }))
      scene.add(mesh)
      el.appendChild(renderer.domElement)
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'

      const resize = () => {
        const w = el.clientWidth
        const h = el.clientHeight
        renderer.setSize(w, h, false)
        uniforms.uRes.value.set(w, h)
      }
      resize()
      const ro = new ResizeObserver(resize)
      ro.observe(el)

      const target = new THREE.Vector2(0.5, 0.5)
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        target.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height)
      }
      window.addEventListener('pointermove', onMove, { passive: true })

      // 화면 밖이거나 탭이 숨겨지면 멈춘다
      let visible = true
      const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
      io.observe(el)

      const start = performance.now()
      let raf = 0
      let first = true
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        if (!visible || document.hidden) return
        uniforms.uTime.value = (now - start) / 1000
        uniforms.uMouse.value.lerp(target, 0.04)
        renderer.render(scene, camera)
        if (first) {
          first = false
          window.clearTimeout(failTimer)
          setMode('gl')
        }
      }
      raf = requestAnimationFrame(tick)

      cleanup = () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
        io.disconnect()
        window.removeEventListener('pointermove', onMove)
        mesh.geometry.dispose()
        ;(mesh.material as InstanceType<typeof THREE.ShaderMaterial>).dispose()
        renderer.dispose()
        renderer.domElement.remove()
      }
    }, () => !disposed && setMode('fallback'))

    return () => {
      disposed = true
      window.clearTimeout(failTimer)
      cleanup()
    }
  }, [startMode])

  return (
    <div
      ref={host}
      aria-hidden
      data-mode={mode}
      className={cx(
        'pointer-events-none overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-160px),transparent)]',
        // 대체 화면(정적 그라데이션). GL 이 뜨면 캔버스가 위를 덮는다
        'hero-shader-fallback',
        'transition-opacity duration-700',
        className,
      )}
    />
  )
}
