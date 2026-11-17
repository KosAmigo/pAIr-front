"""csv/ 의 샘플을 N배로 늘려 csvN/ 에 만든다 (기본 5배). 부하·정합성 검증용.

과제, 문항, 채점 기준, 프롬프트 버전처럼 모두가 함께 쓰는 데이터는 그대로 두고,
회원과 응시 아래 데이터(대화, 작업 기록, 채점 결과 등)만 번호를 밀어 N벌 복제한다.
복제본은 회원 이메일과 시각(벌마다 하루씩)만 다르고 내용은 원본과 같다.

실행: python docs/erd/sample/scale.py [N]   → csv{N}/*.csv
"""
import csv
import os
import shutil
import sys
from datetime import datetime, timedelta

N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "csv")
DST = os.path.join(BASE, f"csv{N}")

# 모두가 함께 쓰는 데이터: 그대로 복사
SHARED = ["companies", "tasks", "task_files", "document_pages", "document_chunks", "task_questions", "question_choices",
          "short_answer_keys", "question_sources", "rubric_items", "rubric_checks", "prompt_versions",
          "prompt_check_hints"]

# 복제할 테이블: 컬럼 → 어느 번호 계열로 밀지
COPY = {
    "users": {"user_id": "user"},
    "attempts": {"attempt_id": "attempt", "user_id": "user", "forked_from_checkpoint_id": "checkpoint"},
    "attempt_files": {"attempt_file_id": "attempt_file", "attempt_id": "attempt"},
    "chat_turns": {"turn_id": "turn", "attempt_id": "attempt"},
    "chat_attachments": {"attachment_id": "attachment", "turn_id": "turn"},
    "attempt_events": {"event_id": "event", "attempt_id": "attempt"},
    "question_answers": {"answer_id": "answer", "attempt_id": "attempt"},
    "answer_choices": {"answer_id": "answer"},
    "checkpoints": {"checkpoint_id": "checkpoint", "attempt_id": "attempt"},
    "checkpoint_files": {"checkpoint_id": "checkpoint"},
    "scorings": {"scoring_id": "scoring", "attempt_id": "attempt"},
    "judge_calls": {"judge_call_id": "judge_call", "scoring_id": "scoring"},
    "check_results": {"result_id": "result", "scoring_id": "scoring"},
    "judge_verdicts": {"verdict_id": "verdict", "result_id": "result", "judge_call_id": "judge_call"},
    "verdict_evidences": {"verdict_id": "verdict"},
    "question_results": {"scoring_id": "scoring"},
    "exam_sessions": {"session_id": "session", "created_by": "user"},
    "exam_participants": {"participant_id": "participant", "session_id": "session", "user_id": "user", "attempt_id": "attempt"},
    "proctor_consents": {"attempt_id": "attempt"},
    "proctor_events": {"proctor_event_id": "proctor_event", "attempt_id": "attempt"},
}
# 각 번호 계열의 기준 테이블과 PK
SERIES = {"user": ("users", "user_id"), "attempt": ("attempts", "attempt_id"),
          "attempt_file": ("attempt_files", "attempt_file_id"), "turn": ("chat_turns", "turn_id"),
          "attachment": ("chat_attachments", "attachment_id"), "event": ("attempt_events", "event_id"),
          "answer": ("question_answers", "answer_id"), "checkpoint": ("checkpoints", "checkpoint_id"),
          "scoring": ("scorings", "scoring_id"), "judge_call": ("judge_calls", "judge_call_id"),
          "result": ("check_results", "result_id"), "verdict": ("judge_verdicts", "verdict_id"),
          "session": ("exam_sessions", "session_id"), "participant": ("exam_participants", "participant_id"), "proctor_event": ("proctor_events", "proctor_event_id")}
TIME_COLS = {"created_at", "started_at", "submitted_at", "followups_done_at", "updated_at", "answered_at",
             "finished_at", "invited_at", "entered_at", "consented_at", "snapshot_deleted_at", "starts_at", "ends_at"}


def read(name):
    with open(os.path.join(SRC, name + ".csv"), encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh))
    return rows[0], rows[1:]


def shift_time(v, days):
    if not v or days == 0:
        return v
    return (datetime.fromisoformat(v.replace("Z", "+00:00")) + timedelta(days=days)).isoformat().replace("+00:00", "Z")


shutil.rmtree(DST, ignore_errors=True)
os.makedirs(DST)
for name in SHARED:
    shutil.copy(os.path.join(SRC, name + ".csv"), DST)

# 계열마다 한 벌의 번호 폭 = 원본 최댓값
width = {}
for s, (t, pk) in SERIES.items():
    head, rows = read(t)
    i = head.index(pk)
    width[s] = max((int(r[i]) for r in rows), default=0)

total = 0
for name, cols in COPY.items():
    head, rows = read(name)
    idx = {head.index(c): s for c, s in cols.items()}
    out = []
    for k in range(N):
        for r in rows:
            r = list(r)
            for i, s in idx.items():
                if r[i]:
                    r[i] = str(int(r[i]) + k * width[s])
            for i, c in enumerate(head):
                if c in TIME_COLS:
                    r[i] = shift_time(r[i], k)
            if name in ("users", "exam_participants") and k:  # 이메일·초대 토큰은 겹치면 안 된다
                r[head.index("email")] = f"copy{k}." + r[head.index("email")]
                if name == "exam_participants":
                    r[head.index("invite_token")] += f"_{k}"
            if name == "exam_sessions" and k:
                r[head.index("entry_code")] += f"-{k}"
            out.append(r)
    with open(os.path.join(DST, name + ".csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(head)
        w.writerows(out)
    total += len(out)
print(f"{N}배: 복제 테이블 {len(COPY)}개 {total}행 → {DST}")
