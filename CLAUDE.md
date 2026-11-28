# Development Rules

## Frontend
- Use React and TypeScript.
- Keep components small and reusable.
- Separate API calls from UI components.
- Handle loading and error states.
- 과제·개발·비개발·자가진단·실전 아이콘은 `components/domainIcons`에서만 가져온다.

## State management (자세한 내용: `pAIr-docs/설계/프런트_상태관리.md`)
- 서버 데이터 조회는 React Query로 한다. `useEffect`에서 API를 불러 `useState`에 담지 않는다.
- 쿼리 키는 `src/data/queryKeys.ts`에 추가하고, 쿼리 옵션(키+함수)은 `src/data/`에 두고 화면은 `useQuery`만 부른다.
- 사용자 화면 데이터는 `freshOnMount`, 폴링은 `refetchInterval`, 변경 후엔 `invalidateQueries`/`setQueryData`.
- 여러 화면이 같이 쓰는 클라이언트 값은 Zustand store(`src/data/credits.ts` 방식). 새 store는 꼭 필요할 때만.
- 로그인은 Context(`AuthProvider`), 한 화면 안의 값은 `useState`. 시험 화면은 화면 훅 + `key={sessionId}`.

## Testing
- Write tests for important business logic.
- Run relevant tests after modifications.
- Run build before completing tasks.
- 화면 확인은 Playwright로 한다: `npm run e2e`(동작 검사), `npm run shots`(스크린샷을 `frontend/.shots/`에 저장, git 에 올리지 않음).

## Token Efficiency
- Inspect only files relevant to the task.
- Avoid reading the entire project repeatedly.
- Do not invoke agents unless necessary.
- Do not generate unnecessary documentation.
- Summarize changed files and test results briefly.
- Ask before large-scale refactoring.
