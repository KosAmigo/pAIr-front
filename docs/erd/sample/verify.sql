-- 적재한 샘플을 검증한다. 몇 배로 넣었든 같은 쿼리로 확인한다.
-- 실행: docker exec -i pair-erd-pg psql -U pair -d pair < docs/erd/sample/verify.sql
\pset footer off
\set QUIET on

\echo '== 1. 테이블별 행 수 =='
SELECT relname AS 테이블, n_live_tup AS 행 FROM pg_stat_user_tables ORDER BY relname;

\echo '== 2. 총점: 감점 합으로 계산 (같은 원본 채점의 복제본끼리 점수가 같아야 함) =='
WITH item AS (
  SELECT s.scoring_id, ri.item_key, GREATEST(0, ri.max_score - COALESCE(SUM(cr.deducted), 0)) AS score
  FROM scorings s CROSS JOIN rubric_items ri
  LEFT JOIN rubric_checks rc ON rc.item_key = ri.item_key
  LEFT JOIN check_results cr ON cr.check_id = rc.check_id AND cr.scoring_id = s.scoring_id
  GROUP BY s.scoring_id, ri.item_key, ri.max_score),
tot AS (SELECT scoring_id, SUM(score) AS total FROM item GROUP BY scoring_id)
SELECT (scoring_id - 1) % 7 + 1 AS 원본_채점, COUNT(*) AS 벌수, MIN(total) AS 최저, MAX(total) AS 최고,
       CASE WHEN MIN(total) = MAX(total) THEN 'OK' ELSE '불일치' END AS 결과
FROM tot GROUP BY 1 ORDER BY 1;

\echo '== 3. 테이블 사이 정합성 (복제본과 섞인 참조 포함, 모두 0이어야 함) =='
SELECT '판정의 결과와 호출이 다른 채점' AS 검사, COUNT(*) FROM judge_verdicts v
  JOIN check_results r ON r.result_id = v.result_id JOIN judge_calls j ON j.judge_call_id = v.judge_call_id
  WHERE r.scoring_id <> j.scoring_id
UNION ALL SELECT '롤백 응시와 체크포인트 주인이 다른 회원', COUNT(*) FROM attempts a
  JOIN checkpoints c ON c.checkpoint_id = a.forked_from_checkpoint_id JOIN attempts o ON o.attempt_id = c.attempt_id
  WHERE o.user_id <> a.user_id
UNION ALL SELECT '체크포인트 턴이 원래 응시에 없음', COUNT(*) FROM checkpoints c
  WHERE NOT EXISTS (SELECT 1 FROM chat_turns t WHERE t.attempt_id = c.attempt_id AND t.turn_no = c.turn_no)
UNION ALL SELECT '답변 문항이 응시 과제와 다름', COUNT(*) FROM (
    SELECT attempt_id, question_id FROM text_answers UNION ALL SELECT attempt_id, question_id FROM choice_answers) x
  JOIN attempts a ON a.attempt_id = x.attempt_id JOIN task_questions q ON q.question_id = x.question_id
  WHERE q.task_id <> a.task_id
UNION ALL SELECT '한 문항에 객관식·글 답변이 둘 다', COUNT(*) FROM text_answers t
  JOIN choice_answers c ON c.attempt_id = t.attempt_id AND c.question_id = t.question_id
UNION ALL SELECT '첨부한 과제 자료가 응시 과제와 다름', COUNT(*) FROM chat_attachments ca
  JOIN chat_turns t ON t.turn_id = ca.turn_id JOIN attempts a ON a.attempt_id = t.attempt_id
  JOIN task_files f ON f.task_file_id = ca.task_file_id WHERE f.task_id <> a.task_id
UNION ALL SELECT '회차를 연 담당자가 다른 회사 소속', COUNT(*) FROM exam_sessions s
  JOIN users u ON u.user_id = s.created_by WHERE u.role = 'COMPANY' AND u.company_id <> s.company_id
UNION ALL SELECT '회차 응시가 회차 과제와 다름', COUNT(*) FROM exam_participants p
  JOIN attempts a ON a.attempt_id = p.attempt_id JOIN exam_sessions s ON s.session_id = p.session_id WHERE a.task_id <> s.task_id
UNION ALL SELECT '회차 응시 회원이 대상자와 다름', COUNT(*) FROM exam_participants p
  JOIN attempts a ON a.attempt_id = p.attempt_id WHERE a.user_id IS DISTINCT FROM p.user_id
UNION ALL SELECT '회차 응시인데 실전 모드가 아님', COUNT(*) FROM exam_participants p
  JOIN attempts a ON a.attempt_id = p.attempt_id WHERE a.mode <> 'LIVE'
UNION ALL SELECT '감독 회차인데 동의 없이 응시', COUNT(*) FROM exam_participants p
  JOIN exam_sessions s ON s.session_id = p.session_id
  WHERE s.proctoring AND p.attempt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proctor_consents c WHERE c.attempt_id = p.attempt_id)
UNION ALL SELECT '감독 이벤트가 시험 시간 밖', COUNT(*) FROM proctor_events e
  JOIN exam_participants p ON p.attempt_id = e.attempt_id JOIN exam_sessions s ON s.session_id = p.session_id
  WHERE e.started_at NOT BETWEEN s.starts_at AND s.ends_at;

\echo '== 4. 잘못된 데이터가 막히는지 =='
CREATE TEMP TABLE bad (검사 text, 결과 text);
DO $$
DECLARE a bigint := (SELECT max(attempt_id) FROM attempts);
        t bigint := (SELECT max(turn_id) FROM chat_turns);
        tn int   := (SELECT turn_no FROM chat_turns WHERE turn_id = (SELECT max(turn_id) FROM chat_turns));
        ta bigint := (SELECT attempt_id FROM chat_turns WHERE turn_id = (SELECT max(turn_id) FROM chat_turns));
        qa record := (SELECT qa FROM text_answers qa ORDER BY text_answer_id DESC LIMIT 1);
        ca record := (SELECT ca FROM choice_answers ca WHERE question_type = 'SINGLE' LIMIT 1);
        other_choice bigint := (SELECT choice_id FROM question_choices WHERE question_id = (SELECT question_id FROM choice_answers WHERE question_type = 'SINGLE' LIMIT 1)
                                AND choice_id NOT IN (SELECT choice_id FROM choice_answers WHERE attempt_id = (SELECT attempt_id FROM choice_answers WHERE question_type = 'SINGLE' LIMIT 1)) LIMIT 1);
        mcq bigint := (SELECT question_id FROM task_questions WHERE question_type = 'SINGLE' LIMIT 1);
        shortq bigint := (SELECT question_id FROM task_questions WHERE question_type = 'SHORT' LIMIT 1);
        rc record := (SELECT rc FROM rubric_checks rc LIMIT 1);
        tests text[][] := ARRAY[
  ['외부 업로드 첨부', format($q$INSERT INTO chat_attachments(turn_id,source_type,file_name,mime_type,sent_text) VALUES (%s,'UPLOAD','x.pdf','application/pdf','x')$q$, t)],
  ['원본 없는 과제 자료 첨부', format($q$INSERT INTO chat_attachments(turn_id,source_type,file_name,mime_type,sent_text) VALUES (%s,'TASK_FILE','x.pdf','application/pdf','x')$q$, t)],
  ['같은 응시에 중복 턴 번호', format($q$INSERT INTO chat_turns(attempt_id,turn_no,role,content) VALUES (%s,%s,'USER','x')$q$, ta, tn)],
  ['없는 응시에 답변', format($q$INSERT INTO text_answers(attempt_id,question_id,question_type,content) VALUES (%s,1,'ESSAY','x')$q$, a + 1000)],
  ['같은 문항에 두 번 답', format($q$INSERT INTO text_answers(attempt_id,question_id,question_type,content) VALUES (%s,%s,%L,'x')$q$, (qa).attempt_id, (qa).question_id, (qa).question_type)],
  ['객관식 문항에 글 답변', format($q$INSERT INTO text_answers(attempt_id,question_id,question_type,content) VALUES (1,%s,'SINGLE','x')$q$, mcq)],
  ['객관식 문항을 단답형이라 속여 글 답변', format($q$INSERT INTO text_answers(attempt_id,question_id,question_type,content) VALUES (1,%s,'SHORT','x')$q$, mcq)],
  ['단답형 문항을 객관식이라 속여 보기 선택', format($q$INSERT INTO choice_answers(attempt_id,question_id,question_type,choice_id) SELECT 1,%s,'SINGLE',choice_id FROM question_choices LIMIT 1$q$, shortq)],
  ['한 개만 고르는 문항에 보기 두 개', format($q$INSERT INTO choice_answers(attempt_id,question_id,question_type,choice_id) VALUES (%s,%s,'SINGLE',%s)$q$, (ca).attempt_id, (ca).question_id, other_choice)],
  ['같은 코드·직군 체크', format($q$INSERT INTO rubric_checks(item_key,code,track,method,points,label) VALUES (%L,%L,%L,%L,1,'x')$q$, (rc).item_key, (rc).code, (rc).track, (rc).method)],
  ['없는 페이지의 조각', $q$INSERT INTO document_chunks(task_file_id,page_no,chunk_no,content,token_count,embedding) SELECT task_file_id,999,1,'x',1,embedding FROM document_chunks LIMIT 1$q$],
  ['차원이 다른 벡터', $q$INSERT INTO document_chunks(task_file_id,page_no,chunk_no,content,token_count,embedding) SELECT task_file_id,page_no,99,'x',1,'[1,2,3]' FROM document_chunks LIMIT 1$q$],
  ['같은 이메일 회원', $q$INSERT INTO users(email,password_hash,name,role) SELECT email,'x','x','USER' FROM users LIMIT 1$q$],
  ['회사 없는 기업 담당자', $q$INSERT INTO users(email,password_hash,name,role) VALUES ('nocompany@x','x','x','COMPANY')$q$],
  ['회사 없는 회차', $q$INSERT INTO exam_sessions(task_id,title,entry_code,starts_at,ends_at,created_by) SELECT task_id,'x','NO-COMPANY',starts_at,ends_at,created_by FROM exam_sessions LIMIT 1$q$],
  ['같은 입장 코드 회차', $q$INSERT INTO exam_sessions(company_id,task_id,title,entry_code,starts_at,ends_at,created_by) SELECT company_id,task_id,'x',entry_code,starts_at,ends_at,created_by FROM exam_sessions LIMIT 1$q$],
  ['종료가 시작보다 이른 회차', $q$INSERT INTO exam_sessions(company_id,task_id,title,entry_code,starts_at,ends_at,created_by) SELECT company_id,task_id,'x','NEW-CODE',ends_at,starts_at,created_by FROM exam_sessions LIMIT 1$q$],
  ['한 응시에 대상자 두 명', $q$INSERT INTO exam_participants(session_id,email,name,invite_token,attempt_id) SELECT session_id,'new@x','x','new_token',attempt_id FROM exam_participants WHERE attempt_id IS NOT NULL LIMIT 1$q$],
  ['같은 회차에 같은 이메일 초대', $q$INSERT INTO exam_participants(session_id,email,name,invite_token) SELECT session_id,email,'x','new_token' FROM exam_participants LIMIT 1$q$],
  ['같은 응시에 감독 동의 두 번', $q$INSERT INTO proctor_consents(attempt_id,consent_version,env_check) SELECT attempt_id,'v2','{}' FROM proctor_consents LIMIT 1$q$],
  ['없는 감독 이벤트 종류', $q$INSERT INTO proctor_events(attempt_id,type,started_at) SELECT attempt_id,'SCREENSHOT',started_at FROM proctor_events LIMIT 1$q$],
  ['확신도 1 초과', $q$INSERT INTO proctor_events(attempt_id,type,started_at,confidence) SELECT attempt_id,'NO_FACE',started_at,1.5 FROM proctor_events LIMIT 1$q$]];
BEGIN
  FOR i IN 1..array_length(tests, 1) LOOP
    BEGIN
      EXECUTE tests[i][2];
      INSERT INTO bad VALUES (tests[i][1], '안 막힘 ✗');
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'undo' THEN INSERT INTO bad VALUES (tests[i][1], '막힘 (' || SQLSTATE || ')'); END IF;
    END;
  END LOOP;
END $$;
SELECT * FROM bad;

\echo '== 5. 자동 번호가 적재 후에도 겹치지 않는지 (새 행을 넣고 되돌림) =='
BEGIN;
INSERT INTO attempts(user_id, task_id, mode, status, assistant_model) SELECT 1, 1, 'SELF', 'IN_PROGRESS', 'x'
  RETURNING attempt_id AS 새_응시_ID, (SELECT max(attempt_id) FROM attempts) AS 기존_최댓값;
ROLLBACK;

\echo '== 6. 활용 쿼리 =='
\echo '-- 근거 문서 2개 미만 문항'
SELECT q.question_id, q.question_type, COUNT(s.task_file_id) AS 근거_문서 FROM task_questions q
  JOIN tasks t ON t.task_id = q.task_id LEFT JOIN question_sources s ON s.question_id = q.question_id
  WHERE q.question_type IN ('MCQ', 'SHORT') GROUP BY 1, 2 HAVING COUNT(s.task_file_id) < 2;
\echo '-- 첨부 vs 정답 근거 (응시별, 앞 10개)'
SELECT a.attempt_id, COUNT(DISTINCT ca.task_file_id) FILTER (WHERE ca.task_file_id IN (SELECT task_file_id FROM question_sources)) AS 근거_첨부,
       (SELECT COUNT(DISTINCT task_file_id) FROM question_sources qs JOIN task_questions q USING (question_id) WHERE q.task_id = a.task_id) AS 근거_전체
FROM attempts a JOIN tasks t ON t.task_id = a.task_id AND t.track = 'BIZ'
LEFT JOIN chat_turns ct ON ct.attempt_id = a.attempt_id LEFT JOIN chat_attachments ca ON ca.turn_id = ct.turn_id
GROUP BY a.attempt_id, a.task_id ORDER BY a.attempt_id LIMIT 10;
\echo '-- 판정이 엇갈린(SPLIT) 체크 상위 5'
SELECT rc.code, COUNT(*) AS 엇갈림 FROM check_results cr JOIN rubric_checks rc USING (check_id)
  WHERE cr.status = 'SPLIT' GROUP BY rc.code ORDER BY 2 DESC, 1 LIMIT 5;
\echo '-- 회원별 롤백 횟수'
SELECT a.user_id, COUNT(*) AS 롤백 FROM attempts a WHERE a.forked_from_checkpoint_id IS NOT NULL GROUP BY 1 ORDER BY 1;
\echo '-- jsonb: 실행(RUN) 이벤트 중 실패 포함'
SELECT COUNT(*) AS 실행_이벤트, COUNT(*) FILTER (WHERE payload::text ILIKE '%fail%') AS 실패_포함 FROM attempt_events WHERE type = 'RUN';
\echo '-- 실전 회차별 입장 현황과 감독 이벤트'
SELECT c.name AS 회사, s.title AS 회차, COUNT(DISTINCT p.participant_id) AS 초대, COUNT(DISTINCT p.attempt_id) AS 입장,
       COUNT(e.proctor_event_id) AS 감독_이벤트, COUNT(e.proctor_event_id) FILTER (WHERE e.snapshot_key IS NOT NULL) AS 스냅샷
FROM exam_sessions s JOIN companies c ON c.company_id = s.company_id JOIN exam_participants p ON p.session_id = s.session_id
LEFT JOIN proctor_events e ON e.attempt_id = p.attempt_id GROUP BY c.name, s.session_id, s.title;
\echo '-- 응시별 감독 주의 구간 (리포트용, 앞 10개)'
SELECT attempt_id, type, started_at, duration_ms, confidence FROM proctor_events ORDER BY attempt_id, started_at LIMIT 10;
\echo '-- 채점 모델별 토큰 합계'
SELECT model, SUM(input_tokens) AS 입력, SUM(output_tokens) AS 출력, SUM(cached_tokens) AS 캐시 FROM judge_calls GROUP BY model;

\echo '== 7. 자주 쓸 조회 속도 =='
\echo '-- 리포트 한 건 (응시 → 채점 → 체크 결과 → 판정 → 근거)'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON)
SELECT cr.check_id, cr.deducted, v.violated, e.ref FROM scorings s
  JOIN check_results cr ON cr.scoring_id = s.scoring_id
  LEFT JOIN judge_verdicts v ON v.result_id = cr.result_id
  LEFT JOIN verdict_evidences e ON e.verdict_id = v.verdict_id
  WHERE s.attempt_id = (SELECT max(attempt_id) FROM scorings);
\echo '-- 대화 기록 한 건'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON)
SELECT * FROM chat_turns WHERE attempt_id = (SELECT max(attempt_id) FROM chat_turns) ORDER BY turn_no;
