// 감독 오탐률 측정 도구 (관리자, /proctor/lab). 영상은 저장하지도 보내지도 않는다.
// 조건(조명·각도·안경)을 고르고 N분 동안 정상 응시처럼 앉아 있으면, 그 사이 뜬 PC 캠 경고를 모두 오탐으로 센다.
// 결과는 이 브라우저(localStorage)에만 쌓이고 CSV 로 내보낸다. 기준값(PC_THRESHOLDS)을 고치면 버전이 바뀌어 전후를 비교한다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Play, Square, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { camHub } from '../camHub.ts'
import { PC_RULES, PC_THRESHOLDS } from '../core/pcRules.ts'
import {
  ANGLE_LABEL,
  conditionLabel,
  EYEWEAR_LABEL,
  LIGHTING_LABEL,
  runsCsv,
  summarize,
  thresholdsVersion,
  totalOf,
  type Angle,
  type Eyewear,
  type FpCondition,
  type FpRun,
  type Lighting,
} from '../core/fpStats.ts'
import { CamPreview } from './CamPreview.tsx'
import { useCamHub } from './useCamHub.ts'

const KEY = 'pair:fp-runs'
const VERSION = thresholdsVersion(PC_THRESHOLDS)
const RULE_KINDS = PC_RULES.map((r) => r.kind)
const MINUTE_CHOICES = [1, 3, 5, 10]

function loadRuns(): FpRun[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FpRun[]) : []
  } catch {
    return []
  }
}
function saveRuns(runs: FpRun[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs))
  } catch {
    /* 저장 못 해도 이번 화면에서는 남는다 */
  }
}

type Active = { condition: FpCondition; startedAt: number; endsAt: number; counts: Record<string, number> }

export default function FalsePositiveLab() {
  const cam = useCamHub()
  const [condition, setCondition] = useState<FpCondition>({ lighting: 'normal', angle: 'front', eyewear: 'none' })
  const [minutes, setMinutes] = useState(3)
  const [note, setNote] = useState('')
  const [runs, setRuns] = useState<FpRun[]>(loadRuns)
  const [active, setActive] = useState<Active | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const seen = useRef(new Set<string>())

  // 측정 중: 카메라 허브(외부 저장소)를 구독해서, 감시가 실제로 시작된 순간부터 시간을 재고
  // 그 뒤 새로 뜬 PC 캠 경고를 센다 (보정 3초 동안은 세지 않음)
  const running = active != null
  useEffect(() => {
    if (!running) return
    const unsubscribe = camHub.subscribe(() => {
      const st = camHub.getState()
      setActive((a) => {
        if (!a) return a
        let next = a
        if (st.monitor === 'monitoring' && !a.startedAt) {
          const t = Date.now()
          next = { ...next, startedAt: t, endsAt: t + minutes * 60_000 }
        }
        const w = st.lastWarning
        if (w && next.startedAt && w.source === 'PC_CAM' && !seen.current.has(w.id)) {
          seen.current.add(w.id)
          next = { ...next, counts: { ...next.counts, [w.kind]: (next.counts[w.kind] ?? 0) + 1 } }
        }
        return next
      })
    })
    return () => {
      unsubscribe()
    }
  }, [running, minutes])

  const finish = (a: Active, endAt: number) => {
    const run: FpRun = {
      id: `run-${endAt}`,
      at: new Date(endAt).toISOString(),
      condition: a.condition,
      durationSec: a.startedAt ? Math.round((endAt - a.startedAt) / 1000) : 0,
      counts: a.counts,
      version: VERSION,
      note: note.trim() || undefined,
    }
    const next = [run, ...runs]
    setRuns(next)
    saveRuns(next)
    setActive(null)
    void camHub.stop()
  }

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (active.startedAt && t >= active.endsAt) finish(active, active.endsAt)
    }, 500)
    return () => window.clearInterval(id)
  })

  useEffect(() => () => void camHub.stop(), [])

  const start = () => {
    seen.current = new Set(camHub.getState().log.map((l) => l.id))
    setActive({ condition, startedAt: 0, endsAt: 0, counts: {} })
    camHub.startMonitoring(0).catch(() => setActive(null))
  }

  const rows = useMemo(() => summarize(runs), [runs])
  const exportCsv = () => {
    const blob = new Blob([runsCsv(runs, RULE_KINDS)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `proctor-false-positives-${VERSION}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const left = active?.startedAt ? Math.max(0, Math.ceil((active.endsAt - now) / 1000)) : null

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <header className="flex items-end gap-4">
        <div>
          <p className="label">PROCTOR LAB</p>
          <h1 className="text-[24px] font-bold text-text">감독 오탐률 측정</h1>
          <p className="mt-1 text-[14px] text-text-muted">
            부정행위 없이 평소처럼 문제를 푸는 자세로 앉아 있으세요. 그동안 뜬 경고는 모두 오탐으로 셉니다. 영상은 저장하거나 보내지 않습니다.
          </p>
        </div>
        <Link to="/console" className="ml-auto text-[14px] font-semibold text-brand hover:underline">
          콘솔로
        </Link>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-6 shadow-sm">
          <Choice label="조명" value={condition.lighting} labels={LIGHTING_LABEL} disabled={!!active}
            onChange={(v) => setCondition({ ...condition, lighting: v as Lighting })} />
          <Choice label="카메라 각도" value={condition.angle} labels={ANGLE_LABEL} disabled={!!active}
            onChange={(v) => setCondition({ ...condition, angle: v as Angle })} />
          <Choice label="안경" value={condition.eyewear} labels={EYEWEAR_LABEL} disabled={!!active}
            onChange={(v) => setCondition({ ...condition, eyewear: v as Eyewear })} />
          <Choice label="측정 시간" value={String(minutes)} labels={Object.fromEntries(MINUTE_CHOICES.map((m) => [String(m), `${m}분`]))}
            disabled={!!active} onChange={(v) => setMinutes(Number(v))} />
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-text">
            메모 (선택)
            <input value={note} onChange={(e) => setNote(e.target.value)} disabled={!!active} maxLength={100}
              placeholder="예: 창가 자리, 오후 4시" className="h-10 rounded-sm border border-line-strong bg-panel px-3 text-[15px] font-normal outline-none focus:border-brand" />
          </label>
          <p className="text-[13px] text-text-muted">
            기준값 버전 <span className="font-mono text-text">{VERSION}</span> (proctor/core/pcRules.ts 의 PC_THRESHOLDS 를 고치면 바뀝니다)
          </p>
          <div className="flex gap-2">
            {!active ? (
              <Button variant="primary" onClick={start}>
                <Play size={16} aria-hidden /> 측정 시작
              </Button>
            ) : (
              <Button variant="danger" onClick={() => finish(active, active.startedAt ? Date.now() : 0)}>
                <Square size={16} aria-hidden /> 지금 끝내기
              </Button>
            )}
          </div>
          {cam.error && <p role="alert" className="text-[14px] text-alert">{cam.error}</p>}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-sm">
          <div className="aspect-video overflow-hidden rounded-md bg-stage">
            {cam.camera === 'ready' ? <CamPreview /> : <p className="flex h-full items-center justify-center text-[13px] text-stage-muted">측정을 시작하면 카메라가 켜집니다</p>}
          </div>
          <p className="text-[14px] text-text" aria-live="polite">
            {!active ? '대기' : cam.monitor === 'calibrating' ? `기준 자세 잡는 중 ${Math.round(cam.calibProgress * 100)}%` : left != null ? `측정 중, ${left}초 남음` : '카메라 준비 중'}
          </p>
          {active && (
            <ul className="flex flex-col gap-1 text-[13px]">
              {RULE_KINDS.map((k) => (
                <li key={k} className="flex justify-between">
                  <span className="text-text-muted">{PC_RULES.find((r) => r.kind === k)?.message}</span>
                  <span className="tnum font-mono text-text">{active.counts[k] ?? 0}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
        <header className="flex h-12 items-center gap-3 border-b border-line px-4">
          <span className="label">RESULTS</span>
          <span className="text-[13px] text-text-muted">조건·기준값별 분당 오탐 수 (낮을수록 좋음)</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={exportCsv} disabled={!runs.length}>
              <Download size={14} aria-hidden /> CSV
            </Button>
            <Button size="sm" variant="ghost" disabled={!runs.length || !!active}
              onClick={() => window.confirm('이 브라우저에 쌓인 측정 기록을 모두 지울까요?') && (setRuns([]), saveRuns([]))}>
              <Trash2 size={14} aria-hidden /> 기록 지우기
            </Button>
          </div>
        </header>
        {rows.length === 0 ? (
          <p className="py-12 text-center text-[14px] text-text-muted">아직 측정한 기록이 없습니다.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="h-9 border-b border-line text-left text-[13px] text-text-muted">
                {['기준값', '조건', '측정', '시간(분)', '오탐', '분당 오탐', '규칙별 (분당)'].map((h) => (
                  <th key={h} className="px-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.version}-${conditionLabel(r.condition)}`} className="h-11 border-b border-line last:border-0">
                  <td className="px-4 font-mono text-[13px]">{r.version}{r.version === VERSION && <span className="ml-1 text-brand">(현재)</span>}</td>
                  <td className="px-4">{conditionLabel(r.condition)}</td>
                  <td className="tnum px-4 font-mono">{r.runs}</td>
                  <td className="tnum px-4 font-mono">{r.minutes}</td>
                  <td className="tnum px-4 font-mono">{r.falsePositives}</td>
                  <td className="tnum px-4 font-mono font-semibold">{r.perMinute}</td>
                  <td className="px-4 text-[12px] text-text-muted">
                    {Object.entries(r.byRule).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {runs.length > 0 && (
          <p className="border-t border-line px-4 py-2 text-[12px] text-text-muted">
            측정 {runs.length}회, 마지막: {conditionLabel(runs[0].condition)} {runs[0].durationSec}초 오탐 {totalOf(runs[0])}건
          </p>
        )}
      </section>
    </main>
  )
}

function Choice({ label, value, labels, onChange, disabled }: {
  label: string
  value: string
  labels: Record<string, string>
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-[14px] font-semibold text-text">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(labels).map(([k, text]) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
            className={value === k
              ? 'h-9 rounded-full bg-brand px-4 text-[14px] font-semibold text-on-accent'
              : 'h-9 rounded-full border border-line-strong px-4 text-[14px] text-text hover:bg-panel-raised disabled:opacity-50'}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
