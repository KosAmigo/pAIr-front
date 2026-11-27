// 과제 검수 상세(DESIGN.md §7-9-3)에서 탭을 열 때 받아 오는 자료: 생성 기록, PDF 자료, 파일, 문항.
// 탭을 처음 열 때 한 번 부른다. 404 는 "없음"(생성 기록 없음, 아직 없는 API)으로 따로 알려 준다.
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { consoleApi, type AdminQuestion, type AdminTaskFile, type TaskMaterial } from '../consoleApi'
import { taskGenApi, type GenReport } from './taskGen'
import { useBlobUrl } from './blobUrl'
import { freshOnMount, queryKeys } from './queryKeys'

export type Load<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  /** 404: 생성 기록이 없거나, 백엔드에 아직 없는 API */
  | { state: 'missing' }
  | { state: 'error'; message: string }

/** fetcher 를 enabled 일 때 한 번 부른다(kind 는 쿼리 키 구분용). reload 로 다시. 404 는 재시도하지 않는다 */
export function useLoad<T>(kind: string, key: string | undefined, fetcher: (key: string) => Promise<T>, enabled = true): Load<T> & { reload: () => void } {
  const on = !!key && enabled
  const q = useQuery({ queryKey: queryKeys.taskReview(kind, key ?? ''), queryFn: () => fetcher(key!), enabled: on, retry: false, ...freshOnMount })
  const { refetch } = q
  const reload = useCallback(() => void refetch(), [refetch])
  let load: Load<T> = { state: 'loading' }
  if (on && q.data !== undefined) load = { state: 'ready', data: q.data }
  else if (on && q.error) {
    const e = q.error as { status?: number; message?: string }
    load = e?.status === 404 ? { state: 'missing' } : { state: 'error', message: e?.message ?? '불러오지 못했어요' }
  }
  return { ...load, reload }
}

export const useGenReport = (code: string | undefined, enabled = true) => useLoad<GenReport>('report', code, taskGenApi.report, enabled)
export const useMaterials = (code: string | undefined, enabled = true) => useLoad<TaskMaterial[]>('materials', code, consoleApi.materials, enabled)
export const useTaskFiles = (code: string | undefined, enabled = true) => useLoad<AdminTaskFile[]>('files', code, consoleApi.taskFiles, enabled)
export const useTaskQuestions = (code: string | undefined, enabled = true) => useLoad<AdminQuestion[]>('questions', code, consoleApi.taskQuestions, enabled)

/**
 * PDF 하나를 blob URL 로 받는다. 다른 파일로 바꾸거나 화면을 떠나면 URL 을 풀어 준다(메모리).
 * 응시 화면이 아니라 관리자 API 라 인증 헤더가 필요해서 <iframe src> 에 주소를 바로 넣지 않는다.
 */
export function usePdfBlob(code: string | undefined, path: string | null) {
  const b = useBlobUrl(code && path ? ['task-pdf', code, path] : null, () => consoleApi.materialFileBlob(code!, path!))
  let error: string | null = null
  if (b.error) {
    const e = b.error as { status?: number; message?: string }
    error =
      e?.status === 404
        ? '이 PDF 파일을 서버에서 찾지 못했어요. 과제를 만든 PC의 local 저장소에만 있는 파일일 수 있어요(공용 DB를 쓰면 S3 저장소가 필요해요).'
        : (e?.message ?? 'PDF를 받지 못했어요')
  }
  return { url: b.url, error, loading: !!path && !b.url && !error }
}

/** 파일 크기 18.2 KB */
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
