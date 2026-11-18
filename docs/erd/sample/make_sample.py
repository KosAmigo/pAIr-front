"""ERD 검증용 샘플 CSV 만들기.

실제 데이터: 과제 2개(task.json, 파일), 샘플 응시 7건(grader/samples), 6개 역량 채점 결과(grader/runs),
채점 프롬프트 버전(grader/versions).
만든 데이터: 회원, 객관식·단답형 문항과 답, 대화 첨부, 체크포인트, 실전 시험 회차·감독(아직 실제 데이터가 없는 기능).
자료 파일 2개는 PDF라고 가정하고 페이지로 나눈다.

실행: python docs/erd/sample/make_sample.py  →  docs/erd/sample/csv/*.csv
"""
import csv
import glob
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "csv")
os.makedirs(OUT, exist_ok=True)
TASKS = os.path.join(ROOT, "backend", "src", "main", "resources", "tasks")
SAMPLES = os.path.join(ROOT, "grader", "samples")
RUN = os.path.join(ROOT, "grader", "runs", "20261113-105312", "results")  # K1 보완 버전으로 채점한 6개 역량 결과
VERSIONS = os.path.join(ROOT, "grader", "versions")

rows = {}


def put(table, cols, row):
    rows.setdefault(table, (cols, []))[1].append(row)


def rj(path):
    return json.load(open(path, encoding="utf-8"))


def lines(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def b(v):
    return "true" if v else "false"


# ── 회사 · 회원 ──
put("companies", ["company_id", "name", "business_no", "created_at"], [1, "예시테크", "123-45-67890", "2026-11-01T00:00:00Z"])
U = ["user_id", "email", "password_hash", "name", "role", "company_id", "created_at"]
put("users", U, [1, "admin@pair.test", "$2a$10$sampleAdminHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "관리자", "ADMIN", None, "2026-11-01T00:00:00Z"])
put("users", U, [2, "a@pair.test", "$2a$10$sampleUserAHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "응시자A", "USER", None, "2026-11-02T00:00:00Z"])
put("users", U, [3, "b@pair.test", "$2a$10$sampleUserBHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "응시자B", "USER", None, "2026-11-03T00:00:00Z"])
put("users", U, [4, "hr@example-tech.test", "$2a$10$sampleCompanyHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "예시테크 담당자", "COMPANY", 1, "2026-11-04T00:00:00Z"])

# ── 과제 ──
CATALOG = {
    "order-deadlock": ("주문이 3초 넘게 멈췄다가 실패합니다. 잠금 순서와 재고 정합성 문제를 찾아 고치세요.", "DEV", "장애 분석", "중급"),
    "pricing-plan": ("이탈 설문과 매출 자료로 저가 요금제 출시 여부를 판단하는 1페이지 기획안을 씁니다.", "BIZ", "기획서", "중급"),
}
TK = ["task_id", "code", "title", "summary", "description", "requirements", "track", "category", "difficulty", "time_limit_min", "status",
      "parent_task_id", "created_by", "created_at", "updated_at", "published_at"]
task_id = {}
for i, code in enumerate(["order-deadlock", "pricing-plan"], 1):
    t = rj(os.path.join(TASKS, code, "task.json"))
    s, track, cat, lvl = CATALOG[code]
    task_id[code] = i
    put("tasks", TK, [i, code, t["title"], s, "\n".join(t["description"]), "\n".join("- " + r for r in t["requirements"]), track, cat, lvl,
                      t["minutes"], "OPEN", None, 1, "2026-11-08T00:00:00Z", "2026-11-10T00:00:00Z", "2026-11-10T00:00:00Z"])

# ── 과제 파일 (자료 2개는 PDF로 가정) ──
MIME = {".java": "text/x-java", ".md": "text/markdown", ".log": "text/plain", ".csv": "text/csv"}
file_id, fid = {}, 0
pdf_text = {}
for code in ["order-deadlock", "pricing-plan"]:
    for vis, sub in [("VISIBLE", "files"), ("HIDDEN", "hidden")]:
        base = os.path.join(TASKS, code, sub)
        for p in sorted(glob.glob(os.path.join(base, "**", "*"), recursive=True)):
            if os.path.isdir(p):
                continue
            rel = os.path.relpath(p, base).replace(os.sep, "/")
            text = open(p, encoding="utf-8").read()
            fid += 1
            file_id[(code, rel)] = fid
            is_pdf = rel.startswith("자료/")
            if is_pdf:
                pdf_text[fid] = text
                rel_pdf = os.path.splitext(rel)[0] + ".pdf"
                put("task_files", ["task_file_id", "task_id", "path", "content", "storage_key", "mime_type", "size_bytes", "visibility", "read_only"],
                    [fid, task_id[code], rel_pdf, None, f"tasks/{code}/{rel_pdf}", "application/pdf", len(text.encode()), vis, "true"])
                file_id[(code, rel_pdf)] = fid
            else:
                ro = rel.startswith("logs/") or vis == "HIDDEN"
                put("task_files", ["task_file_id", "task_id", "path", "content", "storage_key", "mime_type", "size_bytes", "visibility", "read_only"],
                    [fid, task_id[code], rel, text, None, MIME.get(os.path.splitext(rel)[1], "text/plain"), len(text.encode()), vis, b(ro)])

# ── AI로 만든 숨김 초안 과제 (예시): 검수 전이라 CLOSED, 공개 시각 없음 ──
put("tasks", TK, [3, "inventory-sync", "재고 동기화 지연 원인 분석", "주문 직후 재고가 늦게 줄어드는 문제를 찾아 고치세요.", "(AI 생성 초안) 주문 서비스와 재고 서비스 사이 이벤트 처리가 늦어 …",
                  "- 지연 원인을 찾아 NOTES.md에 정리\n- 지연을 없애는 수정\n- 회귀 테스트 추가", "DEV", "장애 분석", "중급", 60, "CLOSED", None, 1,
                  "2026-11-16T03:00:00Z", "2026-11-16T03:00:00Z", None])
put("task_files", ["task_file_id", "task_id", "path", "content", "storage_key", "mime_type", "size_bytes", "visibility", "read_only"],
    [fid + 1, 3, "NOTES.md", "# 원인 분석\n", None, "text/markdown", 14, "VISIBLE", "false"])

# ── 문서 페이지: 설문은 '## ' 절마다 한 페이지, CSV 는 한 페이지 ──
SURVEY = file_id[("pricing-plan", "자료/이탈_설문_요약.md")]
SALES = file_id[("pricing-plan", "자료/요금제별_매출.csv")]
page_text = {}
parts = re.split(r"\n(?=## )", pdf_text[SURVEY].strip())
for n, ptxt in enumerate(parts, 1):
    page_text[(SURVEY, n)] = ptxt.strip()
page_text[(SALES, 1)] = pdf_text[SALES].strip()
for (f, n), ptxt in page_text.items():
    put("document_pages", ["task_file_id", "page_no", "text"], [f, n, ptxt])

# ── 문항: 후속 질문(실제) + 비개발 과제 객관식·단답형(예시) ──
QC = ["question_id", "task_id", "stage", "question_type", "seq", "content", "points", "answer_guide", "active"]
qid = 0
followup_q = {}
for code in ["order-deadlock", "pricing-plan"]:
    t = rj(os.path.join(TASKS, code, "task.json"))
    for s, q in enumerate(t["followUps"], 1):
        qid += 1
        followup_q[(code, s)] = qid
        put("task_questions", QC, [qid, task_id[code], "FOLLOWUP", "ESSAY", s, q, None, None, "true"])
qid += 1
MCQ = qid
put("task_questions", QC, [MCQ, task_id["pricing-plan"], "TASK", "SINGLE", 1,
     "10월 베이직 가입자 중 라이트 요금제로 실제 전환할 것으로 예상되는 인원에 가장 가까운 것은? (설문 의향을 사내 과거 사례 전환율의 중간값으로 보정)",
     5, None, "true"])
qid += 1
SHORT = qid
put("task_questions", QC, [SHORT, task_id["pricing-plan"], "TASK", "SHORT", 2,
     "5월 대비 10월에 월 이탈률이 가장 크게 오른 요금제는?", 3, None, "true"])
CH = ["choice_id", "question_id", "seq", "content", "is_correct"]
for cid, (txt, ok) in enumerate([("약 21,080명", False), ("약 11,590명", True), ("약 7,030명", False), ("약 3,400명", False)], 1):
    put("question_choices", CH, [cid, MCQ, cid, txt, b(ok)])
for kid, acc in enumerate(["베이직", "베이직 요금제"], 1):
    put("short_answer_keys", ["answer_key_id", "question_id", "accepted"], [kid, SHORT, acc])
QS = ["question_id", "task_file_id", "pages", "note"]
put("question_sources", QS, [MCQ, SURVEY, "2, 3", "베이직 전환 의향 34%(2쪽)와 실제 전환율 50~60%(3쪽)"])
put("question_sources", QS, [MCQ, SALES, "1", "10월 베이직 월말 가입자 62,000명"])
put("question_sources", QS, [SHORT, SALES, "1", "요금제별 5월, 10월 이탈률 비교 (문서 1개만 참조: 출제 규칙 위반 예시)"])

# ── 채점 기준: 실제 채점 결과(개발 1건, 비개발 1건)에서 체크 목록을 모은다 ──
def result(att):
    return rj(os.path.join(RUN, f"sample__{att}__1.json"))

ITEMS = [("usage", "AI 활용력", 20), ("control", "AI 통제력", 15), ("decomposition", "문제 분해력", 10),
         ("delegation", "위임 판단력", 10), ("delivery", "AI 결과 도출력", 30), ("potential", "성과 잠재력", 15)]
for n, (k, name, mx) in enumerate(ITEMS, 1):
    put("rubric_items", ["item_key", "name", "max_score", "sort_order"], [k, name, mx, n])
check_id = {}
for att, kind in [("att-261111-1841-avn", "DEV"), ("att-261111-1842-l5r", "BIZ")]:
    for it in result(att)["items"]:
        for c in it["checks"]:
            track = "DEV" if c["code"] == "D0" else (kind if re.fullmatch(r"D[1-4]", c["code"]) else "ALL")
            if (c["code"], track) in check_id:
                continue
            check_id[(c["code"], track)] = len(check_id) + 1
            put("rubric_checks", ["check_id", "item_key", "code", "track", "method", "points", "label"],
                [check_id[(c["code"], track)], it["key"], c["code"], track, c["method"], c["points"], c["label"]])


def ck(code, kind):
    return check_id.get((code, kind)) or check_id[(code, "ALL")] if (code, kind) in check_id or (code, "ALL") in check_id else check_id[(code, "DEV")]


# ── 프롬프트 버전 ──
VER = {"v1_기본": 1, "v2_기본": 2}
# K1 보완 버전은 v2_기본과 내용이 같아 삭제됨(커밋 fcc06f2) → 그 결과는 v2_기본으로 본다
VER_ALIAS = {"20261113-1053_claude_K1-통째로-보완": "v2_기본"}
for vid_s, vid in VER.items():
    v = rj(os.path.join(VERSIONS, vid_s + ".json"))
    parent = VER.get(v.get("parent")) if v.get("parent") else None
    put("prompt_versions", ["version_id", "name", "note", "parent_version_id", "judge_system", "is_active", "created_at"],
        [vid, v["name"], v.get("note") or None, parent, v["judgeSystem"], b(vid_s == "v2_기본"), v["createdAt"]])
    for key, cp in v["checks"].items():
        if not cp.get("hint"):
            continue
        code, _, tr = key.partition("-")
        track = tr.upper() if tr else "ALL"
        if (code, track) not in check_id:
            continue  # v1 에만 있던 체크(R1~R3, U4)는 지금 체크 항목에 없다
        put("prompt_check_hints", ["version_id", "check_id", "hint"], [vid, check_id[(code, track)], cp["hint"]])

# ── 응시 ──
idx = rj(os.path.join(SAMPLES, "index.json"))
attempt_id, att_code = {}, {}
EV = {"start": "START", "save": "SAVE", "run": "RUN", "build": "BUILD", "chat": "CHAT", "chatEmpty": "CHAT_EMPTY",
      "aiEdit": "AI_EDIT", "submit": "SUBMIT", "followups": "FOLLOWUPS", "firstValid": "FIRST_VALID"}
tid = eid = afid = ta_id = 0
turn_ids = {}
TA = ["text_answer_id", "attempt_id", "question_id", "question_type", "content", "answered_at"]
LIVE = {4: 1, 5: 2}  # 개발 응시 2건은 실전 시험 회차에서 본 것으로 가정: 응시 번호 → 대상자 번호 (아래 실전 시험 · 감독)
for n, s in enumerate(idx, 1):
    a = rj(os.path.join(SAMPLES, s["id"], "attempt.json"))
    attempt_id[s["id"]] = n
    att_code[s["id"]] = a["taskId"]
    put("attempts", ["attempt_id", "user_id", "participant_id", "task_id", "mode", "status", "assistant_model", "forked_from_checkpoint_id",
                     "started_at", "submitted_at", "followups_done_at"],
        [n, None if n in LIVE else (2 if n % 2 else 3), LIVE.get(n), task_id[a["taskId"]], "LIVE" if n in LIVE else "SELF", "DONE", a["model"], None,
         a["startedAt"], a["submittedAt"], a["followupsDoneAt"]])
    ws = os.path.join(SAMPLES, s["id"], "workspace")
    for p in sorted(glob.glob(os.path.join(ws, "**", "*"), recursive=True)):
        if os.path.isdir(p) or "자료" in p:
            continue
        afid += 1
        put("attempt_files", ["attempt_file_id", "attempt_id", "path", "content", "updated_at"],
            [afid, n, os.path.relpath(p, ws).replace(os.sep, "/"), open(p, encoding="utf-8").read(), a["submittedAt"]])
    for t in lines(os.path.join(SAMPLES, s["id"], "turns.jsonl")):
        tid += 1
        turn_ids[(n, t["turn"])] = tid
        ai = t["role"] == "ai"
        put("chat_turns", ["turn_id", "attempt_id", "turn_no", "role", "content", "model", "input_tokens", "output_tokens", "created_at"],
            [tid, n, t["turn"], "AI" if ai else "USER", t["text"], t.get("model") if ai else None,
             t.get("inputTokens") if ai else None, t.get("outputTokens") if ai else None, t["at"]])
    for e in lines(os.path.join(SAMPLES, s["id"], "events.jsonl")):
        eid += 1
        payload = {k: v for k, v in e.items() if k not in ("type", "at")}
        put("attempt_events", ["event_id", "attempt_id", "type", "payload", "created_at"],
            [eid, n, EV.get(e["type"], e["type"].upper()), json.dumps(payload, ensure_ascii=False) if payload else None, e["at"]])
    for qn, ans in enumerate(a.get("followUpAnswers") or [], 1):
        ta_id += 1
        put("text_answers", TA, [ta_id, n, followup_q[(a["taskId"], qn)], "ESSAY", ans or "(무응답)", a["followupsDoneAt"]])

# 비개발 응시 2건에 객관식·단답형 답 (모범 응시는 정답, 자료 없이 붙인 응시는 오답)
answer_rows = {}
for att, mcq_choice, short in [("att-261111-1842-l5r", 2, "베이직"), ("att-261111-1843-anp", 1, "스탠다드")]:
    n = attempt_id[att]
    put("choice_answers", ["attempt_id", "question_id", "question_type", "choice_id", "answered_at"],
        [n, MCQ, "SINGLE", mcq_choice, "2026-11-11T09:43:00Z"])
    answer_rows[(n, MCQ)] = mcq_choice == 2
    ta_id += 1
    put("text_answers", TA, [ta_id, n, SHORT, "SHORT", short, "2026-11-11T09:43:05Z"])
    answer_rows[(n, SHORT)] = short in ("베이직", "베이직 요금제")

# 대화 첨부: 모범 비개발 응시가 첫 질문에 설문 2쪽을 첨부했다고 가정
n_l5r = attempt_id["att-261111-1842-l5r"]
put("chat_attachments", ["attachment_id", "turn_id", "source_type", "task_file_id", "file_name", "pages", "mime_type", "sent_text"],
    [1, turn_ids[(n_l5r, 1)], "TASK_FILE", SURVEY, "이탈_설문_요약.pdf", "2", "application/pdf", page_text[(SURVEY, 2)]])
put("chat_attachments", ["attachment_id", "turn_id", "source_type", "task_file_id", "file_name", "pages", "mime_type", "sent_text"],
    [2, turn_ids[(n_l5r, 1)], "TASK_FILE", SALES, "요금제별_매출.pdf", "1", "application/pdf", page_text[(SALES, 1)]])

# 체크포인트: 개발 모범 응시 4번째 턴 시점 + 그 시점 NOTES.md 사본, 그리고 거기서 롤백한 응시 1건
n_avn = attempt_id["att-261111-1841-avn"]
put("checkpoints", ["checkpoint_id", "attempt_id", "turn_no", "label", "created_at"], [1, n_avn, 4, "원인 파악 직후", "2026-11-11T09:41:17Z"])
put("checkpoint_files", ["checkpoint_file_id", "checkpoint_id", "path", "content"], [1, 1, "NOTES.md", open(os.path.join(TASKS, "order-deadlock", "files", "NOTES.md"), encoding="utf-8").read()])
put("attempts", ["attempt_id", "user_id", "participant_id", "task_id", "mode", "status", "assistant_model", "forked_from_checkpoint_id",
                 "started_at", "submitted_at", "followups_done_at"],
    [len(idx) + 1, 2, None, task_id["order-deadlock"], "SELF", "SOLVING", "gpt-6-luna", 1, "2026-11-12T10:00:00Z", None, None])

# ── 실전 시험 · 감독 (예시) ──
# 예시테크 담당자가 과제 2개(개발, 비개발)로 회차 1개를 열고 3명을 초대. 2명은 입장해 개발 과제를 풀었고(4, 5번),
# 응시자A는 비개발 과제도 시작했다(풀던 중). 1명은 입장하지 않음. 시간은 회차 전체로 본다.
put("exam_sessions", ["session_id", "company_id", "title", "starts_at", "ends_at", "proctoring", "created_by", "created_at"],
    [1, 1, "2026 하반기 백엔드 신입 실전", "2026-11-11T09:40:00Z", "2026-11-11T10:40:00Z",
     "true", 4, "2026-11-10T12:00:00Z"])
put("exam_session_tasks", ["session_id", "task_id", "sort_order"], [1, task_id["order-deadlock"], 1])
put("exam_session_tasks", ["session_id", "task_id", "sort_order"], [1, task_id["pricing-plan"], 2])
# 실전 시험은 로그인 없이 보므로 대상자와 응시에 회원을 연결하지 않는다. 응시가 대상자를 가리킨다(attempts.participant_id).
P = ["participant_id", "session_id", "email", "name", "invite_token", "invited_at", "entered_at"]
put("exam_participants", P, [1, 1, "b@pair.test", "응시자B", "inv_8f3a1c9e2b7d4f60", "2026-11-10T12:05:00Z", "2026-11-11T09:42:08Z"])
put("exam_participants", P, [2, 1, "a@pair.test", "응시자A", "inv_2d9c47a1e5b83f02", "2026-11-10T12:05:00Z", "2026-11-11T09:41:57Z"])
put("exam_participants", P, [3, 1, "c@pair.test", "응시자C", "inv_71e0b4d6c3a95f18", "2026-11-10T12:05:00Z", None])
put("attempts", ["attempt_id", "user_id", "participant_id", "task_id", "mode", "status", "assistant_model", "forked_from_checkpoint_id",
                 "started_at", "submitted_at", "followups_done_at"],
    [len(idx) + 2, None, 2, task_id["pricing-plan"], "LIVE", "SOLVING", "gpt-6-luna", None, "2026-11-11T09:55:00Z", None, None])
ENV = json.dumps({"camera": True, "fullscreen": True, "browser": "Chrome 142"})
for p in sorted(LIVE.values()):  # 감독 동의는 대상자마다 회차당 1번
    put("proctor_consents", ["participant_id", "consent_version", "env_check", "consented_at"], [p, "v1", ENV, "2026-11-11T09:41:50Z"])
PE = ["proctor_event_id", "attempt_id", "type", "started_at", "duration_ms", "confidence", "detail", "snapshot_key", "snapshot_deleted_at",
      "review", "review_note", "reviewed_by", "reviewed_at"]
NR = [None, None, None, None]  # 아직 확인하지 않은 이벤트
put("proctor_events", PE, [1, 4, "TAB_HIDDEN", "2026-11-11T09:42:10Z", 12000, None, None, None, None,
                           "OK", "응시자 문의: 감독 프로그램 알림을 닫다가 탭이 바뀜", 4, "2026-11-11T11:05:00Z"])
put("proctor_events", PE, [2, 4, "PASTE", "2026-11-11T09:42:12Z", 0, None,
                           json.dumps({"chars": 840, "fromAssistant": False}), None, None,
                           "SUSPECT", "외부에서 840자 붙여넣기. 리포트 대화와 대조 필요", 4, "2026-11-11T11:07:00Z"])
put("proctor_events", PE, [3, 4, "NO_FACE", "2026-11-11T09:42:13Z", 7000, 0.93, json.dumps({"faces": 0}),
                           "proctor/4/3.jpg", None, *NR])
put("proctor_events", PE, [4, 5, "HEAD_TURN", "2026-11-11T09:42:01Z", 3500, 0.71, json.dumps({"yawDeg": 48}),
                           "proctor/5/4.jpg", "2026-12-11T00:00:00Z", *NR])
put("proctor_events", PE, [5, 5, "WINDOW_BLUR", "2026-11-11T09:42:05Z", 2000, None, None, None, None, *NR])

# ── 채점 결과 (K1 보완 버전, 실제 결과) ──
sc = jc = rid = vid_n = 0
for s in idx:
    r = result(s["id"])
    n = attempt_id[s["id"]]
    kind = "DEV" if r["taskType"] == "dev" else "BIZ"
    sc += 1
    put("scorings", ["scoring_id", "attempt_id", "version_id", "status", "error", "started_at", "finished_at"],
        [sc, n, VER[VER_ALIAS.get(r["promptVersion"], r["promptVersion"])], "DONE", None, r["submittedAt"], r["submittedAt"]])
    call = {}
    for judge in ["claude", "openai"]:
        t = r["tokens"]["judge_" + judge]
        jc += 1
        call[judge] = jc
        put("judge_calls", ["judge_call_id", "scoring_id", "model", "input_tokens", "output_tokens", "cached_tokens"],
            [jc, sc, t["model"], t["input"], t["output"], t.get("cachedInput", 0)])
    for it in r["items"]:
        for c in it["checks"]:
            track = "DEV" if c["code"] == "D0" else (kind if re.fullmatch(r"D[1-4]", c["code"]) else "ALL")
            rid += 1
            put("check_results", ["result_id", "scoring_id", "check_id", "deducted", "status", "reason"],
                [rid, sc, check_id[(c["code"], track)], c["deducted"], c["status"], c.get("reason") or None])
            for j in c.get("judges") or []:
                vid_n += 1
                put("judge_verdicts", ["verdict_id", "result_id", "judge_call_id", "violated", "count", "reason"],
                    [vid_n, rid, call[j["judge"]], b(j["violated"]), j.get("count", 0), j.get("reason") or None])
                for ref in dict.fromkeys(j.get("evidence") or []):
                    put("verdict_evidences", ["verdict_id", "ref"], [vid_n, ref[:50]])
    for q, pts in [(MCQ, 5), (SHORT, 3)]:
        if (n, q) in answer_rows:
            put("question_results", ["scoring_id", "question_id", "score", "method", "reason"],
                [sc, q, pts if answer_rows[(n, q)] else 0, "AUTO", "정답" if answer_rows[(n, q)] else "오답"])

for table, (cols, rs) in rows.items():
    with open(os.path.join(OUT, table + ".csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rs:
            w.writerow(["" if v is None else v for v in r])
print({t: len(rs) for t, (_, rs) in rows.items()})
json.dump({f"{f}:{p}": t for (f, p), t in page_text.items()}, open(os.path.join(OUT, "_pages.json"), "w", encoding="utf-8"), ensure_ascii=False)
