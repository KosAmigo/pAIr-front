#!/usr/bin/env bash
# 샘플 CSV 를 eXERD 용 Docker DB(pair-erd-pg)에 외래 키 순서대로 넣는다. 한 테이블이라도 실패하면 전체를 되돌린다.
# 실행: bash docs/erd/sample/load.sh [csv 폴더, 기본 csv]
set -euo pipefail
cd "$(dirname "$0")"
CSV_DIR="${1:-csv}"
export MSYS_NO_PATHCONV=1   # Windows Git Bash 가 /sample 을 C:/Program Files/Git/sample 로 바꾸지 않게
docker exec pair-erd-pg rm -rf /sample
docker cp "$CSV_DIR" pair-erd-pg:/sample

ORDER="companies users company_inquiries company_invites credit_purchases tasks task_files document_pages document_chunks task_questions question_choices short_answer_keys question_sources
rubric_items rubric_checks prompt_versions prompt_check_hints exam_sessions exam_session_tasks exam_participants
attempts attempt_files chat_turns credit_ledger chat_attachments attempt_events text_answers choice_answers checkpoints checkpoint_files
proctor_consents proctor_events
scorings judge_calls check_results judge_verdicts verdict_evidences question_results"

SQL="BEGIN;
TRUNCATE $(echo $ORDER | tr ' ' ',') RESTART IDENTITY CASCADE;
SET CONSTRAINTS ALL DEFERRED;"
for t in $ORDER; do
  cols=$(head -1 "$CSV_DIR/$t.csv" | tr -d '\r')
  if [ "$t" = attempts ]; then
    # attempts ↔ checkpoints 가 서로를 가리키므로, 롤백 출발점은 체크포인트를 넣은 뒤에 채운다
    SQL+="
CREATE TEMP TABLE attempts_in (LIKE attempts);
COPY attempts_in ($cols) FROM '/sample/attempts.csv' CSV HEADER;
INSERT INTO attempts SELECT attempt_id, user_id, participant_id, task_id, mode, status, assistant_model, NULL, started_at, submitted_at, followups_done_at, share_token_hash, shared_at FROM attempts_in;"
  else
    SQL+="
COPY $t ($cols) FROM '/sample/$t.csv' CSV HEADER;"
  fi
done
SQL+="
UPDATE attempts a SET forked_from_checkpoint_id = i.forked_from_checkpoint_id FROM attempts_in i
 WHERE a.attempt_id = i.attempt_id AND i.forked_from_checkpoint_id IS NOT NULL;
-- 번호를 직접 넣었으므로 자동 번호(BIGSERIAL 시퀀스)를 최댓값 다음으로 맞춘다. 안 하면 다음 INSERT 가 1번과 겹친다.
DO \$\$ DECLARE r record; BEGIN
  FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
           WHERE c.table_schema='public' AND c.column_default LIKE 'nextval%' LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L,%L), COALESCE((SELECT max(%I) FROM %I),0)+1, false)',
                   r.table_name, r.column_name, r.column_name, r.table_name);
  END LOOP;
END \$\$;
COMMIT;"
echo "$SQL" | docker exec -i pair-erd-pg psql -U pair -d pair -v ON_ERROR_STOP=1 -q
echo "적재 완료"
