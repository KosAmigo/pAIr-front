// 로그인 헤더가 필요한 사진·PDF 를 받아 화면에 쓸 URL 로 바꾸는 훅.
// 쿼리 캐시에는 Blob 을 두고(URL 은 풀어 줘야 해서), URL 은 이 훅이 만들고 바뀌거나 화면을 떠나면 풀어 준다.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'

export type BlobUrl = { url: string | null; error: unknown; loading: boolean }

/** key 가 null 이거나 enabled 가 false 면 받지 않는다. 한 번 받고(재시도 없음) 화면을 떠나면 캐시를 버린다 */
export function useBlobUrl(key: (string | number)[] | null, fetcher: () => Promise<Blob>, enabled = true): BlobUrl {
  const on = key != null && enabled
  const q = useQuery({ queryKey: queryKeys.blob(...(key ?? [])), queryFn: fetcher, enabled: on, retry: false, staleTime: Infinity, gcTime: 0 })
  const blob = on ? (q.data ?? null) : null
  const [made, setMade] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setMade({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  const url = blob && made?.blob === blob ? made.url : null
  const error = on ? q.error : null
  return { url, error, loading: on && !error && !url }
}
