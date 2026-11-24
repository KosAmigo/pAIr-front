# pAIr-front
AI 활용 역량 진단 플랫폼 프런트 (React, TypeScript, Vite). 백엔드는 [pAIr-back](https://github.com/KosAmigo/pAIr-back).

## 폴더
- `frontend/` 프런트 코드
  - `src/` 화면과 기능 (`src/proctor/` 실전 시험 카메라 감독, `src/anti-cheating/` 브라우저 이벤트 감독)
  - `server/` 개발 서버 플러그인 (휴대폰 보조 캠 WebSocket 릴레이, 개발·시연용)
  - `tests/` node --test 로 도는 테스트
- `scripts/` 개발 실행 스크립트 (`dev-all.mjs`)
- `docs/` 감독 구조 의도(`intent/`)·구현 계획(`plan/`)
- `screenshots/` 화면 캡처
- 화면 규칙은 `DESIGN.md`, 기획·설계·평가·API 문서는 [pAIr-docs](https://github.com/KosAmigo/pAIr-docs)
