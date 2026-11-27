// React Query 쿼리 키를 한 곳에 모은다. 같은 API 를 여러 화면이 쓰면 같은 키를 쓴다.
// (콘솔 과제 목록 ['console-tasks'] 는 consoleTasks.ts 의 consoleTasksQuery 가 가진다)
export const queryKeys = {
  /** 과제 목록과 각 과제 정의 (사용자 화면) */
  tasks: ['tasks'] as const,
  /** 내 응시 목록. includeEmpty=true 는 시작만 하고 아무것도 안 한 응시까지 */
  attempts: (includeEmpty: boolean) => ['attempts', includeEmpty ? 'with-empty' : 'submitted'] as const,
  /** 응시 하나의 리포트(채점 상태 포함) */
  report: (attemptId: string) => ['report', attemptId] as const,
  /** 응시 하나의 요약(제출 완료 화면) */
  attempt: (attemptId: string) => ['attempt', attemptId] as const,
  /** 대시보드 점수 이력. 과제 ID 는 없으면 가장 최근 과제 */
  statHistory: (taskId: string | null) => ['stat-history', taskId] as const,
  /** 크레딧 화면: 상품·구매 내역·사용 내역 한 묶음 */
  creditsHistory: (userId: number, purchasePage: number, ledgerPage: number) => ['credits-history', userId, purchasePage, ledgerPage] as const,
  /** 마이페이지 회원 정보 */
  profile: (userId: number) => ['profile', userId] as const,
  /** 기업 감독관 초대 */
  invitation: (token: string) => ['invitation', token] as const,
  /** 콘솔 과제 하나(요약+정의) */
  consoleTask: (id: string) => ['console-task', id] as const,
  /** 콘솔 과제 검수 탭 자료. kind = report | materials | files | questions */
  taskReview: (kind: string, code: string) => ['task-review', kind, code] as const,
  /** 생성 작업 하나의 상태+내용 */
  genJobDetail: (jobId: string) => ['gen-job-detail', jobId] as const,
  /** 이미지(blob). 로그인 헤더가 필요해 Blob 으로 받는다 */
  blob: (...parts: (string | number)[]) => ['blob', ...parts] as const,
}

/**
 * 사용자 화면 데이터 기본 옵션: 화면을 열 때마다 새로 받고(staleTime 0), 화면을 떠나면 캐시를 버린다(gcTime 0).
 * 옮기기 전(useEffect 로 직접 부르던 때)과 같게 보이고, 로그아웃 뒤 다른 계정에 이전 데이터가 남지 않는다.
 */
export const freshOnMount = { staleTime: 0, gcTime: 0 } as const

/** 오류를 화면에 보일 문자열로 */
export const errorMessage = (e: unknown): string | null => (e == null ? null : e instanceof Error ? e.message : String(e))
