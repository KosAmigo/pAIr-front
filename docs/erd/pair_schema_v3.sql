-- pAIr 스키마 v3 (eXERD v3_finally DDL을 실행 가능하게 고친 버전, PostgreSQL)
-- 원본 대비 수정 내역은 파일 끝 주석 참고.

CREATE EXTENSION IF NOT EXISTS vector;

-- =========================================================
-- 계정
-- =========================================================
CREATE TABLE companies (
    company_id            bigserial     PRIMARY KEY,
    company_user_email    varchar(255)  NOT NULL UNIQUE,
    company_name          varchar(50)   NOT NULL,
    company_password_hash varchar(100)  NOT NULL,
    name                  varchar(100)  NOT NULL,
    business_no           varchar(20)   UNIQUE,
    company_status        varchar(20)   NOT NULL DEFAULT 'PENDING'
                          CHECK (company_status IN ('PENDING', 'APPROVED')),
    created_at            timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON TABLE  companies IS '기업 회원(실전 시험을 여는 기업)';
COMMENT ON COLUMN companies.company_id IS '회사 ID';
COMMENT ON COLUMN companies.company_user_email IS '이메일(로그인 ID)';
COMMENT ON COLUMN companies.company_name IS '담당자 이름';
COMMENT ON COLUMN companies.company_password_hash IS '비밀번호 해시(BCrypt)';
COMMENT ON COLUMN companies.name IS '회사 이름';
COMMENT ON COLUMN companies.business_no IS '사업자등록번호';
COMMENT ON COLUMN companies.company_status IS '상태(PENDING 승인대기/APPROVED 정상)';
COMMENT ON COLUMN companies.created_at IS '등록 시각';

CREATE TABLE users (
    user_id       bigserial    PRIMARY KEY,
    email         varchar(255) NOT NULL UNIQUE,
    password_hash varchar(100) NOT NULL,
    name          varchar(50)  NOT NULL,
    member_status varchar(20)  NOT NULL DEFAULT 'ACTIVE'
                  CHECK (member_status IN ('ACTIVE', 'WITHDRAWN', 'PENDING')),
    role          varchar(10)  NOT NULL DEFAULT 'USER'
                  CHECK (role IN ('USER', 'ADMIN')),
    created_at    timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  users IS '회원(개인·관리자)';
COMMENT ON COLUMN users.user_id IS '회원 ID';
COMMENT ON COLUMN users.email IS '이메일(로그인 ID)';
COMMENT ON COLUMN users.password_hash IS '비밀번호 해시(BCrypt)';
COMMENT ON COLUMN users.name IS '이름';
COMMENT ON COLUMN users.member_status IS '회원 상태(ACTIVE/WITHDRAWN/PENDING)';
COMMENT ON COLUMN users.role IS '권한(USER/ADMIN)';
COMMENT ON COLUMN users.created_at IS '가입 시각';

-- =========================================================
-- 과제·자료
-- =========================================================
CREATE TABLE tasks (
    task_id        bigserial    PRIMARY KEY,
    code           varchar(50)  NOT NULL UNIQUE,
    title          varchar(200) NOT NULL,
    summary        varchar(200) NOT NULL,
    description    text         NOT NULL,
    requirements   text         NOT NULL,
    track          varchar(10)  NOT NULL CHECK (track IN ('DEV', 'BIZ')),
    category       varchar(30)  NOT NULL,
    difficulty     varchar(10)  NOT NULL,
    time_limit_min int          NOT NULL CHECK (time_limit_min > 0),
    status         varchar(20)  NOT NULL DEFAULT 'OPEN'
                   CHECK (status IN ('OPEN', 'CLOSE', 'HIDDEN'))
);
COMMENT ON TABLE  tasks IS '과제';
COMMENT ON COLUMN tasks.code IS '과제 코드';
COMMENT ON COLUMN tasks.summary IS '한 줄 소개(과제 목록 카드)';
COMMENT ON COLUMN tasks.description IS '상세 설명(응시 화면)';
COMMENT ON COLUMN tasks.track IS '직군(DEV/BIZ)';
COMMENT ON COLUMN tasks.category IS '과제 형태';
COMMENT ON COLUMN tasks.time_limit_min IS '제한 시간(분)';
COMMENT ON COLUMN tasks.status IS '상태(OPEN/CLOSE/HIDDEN)';

CREATE TABLE task_files (
    task_file_id      bigserial    PRIMARY KEY,
    task_id           bigint       NOT NULL REFERENCES tasks (task_id),
    path              varchar(255) NOT NULL,
    task_file_content text,
    storage_key       varchar(500),
    mime_type         varchar(100) NOT NULL,
    size_bytes        bigint       NOT NULL,
    visibility        varchar(10)  NOT NULL CHECK (visibility IN ('VISIBLE', 'HIDDEN')),
    read_only         boolean      NOT NULL DEFAULT false,
    UNIQUE (task_id, path)
);
COMMENT ON TABLE  task_files IS '과제 파일';
COMMENT ON COLUMN task_files.task_file_content IS '내용(텍스트 파일만)';
COMMENT ON COLUMN task_files.storage_key IS '저장 위치(PDF 등 바이너리 파일)';
COMMENT ON COLUMN task_files.visibility IS '공개 여부(VISIBLE/HIDDEN)';

CREATE TABLE document_pages (
    task_file_id bigint NOT NULL REFERENCES task_files (task_file_id),
    page_no      int    NOT NULL,
    text         text   NOT NULL,
    PRIMARY KEY (task_file_id, page_no)
);
COMMENT ON TABLE document_pages IS '문서 페이지 텍스트';

CREATE TABLE document_chunks (
    chunk_id      bigserial PRIMARY KEY,
    task_file_id  bigint    NOT NULL,
    page_no       int       NOT NULL,
    chunk_no      int       NOT NULL,
    chunk_content text      NOT NULL,
    token_count   int       NOT NULL,
    embedding     vector    NOT NULL,
    UNIQUE (task_file_id, page_no, chunk_no),
    FOREIGN KEY (task_file_id, page_no) REFERENCES document_pages (task_file_id, page_no)
);
COMMENT ON TABLE  document_chunks IS '문서 조각(채점용 RAG 임베딩)';
COMMENT ON COLUMN document_chunks.embedding IS '임베딩 벡터(차원은 임베딩 모델 확정 시 조정)';
-- 벡터 인덱스는 차원이 정해져야 만들 수 있다. 예: embedding을 vector(1536)으로 바꾼 뒤
-- CREATE INDEX idx_document_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- =========================================================
-- 문항
-- =========================================================
CREATE TABLE task_questions (
    question_id            bigserial   PRIMARY KEY,
    task_id                bigint      NOT NULL REFERENCES tasks (task_id),
    stage                  varchar(10) NOT NULL CHECK (stage IN ('TASK', 'FOLLOWUP')),
    question_type          varchar(10) NOT NULL CHECK (question_type IN ('SINGLE', 'MULTI', 'SHORT', 'ESSAY')),
    seq                    int         NOT NULL,
    task_questions_content text        NOT NULL,
    points                 int,
    answer_guide           text,
    active                 boolean     NOT NULL DEFAULT true,
    UNIQUE (question_id, question_type)
);
CREATE INDEX idx_task_questions_task_id ON task_questions (task_id);
COMMENT ON TABLE  task_questions IS '문항';
COMMENT ON COLUMN task_questions.points IS '배점(후속 질문은 없음)';
COMMENT ON COLUMN task_questions.answer_guide IS '서술형 채점 기준';

CREATE TABLE question_choices (
    choice_id                bigserial PRIMARY KEY,
    question_id              bigint    NOT NULL REFERENCES task_questions (question_id),
    seq                      int       NOT NULL,
    question_choices_content text      NOT NULL,
    is_correct               boolean   NOT NULL DEFAULT false,
    UNIQUE (choice_id, question_id)
);
CREATE INDEX idx_question_choices_question_id ON question_choices (question_id);
COMMENT ON TABLE question_choices IS '객관식 보기';

CREATE TABLE short_answer_keys (
    answer_key_id bigserial    PRIMARY KEY,
    question_id   bigint       NOT NULL REFERENCES task_questions (question_id),
    accepted      varchar(200) NOT NULL,
    UNIQUE (question_id, accepted)
);
COMMENT ON TABLE short_answer_keys IS '단답형 인정 답안(코드로 비교해 채점)';

CREATE TABLE question_sources (
    question_id  bigint      NOT NULL REFERENCES task_questions (question_id),
    task_file_id bigint      NOT NULL REFERENCES task_files (task_file_id),
    pages        varchar(50),
    note         text,
    PRIMARY KEY (question_id, task_file_id)
);
COMMENT ON TABLE question_sources IS '문항 근거 문서';

-- =========================================================
-- 응시
-- =========================================================
CREATE TABLE attempts (
    attempt_id                bigserial   PRIMARY KEY,
    user_id                   bigint      NOT NULL REFERENCES users (user_id),
    task_id                   bigint      NOT NULL REFERENCES tasks (task_id),
    mode                      varchar(10) NOT NULL CHECK (mode IN ('SELF', 'LIVE')),
    status                    varchar(20) NOT NULL,
    assistant_model           varchar(50) NOT NULL,
    forked_from_checkpoint_id bigint,
    started_at                timestamptz NOT NULL DEFAULT now(),
    submitted_at              timestamptz,
    followups_done_at         timestamptz
);
CREATE INDEX idx_attempts_user_id ON attempts (user_id);
COMMENT ON TABLE  attempts IS '응시';
COMMENT ON COLUMN attempts.mode IS '모드(SELF 자가진단/LIVE 실전)';
COMMENT ON COLUMN attempts.forked_from_checkpoint_id IS '롤백 출발 체크포인트 ID';

CREATE TABLE checkpoints (
    checkpoint_id bigserial    PRIMARY KEY,
    attempt_id    bigint       NOT NULL REFERENCES attempts (attempt_id),
    turn_no       int          NOT NULL,
    label         varchar(100),
    created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_checkpoints_attempt_id ON checkpoints (attempt_id);
COMMENT ON TABLE checkpoints IS '체크포인트';

ALTER TABLE attempts
    ADD CONSTRAINT fk_attempts_checkpoint
    FOREIGN KEY (forked_from_checkpoint_id) REFERENCES checkpoints (checkpoint_id);

CREATE TABLE checkpoint_files (
    checkpoint_id            bigint       NOT NULL REFERENCES checkpoints (checkpoint_id),
    path                     varchar(255) NOT NULL,
    checkpoint_files_content text         NOT NULL,
    PRIMARY KEY (checkpoint_id, path)
);
COMMENT ON TABLE checkpoint_files IS '체크포인트 파일';

CREATE TABLE attempt_files (
    attempt_file_id       bigserial    PRIMARY KEY,
    attempt_id            bigint       NOT NULL REFERENCES attempts (attempt_id),
    path                  varchar(255) NOT NULL,
    attempt_files_content text         NOT NULL,
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, path)
);
COMMENT ON TABLE attempt_files IS '응시 작업 파일';

CREATE TABLE chat_turns (
    turn_id            bigserial   PRIMARY KEY,
    attempt_id         bigint      NOT NULL REFERENCES attempts (attempt_id),
    turn_no            int         NOT NULL,
    role               varchar(10) NOT NULL CHECK (role IN ('USER', 'AI')),
    chat_turns_content text        NOT NULL,
    model              varchar(50),
    input_tokens       int,
    output_tokens      int,
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, turn_no)
);
COMMENT ON TABLE chat_turns IS 'AI 대화';

CREATE TABLE chat_attachments (
    attachment_id bigserial    PRIMARY KEY,
    turn_id       bigint       NOT NULL REFERENCES chat_turns (turn_id),
    source_type   varchar(20)  NOT NULL CHECK (source_type IN ('TASK_FILE', 'ATTEMPT_FILE')),
    task_file_id  bigint       REFERENCES task_files (task_file_id),
    file_name     varchar(255) NOT NULL,
    pages         varchar(50),
    mime_type     varchar(100) NOT NULL,
    sent_text     text         NOT NULL,
    CHECK (source_type <> 'TASK_FILE' OR task_file_id IS NOT NULL)
);
CREATE INDEX idx_chat_attachments_turn_id ON chat_attachments (turn_id);
COMMENT ON TABLE chat_attachments IS '대화 첨부';

CREATE TABLE attempt_events (
    event_id   bigserial   PRIMARY KEY,
    attempt_id bigint      NOT NULL REFERENCES attempts (attempt_id),
    type       varchar(20) NOT NULL CHECK (type IN ('SAVE', 'BUILD', 'RUN', 'AI_EDIT', 'SUBMIT')),
    payload    jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempt_events_attempt_id ON attempt_events (attempt_id);
COMMENT ON TABLE attempt_events IS '작업 기록';

CREATE TABLE text_answers (
    text_answer_id       bigserial   PRIMARY KEY,
    attempt_id           bigint      NOT NULL REFERENCES attempts (attempt_id),
    question_id          bigint      NOT NULL,
    question_type        varchar(10) NOT NULL CHECK (question_type IN ('SHORT', 'ESSAY')),
    text_answers_content text        NOT NULL,
    answered_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, question_id),
    FOREIGN KEY (question_id, question_type) REFERENCES task_questions (question_id, question_type)
);
COMMENT ON TABLE text_answers IS '단답형·서술형 답변';

CREATE TABLE choice_answers (
    attempt_id    bigint      NOT NULL REFERENCES attempts (attempt_id),
    question_id   bigint      NOT NULL,
    question_type varchar(10) NOT NULL CHECK (question_type IN ('SINGLE', 'MULTI')),
    choice_id     bigint      NOT NULL,
    answered_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, choice_id),
    FOREIGN KEY (choice_id, question_id) REFERENCES question_choices (choice_id, question_id),
    FOREIGN KEY (question_id, question_type) REFERENCES task_questions (question_id, question_type)
);
-- SINGLE 문항만 응시당 보기 하나로 제한한다(MULTI는 여러 개 선택 가능).
CREATE UNIQUE INDEX uq_choice_answers_single
    ON choice_answers (attempt_id, question_id) WHERE question_type = 'SINGLE';
COMMENT ON TABLE choice_answers IS '객관식 답변(선택한 보기)';

-- =========================================================
-- 실전 시험·감독
-- =========================================================
CREATE TABLE exam_sessions (
    session_id bigserial    PRIMARY KEY,
    company_id bigint       NOT NULL REFERENCES companies (company_id),
    title      varchar(100) NOT NULL,
    entry_code varchar(20)  NOT NULL UNIQUE,
    starts_at  timestamptz  NOT NULL,
    ends_at    timestamptz  NOT NULL,
    proctoring boolean      NOT NULL DEFAULT true,
    file_path  varchar(500),
    created_at timestamptz  NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX idx_exam_sessions_company_id ON exam_sessions (company_id);
COMMENT ON TABLE  exam_sessions IS '시험 회차';
COMMENT ON COLUMN exam_sessions.entry_code IS '입장 코드';
COMMENT ON COLUMN exam_sessions.file_path IS '첨부 파일 경로';

CREATE TABLE task_set (
    session_id bigint NOT NULL REFERENCES exam_sessions (session_id),
    task_id    bigint NOT NULL REFERENCES tasks (task_id),
    sort_order int    NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id, task_id)
);
CREATE INDEX idx_task_set_task_id ON task_set (task_id);
COMMENT ON TABLE task_set IS '회차 과제 묶음';

CREATE TABLE exam_participants (
    participant_id bigserial    PRIMARY KEY,
    session_id     bigint       NOT NULL REFERENCES exam_sessions (session_id),
    email          varchar(255) NOT NULL,
    name           varchar(50)  NOT NULL,
    invite_token   varchar(64)  NOT NULL UNIQUE,
    attempt_id     bigint       UNIQUE REFERENCES attempts (attempt_id),
    invited_at     timestamptz  NOT NULL DEFAULT now(),
    entered_at     timestamptz,
    UNIQUE (session_id, email)
);
COMMENT ON TABLE exam_participants IS '회차 응시 대상자';

CREATE TABLE proctor_consents (
    attempt_id      bigint      PRIMARY KEY REFERENCES attempts (attempt_id),
    consent_version varchar(20) NOT NULL,
    env_check       jsonb       NOT NULL,
    consented_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE proctor_consents IS '감독 동의·환경 점검';

CREATE TABLE proctor_events (
    proctor_event_id    bigserial    PRIMARY KEY,
    attempt_id          bigint       NOT NULL REFERENCES attempts (attempt_id),
    type                varchar(20)  NOT NULL CHECK (type IN ('TAB_HIDDEN', 'WINDOW_BLUR', 'PASTE', 'FULLSCREEN_EXIT',
                                                          'NO_FACE', 'MULTI_FACE', 'HEAD_TURN', 'PHONE')),
    started_at          timestamptz  NOT NULL,
    duration_ms         int          NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    confidence          numeric(4,3) CHECK (confidence >= 0 AND confidence <= 1),
    detail              jsonb,
    snapshot_key        varchar(255),
    snapshot_deleted_at timestamptz
);
CREATE INDEX idx_proctor_events_attempt_id ON proctor_events (attempt_id);
COMMENT ON TABLE proctor_events IS '감독 이벤트';

-- =========================================================
-- 채점
-- =========================================================
CREATE TABLE rubric_items (
    item_key   varchar(30) PRIMARY KEY,
    name       varchar(50) NOT NULL,
    max_score  int         NOT NULL,
    sort_order int         NOT NULL
);
COMMENT ON TABLE rubric_items IS '역량 항목';

CREATE TABLE rubric_checks (
    check_id bigserial    PRIMARY KEY,
    item_key varchar(30)  NOT NULL REFERENCES rubric_items (item_key),
    code     varchar(10)  NOT NULL,
    track    varchar(10)  NOT NULL CHECK (track IN ('ALL', 'DEV', 'BIZ')),
    method   varchar(10)  NOT NULL CHECK (method IN ('AUTO', 'JUDGE')),
    points   int          NOT NULL,
    label    varchar(300) NOT NULL,
    UNIQUE (code, track)
);
COMMENT ON TABLE rubric_checks IS '체크 항목';

CREATE TABLE prompt_versions (
    version_id        bigserial    PRIMARY KEY,
    name              varchar(100) NOT NULL,
    note              varchar(500),
    parent_version_id bigint       REFERENCES prompt_versions (version_id),
    judge_system      text         NOT NULL,
    is_active         boolean      NOT NULL DEFAULT false,
    created_at        timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE prompt_versions IS '채점 프롬프트 버전(팀 공용)';

CREATE TABLE prompt_check_hints (
    version_id bigint NOT NULL REFERENCES prompt_versions (version_id),
    check_id   bigint NOT NULL REFERENCES rubric_checks (check_id),
    hint       text   NOT NULL,
    PRIMARY KEY (version_id, check_id)
);
COMMENT ON TABLE prompt_check_hints IS '판정 기준 문장';

CREATE TABLE scorings (
    scoring_id  bigserial   PRIMARY KEY,
    attempt_id  bigint      NOT NULL REFERENCES attempts (attempt_id),
    version_id  bigint      NOT NULL REFERENCES prompt_versions (version_id),
    status      varchar(20) NOT NULL,
    error       text,
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
CREATE INDEX idx_scorings_attempt_id ON scorings (attempt_id);
COMMENT ON TABLE scorings IS '채점(실제 응시 채점)';

CREATE TABLE judge_calls (
    judge_call_id bigserial   PRIMARY KEY,
    scoring_id    bigint      NOT NULL REFERENCES scorings (scoring_id),
    model         varchar(50) NOT NULL,
    input_tokens  int         NOT NULL DEFAULT 0,
    output_tokens int         NOT NULL DEFAULT 0,
    cached_tokens int         NOT NULL DEFAULT 0
);
CREATE INDEX idx_judge_calls_scoring_id ON judge_calls (scoring_id);
COMMENT ON TABLE judge_calls IS '채점 모델 호출';

CREATE TABLE check_results (
    result_id  bigserial   PRIMARY KEY,
    scoring_id bigint      NOT NULL REFERENCES scorings (scoring_id),
    check_id   bigint      NOT NULL REFERENCES rubric_checks (check_id),
    deducted   int         NOT NULL DEFAULT 0,
    status     varchar(20) NOT NULL CHECK (status IN ('DEDUCTED', 'PASSED', 'SPLIT', 'NO_EVIDENCE', 'SKIPPED')),
    reason     text,
    UNIQUE (scoring_id, check_id)
);
COMMENT ON TABLE check_results IS '체크 결과';

CREATE TABLE judge_verdicts (
    verdict_id    bigserial PRIMARY KEY,
    result_id     bigint    NOT NULL REFERENCES check_results (result_id),
    judge_call_id bigint    NOT NULL REFERENCES judge_calls (judge_call_id),
    violated      boolean   NOT NULL,
    count         int       NOT NULL DEFAULT 0,
    reason        text
);
CREATE INDEX idx_judge_verdicts_result_id ON judge_verdicts (result_id);
COMMENT ON TABLE judge_verdicts IS '모델별 판정';

CREATE TABLE verdict_evidences (
    verdict_id bigint      NOT NULL REFERENCES judge_verdicts (verdict_id),
    ref        varchar(50) NOT NULL,
    PRIMARY KEY (verdict_id, ref)
);
COMMENT ON TABLE verdict_evidences IS '판정 근거(#T03, 파일명, Q2)';

CREATE TABLE question_results (
    scoring_id  bigint      NOT NULL REFERENCES scorings (scoring_id),
    question_id bigint      NOT NULL REFERENCES task_questions (question_id),
    score       int         NOT NULL,
    method      varchar(10) NOT NULL CHECK (method IN ('AUTO', 'JUDGE')),
    reason      text,
    PRIMARY KEY (scoring_id, question_id)
);
COMMENT ON TABLE question_results IS '문항 채점 결과';

-- =========================================================
-- 원본 DDL 대비 수정 내역
-- 1. users_check 삭제: users에 company_id가 없어 실행 실패. role은 USER/ADMIN만 허용.
-- 2. companies_business_no_key: 빈 인덱스 → business_no UNIQUE.
-- 3. exam_sessions: entry_code 컬럼 추가(UNIQUE), company_id 인덱스 채움, company_id NOT NULL.
-- 4. idx_exam_participants_user_id 삭제(대상 컬럼 없음).
-- 5. exam_sessions.files_pash PATH → file_path varchar(500).
-- 6. companies.company_id 자동 증가, company_user_email NOT NULL + UNIQUE.
-- 7. company_status·member_status NOT NULL + 영문 코드 CHECK.
-- 8. uq_choice_answers_single → SINGLE 문항만 거는 부분 인덱스(MULTI 다중 선택 허용).
-- 9. idx_document_chunks_embedding: 차원 없는 vector에는 만들 수 없어 주석으로 보류.
-- 10. 상태·유형 컬럼에 CHECK 추가, task_set.sort_order 추가, 누락된 FK 인덱스 추가.
-- =========================================================
