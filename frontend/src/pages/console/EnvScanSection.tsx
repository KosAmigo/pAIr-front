// 환경 점검 사진(방 360도 방향별, 책상 위). 콘솔 "점검 미통과" 탭에서만 보여 준다.
import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { cx } from '../../components/cx'
import { consoleApi, type EnvScanPhotoView } from '../../consoleApi'

/** 있으면 안 되는 물체(감지 이름 → 화면 이름). 방 스캔에서 잡히면 감독관이 사진으로 확인하고 치우도록 안내한다 */
const SUSPECT_LABEL: Record<string, string> = { person: '다른 사람', 'cell phone': '휴대폰', book: '책', tv: '화면', laptop: '화면' }

/** 이 사진에서 잡힌 의심 물체 이름 (중복 없이) */
function suspectsOf(f: EnvScanPhotoView): string[] {
  return [...new Set(f.objects.map((o) => SUSPECT_LABEL[o]).filter((x): x is string => !!x))]
}

/** 방향 이름: 방 스캔은 "방 90°", 책상은 "책상 위" */
function scanLabel(f: EnvScanPhotoView): string {
  return f.stage === 'DESK' ? '책상 위' : f.angle === null ? '방' : `방 ${f.angle}°`
}

/**
 * 환경 점검 사진(방 360도 방향별, 책상 위). 있으면 안 되는 물체가 감지된 장면이 있으면 먼저 펼쳐 감독관이 확인하게 한다
 * (방 스캔은 막지 않고 경고만 남기므로, 감독관이 사진을 보고 치우도록 안내한다. 응시자가 "휴대폰이 아니다"라고 답한 경우도 근거가 된다).
 */
export function EnvScanSection({ sessionId, photos }: { sessionId: number; photos: EnvScanPhotoView[] }) {
  const flagged = photos.filter((f) => suspectsOf(f).length > 0).length
  return (
    <details className="border-b border-line px-4 py-3" open={flagged > 0}>
      <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-text">
        환경 점검 사진 {photos.length}장
        {flagged > 0 && <span className="rounded-sm bg-caution/15 px-1.5 py-0.5 text-[12px] font-semibold text-caution">확인 필요 {flagged}장</span>}
      </summary>
      {flagged > 0 && (
        <p className="mt-2 text-[12px] leading-5 break-keep text-text-muted">
          표시된 사진에서 있으면 안 되는 물체가 감지됐습니다. 응시자에게는 경고만 보여 주고 막지 않았습니다. 사진을 확인하고 필요하면 치우도록 안내해 주세요.
        </p>
      )}
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {photos.map((f) => (
          <li key={f.id} className="flex flex-col gap-1">
            <ScanThumb sessionId={sessionId} photo={f} />
            <span className="flex flex-wrap items-center gap-x-1 text-[12px] text-text-muted">
              {scanLabel(f)}
              {suspectsOf(f).length > 0 && <span className="font-semibold text-caution">{suspectsOf(f).join('·')}?</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function ScanThumb({ sessionId, photo }: { sessionId: number; photo: EnvScanPhotoView }) {
  const [state, setState] = useState<{ id: number; url?: string; error?: string } | null>(null)
  useEffect(() => {
    if (photo.deleted) return
    let alive = true
    let url: string | undefined
    consoleApi.envScanImageUrl(sessionId, photo.id).then(
      (u) => {
        if (!alive) return URL.revokeObjectURL(u)
        url = u
        setState({ id: photo.id, url: u })
      },
      (e: unknown) => alive && setState({ id: photo.id, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [sessionId, photo.id, photo.deleted])
  const cur = state?.id === photo.id ? state : null
  if (cur?.url) {
    return (
      <a href={cur.url} target="_blank" rel="noreferrer" title="크게 보기">
        <img src={cur.url} alt={`환경 점검 사진 ${scanLabel(photo)}`} className={cx('aspect-[4/3] w-full rounded-md object-cover', suspectsOf(photo).length > 0 && 'ring-2 ring-caution')} />
      </a>
    )
  }
  return (
    <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-panel-raised text-text-muted">
      {photo.deleted || cur?.error ? <ImageOff size={20} aria-hidden /> : <Loader2 size={18} className="animate-spin text-brand" aria-hidden />}
    </span>
  )
}
