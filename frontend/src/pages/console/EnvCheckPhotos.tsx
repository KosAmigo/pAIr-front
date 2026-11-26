// 콘솔: 응시자가 환경 점검에서 찍은 귀·손목 사진. 이어폰·스마트워치는 자동으로 분석하지 않고 감독관이 이 사진으로 확인한다.
// 사진은 로그인 헤더가 필요해 blob URL 로 받는다 (최대 3장).
import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { ErrorState } from '../../components/ErrorState'
import { consoleApi, type EnvCheckPhotoView } from '../../consoleApi'
import { useLoad } from '../../data/consoleSessions'
import { Modal } from './common'
import { fmtTime } from './format'

const STAGE_LABEL: Record<EnvCheckPhotoView['stage'], string> = { EAR_LEFT: '왼쪽 귀', EAR_RIGHT: '오른쪽 귀', WRIST: '손목' }
const STAGE_ORDER: EnvCheckPhotoView['stage'][] = ['EAR_LEFT', 'EAR_RIGHT', 'WRIST']

function usePhotoUrl(sessionId: number, photo: EnvCheckPhotoView) {
  const [state, setState] = useState<{ key: string; url?: string; error?: boolean } | null>(null)
  // 다시 찍은 사진은 같은 번호라서 찍은 시각을 키에 넣어 다시 받는다
  const key = `${photo.id}-${photo.capturedAt}`
  useEffect(() => {
    if (photo.deleted) return
    let alive = true
    let url: string | undefined
    consoleApi.envCheckPhotoUrl(sessionId, photo.id).then(
      (u) => {
        if (!alive) return URL.revokeObjectURL(u)
        url = u
        setState({ key, url: u })
      },
      () => alive && setState({ key, error: true }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [sessionId, photo.id, photo.deleted, key])
  return state?.key === key ? state : null
}

function PhotoTile({ sessionId, photo, onOpen }: { sessionId: number; photo: EnvCheckPhotoView; onOpen: (url: string) => void }) {
  const img = usePhotoUrl(sessionId, photo)
  const label = STAGE_LABEL[photo.stage]
  return (
    <figure className="w-32">
      <button
        type="button"
        disabled={!img?.url}
        onClick={() => img?.url && onOpen(img.url)}
        aria-label={`${label} 사진 크게 보기`}
        className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-sm border border-line bg-panel-raised text-text-faint disabled:cursor-default"
      >
        {photo.deleted || img?.error ? <ImageOff size={16} aria-hidden /> : img?.url ? <img src={img.url} alt={`${label} 사진`} className="size-full object-cover" /> : <Loader2 size={16} className="animate-spin" aria-hidden />}
      </button>
      <figcaption className="mt-1 text-[12px] text-text-muted">
        <span className="font-semibold text-text">{label}</span> · {photo.deleted ? '보관 기간이 지나 삭제됨' : fmtTime(photo.capturedAt)}
      </figcaption>
    </figure>
  )
}

export default function EnvCheckPhotos({ sessionId, participantId, pollMs }: { sessionId: number; participantId: number; pollMs?: number }) {
  const photos = useLoad(`envphotos-${sessionId}-${participantId}`, () => consoleApi.envCheckPhotos(sessionId, participantId), pollMs)
  const [big, setBig] = useState<string | null>(null)
  const list = [...(photos.data ?? [])].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))

  return (
    <div className="mt-4 border-t border-line pt-3">
      <h4 className="text-[13px] font-semibold text-text">점검 사진 (귀·손목)</h4>
      <p className="mt-0.5 text-[12px] text-text-faint">이어폰·스마트워치는 자동으로 찾지 않습니다. 사진으로 직접 확인해 주세요.</p>
      {photos.error && !photos.data ? (
        <ErrorState compact message={photos.error} onRetry={photos.reload} className="mt-2" />
      ) : list.length === 0 ? (
        <p className="mt-2 text-[13px] text-text-muted">{photos.loading ? '불러오는 중' : '올라온 점검 사진이 없습니다.'}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-3">
          {list.map((p) => (
            <PhotoTile key={p.id} sessionId={sessionId} photo={p} onOpen={setBig} />
          ))}
        </div>
      )}
      {big && (
        <Modal title="점검 사진" onClose={() => setBig(null)} actions={null}>
          <img src={big} alt="점검 사진 크게 보기" className="max-h-[70vh] w-full object-contain" />
        </Modal>
      )}
    </div>
  )
}
