# pAIr-front
AI 활용 역량 진단 플랫폼 프런트 (React, TypeScript, Vite). 백엔드는 [pAIr-back](https://github.com/KosAmigo/pAIr-back).

## 한눈에 보기

| 하고 싶은 것 | 명령 (실행 위치) |
|---|---|
| **터널 + 백엔드 + 프론트를 한 번에** (휴대폰 보조 캠을 LTE 등 다른 망에서 쓸 때) | `node pAIr-front/scripts/dev-all.mjs` (두 저장소가 들어 있는 상위 폴더) 또는 `npm --prefix frontend run dev:all` (pAIr-front) |
| 백엔드 + 프론트를 한 번에 (같은 와이파이만, 터널 없이) | `node pAIr-front/scripts/dev-all.mjs --no-tunnel` |
| 프론트만 | `npm --prefix frontend run dev` (pAIr-front) |
| 백엔드만 | `.\gradlew.bat bootRun` (pAIr-back/backend) |
| 초대 메일 확인용 메일함(Mailpit) | `docker compose up -d` (pAIr-back) → http://localhost:8025 |
| 끝내기 | 실행한 터미널에서 `Ctrl+C` |

포트: 프론트 `5173`(`/api` 는 백엔드로 프록시), 백엔드 `8180`.

## 준비물
- **Node** (프론트·실행 스크립트), **JDK 21** (백엔드는 Gradle wrapper 가 빌드)
- **`pAIr-back/application-secret.yml`**: DB(AWS RDS) 비밀번호와 OpenAI·Anthropic 키가 들어 있다. 저장소에 없으니 팀에서 받아 `pAIr-back` 폴더에 둔다. 없으면 백엔드가 켜지지 않는다
- **Docker** (선택): 초대 메일을 Mailpit 으로 확인할 때만 필요하다. 개발 DB 는 RDS 라 Docker 로 띄우지 않는다
- **cloudflared** (선택): 휴대폰을 다른 망(LTE)에서 연결할 때의 임시 터널. `winget install Cloudflare.cloudflared` (설치 뒤 터미널을 새로 연다)
- 프론트 의존성 설치: `npm --prefix frontend install`

## 실행 방법

### A. 한 번에 켜기 (`scripts/dev-all.mjs`)
터널·백엔드·프론트를 한 터미널에서 띄운다 (Windows·macOS·Linux 공통, Node 만 있으면 된다).

```bash
node pAIr-front/scripts/dev-all.mjs               # 두 저장소가 들어 있는 상위 폴더에서
node scripts/dev-all.mjs                          # pAIr-front 폴더에서
npm --prefix frontend run dev:all                 # pAIr-front 폴더에서
node pAIr-front/scripts/dev-all.mjs --no-tunnel   # 같은 와이파이만 쓸 때 (터널 없이)
node pAIr-front/scripts/dev-all.mjs --back-dir D:\work\pAIr-back   # pAIr-back 이 다른 곳에 있을 때
```

동작 순서
1. **터널**: `cloudflared` 로 5173 번에 공인 HTTPS 주소(`https://○○○.trycloudflare.com`, 켤 때마다 바뀜)를 붙인다. `cloudflared` 가 없으면 설치 방법을 안내하고 터널 없이 시작한다.
2. **백엔드**: `pAIr-back/backend` 에서 `gradlew bootRun`. 터널 주소를 `PAIR_ENTRY_BASE_URL` 로 받아 **초대 메일 링크**가 그 주소로 만들어진다. Windows 에서는 사용자 이름에 한글이 있으면 Gradle 이 임시 폴더 때문에 실패할 수 있어 `C:/dev/tmp` 를 만들어 쓴다 (`PAIR_JAVA_TMP` 로 바꿈).
3. **프론트**: 터널이 있으면 빌드 후 `vite preview`(개발 서버는 연결이 잠깐 끊기면 휴대폰 페이지를 통째로 새로고침하기 때문), 없으면 `dev:local`. 터널 주소를 `PAIR_PUBLIC_ORIGIN` 으로 받아 **휴대폰 QR 주소**가 터널 주소로 만들어진다.
4. 각 포트가 응답할 때까지 기다렸다가 `터널 주소`와 `PC 브라우저: http://localhost:5173` 을 출력한다. 처음 켤 때는 빌드와 Gradle 때문에 몇 분 걸릴 수 있다.

주의
- 이미 떠 있는 포트(5173·8180)는 건너뛴다. 단 **이미 떠 있는 백엔드는 새 터널 주소를 모른다.** 초대 메일 링크가 이전 주소로 나오면 백엔드를 끄고 이 스크립트로 다시 켠다.
- 터널을 다시 켜면 주소가 바뀐다. 이미 받은 초대 메일은 주소 부분만 새 터널 주소로 바꿔 열거나 초대를 다시 보낸다.
- 터널이 켜져 있는 동안은 개발 서버가 인터넷에 열려 있으니 쓰지 않을 때는 끈다.
- 끝낼 때는 `Ctrl+C` 한 번이면 세 프로세스가 모두 종료된다.

### B. 따로 켜기
터미널 세 개를 쓴다. 터널이 필요 없으면 (1)·(3)은 생략한다.

1. (선택) 메일함: `cd pAIr-back; docker compose up -d`
2. 백엔드: `cd pAIr-back\backend; .\gradlew.bat bootRun` (Gradle 이 "Unable to establish loopback connection" 으로 실패하면 먼저 `$env:JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/dev/tmp"`)
3. 프론트: `cd pAIr-front; npm --prefix frontend run dev`
   - 기본(`dev`)은 같은 와이파이의 휴대폰·팀원 접속까지 열린다 (자체 서명 HTTPS, 휴대폰 카메라는 HTTPS 에서만 열린다). 초대 메일 링크는 백엔드가 이 PC 사내 IP 로 자동으로 만든다.
   - 이 PC 에서만 쓸 때: `npm --prefix frontend run dev:local`
- 빌드: `npm --prefix frontend run build`

### C. 터널만 수동으로 켜기
`dev-all.mjs` 없이 터널을 직접 붙이는 방법 (A 를 쓰면 필요 없다).
1. 터미널 A: `npm --prefix frontend run dev:local`
2. 터미널 B: `cloudflared tunnel --url http://localhost:5173` → 출력의 `https://○○○.trycloudflare.com` 주소를 확인
3. PC 브라우저를 그 터널 주소로 연다 (`PAIR_PUBLIC_ORIGIN` 을 지정했다면 `localhost` 로 열어도 QR 에 터널 주소가 들어간다)
4. 끝나면 터미널 B 에서 `Ctrl+C`

## 휴대폰 보조 캠 연결
PC 화면의 QR 을 휴대폰으로 찍으면 연결된다. 휴대폰은 영상만 보내고 분석은 PC 가 한다. 영상은 WebRTC 로 PC 에 직접 가고, 서버(릴레이)는 연결 정보만 넘긴다. 영상은 서버에 저장되지 않는다.

- **같은 와이파이**: `npm --prefix frontend run dev` 로 띄우고 PC 에서 `https://localhost:5173` 으로 접속한다. 휴대폰에서 "안전하지 않음" 화면이 나오면 고급 → 계속 진행(크롬), 세부사항 보기 → 이 웹 사이트 방문(사파리).
- **다른 네트워크(LTE 등)**: 터널이 필요하다. 위 **A** 로 켜고, PC 를 `localhost` 또는 터널 주소로 연 뒤 휴대폰 와이파이를 끄고 QR 을 찍는다 → "보조 캠 시작". PC 의 휴대폰 카드에 영상이 나오면 성공이다.
- **함께 켜 둘 것**: 백엔드(`localhost:8180`). 입장 링크 확인에 쓰므로 꺼져 있으면 "입장 링크가 올바르지 않습니다"가 뜬다.
- 릴레이 진단 로그는 서버를 켠 PC 의 `%TEMP%\pair-relay.log` 에 쌓인다.

### 안 될 때
| 증상 | 원인과 해결 |
|---|---|
| 터널 주소에서 `Blocked request` | 개발 서버가 `vite.config.ts` 변경 전에 켜졌다. 껐다 다시 켠다 |
| QR 주소가 `192.168...` 로 나옴 | `PAIR_PUBLIC_ORIGIN` 없이 PC 를 `localhost` 로 열었다. 터널 주소로 접속하거나 `dev-all.mjs` 로 켠다 |
| `cloudflared` 를 찾을 수 없음 | 설치 전에 연 터미널이다. 터미널을 닫고 새로 연다 |
| 휴대폰 보조 캠이 연결 1~2분 뒤 갑자기 끊기고(릴레이 로그 `code 1001`/`1006`) 스캔이 "영상이 끊겼습니다"로 끝남 | **개발 서버(`dev`, `dev:local`)는 코드가 바뀌면 휴대폰 페이지를 통째로 새로고침한다.** 새로고침되면 휴대폰에서 "보조 캠 시작"을 다시 눌러야 한다. 휴대폰 시험 중에는 코드를 고치지 말거나, 빌드본으로 띄우는 `dev-all.mjs`(터널 모드)를 쓴다. 그래도 반복되면 `%TEMP%\pair-relay.log` 의 닫힘 시각·코드를 확인한다 |
| "입장 링크가 올바르지 않습니다" | 백엔드(8180)가 꺼져 있다 |
| 초대 메일 링크가 이전 터널 주소임 | 이미 떠 있던 백엔드가 새 터널 주소를 모른다. 백엔드를 껐다가 `dev-all.mjs` 로 다시 켠다 |
| 와이파이에선 되는데 LTE 에선 영상이 안 나옴 | 망이 직접 연결을 막는 경우다. TURN 서버가 필요하다 (아래 환경변수) |

### 환경변수 (모두 선택)
- `PAIR_PUBLIC_ORIGIN`: QR 에 넣을 주소를 직접 지정 (예: 고정 도메인). 없으면 PC 가 접속한 주소를 쓴다 (`dev-all.mjs` 는 터널 주소를 넣어 준다)
- `PAIR_BACKEND_URL`: 백엔드 주소 (기본 `http://localhost:8180`)
- `PAIR_JAVA_TMP`: `dev-all.mjs` 가 Gradle 에 쓰게 할 임시 폴더 (Windows 기본 `C:/dev/tmp`)
- `VITE_TURN_URL`(쉼표로 여러 개), `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`: TURN 서버. 학교·회사 망까지 지원하려면 필요하다. 기본은 공개 STUN 만 쓴다
- TURN 설정 방법은 아래 "TURN 서버 설정"을 본다.
- `VITE_ALLOW_CHECK_SKIP=true`: 개발 서버가 아니어도 환경 점검 "건너뛰기"를 보이게 하는 빌드 옵션 (테스트용)

### TURN 서버 설정 (휴대폰이 LTE 일 때 필요)
터널(cloudflared)은 HTTPS·WebSocket(연결 정보)만 넘기고 **영상(WebRTC)은 지나가지 못한다.** 휴대폰이 PC 와 같은 와이파이면 영상이 직접 가지만, LTE 처럼 서로 직접 연결이 안 되는 망에서는 TURN(중계) 서버가 있어야 영상이 온다. 없으면 휴대폰 카드가 "영상 연결 중"에서 멈추고 10초 뒤 안내가 뜬다.

1. TURN 서비스에 가입해 주소·계정·비밀번호를 받는다. 예: [Metered](https://www.metered.ca/tools/openrelay/) (무료 월 20GB, 가입 필요), [Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/) (단독 사용 시 유료 $0.05/GB), 직접 설치하는 coturn
2. `pAIr-front/frontend/.env.local` 파일을 만들어 값을 넣는다 (`.env.*` 는 git 에 올라가지 않는다):
   ```
   VITE_TURN_URL=turn:주소:3478,turns:주소:443
   VITE_TURN_USERNAME=계정
   VITE_TURN_CREDENTIAL=비밀번호
   ```
3. 프론트를 다시 빌드·실행한다 (`dev-all.mjs` 는 터널 모드에서 매번 빌드한다). 값은 빌드에 포함되어 브라우저에서 보이므로 개발용 계정만 쓴다. 영상은 DTLS-SRTP 로 암호화되어 TURN 서버는 내용을 볼 수 없다.

TURN 없이 시험하려면 **휴대폰을 PC 와 같은 와이파이에 붙이면** 된다. 터널 주소는 그대로 써도 된다.

## 테스트
- 브라우저 이벤트 감독: `npm --prefix frontend run test:anti-cheating`
- 카메라 감독 규칙·환경 점검·연결부·감독관 영상: `npm --prefix frontend run test:proctor`
- 실행 스크립트(`dev-all`): `npm --prefix frontend run test:scripts`
- 실기기 시험 체크리스트: [docs/plan/real-device-checklist.md](docs/plan/real-device-checklist.md)

## 폴더
- `frontend/` 프런트 코드
  - `src/` 화면과 기능 (`src/proctor/` 실전 시험 카메라 감독, `src/anti-cheating/` 브라우저 이벤트 감독)
  - `server/` 개발 서버 플러그인 (휴대폰 보조 캠 WebSocket 릴레이, 개발·시연용)
  - `tests/` node --test 로 도는 테스트
- `scripts/` 개발 실행 스크립트 (`dev-all.mjs`)
- `docs/` 감독 구조 의도(`intent/`)·구현 계획(`plan/`)
- `screenshots/` 화면 캡처
- 화면 규칙은 `DESIGN.md`, 기획·설계·평가·API 문서는 [pAIr-docs](https://github.com/KosAmigo/pAIr-docs)
