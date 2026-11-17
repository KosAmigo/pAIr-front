# pAIr DB 데이터 흐름과 컬럼 정리

## 범위

이 문서는 pAIr PostgreSQL/pgvector 스키마만 설명합니다. 애플리케이션 코드 경로는 다루지 않습니다. 테이블 간 PK/FK 흐름, 컬럼의 저장 목적, 식별/비식별 관계, ERD 샘플 CSV의 적합성 검증을 중심으로 정리했습니다.

현재 정의서 기준 스키마는 **33개 테이블, FK 45개**입니다. 이전 정리에서 빠졌던 5개 테이블(`companies`, `exam_sessions`, `exam_participants`, `proctor_consents`, `proctor_events`)과 `users.company_id` 연결을 반영했습니다. 샘플 CSV도 33개이며 현재 파일 기준 총 1,266행입니다.

## 기능별 DB 데이터 흐름

### A. 기준 데이터와 문항 구성

- 회원은 users에서 한 번 식별하고, 각 응시는 user_id로 회원에 연결합니다.
- 과제는 tasks의 task_id를 기준으로 과제 파일, 문항, 응시와 연결됩니다.
- 과제 파일이 페이지 문서라면 task_files → document_pages → document_chunks 순으로 추출 본문과 검색용 조각을 보관합니다.
- 문항은 task_questions에서 시작해 객관식 보기, 허용 단답, 근거 문서로 이어집니다.
- 채점 기준은 rubric_items → rubric_checks로 세분화합니다. 판정 문구는 prompt_versions와 prompt_check_hints 조합으로 버전 관리합니다.

~~~mermaid
flowchart LR
  U["users<br/>user_id"] --> A["attempts<br/>user_id"]
  T["tasks<br/>task_id"] --> F["task_files<br/>task_id"]
  T --> Q["task_questions<br/>task_id"]
  F --> DP["document_pages<br/>task_file_id + page_no"]
  DP --> DC["document_chunks<br/>task_file_id + page_no"]
  Q --> CH["question_choices<br/>question_id"]
  Q --> SK["short_answer_keys<br/>question_id"]
  Q --> QS["question_sources<br/>question_id + task_file_id"]
  F --> QS
  RI["rubric_items<br/>item_key"] --> RC["rubric_checks<br/>item_key"]
  RC --> PH["prompt_check_hints<br/>check_id"]
  PV["prompt_versions<br/>version_id"] --> PH
~~~

### B. 응시 데이터와 작업 이력

- attempts는 사용자·과제·응시모드·상태·시간을 묶는 중심 레코드입니다.
- 작업 파일, 채팅 턴, 이벤트, 문항 답변, 체크포인트는 attempt_id를 통해 한 응시에 귀속됩니다.
- 대화 첨부는 chat_turns에, 선택한 보기는 question_answers에 각각 종속됩니다.
- 체크포인트는 당시 턴과 파일 사본을 함께 보존합니다. 이후 새 응시의 forked_from_checkpoint_id가 출발점을 가리킵니다.

~~~mermaid
flowchart TD
  A["attempts"] --> AF["attempt_files"]
  A --> CT["chat_turns"] --> CA["chat_attachments"]
  A --> AE["attempt_events"]
  A --> QA["question_answers"] --> AC["answer_choices"]
  QC["question_choices"] --> AC
  A --> CP["checkpoints"] --> CF["checkpoint_files"]
  CP -. "forked_from_checkpoint_id" .-> A
~~~

### C. 채점 실행과 결과

- scorings는 어느 응시를 어떤 프롬프트 버전으로 채점했는지 고정합니다.
- 한 채점 실행에서 judge_calls는 모델별 사용량을 기록하고, check_results는 체크별 최종 감점을 기록합니다.
- 체크 결과는 여러 judge_verdicts를 가질 수 있고, 각 모델 판정에 여러 verdict_evidences가 붙습니다.
- 문항 점수는 역량 체크 감점과 성격이 달라 question_results에 따로 둡니다. 총점은 역량 배점에서 체크별 감점을 합산해 계산하는 설계입니다.

~~~mermaid
flowchart LR
  A["attempts"] --> S["scorings"]
  PV["prompt_versions"] --> S
  S --> JC["judge_calls"]
  S --> CR["check_results"]
  RC["rubric_checks"] --> CR
  CR --> JV["judge_verdicts"]
  JC --> JV
  JV --> VE["verdict_evidences"]
  S --> QR["question_results"]
  Q["task_questions"] --> QR
~~~

### D. 기업 실전 시험과 감독 기록

- `companies`는 기업 경계를 만들고, 기업 담당자(`users.company_id`)와 시험 회차(`exam_sessions.company_id`)를 연결합니다.
- 회차는 회사·과제·개설 담당자와 시간 범위를 보관합니다. 초대 명단은 `exam_participants`에 쌓이며, 실제 입장 시 회원 및 응시(`user_id`, `attempt_id`)와 연결됩니다. 아직 입장하지 않은 초대자도 `attempt_id`가 비어 있는 상태로 보존됩니다.
- 실전 응시의 동의·환경 점검은 `proctor_consents`에 응시당 한 건 저장합니다. 감독 이벤트는 `proctor_events`에 유형·시각·지속시간·확신도·상세 JSON·선택적 스냅샷 키로 누적됩니다.
- 감독 이벤트의 스냅샷 이미지는 DB에 직접 넣지 않고 `snapshot_key`로 외부 저장 위치를 가리킵니다. 삭제 후에도 이벤트 이력은 남고 `snapshot_deleted_at`으로 스냅샷 삭제 시각을 기록합니다.

~~~mermaid
flowchart LR
  C["companies"] --> U["users<br/>company_id"]
  C --> ES["exam_sessions"]
  T["tasks"] --> ES
  U --> ES
  ES --> EP["exam_participants"]
  EP --> U
  EP --> A["attempts"]
  A --> PC["proctor_consents"]
  A --> PE["proctor_events<br/>snapshot_key"]
~~~

## 전체 컬럼과 각 컬럼의 역할

아래 기존 ERD와 추가 ERD를 합쳐 33개 테이블의 컬럼을 모두 표시합니다. PK는 기본키, FK는 외래키, UK는 유니크 제약입니다.

### 1. 회원·과제·자료·문항

~~~mermaid
erDiagram
  USERS ||--o{ ATTEMPTS : member
  TASKS ||--o{ TASK_FILES : files
  TASKS ||--o{ TASK_QUESTIONS : questions
  TASK_FILES ||--o{ DOCUMENT_PAGES : pages
  DOCUMENT_PAGES ||--o{ DOCUMENT_CHUNKS : chunks
  TASK_QUESTIONS ||--o{ QUESTION_CHOICES : choices
  TASK_QUESTIONS ||--o{ SHORT_ANSWER_KEYS : accepted_answers
  TASK_QUESTIONS ||--o{ QUESTION_SOURCES : references
  TASK_FILES ||--o{ QUESTION_SOURCES : source_files

  USERS {
    bigint user_id PK
    varchar email UK
    varchar password_hash
    varchar name
    varchar role
    bigint company_id FK
    timestamptz created_at
  }
  TASKS {
    bigint task_id PK
    varchar code UK
    varchar title
    varchar summary
    text description
    text requirements
    varchar track
    varchar category
    varchar difficulty
    int time_limit_min
    varchar status
  }
  TASK_FILES {
    bigint task_file_id PK
    bigint task_id FK
    varchar path
    text content
    varchar storage_key
    varchar mime_type
    bigint size_bytes
    varchar visibility
    boolean read_only
  }
  DOCUMENT_PAGES {
    bigint task_file_id PK, FK
    int page_no PK
    text text
  }
  DOCUMENT_CHUNKS {
    bigint chunk_id PK
    bigint task_file_id FK
    int page_no FK
    int chunk_no
    text content
    int token_count
    vector embedding
  }
  TASK_QUESTIONS {
    bigint question_id PK
    bigint task_id FK
    varchar stage
    varchar question_type
    int seq
    text content
    int points
    text answer_guide
    boolean active
  }
  QUESTION_CHOICES {
    bigint choice_id PK
    bigint question_id FK
    int seq
    text content
    boolean is_correct
  }
  SHORT_ANSWER_KEYS {
    bigint question_id PK, FK
    varchar accepted PK
  }
  QUESTION_SOURCES {
    bigint question_id PK, FK
    bigint task_file_id PK, FK
    varchar pages
    text note
  }
~~~

| 테이블 | 컬럼을 두는 이유 |
|---|---|
| users | user_id는 안정적인 회원 식별자. email은 로그인 ID와 중복 방지, password_hash는 해시, name/role은 표시와 권한, created_at은 가입 이력. |
| tasks | task_id는 참조 키, code는 URL/고정 코드. title/summary/description/requirements는 과제 정보. track/category/difficulty는 분류, time_limit_min은 제한시간, status는 공개 상태. |
| task_files | task_file_id/task_id/path는 파일 식별과 소속. content 또는 storage_key는 본문/바이너리 위치. mime_type/size_bytes는 파일 속성, visibility/read_only는 공개·수정 정책. |
| document_pages | task_file_id/page_no는 파일 안 페이지를 식별하고 text는 페이지 추출 내용. |
| document_chunks | chunk_id는 조각 ID. task_file_id/page_no/chunk_no는 원문 페이지와 조각 순서. content/token_count는 검색 문구와 전송량, embedding은 의미 검색 벡터. |
| task_questions | question_id/task_id는 문항과 과제. stage/question_type/seq는 단계·유형·순서. content/points/answer_guide는 문제와 채점 정보, active는 현재 사용 문항 구분. |
| question_choices | choice_id/question_id는 보기 식별과 소속. seq/content/is_correct는 표시 순서·문구·정답 여부. |
| short_answer_keys | question_id/accepted 복합키로 한 문항의 여러 허용 답을 중복 없이 저장. |
| question_sources | question_id/task_file_id 복합키로 문항과 근거 자료 연결. pages/note는 근거 위치와 출제 메모. |

### 2. 응시·답변·대화·복기

~~~mermaid
erDiagram
  ATTEMPTS ||--o{ ATTEMPT_FILES : edits
  ATTEMPTS ||--o{ CHAT_TURNS : talks
  CHAT_TURNS ||--o{ CHAT_ATTACHMENTS : attaches
  ATTEMPTS ||--o{ ATTEMPT_EVENTS : events
  ATTEMPTS ||--o{ QUESTION_ANSWERS : answers
  QUESTION_ANSWERS ||--o{ ANSWER_CHOICES : selects
  ATTEMPTS ||--o{ CHECKPOINTS : saves
  CHECKPOINTS ||--o{ CHECKPOINT_FILES : snapshots
  CHECKPOINTS o|--o{ ATTEMPTS : fork_source

  ATTEMPTS {
    bigint attempt_id PK
    bigint user_id FK
    bigint task_id FK
    varchar mode
    varchar status
    varchar assistant_model
    bigint forked_from_checkpoint_id FK
    timestamptz started_at
    timestamptz submitted_at
    timestamptz followups_done_at
  }
  ATTEMPT_FILES {
    bigint attempt_file_id PK
    bigint attempt_id FK
    varchar path
    text content
    timestamptz updated_at
  }
  CHAT_TURNS {
    bigint turn_id PK
    bigint attempt_id FK
    int turn_no
    varchar role
    text content
    varchar model
    int input_tokens
    int output_tokens
    timestamptz created_at
  }
  CHAT_ATTACHMENTS {
    bigint attachment_id PK
    bigint turn_id FK
    varchar source_type
    bigint task_file_id FK
    varchar file_name
    varchar pages
    varchar mime_type
    text sent_text
  }
  ATTEMPT_EVENTS {
    bigint event_id PK
    bigint attempt_id FK
    varchar type
    jsonb payload
    timestamptz created_at
  }
  QUESTION_ANSWERS {
    bigint answer_id PK
    bigint attempt_id FK
    bigint question_id FK
    text text_answer
    timestamptz answered_at
  }
  ANSWER_CHOICES {
    bigint answer_id PK, FK
    bigint choice_id PK, FK
  }
  CHECKPOINTS {
    bigint checkpoint_id PK
    bigint attempt_id FK
    int turn_no
    varchar label
    timestamptz created_at
  }
  CHECKPOINT_FILES {
    bigint checkpoint_id PK, FK
    varchar path PK
    text content
  }
~~~

| 테이블 | 컬럼을 두는 이유 |
|---|---|
| attempts | attempt_id는 응시 PK, user_id/task_id는 주체와 과제. mode/status는 응시 유형과 상태. assistant_model은 당시 모델. forked_from_checkpoint_id는 분기 출처. started_at/submitted_at/followups_done_at은 시간·단계 이력. |
| attempt_files | attempt_file_id는 파일 행, attempt_id/path는 응시별 파일 경로. content는 현재 제출 대상 내용, updated_at은 최근 수정 시각. |
| chat_turns | turn_id는 턴 PK. attempt_id/turn_no는 소속과 순서. role/content는 발화 주체·본문, model은 응답 모델, 토큰 컬럼은 사용량, created_at은 대화 시각. |
| chat_attachments | attachment_id/turn_id는 첨부와 질문. source_type/task_file_id는 출처. file_name/pages/mime_type는 파일 정보, sent_text는 당시 실제 전달된 내용 스냅샷. |
| attempt_events | event_id/attempt_id는 이벤트와 응시. type은 행동 종류, payload는 종류별 세부 JSON, created_at은 발생 시각. |
| question_answers | answer_id는 답변 PK. attempt_id/question_id는 응시와 문항. text_answer는 주관식 응답, answered_at은 응답 시각. |
| answer_choices | answer_id/choice_id 복합키로 답변에서 선택한 보기들을 중복 없이 연결. |
| checkpoints | checkpoint_id/attempt_id는 저장점과 응시. turn_no/label/created_at은 저장 시점·이름·시각. |
| checkpoint_files | checkpoint_id/path 복합키로 저장점 당시 파일을 식별. content는 복원할 파일 본문. |

### 3. 기준·프롬프트·채점 결과

~~~mermaid
erDiagram
  RUBRIC_ITEMS ||--o{ RUBRIC_CHECKS : groups
  RUBRIC_CHECKS ||--o{ PROMPT_CHECK_HINTS : check_prompt
  PROMPT_VERSIONS ||--o{ PROMPT_CHECK_HINTS : versions
  SCORINGS ||--o{ JUDGE_CALLS : calls
  SCORINGS ||--o{ CHECK_RESULTS : checks
  CHECK_RESULTS ||--o{ JUDGE_VERDICTS : verdicts
  JUDGE_CALLS ||--o{ JUDGE_VERDICTS : source_call
  JUDGE_VERDICTS ||--o{ VERDICT_EVIDENCES : evidence
  SCORINGS ||--o{ QUESTION_RESULTS : question_scores

  RUBRIC_ITEMS {
    varchar item_key PK
    varchar name
    int max_score
    int sort_order
  }
  RUBRIC_CHECKS {
    bigint check_id PK
    varchar item_key FK
    varchar code
    varchar track
    varchar method
    int points
    varchar label
  }
  PROMPT_VERSIONS {
    bigint version_id PK
    varchar name
    varchar note
    bigint parent_version_id FK
    text judge_system
    boolean is_active
    timestamptz created_at
  }
  PROMPT_CHECK_HINTS {
    bigint version_id PK, FK
    bigint check_id PK, FK
    text hint
  }
  SCORINGS {
    bigint scoring_id PK
    bigint attempt_id FK
    bigint version_id FK
    varchar status
    text error
    timestamptz started_at
    timestamptz finished_at
  }
  JUDGE_CALLS {
    bigint judge_call_id PK
    bigint scoring_id FK
    varchar model
    int input_tokens
    int output_tokens
    int cached_tokens
  }
  CHECK_RESULTS {
    bigint result_id PK
    bigint scoring_id FK
    bigint check_id FK
    int deducted
    varchar status
    text reason
  }
  JUDGE_VERDICTS {
    bigint verdict_id PK
    bigint result_id FK
    bigint judge_call_id FK
    boolean violated
    int count
    text reason
  }
  VERDICT_EVIDENCES {
    bigint verdict_id PK, FK
    varchar ref PK
  }
  QUESTION_RESULTS {
    bigint scoring_id PK, FK
    bigint question_id PK, FK
    int score
    varchar method
    text reason
  }
~~~

| 테이블 | 컬럼을 두는 이유 |
|---|---|
| rubric_items | item_key는 역량 키, name은 표시명, max_score는 배점, sort_order는 표시 순서. |
| rubric_checks | check_id는 체크 PK, item_key는 역량 소속. code/track은 체크와 적용 직군, method는 판정 방식, points는 감점, label은 사용자 설명. code+track 조합은 유일. |
| prompt_versions | version_id는 버전 PK. name/note는 식별·변경 메모, parent_version_id는 이전 기준, judge_system은 공통 판정 지침, is_active는 적용 여부, created_at은 버전 시각. |
| prompt_check_hints | version_id/check_id 복합키로 버전별 체크 지침을 저장하고 hint는 판정 문장. |
| scorings | scoring_id는 실행 PK, attempt_id/version_id는 대상 응시와 적용 기준. status/error는 결과 상태, started_at/finished_at은 실행 시간. 응시별 재채점을 보존하도록 1:N. |
| judge_calls | judge_call_id/scoring_id는 호출 식별과 소속. model과 입력·출력·캐시 토큰은 비용 및 사용량. |
| check_results | result_id는 결과 PK, scoring_id/check_id는 실행과 항목. deducted/status/reason은 최종 감점·판정·설명. 실행-체크 조합은 유일. |
| judge_verdicts | verdict_id/result_id/judge_call_id는 모델 판정과 결과·호출 연결. violated/count/reason은 위반·개수·사유. |
| verdict_evidences | verdict_id/ref 복합키로 모델 판정에 여러 근거를 각각 연결. |
| question_results | scoring_id/question_id 복합키로 채점-문항 결과를 식별. score/method/reason은 득점·방식·이유. |

## 식별·비식별 관계

식별 관계는 자식 PK에 부모 FK가 포함된 관계입니다. FK가 존재하거나 UNIQUE가 있다는 것만으로 식별 관계가 되지는 않습니다.

| 종류 | 테이블 관계 | 판정 근거 |
|---|---|---|
| 식별 | task_files → document_pages | document_pages PK에 task_file_id 포함 |
| 식별 | task_questions → short_answer_keys | PK가 question_id + accepted |
| 식별 | task_questions/task_files → question_sources | 두 부모 FK가 복합 PK |
| 식별 | question_answers/question_choices → answer_choices | 두 부모 FK가 복합 PK |
| 식별 | checkpoints → checkpoint_files | PK에 checkpoint_id 포함 |
| 식별 | prompt_versions/rubric_checks → prompt_check_hints | 두 부모 FK가 복합 PK |
| 식별 | judge_verdicts → verdict_evidences | PK에 verdict_id 포함 |
| 식별 | scorings/task_questions → question_results | 두 부모 FK가 복합 PK |
| 비식별 | tasks → task_files/task_questions | 자식이 별도 task_file_id/question_id PK 사용 |
| 비식별 | attempts → 작업파일/대화/이벤트/답변/체크포인트/채점 | 자식별 독립 PK 사용 |
| 비식별 | document_pages → document_chunks | child PK가 chunk_id |
| 비식별 | prompt_versions → scorings 및 자기 참조 | scoring_id/version_id가 독립 PK |
| 비식별 | rubric_checks → check_results | result_id가 독립 PK |
| 비식별 | check_results/judge_calls → judge_verdicts | verdict_id가 독립 PK |
| 비식별 | checkpoints → attempts 분기 출처 | forked_from_checkpoint_id는 attempts PK에 포함되지 않음 |
| 비식별 | companies → users/exam_sessions | 각각 user_id/session_id가 독립 PK |
| 비식별 | tasks/users/companies → exam_sessions | session_id가 독립 PK |
| 비식별 | exam_sessions/users/attempts → exam_participants | participant_id가 독립 PK; user_id·attempt_id는 nullable/unique 참조 |
| 식별 | attempts → proctor_consents | attempt_id가 PK이자 FK |
| 비식별 | attempts → proctor_events | proctor_event_id가 독립 PK |

식별 관계는 9개 테이블의 13개 FK 연결, 비식별 관계는 나머지 32개 FK 연결입니다(총 FK 45개).

## 추가된 테이블 5개와 전체 컬럼

다음 컬럼 정의는 현재 `테이블_정의서.md`와 `pair_schema.sql`의 신규 영역을 대조해 반영했습니다. 추가 테이블은 이전 문서의 28개에 포함되지 않았습니다. 기존 `users`에도 `company_id` FK 컬럼이 새로 포함되어 현재 컬럼 목록에 반영했습니다.

~~~mermaid
erDiagram
  COMPANIES ||--o{ USERS : company
  COMPANIES ||--o{ EXAM_SESSIONS : owns
  TASKS ||--o{ EXAM_SESSIONS : assigned
  USERS ||--o{ EXAM_SESSIONS : created_by
  EXAM_SESSIONS ||--o{ EXAM_PARTICIPANTS : invites
  USERS o|--o{ EXAM_PARTICIPANTS : linked_user
  ATTEMPTS o|--o| EXAM_PARTICIPANTS : linked_attempt
  ATTEMPTS ||--o| PROCTOR_CONSENTS : consent
  ATTEMPTS ||--o{ PROCTOR_EVENTS : monitored_events
  COMPANIES {
    bigint company_id PK
    varchar name
    varchar business_no UK
    timestamptz created_at
  }
  USERS {
    bigint user_id PK
    varchar email UK
    varchar password_hash
    varchar name
    varchar role
    bigint company_id FK
    timestamptz created_at
  }
  EXAM_SESSIONS {
    bigint session_id PK
    bigint company_id FK
    bigint task_id FK
    varchar title
    varchar entry_code UK
    timestamptz starts_at
    timestamptz ends_at
    boolean proctoring
    bigint created_by FK
    timestamptz created_at
  }
  EXAM_PARTICIPANTS {
    bigint participant_id PK
    bigint session_id FK
    varchar email
    varchar name
    varchar invite_token UK
    bigint user_id FK
    bigint attempt_id FK, UK
    timestamptz invited_at
    timestamptz entered_at
  }
  PROCTOR_CONSENTS {
    bigint attempt_id PK, FK
    varchar consent_version
    jsonb env_check
    timestamptz consented_at
  }
  PROCTOR_EVENTS {
    bigint proctor_event_id PK
    bigint attempt_id FK
    varchar type
    timestamptz started_at
    int duration_ms
    numeric confidence
    jsonb detail
    varchar snapshot_key
    timestamptz snapshot_deleted_at
  }
~~~

| 테이블 | 컬럼 목적과 검수 메모 |
|---|---|
| companies | `company_id`는 회사 키, `name`은 표시명, `business_no`는 선택적 고유 사업자번호, `created_at`은 등록 시각. 회사 구분을 반복해서 저장하지 않고 사용자와 회차에서 참조합니다. |
| users 추가 컬럼 | `company_id`는 `COMPANY` 역할 담당자의 회사 FK입니다. DDL CHECK는 `COMPANY` 역할일 때 회사가 비어 있는 경우를 막습니다. 반대로 `USER`/`ADMIN`이 회사 ID를 가지지 못하게 막는 제약은 없습니다. |
| exam_sessions | `session_id`는 회차 키, `company_id`와 `task_id`는 주관 회사와 과제, `title`은 회차명, `entry_code`는 고유 입장 코드, `starts_at`/`ends_at`은 응시 기간, `proctoring`은 감독 설정, `created_by`는 개설 담당자, `created_at`은 생성 시각입니다. `ends_at > starts_at`는 DB CHECK로 보장합니다. |
| exam_participants | `participant_id`는 초대 행 키, `session_id`는 회차, `email`/`name`은 초대 대상 식별 정보, `invite_token`은 고유 초대 토큰, `user_id`/`attempt_id`는 입장 후 연결되는 회원/응시(선택적), `invited_at`/`entered_at`은 초대 및 입장 시각입니다. 회차+이메일 중복과 응시 중복을 막습니다. |
| proctor_consents | `attempt_id`를 PK이자 FK로 써 응시당 동의·환경 점검을 최대 한 건으로 제한합니다. `consent_version`은 동의서 버전, `env_check`는 브라우저/카메라/전체화면 점검 JSON, `consented_at`은 동의 시각입니다. |
| proctor_events | `proctor_event_id`는 이벤트 키, `attempt_id`는 응시 귀속, `type`은 제한된 감독 이벤트 유형, `started_at`/`duration_ms`는 발생과 지속, `confidence`는 선택적 0~1 감지 확신도, `detail`은 유형별 JSON, `snapshot_key`는 선택적 이미지 위치, `snapshot_deleted_at`은 삭제 시각입니다. 이벤트 유형·음수 지속시간·확신도 범위가 DB 제약으로 제한됩니다. |

### 식별 정보와 데이터 관계 검수

- **직접 식별 정보:** `users.email`, `users.name`, `companies.business_no`, `exam_participants.email/name`, `exam_participants.invite_token`은 개인 또는 회사를 직접 식별하거나 접근 권한을 줄 수 있는 값입니다. `invite_token`은 단순 업무 키가 아니라 링크 접근 토큰 성격이므로 외부 노출을 제한해야 합니다.
- **가명/연결 키:** `user_id`, `company_id`, `participant_id`, `attempt_id`, `session_id`는 단독으로 이름을 표현하지 않지만 여러 데이터의 결합 키라서 접근 통제가 필요합니다. 응시·감독 이력과 결합하면 특정 사람을 식별할 수 있습니다.
- **행동/민감 가능 데이터:** `proctor_events.detail`은 붙여넣은 글자 수, 얼굴 수, 고개 각도 등이 들어갈 수 있고 `snapshot_key`는 스냅샷 위치를 노출할 수 있습니다. 샘플은 원본 영상이 아니라 이벤트와 선택적 스냅샷 키만 사용합니다.
- `business_no`는 nullable unique라 샘플/시연 회사에서 비울 수 있으며, 값이 들어오면 중복을 막습니다. 샘플에는 실제 식별정보가 아닌 예시 이메일·회사·토큰이 들어 있습니다.

### 추가 관계의 무결성 한계와 점검 포인트

- DB에서 강제되는 조건: 회사 담당자 역할의 회사 필수, 회차 시간 순서, 회차+이메일 유일성, 초대 토큰 유일성, 응시당 참가자 최대 한 명, 이벤트 종류·지속시간·확신도 범위, 응시당 동의 최대 한 건.
- 테이블 간 조건은 FK/CHECK만으로 완전히 보장되지 않습니다. 정의서 README의 `verify.sql` 검증 대상에 따라 **회차의 과제와 연결된 응시의 과제가 같은지**, **회차 참가자의 회원과 응시 회원이 같은지**, **실전 회차 응시가 LIVE 모드인지**, **동의한 응시가 감독 회차에 속하는지**, **감독 이벤트가 회차 시간 내에 발생했는지**, **회차를 만든 담당자가 같은 회사 소속인지**를 별도 교차 검증해야 합니다.
- 현재 DDL은 `proctoring = false`인 회차에서도 `proctor_consents`/`proctor_events` 행이 생기는 것을 금지하지 않습니다. 또한 동의 시각이 응시 시작 이전인지, 스냅샷 키와 삭제 시각의 조합이 보존 정책에 맞는지도 DB CHECK로 제한하지 않습니다. 운영 규칙으로 확정하고 정합성 검사에 포함할 영역입니다.
- 샘플 검증 기록(2026-11-17)은 새 관계 정합성 5종에서 오류 0건, 새 잘못된 입력 차단 7종 모두 차단, 회사 담당자 불일치 0건을 기록합니다. 이는 샘플 DB 적재 당시 결과이며, 이번 문서 갱신에서 PostgreSQL 검증을 재실행한 것은 아닙니다.

## CSV 테스트 데이터의 DB 적재 흐름과 검증

33개 샘플 CSV를 FK 의존 순서로 데이터베이스에 넣어 관계와 제약을 검토하는 구조입니다.

~~~mermaid
flowchart LR
  A["기준 CSV<br/>users / tasks / rubric"] --> D["부모 레코드 적재"]
  B["과제·문항 CSV<br/>files / pages / questions"] --> E["자료/문항 종속 레코드 적재"]
  C["응시·채점 CSV<br/>attempts / turns / scores"] --> F["응시/결과 종속 레코드 적재"]
  D --> DB["PostgreSQL 샘플 DB"]
  E --> DB
  F --> DB
  DB --> V["관계·제약 검증"]
  CP["attempts ↔ checkpoints<br/>초기 삽입 후 FK 연결"] -.-> F
~~~

- 현재 CSV: 33개 파일, 총 1,266행(파일을 읽어 행 수를 재확인). 신규 테이블 샘플은 companies 1, exam_sessions 1, exam_participants 3, proctor_consents 2, proctor_events 5행입니다. 나머지 대표 행 수는 attempts 8, 대화 48, 작업 이벤트 75, 채점 7, 체크 결과 208, 모델 판정 306, 근거 359입니다.
- 예시 데이터: 회원 4행, 회사 1행, 초대 대상 3명 중 2명은 응시와 연결되고 1명은 미입장 상태입니다. 감독 동의 2건과 이벤트 5건이 두 실전 응시에 연결됩니다.
- 최신 정의서가 기록한 DB 검증은 FK 의존 순서 적재 오류 없음, 실전 회차 새 정합성 5종 오류 0건, 회사 담당자 정합성 오류 0건을 포함합니다. 최신 DDL 기준 FK는 45개입니다. 기존 정적 대조 결과(FK 36개, PK/UNIQUE 37조합)는 과거 28테이블 버전이므로 새 5개 테이블을 포함한 수치로 취급하지 않습니다.
- 체크포인트-턴 동일 응시, 선택 보기-답변 문항 일치, 첨부-응시 과제 일치, 답변 문항-응시 과제 일치, 모델 판정-채점 일치 교차검사는 모두 오류 0건입니다.
- 벡터 샘플은 1536차원입니다. CSV 행 수는 현재 파일을 직접 확인했고, PostgreSQL 적재/검증은 이번 문서 갱신에서 재실행하지 않았습니다. 샘플 README에 기록된 적재·잘못된 입력 차단·총점 일치 결과와 파일 재확인 결과를 구분합니다.
- attempts와 checkpoints는 서로 참조하므로 적재 시 attempts의 forked_from_checkpoint_id를 먼저 비워 둔 채 응시를 넣고, 체크포인트 삽입 후 FK를 연결하는 순서가 필요합니다.

## 참고

- 정의서: [테이블_정의서.md](C:/dev/pAIr/docs/erd/테이블_정의서.md)
- DDL: [pair_schema.sql](C:/dev/pAIr/docs/erd/pair_schema.sql)
- 샘플 CSV: [csv 디렉터리](C:/dev/pAIr/docs/erd/sample/csv)
- 검증 결과 기록: [README.md](C:/dev/pAIr/docs/erd/sample/README.md)

