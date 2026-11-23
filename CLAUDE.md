# Development Rules

## Frontend
- Use React and TypeScript.
- Keep components small and reusable.
- Separate API calls from UI components.
- Handle loading and error states.
- 과제·개발·비개발·자가진단·실전 아이콘은 `components/domainIcons`에서만 가져온다.

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
