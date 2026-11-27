import { QueryClient } from '@tanstack/react-query'

// 컴포넌트 밖(데이터 모듈)에서도 캐시를 고칠 수 있게 하나만 만들어 공유한다
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
})
