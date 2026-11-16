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

\echo '== 3. 다른 벌(복제본)과 섞인 참조가 없는지 (모두 0이어야 함) =='
SELECT '판정의 결과와 호출이 다른 채점' AS 검사, COUNT(*) FROM judge_verdicts v
  JOIN check_results r ON r.result_id = v.result_id JOIN judge_calls j ON j.judge_call_id = v.judge_call_id
  WHERE r.scoring_id <> j.scoring_id
UNION ALL SELECT '롤백 응시와 체크포인트 주인이 다른 회원', COUNT(*) FROM attempts a
  JOIN checkpoints c ON c.checkpoint_id = a.forked_from_checkpoint_id JOIN attempts o ON o.attempt_id = c.attempt_id
  WHERE o.user_id <> a.user_id
UNION ALL SELECT '체크포인트 턴이 원래 응시에 없음', COUNT(*) FROM checkpoints c
  WHERE NOT EXISTS (SELECT 1 FROM chat_turns t WHERE t.attempt_id = c.attempt_id AND t.turn_no = c.turn_no)
UNION ALL SELECT '선택한 보기가 다른 문항 것', COUNT(*) FROM answer_choices ac
  JOIN question_answers qa ON qa.answer_id = ac.answer_id JOIN question_choices qc ON qc.choice_id = ac.choice_id
  WHERE qc.question_id <> qa.question_id
UNION ALL SELECT '답변 문항이 응시 과제와 다름', COUNT(*) FROM question_answers qa
  JOIN attempts a ON a.attempt_id = qa.attempt_id JOIN task_questions q ON q.question_id = qa.question_id
  WHERE q.task_id <> a.task_id
UNION ALL SELECT '첨부한 과제 자료가 응시 과제와 다름', COUNT(*) FROM chat_attachments ca
  JOIN chat_turns t ON t.turn_id = ca.turn_id JOIN attempts a ON a.attempt_id = t.attempt_id
  JOIN task_files f ON f.task_file_id = ca.task_file_id WHERE f.task_id <> a.task_id;

\echo '== 4. 잘못된 데이터가 막히는지 =='
CREATE TEMP TABLE bad (검사 text, 결과 text);
DO $$
DECLARE a bigint := (SELECT max(attempt_id) FROM attempts);
        t bigint := (SELECT max(turn_id) FROM chat_turns);
        tn int   := (SELECT turn_no FROM chat_turns WHERE turn_id = (SELECT max(turn_id) FROM chat_turns));
        ta bigint := (SELECT attempt_id FROM chat_turns WHERE turn_id = (SELECT max(turn_id) FROM chat_turns));
        qa record := (SELECT qa FROM question_answers qa ORDER BY answer_id DESC LIMIT 1);
        rc record := (SELECT rc FROM rubric_checks rc LIMIT 1);
        tests text[][] := ARRAY[
  ['외부 업로드 첨부', format($q$INSERT INTO chat_attachments(turn_id,source_type,file_name,mime_type,sent_text) VALUES (%s,'UPLOAD','x.pdf','application/pdf','x')$q$, t)],
  ['원본 없는 과제 자료 첨부', format($q$INSERT INTO chat_attachments(turn_id,source_type,file_name,mime_type,sent_text) VALUES (%s,'TASK_FILE','x.pdf','application/pdf','x')$q$, t)],
  ['같은 응시에 중복 턴 번호', format($q$INSERT INTO chat_turns(attempt_id,turn_no,role,content) VALUES (%s,%s,'USER','x')$q$, ta, tn)],
  ['없는 응시에 답변', format($q$INSERT INTO question_answers(attempt_id,question_id) VALUES (%s,1)$q$, a + 1000)],
  ['같은 문항에 두 번 답', format($q$INSERT INTO question_answers(attempt_id,question_id) VALUES (%s,%s)$q$, (qa).attempt_id, (qa).question_id)],
  ['같은 코드·직군 체크', format($q$INSERT INTO rubric_checks(item_key,code,track,method,points,label) VALUES (%L,%L,%L,%L,1,'x')$q$, (rc).item_key, (rc).code, (rc).track, (rc).method)],
  ['없는 페이지의 조각', $q$INSERT INTO document_chunks(task_file_id,page_no,chunk_no,content,token_count,embedding) SELECT task_file_id,999,1,'x',1,embedding FROM document_chunks LIMIT 1$q$],
  ['차원이 다른 벡터', $q$INSERT INTO document_chunks(task_file_id,page_no,chunk_no,content,token_count,embedding) SELECT task_file_id,page_no,99,'x',1,'[1,2,3]' FROM document_chunks LIMIT 1$q$],
  ['같은 이메일 회원', $q$INSERT INTO users(email,password_hash,name,role) SELECT email,'x','x','USER' FROM users LIMIT 1$q$]];
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
