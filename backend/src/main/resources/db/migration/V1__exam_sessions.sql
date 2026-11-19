-- 실전 시험 회차 (팀원 4). docs/erd/pair_schema_v3.sql 의 exam_sessions, task_set, exam_participants,
-- proctor_consents, proctor_events 를 바탕으로, 아직 파일로 저장 중인 부분에 맞춰 고친 버전.
--   * companies, tasks, attempts 는 아직 DB 에 없다 → FK 없이 값만 둔다 (company_id, task_id, attempt_id 문자열)
--   * 회차에 과제가 여러 개라 대상자 1명이 응시(attempt)를 여러 개 가진다 → participant_attempts
--   * 동의·감독 이벤트는 attempt 가 아니라 대상자(participant)에 붙인다 (과제를 오가도 감독은 하나)
--   * jsonb 대신 text (H2 테스트와 호환, 내용은 JSON 문자열)

CREATE TABLE exam_sessions (
    session_id   bigserial    PRIMARY KEY,
    company_id   bigint       NOT NULL,
    title        varchar(100) NOT NULL,
    starts_at    timestamptz  NOT NULL,
    ends_at      timestamptz  NOT NULL,
    proctoring   boolean      NOT NULL DEFAULT true,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    -- 자동 제출 스케줄러가 처리를 끝낸 시각. null 이면 아직 닫히지 않은 회차
    closed_at    timestamptz,
    CHECK (ends_at > starts_at)
);
CREATE INDEX idx_exam_sessions_company_id ON exam_sessions (company_id);
-- 스케줄러가 "끝났는데 안 닫힌 회차"를 찾는 조회용
CREATE INDEX idx_exam_sessions_open_ends_at ON exam_sessions (ends_at) WHERE closed_at IS NULL;

CREATE TABLE exam_session_tasks (
    session_id bigint      NOT NULL REFERENCES exam_sessions (session_id) ON DELETE CASCADE,
    task_id    varchar(64) NOT NULL,
    sort_order int         NOT NULL,
    PRIMARY KEY (session_id, task_id)
);

CREATE TABLE exam_participants (
    participant_id bigserial    PRIMARY KEY,
    session_id     bigint       NOT NULL REFERENCES exam_sessions (session_id) ON DELETE CASCADE,
    email          varchar(255) NOT NULL,
    name           varchar(50)  NOT NULL,
    invite_token   varchar(64)  NOT NULL UNIQUE,
    invite_status  varchar(10)  NOT NULL DEFAULT 'PENDING' CHECK (invite_status IN ('PENDING', 'SENT', 'FAILED')),
    invite_error   varchar(255),
    invited_at     timestamptz  NOT NULL DEFAULT now(),
    entered_at     timestamptz,
    started_at     timestamptz,
    submitted_at   timestamptz,
    -- AUTO: 종료 시각에 스케줄러가 제출, MANUAL: 응시자가 직접 제출
    submit_kind    varchar(10)  CHECK (submit_kind IN ('AUTO', 'MANUAL')),
    UNIQUE (session_id, email)
);

CREATE TABLE participant_attempts (
    participant_id bigint      NOT NULL REFERENCES exam_participants (participant_id) ON DELETE CASCADE,
    task_id        varchar(64) NOT NULL,
    attempt_id     varchar(64) NOT NULL UNIQUE,
    PRIMARY KEY (participant_id, task_id)
);

CREATE TABLE proctor_consents (
    participant_id  bigint      PRIMARY KEY REFERENCES exam_participants (participant_id) ON DELETE CASCADE,
    consent_version varchar(20) NOT NULL,
    env_check       text        NOT NULL,
    consented_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proctor_events (
    proctor_event_id    bigserial    PRIMARY KEY,
    participant_id      bigint       NOT NULL REFERENCES exam_participants (participant_id) ON DELETE CASCADE,
    type                varchar(20)  NOT NULL,
    source              varchar(10)  NOT NULL CHECK (source IN ('BROWSER', 'PC_CAM', 'PHONE_CAM')),
    started_at          timestamptz  NOT NULL,
    duration_ms         int          NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    confidence          numeric(4,3) CHECK (confidence >= 0 AND confidence <= 1),
    detail              text,
    snapshot_key        varchar(255),
    snapshot_bytes      int          NOT NULL DEFAULT 0,
    snapshot_deleted_at timestamptz,
    received_at         timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_proctor_events_participant_id ON proctor_events (participant_id);
-- 보관 기간이 지난 사진을 찾는 조회용
CREATE INDEX idx_proctor_events_snapshot ON proctor_events (received_at)
    WHERE snapshot_key IS NOT NULL AND snapshot_deleted_at IS NULL;
