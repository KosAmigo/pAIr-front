# 실전 시험·감독 API 명세 (프론트 ↔ 백엔드)

> 작성: 팀원 4 (실전 시험 흐름) · 2026-11-19
> 프론트는 이 명세대로만 부른다. 호출 코드는 `frontend/src/proctor/api/proctorApi.ts` 한 파일에 모여 있어서, 주소가 바뀌면 그 파일만 고치면 된다.
> 참고 구현: 이 저장소 `backend/src/main/java/com/pair/exam/` (Spring Boot, JPA, PostgreSQL). 그대로 옮겨 써도 된다.

## 0. 공통

| 항목 | 규칙 |
|---|---|
| 시각 | 모두 ISO-8601 UTC 문자열 (`2026-12-01T06:00:00Z`). **판단은 서버 시각으로만** 한다 |
| 오류 | HTTP 상태 + `{"message": "사용자에게 그대로 보여 줄 한국어 문장"}` |
| 상태 코드 | 400 입력·상태 오류, 404 없는 토큰·회차, 413 파일 너무 큼 |
| 응시자 인증 | 로그인 없음. 메일 링크의 **초대 토큰(invite)** 이 곧 본인 확인. 43자 `[A-Za-z0-9_-]`, `SecureRandom` 32바이트 |
| 입장 링크 | `{프론트 주소}/entry?invite={초대 토큰}` |

**개인정보 원칙 (동의서 문구와 맞춰야 함)**
- 영상은 서버로 보내지 않는다. 카메라 분석은 응시자 브라우저 안에서만 한다.
- 이상이 확정된 순간에만 이벤트 1건과 JPEG 사진 1장(320px, 보통 10~20KB)을 보낸다.
- 얼굴을 식별하지 않는다(누구인지가 아니라 얼굴이 있는지만 본다).
- 사진은 보관 기간(기본 168시간)이 지나면 지우고 `snapshot_deleted_at` 만 남긴다.

---

## 1. 응시자 API (프론트 `Entry.tsx`, `RealExam.tsx`, 휴대폰 페이지가 부름)

### 1-1. `GET /api/time` 서버 시각
```json
{ "serverNow": "2026-12-01T05:58:12.345Z" }
```
프론트는 `서버 시각 - 내 시각` 을 보정값으로 써서 카운트다운을 그린다.

### 1-2. `GET /api/entry/{invite}` 입장 정보
```json
{
  "sessionTitle": "2026 하반기 신입 개발자 역량평가",
  "companyName": "(주)넥스트커머스",
  "name": "김지원",
  "email": "jiwon.kim@example.com",
  "startsAt": "2026-12-01T06:00:00Z",
  "endsAt": "2026-12-01T07:00:00Z",
  "serverNow": "2026-12-01T05:58:12Z",
  "phase": "UPCOMING",
  "proctoring": true,
  "consented": false,
  "startedAt": null,
  "submittedAt": null,
  "taskIds": ["order-deadlock"],
  "attempts": {}
}
```
- `phase`: `UPCOMING`(시작 전) · `LIVE`(진행 중) · `ENDED`(종료) — 서버 시각 기준
- `companyName` 은 선택. 없으면 프론트는 비워 둔다
- `attempts`: 과제 ID → 응시 ID. 시작 전에는 빈 객체

### 1-3. `POST /api/entry/{invite}/consent` 감독 동의 + 환경 점검 결과
```json
{ "consentVersion": "v1", "envCheck": { "passed": true, "items": [ ... ], "phone": { ... } } }
```
- `envCheck` 는 프론트 환경 점검 결과 JSON 그대로 (최대 20,000자). 다시 점검하면 덮어쓴다
- 종료된 회차면 400. 응답: 1-2 와 같은 입장 정보

### 1-4. `POST /api/entry/{invite}/enter` 대기실 입장
처음 들어온 시각만 기록한다 (`entered_at`). 응답: 입장 정보.

### 1-5. `POST /api/entry/{invite}/start` 시험 시작
- **서버 시각 ≥ startsAt** 이어야 한다. 아니면 400 `아직 시작 시각이 아닙니다.` (프론트는 1초 뒤 다시 시도)
- 감독 회차인데 동의 기록이 없으면 400
- 과제마다 응시(attempt)를 만든다. **두 번 불러도 응시는 한 번만** (대상자 행 잠금, `SELECT ... FOR UPDATE`)
- 응답: 입장 정보 (`attempts` 가 채워짐). 프론트는 첫 응시로 `/exam/{attemptId}?mode=live` 로 이동

### 1-6. `POST /api/entry/{invite}/submit` 직접 제출
- 아직 풀고 있는 응시를 모두 제출하고 `submit_kind=MANUAL`
- 종료 시각이 지났으면 400 (스케줄러가 대신 제출한다)

### 1-7. `POST /api/entry/{invite}/proctor-events` 감독 이벤트 1건
```json
{
  "type": "NO_FACE",
  "source": "PC_CAM",
  "startedAt": "2026-12-01T06:12:03.120Z",
  "durationMs": 2100,
  "confidence": 0.91,
  "detail": { "faceCount": 0 },
  "snapshot": "data:image/jpeg;base64,/9j/4AAQ..."
}
```
| 필드 | 규칙 |
|---|---|
| `type` | 아래 표 |
| `source` | `BROWSER` · `PC_CAM` · `PHONE_CAM` |
| `startedAt` | 이상 상태가 시작된 시각. `startsAt - 1분` ~ `서버 시각 + 1분` 밖이면 400 |
| `durationMs` | 0 ~ 3,600,000 |
| `confidence` | 선택, 0~1 |
| `detail` | 선택, 자유 JSON (최대 4,000자) |
| `snapshot` | 선택, JPEG data URL 또는 base64. **카메라 이벤트만**, 최대 200KB, JPEG 매직(FF D8 FF) 확인 |

- 시작하지 않은 응시자, 감독 없는 회차, 종료 5분이 지난 뒤의 요청은 400
- 사진은 S3 `exam-snapshots/{회차ID}/{이벤트ID}.jpg` (SSE-S3, 비공개 버킷)
- **업로드 실패 시 이벤트도 롤백**한다. 프론트 아웃박스가 다시 보낸다 (네트워크 오류·5xx 만 재시도, 4xx 는 버림)
- 응답 201: `{ "id": 12, "type": "NO_FACE", "source": "PC_CAM", "startedAt": "...", "durationMs": 2100, "confidence": 0.91, "detail": "{...}", "snapshot": "ok", "snapshotBytes": 14203 }`

**이벤트 유형**

| type | source | 뜻 |
|---|---|---|
| `TAB_HIDDEN` `WINDOW_BLUR` `MOUSE_LEAVE` `PASTE` `FULLSCREEN_EXIT` | BROWSER | 탭·창 이탈, 외부 붙여넣기, 전체 화면 해제 |
| `NO_FACE` `MULTI_FACE` `HEAD_TURN` `HEAD_DOWN` `GAZE_AWAY` `TORSO_SHIFT` `TORSO_TURN` | PC_CAM | 얼굴 없음, 여러 얼굴, 고개 돌림, 오래 숙임, 시선 이탈, 자리 이동, 몸 돌림 |
| `HAND_MISSING` `HAND_MOVED` `ARM_MOVE` `PHONE` `EXTRA_SCREEN` `BOOK` | PHONE_CAM | 손 이탈, 손 위치 이탈, 팔 움직임, 휴대폰, 다른 화면, 책 |
| `PHONE_DISCONNECTED` | PHONE_CAM | 휴대폰 캠 연결 끊김·응답 없음·화면 이탈 (**릴레이 서버가 만든다**) |

> 브라우저 이벤트는 지금 기존 `/api/anti-cheating/sessions/{attemptId}/violations` 로 간다 (`frontend/src/anti-cheating`). 백엔드를 새로 만들 때 1-7 로 합쳐도 되고, 그러면 `ViolationApi.ts` 만 바꾸면 된다.

---

## 2. 휴대폰 보조 캠 릴레이 (WebSocket `/ws/proctor`)

PC 와 휴대폰을 잇는다. **영상은 오가지 않는다.** 메시지는 모두 JSON 문자열. 최대 2MB.

### 2-1. 연결 순서
```
PC  ── hello-pc {invite} ─────────────▶ 서버: 초대 토큰 확인, 짝 코드 발급
PC  ◀── paired {pairCode, phoneUrl} ──  서버   (PC 는 phoneUrl 을 QR 로 보여 줌)
폰  ── hello-phone {pairCode} ────────▶ 서버: 짝 코드 확인
폰  ◀── phone-joined                    PC ◀── peer {phone:"connected"}
폰  ── violation / phone-status / scan-frame / check-report ─▶ 서버 ─▶ PC
```
- **짝 코드는 초대 토큰과 다른 값**이다 (QR 에 초대 토큰을 넣지 않는다). 대상자당 하나, 재접속해도 같은 값
- 휴대폰 페이지 주소: `{프론트 주소}/proctor/phone?p={pairCode}` (카메라 때문에 HTTPS 필요)
- 같은 짝 코드로 폰이 새로 붙으면 예전 폰 연결은 끊는다

### 2-2. 클라이언트 → 서버
| type | 보내는 쪽 | 내용 | 서버 처리 |
|---|---|---|---|
| `hello-pc` | PC | `{ invite }` | 토큰 확인. 틀리면 `error` 후 종료 |
| `hello-phone` | 폰 | `{ pairCode }` | 짝 확인. 틀리면 `error` 후 종료 |
| `violation` | 폰 | `{ violation: { id, kind, type, message, startedAt, ts, durationMs, detail?, snapshot? } }` (시각은 epoch ms) | **1-7 로 저장** (`source=PHONE_CAM`, 응시자가 시작한 뒤만). 사진을 뺀 내용을 PC 로 전달 |
| `phone-status` | 폰 | `{ status: { fps, handCount, objects[], calibrated, bytesSent } }` 1초마다 | 마지막 수신 시각 갱신, PC 로 전달 |
| `scan-frame` | 폰 | `{ stage: "room"\|"desk", image: "data:image/jpeg;base64,...", objects[] }` | **저장하지 않고** PC 로 전달 (PC 가 정밀 분석) |
| `check-report` | 폰 | `{ report: { passed, items[] } }` | PC 로 전달 (PC 가 1-3 에 함께 저장) |

### 2-3. 서버 → 클라이언트
| type | 받는 쪽 | 내용 |
|---|---|---|
| `paired` | PC | `{ pairCode, phoneUrl }` |
| `phone-joined` | 폰 | `{}` |
| `peer` | PC | `{ phone: "connected" \| "disconnected" \| "stale" }` |
| `violation` | PC | 폰 경고 (사진 없이) |
| `phone-status` `scan-frame` `check-report` | PC | 폰이 보낸 그대로 |
| `error` | 둘 다 | `{ message }` |

### 2-4. 서버가 직접 만드는 이벤트
- 폰 연결이 끊김 → `PHONE_DISCONNECTED`
- 폰이 감시 중(`calibrated=true`)인데 **6초** 동안 아무 메시지가 없음 → `peer: stale` + `PHONE_DISCONNECTED`
- 둘 다 응시자가 시작한 뒤에만 저장한다 (시작 전 점검 중 끊김은 기록 안 함)

> 개발용 릴레이: `frontend/server/proctorRelay.ts` (Vite 개발 서버 플러그인). 위 규칙을 그대로 구현했고, 폰 이벤트는 백엔드 1-7 로 보낸다. 운영 백엔드에서는 Spring WebSocket 으로 같은 동작을 만들면 된다.

---

## 3. 기업 콘솔 API (참고 구현에 있음, 콘솔 화면 연결은 다음 단계)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/console/sessions?companyId=` | 회차 목록 + 인원 집계 |
| POST | `/api/console/sessions` | 회차 생성 `{companyId, title, startsAt, endsAt, proctoring, taskIds[]}` |
| GET·PUT·DELETE | `/api/console/sessions/{id}` | 상세 · 수정(시작 전만) · 삭제(시작 전만) |
| POST | `/api/console/sessions/{id}/participants` | 대상자 추가 `{participants:[{name,email}]}` → `{added, rejected:[{line,name,email,reason}]}` |
| POST | `/api/console/sessions/{id}/participants/excel` | 엑셀(.xlsx, 2MB) 업로드. 첫 행에 `이름`·`이메일` |
| POST | `/api/console/sessions/{id}/participants/{pid}/invite` | 초대 메일 다시 보내기 |
| GET | `/api/console/sessions/{id}/participants/{pid}/events` | 감독 이벤트 목록 |
| GET | `/api/console/sessions/{id}/events/{eid}/snapshot` | 사진 (image/jpeg, no-store) |
| GET | `/api/console/sessions/{id}/results` | 순위·분포·역량별 평균·상하위 비교·감독 합계·지표 |
| GET | `/api/console/sessions/{id}/results.csv` | CSV (UTF-8 BOM, 수식 주입 방지) |

**주의: 콘솔 API 는 아직 인증이 없다.** 기업 로그인을 붙일 때 `companyId` 를 로그인 정보에서 꺼내고, 회차의 회사와 같은지 확인해야 한다.

---

## 4. 서버 쪽 필수 동작

| 동작 | 규칙 |
|---|---|
| 동시 시작 | 시작 가능 여부는 서버 시각으로만. 프론트 시계는 믿지 않는다 |
| 자동 제출 | 2초 주기 스케줄러가 `ends_at ≤ 지금` 이고 안 닫힌 회차를 찾아, 시작했고 미제출인 응시자를 전원 제출(`submit_kind=AUTO`). 회차마다 트랜잭션 분리, 두 번 돌아도 안전. 서버가 여러 대면 ShedLock 필요 |
| 지연 지표 | `closed_at - ends_at` 을 결과 API `metrics.autoSubmitLagMs` 로 |
| 사진 삭제 | 1시간 주기로 보관 기간 지난 사진 삭제. S3 수명 주기 규칙으로 대신해도 된다 (그때도 `snapshot_deleted_at` 은 남길 것) |
| 초대 메일 | 대상자 등록 트랜잭션 **커밋 뒤** 비동기 발송. 결과는 `invite_status` (PENDING/SENT/FAILED) |
| 로그 | 초대 토큰이 경로에 들어가므로 접근 로그에서 가린다. 메일 주소도 로그에 남기지 않는다 |

## 5. 테이블

`backend/src/main/resources/db/migration/V1__exam_sessions.sql` 참고:
`exam_sessions`, `exam_session_tasks`, `exam_participants`, `participant_attempts`, `proctor_consents`, `proctor_events`
