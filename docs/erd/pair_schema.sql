-- pAIr ERD (PostgreSQL, 3정규형 기준)
-- 반정규화(점수 합계 컬럼 등)는 팀에서 판단해 추가한다.

-- ───────── 1. 회원 · 과제 ─────────

CREATE TABLE users (
    user_id        BIGSERIAL    PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(100) NOT NULL,
    name           VARCHAR(50)  NOT NULL,
    role           VARCHAR(10)  NOT NULL DEFAULT 'USER',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  users IS '회원';
COMMENT ON COLUMN users.user_id IS '회원 ID';
COMMENT ON COLUMN users.email IS '이메일(로그인 ID)';
COMMENT ON COLUMN users.password_hash IS '비밀번호 해시(BCrypt)';
COMMENT ON COLUMN users.name IS '이름';
COMMENT ON COLUMN users.role IS '권한(USER/ADMIN)';
COMMENT ON COLUMN users.created_at IS '가입 시각';

CREATE TABLE tasks (
    task_id         BIGSERIAL    PRIMARY KEY,
    code            VARCHAR(50)  NOT NULL UNIQUE,
    title           VARCHAR(200) NOT NULL,
    description     TEXT         NOT NULL,
    requirements    TEXT         NOT NULL,
    track           VARCHAR(10)  NOT NULL,
    category        VARCHAR(30)  NOT NULL,
    difficulty      VARCHAR(10)  NOT NULL,
    time_limit_min  INT          NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
);
COMMENT ON TABLE  tasks IS '과제';
COMMENT ON COLUMN tasks.task_id IS '과제 ID';
COMMENT ON COLUMN tasks.code IS '과제 코드';
COMMENT ON COLUMN tasks.title IS '제목';
COMMENT ON COLUMN tasks.description IS '설명';
COMMENT ON COLUMN tasks.requirements IS '요구사항';
COMMENT ON COLUMN tasks.track IS '직군(DEV/BIZ)';
COMMENT ON COLUMN tasks.category IS '과제 형태';
COMMENT ON COLUMN tasks.difficulty IS '난이도';
COMMENT ON COLUMN tasks.time_limit_min IS '제한 시간(분)';
COMMENT ON COLUMN tasks.status IS '상태(OPEN/COMING_SOON)';

CREATE TABLE task_files (
    task_file_id  BIGSERIAL    PRIMARY KEY,
    task_id       BIGINT       NOT NULL REFERENCES tasks (task_id),
    path          VARCHAR(255) NOT NULL,
    content       TEXT,
    storage_key   VARCHAR(500),
    mime_type     VARCHAR(100) NOT NULL,
    size_bytes    BIGINT       NOT NULL,
    visibility    VARCHAR(10)  NOT NULL,
    read_only     BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (task_id, path)
);
COMMENT ON TABLE  task_files IS '과제 파일';
COMMENT ON COLUMN task_files.task_file_id IS '과제 파일 ID';
COMMENT ON COLUMN task_files.task_id IS '과제 ID';
COMMENT ON COLUMN task_files.path IS '파일 경로';
COMMENT ON COLUMN task_files.content IS '내용(텍스트 파일만)';
COMMENT ON COLUMN task_files.storage_key IS '저장 위치(PDF 등 바이너리 파일)';
COMMENT ON COLUMN task_files.mime_type IS '파일 형식';
COMMENT ON COLUMN task_files.size_bytes IS '파일 크기';
COMMENT ON COLUMN task_files.visibility IS '공개 여부(VISIBLE/HIDDEN)';
COMMENT ON COLUMN task_files.read_only IS '읽기 전용';

CREATE TABLE document_pages (
    task_file_id  BIGINT NOT NULL REFERENCES task_files (task_file_id),
    page_no       INT    NOT NULL,
    text          TEXT   NOT NULL,
    PRIMARY KEY (task_file_id, page_no)
);
COMMENT ON TABLE  document_pages IS '문서 페이지 텍스트';
COMMENT ON COLUMN document_pages.task_file_id IS '과제 파일 ID';
COMMENT ON COLUMN document_pages.page_no IS '페이지 번호';
COMMENT ON COLUMN document_pages.text IS '추출한 텍스트';

CREATE TABLE task_questions (
    question_id    BIGSERIAL   PRIMARY KEY,
    task_id        BIGINT      NOT NULL REFERENCES tasks (task_id),
    stage          VARCHAR(10) NOT NULL,
    question_type  VARCHAR(10) NOT NULL,
    seq            INT         NOT NULL,
    content        TEXT        NOT NULL,
    points         INT,
    answer_guide   TEXT,
    active         BOOLEAN     NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE  task_questions IS '문항';
COMMENT ON COLUMN task_questions.question_id IS '문항 ID';
COMMENT ON COLUMN task_questions.task_id IS '과제 ID';
COMMENT ON COLUMN task_questions.stage IS '단계(TASK/FOLLOWUP)';
COMMENT ON COLUMN task_questions.question_type IS '유형(SINGLE/MULTI/SHORT/ESSAY)';
COMMENT ON COLUMN task_questions.seq IS '순서';
COMMENT ON COLUMN task_questions.content IS '문제 내용';
COMMENT ON COLUMN task_questions.points IS '배점(후속 질문은 없음)';
COMMENT ON COLUMN task_questions.answer_guide IS '서술형 채점 기준';
COMMENT ON COLUMN task_questions.active IS '사용 여부';

CREATE TABLE question_choices (
    choice_id    BIGSERIAL PRIMARY KEY,
    question_id  BIGINT    NOT NULL REFERENCES task_questions (question_id),
    seq          INT       NOT NULL,
    content      TEXT      NOT NULL,
    is_correct   BOOLEAN   NOT NULL DEFAULT FALSE
);
COMMENT ON TABLE  question_choices IS '객관식 보기';
COMMENT ON COLUMN question_choices.choice_id IS '보기 ID';
COMMENT ON COLUMN question_choices.question_id IS '문항 ID';
COMMENT ON COLUMN question_choices.seq IS '보기 순서';
COMMENT ON COLUMN question_choices.content IS '보기 내용';
COMMENT ON COLUMN question_choices.is_correct IS '정답 여부';

CREATE TABLE short_answer_keys (
    question_id  BIGINT       NOT NULL REFERENCES task_questions (question_id),
    accepted     VARCHAR(200) NOT NULL,
    PRIMARY KEY (question_id, accepted)
);
COMMENT ON TABLE  short_answer_keys IS '단답형 정답(코드로 비교해 채점)';
COMMENT ON COLUMN short_answer_keys.question_id IS '문항 ID';
COMMENT ON COLUMN short_answer_keys.accepted IS '인정 답안';

CREATE TABLE question_sources (
    question_id   BIGINT      NOT NULL REFERENCES task_questions (question_id),
    task_file_id  BIGINT      NOT NULL REFERENCES task_files (task_file_id),
    pages         VARCHAR(50),
    note          TEXT,
    PRIMARY KEY (question_id, task_file_id)
);
COMMENT ON TABLE  question_sources IS '문항 근거 문서';
COMMENT ON COLUMN question_sources.question_id IS '문항 ID';
COMMENT ON COLUMN question_sources.task_file_id IS '과제 파일 ID';
COMMENT ON COLUMN question_sources.pages IS '근거 페이지';
COMMENT ON COLUMN question_sources.note IS '출제 메모';

-- ───────── 2. 응시 · 3. 복기 트리 ─────────

CREATE TABLE attempts (
    attempt_id                 BIGSERIAL    PRIMARY KEY,
    user_id                    BIGINT       NOT NULL REFERENCES users (user_id),
    task_id                    BIGINT       NOT NULL REFERENCES tasks (task_id),
    mode                       VARCHAR(10)  NOT NULL,
    status                     VARCHAR(20)  NOT NULL,
    assistant_model            VARCHAR(50)  NOT NULL,
    forked_from_checkpoint_id  BIGINT,
    started_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
    submitted_at               TIMESTAMPTZ,
    followups_done_at          TIMESTAMPTZ
);
COMMENT ON TABLE  attempts IS '응시';
COMMENT ON COLUMN attempts.attempt_id IS '응시 ID';
COMMENT ON COLUMN attempts.user_id IS '회원 ID';
COMMENT ON COLUMN attempts.task_id IS '과제 ID';
COMMENT ON COLUMN attempts.mode IS '모드(SELF/LIVE)';
COMMENT ON COLUMN attempts.status IS '상태';
COMMENT ON COLUMN attempts.assistant_model IS '어시스턴트 모델';
COMMENT ON COLUMN attempts.forked_from_checkpoint_id IS '롤백 출발 체크포인트 ID';
COMMENT ON COLUMN attempts.started_at IS '시작 시각';
COMMENT ON COLUMN attempts.submitted_at IS '제출 시각';
COMMENT ON COLUMN attempts.followups_done_at IS '후속 질문 완료 시각';

CREATE TABLE attempt_files (
    attempt_file_id  BIGSERIAL    PRIMARY KEY,
    attempt_id       BIGINT       NOT NULL REFERENCES attempts (attempt_id),
    path             VARCHAR(255) NOT NULL,
    content          TEXT         NOT NULL,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, path)
);
COMMENT ON TABLE  attempt_files IS '응시 작업 파일';
COMMENT ON COLUMN attempt_files.attempt_file_id IS '응시 파일 ID';
COMMENT ON COLUMN attempt_files.attempt_id IS '응시 ID';
COMMENT ON COLUMN attempt_files.path IS '파일 경로';
COMMENT ON COLUMN attempt_files.content IS '내용';
COMMENT ON COLUMN attempt_files.updated_at IS '수정 시각';

CREATE TABLE chat_turns (
    turn_id        BIGSERIAL    PRIMARY KEY,
    attempt_id     BIGINT       NOT NULL REFERENCES attempts (attempt_id),
    turn_no        INT          NOT NULL,
    role           VARCHAR(10)  NOT NULL,
    content        TEXT         NOT NULL,
    model          VARCHAR(50),
    input_tokens   INT,
    output_tokens  INT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, turn_no)
);
COMMENT ON TABLE  chat_turns IS 'AI 대화';
COMMENT ON COLUMN chat_turns.turn_id IS '대화 ID';
COMMENT ON COLUMN chat_turns.attempt_id IS '응시 ID';
COMMENT ON COLUMN chat_turns.turn_no IS '턴 번호';
COMMENT ON COLUMN chat_turns.role IS '역할(USER/AI)';
COMMENT ON COLUMN chat_turns.content IS '내용';
COMMENT ON COLUMN chat_turns.model IS '모델';
COMMENT ON COLUMN chat_turns.input_tokens IS '입력 토큰';
COMMENT ON COLUMN chat_turns.output_tokens IS '출력 토큰';
COMMENT ON COLUMN chat_turns.created_at IS '생성 시각';

CREATE TABLE attempt_events (
    event_id    BIGSERIAL    PRIMARY KEY,
    attempt_id  BIGINT       NOT NULL REFERENCES attempts (attempt_id),
    type        VARCHAR(20)  NOT NULL,
    payload     JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  attempt_events IS '작업 기록';
COMMENT ON COLUMN attempt_events.event_id IS '이벤트 ID';
COMMENT ON COLUMN attempt_events.attempt_id IS '응시 ID';
COMMENT ON COLUMN attempt_events.type IS '종류(SAVE/BUILD/RUN/AI_EDIT/SUBMIT)';
COMMENT ON COLUMN attempt_events.payload IS '상세 내용';
COMMENT ON COLUMN attempt_events.created_at IS '발생 시각';

CREATE TABLE question_answers (
    answer_id    BIGSERIAL    PRIMARY KEY,
    attempt_id   BIGINT       NOT NULL REFERENCES attempts (attempt_id),
    question_id  BIGINT       NOT NULL REFERENCES task_questions (question_id),
    text_answer  TEXT,
    answered_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, question_id)
);
COMMENT ON TABLE  question_answers IS '문항 답변';
COMMENT ON COLUMN question_answers.answer_id IS '답변 ID';
COMMENT ON COLUMN question_answers.attempt_id IS '응시 ID';
COMMENT ON COLUMN question_answers.question_id IS '문항 ID';
COMMENT ON COLUMN question_answers.text_answer IS '답변 글(객관식은 없음)';
COMMENT ON COLUMN question_answers.answered_at IS '답변 시각';

CREATE TABLE answer_choices (
    answer_id  BIGINT NOT NULL REFERENCES question_answers (answer_id),
    choice_id  BIGINT NOT NULL REFERENCES question_choices (choice_id),
    PRIMARY KEY (answer_id, choice_id)
);
COMMENT ON TABLE  answer_choices IS '선택한 보기';
COMMENT ON COLUMN answer_choices.answer_id IS '답변 ID';
COMMENT ON COLUMN answer_choices.choice_id IS '보기 ID';

CREATE TABLE chat_attachments (
    attachment_id  BIGSERIAL    PRIMARY KEY,
    turn_id        BIGINT       NOT NULL REFERENCES chat_turns (turn_id),
    source_type    VARCHAR(20)  NOT NULL CHECK (source_type IN ('TASK_FILE', 'ATTEMPT_FILE')),
    task_file_id   BIGINT       REFERENCES task_files (task_file_id),
    file_name      VARCHAR(255) NOT NULL,
    pages          VARCHAR(50),
    mime_type      VARCHAR(100) NOT NULL,
    sent_text      TEXT         NOT NULL,
    CHECK (source_type <> 'TASK_FILE' OR task_file_id IS NOT NULL)
);
COMMENT ON TABLE  chat_attachments IS '대화 첨부';
COMMENT ON COLUMN chat_attachments.attachment_id IS '첨부 ID';
COMMENT ON COLUMN chat_attachments.turn_id IS '대화 ID(질문 턴)';
COMMENT ON COLUMN chat_attachments.source_type IS '출처(TASK_FILE/ATTEMPT_FILE)';
COMMENT ON COLUMN chat_attachments.task_file_id IS '과제 파일 ID(과제 자료일 때)';
COMMENT ON COLUMN chat_attachments.file_name IS '파일 이름';
COMMENT ON COLUMN chat_attachments.pages IS '첨부 페이지 범위';
COMMENT ON COLUMN chat_attachments.mime_type IS '파일 형식';
COMMENT ON COLUMN chat_attachments.sent_text IS 'AI에 보낸 내용';

CREATE TABLE checkpoints (
    checkpoint_id  BIGSERIAL    PRIMARY KEY,
    attempt_id     BIGINT       NOT NULL REFERENCES attempts (attempt_id),
    turn_no        INT          NOT NULL,
    label          VARCHAR(100),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  checkpoints IS '체크포인트';
COMMENT ON COLUMN checkpoints.checkpoint_id IS '체크포인트 ID';
COMMENT ON COLUMN checkpoints.attempt_id IS '응시 ID';
COMMENT ON COLUMN checkpoints.turn_no IS '대화 시점(턴 번호)';
COMMENT ON COLUMN checkpoints.label IS '이름';
COMMENT ON COLUMN checkpoints.created_at IS '생성 시각';

ALTER TABLE attempts
    ADD CONSTRAINT fk_attempts_checkpoint
    FOREIGN KEY (forked_from_checkpoint_id) REFERENCES checkpoints (checkpoint_id);

CREATE TABLE checkpoint_files (
    checkpoint_id  BIGINT       NOT NULL REFERENCES checkpoints (checkpoint_id),
    path           VARCHAR(255) NOT NULL,
    content        TEXT         NOT NULL,
    PRIMARY KEY (checkpoint_id, path)
);
COMMENT ON TABLE  checkpoint_files IS '체크포인트 파일';
COMMENT ON COLUMN checkpoint_files.checkpoint_id IS '체크포인트 ID';
COMMENT ON COLUMN checkpoint_files.path IS '파일 경로';
COMMENT ON COLUMN checkpoint_files.content IS '내용';

-- ───────── 4. 채점 기준 ─────────

CREATE TABLE rubric_items (
    item_key    VARCHAR(30) PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    max_score   INT         NOT NULL,
    sort_order  INT         NOT NULL
);
COMMENT ON TABLE  rubric_items IS '역량 항목';
COMMENT ON COLUMN rubric_items.item_key IS '항목 키';
COMMENT ON COLUMN rubric_items.name IS '항목 이름';
COMMENT ON COLUMN rubric_items.max_score IS '배점';
COMMENT ON COLUMN rubric_items.sort_order IS '표시 순서';

CREATE TABLE rubric_checks (
    check_id  BIGSERIAL    PRIMARY KEY,
    item_key  VARCHAR(30)  NOT NULL REFERENCES rubric_items (item_key),
    code      VARCHAR(10)  NOT NULL,
    track     VARCHAR(10)  NOT NULL,
    method    VARCHAR(10)  NOT NULL,
    points    INT          NOT NULL,
    label     VARCHAR(300) NOT NULL,
    UNIQUE (code, track)
);
COMMENT ON TABLE  rubric_checks IS '체크 항목';
COMMENT ON COLUMN rubric_checks.check_id IS '체크 ID';
COMMENT ON COLUMN rubric_checks.item_key IS '항목 키';
COMMENT ON COLUMN rubric_checks.code IS '체크 코드';
COMMENT ON COLUMN rubric_checks.track IS '적용 직군(ALL/DEV/BIZ)';
COMMENT ON COLUMN rubric_checks.method IS '판정 방식(AUTO/JUDGE)';
COMMENT ON COLUMN rubric_checks.points IS '감점';
COMMENT ON COLUMN rubric_checks.label IS '체크 내용';

CREATE TABLE prompt_versions (
    version_id         BIGSERIAL    PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    note               VARCHAR(500),
    parent_version_id  BIGINT       REFERENCES prompt_versions (version_id),
    judge_system       TEXT         NOT NULL,
    is_active          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  prompt_versions IS '채점 프롬프트 버전(팀 공용, 작성자 구분 없음)';
COMMENT ON COLUMN prompt_versions.version_id IS '버전 ID';
COMMENT ON COLUMN prompt_versions.name IS '버전 이름';
COMMENT ON COLUMN prompt_versions.note IS '메모';
COMMENT ON COLUMN prompt_versions.parent_version_id IS '바탕 버전 ID';
COMMENT ON COLUMN prompt_versions.judge_system IS '공통 채점 규칙';
COMMENT ON COLUMN prompt_versions.is_active IS '실제 채점 사용 여부';
COMMENT ON COLUMN prompt_versions.created_at IS '생성 시각';

CREATE TABLE prompt_check_hints (
    version_id  BIGINT NOT NULL REFERENCES prompt_versions (version_id),
    check_id    BIGINT NOT NULL REFERENCES rubric_checks (check_id),
    hint        TEXT   NOT NULL,
    PRIMARY KEY (version_id, check_id)
);
COMMENT ON TABLE  prompt_check_hints IS '판정 기준 문장';
COMMENT ON COLUMN prompt_check_hints.version_id IS '버전 ID';
COMMENT ON COLUMN prompt_check_hints.check_id IS '체크 ID';
COMMENT ON COLUMN prompt_check_hints.hint IS '판정 기준';

-- ───────── 5. 채점 결과 ─────────

CREATE TABLE scorings (
    scoring_id   BIGSERIAL    PRIMARY KEY,
    attempt_id   BIGINT       NOT NULL REFERENCES attempts (attempt_id),
    version_id   BIGINT       NOT NULL REFERENCES prompt_versions (version_id),
    status       VARCHAR(20)  NOT NULL,
    error        TEXT,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);
COMMENT ON TABLE  scorings IS '채점(실제 응시 채점. 채점 툴 실험 기록은 git의 grader/runs 파일)';
COMMENT ON COLUMN scorings.scoring_id IS '채점 ID';
COMMENT ON COLUMN scorings.attempt_id IS '응시 ID';
COMMENT ON COLUMN scorings.version_id IS '버전 ID';
COMMENT ON COLUMN scorings.status IS '상태';
COMMENT ON COLUMN scorings.error IS '오류 내용';
COMMENT ON COLUMN scorings.started_at IS '시작 시각';
COMMENT ON COLUMN scorings.finished_at IS '종료 시각';

CREATE TABLE judge_calls (
    judge_call_id  BIGSERIAL   PRIMARY KEY,
    scoring_id     BIGINT      NOT NULL REFERENCES scorings (scoring_id),
    model          VARCHAR(50) NOT NULL,
    input_tokens   INT         NOT NULL DEFAULT 0,
    output_tokens  INT         NOT NULL DEFAULT 0,
    cached_tokens  INT         NOT NULL DEFAULT 0
);
COMMENT ON TABLE  judge_calls IS '채점 모델 호출';
COMMENT ON COLUMN judge_calls.judge_call_id IS '호출 ID';
COMMENT ON COLUMN judge_calls.scoring_id IS '채점 ID';
COMMENT ON COLUMN judge_calls.model IS '채점 모델';
COMMENT ON COLUMN judge_calls.input_tokens IS '입력 토큰';
COMMENT ON COLUMN judge_calls.output_tokens IS '출력 토큰';
COMMENT ON COLUMN judge_calls.cached_tokens IS '캐시 입력 토큰';

CREATE TABLE check_results (
    result_id   BIGSERIAL   PRIMARY KEY,
    scoring_id  BIGINT      NOT NULL REFERENCES scorings (scoring_id),
    check_id    BIGINT      NOT NULL REFERENCES rubric_checks (check_id),
    deducted    INT         NOT NULL DEFAULT 0,
    status      VARCHAR(20) NOT NULL,
    reason      TEXT,
    UNIQUE (scoring_id, check_id)
);
COMMENT ON TABLE  check_results IS '체크 결과';
COMMENT ON COLUMN check_results.result_id IS '결과 ID';
COMMENT ON COLUMN check_results.scoring_id IS '채점 ID';
COMMENT ON COLUMN check_results.check_id IS '체크 ID';
COMMENT ON COLUMN check_results.deducted IS '감점';
COMMENT ON COLUMN check_results.status IS '결과(DEDUCTED/PASSED/SPLIT/NO_EVIDENCE/SKIPPED)';
COMMENT ON COLUMN check_results.reason IS '이유';

CREATE TABLE judge_verdicts (
    verdict_id     BIGSERIAL PRIMARY KEY,
    result_id      BIGINT    NOT NULL REFERENCES check_results (result_id),
    judge_call_id  BIGINT    NOT NULL REFERENCES judge_calls (judge_call_id),
    violated       BOOLEAN   NOT NULL,
    count          INT       NOT NULL DEFAULT 0,
    reason         TEXT
);
COMMENT ON TABLE  judge_verdicts IS '모델별 판정';
COMMENT ON COLUMN judge_verdicts.verdict_id IS '판정 ID';
COMMENT ON COLUMN judge_verdicts.result_id IS '결과 ID';
COMMENT ON COLUMN judge_verdicts.judge_call_id IS '호출 ID';
COMMENT ON COLUMN judge_verdicts.violated IS '걸림 여부';
COMMENT ON COLUMN judge_verdicts.count IS '미충족 개수';
COMMENT ON COLUMN judge_verdicts.reason IS '이유';

CREATE TABLE verdict_evidences (
    verdict_id  BIGINT      NOT NULL REFERENCES judge_verdicts (verdict_id),
    ref         VARCHAR(50) NOT NULL,
    PRIMARY KEY (verdict_id, ref)
);
COMMENT ON TABLE  verdict_evidences IS '판정 근거';
COMMENT ON COLUMN verdict_evidences.verdict_id IS '판정 ID';
COMMENT ON COLUMN verdict_evidences.ref IS '근거(#T03, 파일명, Q2)';

CREATE TABLE question_results (
    scoring_id   BIGINT      NOT NULL REFERENCES scorings (scoring_id),
    question_id  BIGINT      NOT NULL REFERENCES task_questions (question_id),
    score        INT         NOT NULL,
    method       VARCHAR(10) NOT NULL,
    reason       TEXT,
    PRIMARY KEY (scoring_id, question_id)
);
COMMENT ON TABLE  question_results IS '문항 채점 결과';
COMMENT ON COLUMN question_results.scoring_id IS '채점 ID';
COMMENT ON COLUMN question_results.question_id IS '문항 ID';
COMMENT ON COLUMN question_results.score IS '얻은 점수';
COMMENT ON COLUMN question_results.method IS '채점 방식(AUTO/JUDGE)';
COMMENT ON COLUMN question_results.reason IS '판정 이유';
