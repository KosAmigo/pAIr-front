# pAIr-front
AI 활용 역량 진단 플랫폼 프런트 (React, TypeScript, Vite). 백엔드는 [pAIr-back](https://github.com/KosAmigo/pAIr-back).

## 실행
- 설치: `npm --prefix frontend install`
- 개발 서버: `npm --prefix frontend run dev` (포트 5173, `/api` 는 백엔드 8180 으로 프록시)
- `npm --prefix frontend run dev` 가 기본이며 같은 와이파이의 휴대폰 보조 캠·팀원 접속까지 열린다 (자체 서명 HTTPS. 휴대폰 카메라는 HTTPS 에서만 열린다). 초대 메일 링크는 백엔드가 이 PC 사내 IP 로 자동으로 만든다. 이 PC 만 쓸 때: `npm --prefix frontend run dev:local`
- 빌드: `npm --prefix frontend run build`

## 테스트
- 인증·토큰 재발급: `npm --prefix frontend run test:auth`
- 브라우저 이벤트 감독: `npm --prefix frontend run test:anti-cheating`
- 카메라 감독 규칙·환경 점검·연결부: `npm --prefix frontend run test:proctor`

## 인증 저장 방식
- 기존 로그인 유지 방식에 따라 액세스·리프레시 토큰을 `localStorage`에 보관한다. HttpOnly 쿠키가 아니므로 XSS가 발생하면 두 토큰 모두 탈취될 수 있다. 안전한 장기 운영을 위해 백엔드의 HttpOnly·Secure 쿠키 전환과 CSP 등 XSS 방어가 필요하다.
- 동시 재발급은 한 탭에서 공유하며, Web Locks API를 지원하는 보안 컨텍스트에서는 탭 사이에서도 직렬화한다. Web Locks를 지원하지 않는 환경에서는 탭 간 동시 재발급을 보장하지 못한다.

## 폴더
- `frontend/` 프런트 코드
  - `src/` 화면과 기능 (`src/proctor/` 실전 시험 카메라 감독, `src/anti-cheating/` 브라우저 이벤트 감독)
  - `server/` 개발 서버 플러그인 (휴대폰 보조 캠 WebSocket 릴레이, 개발·시연용)
  - `tests/` node --test 로 도는 테스트
- `screenshots/` 화면 캡처
- 화면 규칙은 `DESIGN.md`, 기획·설계·평가·API 문서는 [pAIr-docs](https://github.com/KosAmigo/pAIr-docs)
