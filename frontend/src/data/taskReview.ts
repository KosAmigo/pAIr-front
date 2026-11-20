// 과제 검수 상세(DESIGN.md §7-9-3)에서 탭을 열 때 받아 오는 자료: 생성 기록, PDF 자료, 파일, 문항.
// 탭을 처음 열 때 한 번 부른다. 404 는 "없음"(생성 기록 없음, 아직 없는 API)으로 따로 알려 준다.
import { useCallback, useEffect, useState } from 'react'
import { consoleApi, type AdminQuestion, type AdminTaskFile, type TaskMaterial } from '../consoleApi'
import { taskGenApi, type GenReport } from './taskGen'

export type Load<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  /** 404: 생성 기록이 없거나, 백엔드에 아직 없는 API */
  | { state: 'missing' }
  | { state: 'error'; message: string }

/** fetcher 를 enabled 일 때 한 번 부른다. reload 로 다시 */
export function useLoad<T>(key: string | undefined, fetcher: (key: string) => Promise<T>, enabled = true): Load<T> & { reload: () => void } {
  const [tick, setTick] = useState(0)
  const id = `${key}#${tick}`
  const [res, setRes] = useState<{ id: string; load: Load<T> } | null>(null)
  useEffect(() => {
    if (!key || !enabled) return
    let alive = true
    fetcher(key).then(
      (data) => alive && setRes({ id, load: { state: 'ready', data } }),
      (e: { status?: number; message?: string }) =>
        alive && setRes({ id, load: e?.status === 404 ? { state: 'missing' } : { state: 'error', message: e?.message ?? '불러오지 못했어요' } }),
    )
    return () => {
      alive = false
    }
    // fetcher 는 모듈 함수라 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const load: Load<T> = res?.id === id ? res.load : { state: 'loading' }
  return { ...load, reload }
}

export const useGenReport = (code: string | undefined, enabled = true) => useLoad<GenReport>(code, taskGenApi.report, enabled)
export const useMaterials = (code: string | undefined, enabled = true) => useLoad<TaskMaterial[]>(code, consoleApi.materials, enabled)
export const useTaskFiles = (code: string | undefined, enabled = true) => useLoad<AdminTaskFile[]>(code, consoleApi.taskFiles, enabled)
export const useTaskQuestions = (code: string | undefined, enabled = true) => useLoad<AdminQuestion[]>(code, consoleApi.taskQuestions, enabled)

/**
 * PDF 하나를 blob URL 로 받는다. 다른 파일로 바꾸거나 화면을 떠나면 URL 을 풀어 준다(메모리).
 * 응시 화면이 아니라 관리자 API 라 인증 헤더가 필요해서 <iframe src> 에 주소를 바로 넣지 않는다.
 */
export function usePdfBlob(code: string | undefined, path: string | null) {
  const [res, setRes] = useState<{ key: string; url: string | null; error: string | null } | null>(null)
  const key = `${code}|${path}`
  useEffect(() => {
    if (!code || !path) return
    let alive = true
    let made: string | null = null
    consoleApi.materialFileUrl(code, path).then(
      (url) => {
        made = url
        if (alive) setRes({ key, url, error: null })
        else URL.revokeObjectURL(url)
      },
      (e: { status?: number; message?: string }) => {
        if (!alive) return
        const msg =
          e?.status === 404
            ? '이 PDF 파일을 서버에서 찾지 못했어요. 과제를 만든 PC의 local 저장소에만 있는 파일일 수 있어요(공용 DB를 쓰면 S3 저장소가 필요해요).'
            : (e?.message ?? 'PDF를 받지 못했어요')
        setRes({ key, url: null, error: msg })
      },
    )
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [code, path, key])
  const cur = res?.key === key ? res : null
  return { url: cur?.url ?? null, error: cur?.error ?? null, loading: !!path && !cur }
}

/** 파일 크기 18.2 KB */
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
