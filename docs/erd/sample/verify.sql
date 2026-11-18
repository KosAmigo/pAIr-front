-- 적재한 샘플을 검증한다.
-- 실행: docker exec -i pair-erd-pg psql -U pair -d pair < docs/erd/sample/verify.sql
\pset footer off
\set QUIET on

\echo '== 1. 테이블별 행 수 =='
SELECT relname AS 테이블, n_live_tup AS 행 FROM pg_stat_user_tables ORDER BY relname;

\echo '== 2. 총점: 감점 합으로 계산 (리포트 총점과 같아야 함: 96, 96, 93, 68, 45, 96, 60) =='
WITH item AS (
  SELECT s.scoring_id, ri.item_key, GREATEST(0, ri.max_score - COALESCE(SUM(cr.deducted), 0)) AS score
  FROM scorings s CROSS JOIN rubric_items ri
  LEFT JOIN rubric_checks rc ON rc.item_key = ri.item_key
  LEFT JOIN check_results cr ON cr.check_id = rc.check_id AND cr.scoring_id = s.scoring_id
  GROUP BY s.scoring_id, ri.item_key, ri.max_score),
tot AS (SELECT scoring_id, SUM(score) AS total FROM item GROUP BY scoring_id)
SELECT scoring_id AS 채점, total AS 총점 FROM tot ORDER BY 1;

\echo '== 3. 테이블 사이 정합성 (모두 0이어야 함) =='
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
UNION ALL SELECT '관리자가 아닌 회원이 만든 과제', COUNT(*) FROM tasks t
  JOIN users u ON u.user_id = t.created_by WHERE u.role <> 'ADMIN'
UNION ALL SELECT '회차를 만든 사람이 같은 회사 매니저·관리자가 아님', COUNT(*) FROM exam_sessions s
  JOIN users u ON u.user_id = s.created_by WHERE NOT (u.role = 'ADMIN' OR (u.role = 'MANAGER' AND u.company_id = s.company_id))
UNION ALL SELECT '실전 응시 과제가 회차 과제에 없음', COUNT(*) FROM attempts a
  JOIN exam_participants p ON p.participant_id = a.participant_id
  WHERE NOT EXISTS (SELECT 1 FROM exam_session_tasks st WHERE st.session_id = p.session_id AND st.task_id = a.task_id)
UNION ALL SELECT '실전 응시인데 입장 기록 없음', COUNT(*) FROM attempts a
  JOIN exam_participants p ON p.participant_id = a.participant_id WHERE p.entered_at IS NULL
UNION ALL SELECT '실전 응시가 시험 시간 밖에 시작', COUNT(*) FROM attempts a
  JOIN exam_participants p ON p.participant_id = a.participant_id JOIN exam_sessions s ON s.session_id = p.session_id
  WHERE a.started_at NOT BETWEEN s.starts_at AND s.ends_at
UNION ALL SELECT '감독 판단자가 같은 회사 감독관·매니저·관리자가 아님', COUNT(*) FROM proctor_events e
  JOIN attempts a ON a.attempt_id = e.attempt_id JOIN exam_participants p ON p.participant_id = a.participant_id
  JOIN exam_sessions s ON s.session_id = p.session_id
  JOIN users u ON u.user_id = e.reviewed_by WHERE NOT (u.role = 'ADMIN' OR (u.role IN ('PROCTOR', 'MANAGER') AND u.company_id = s.company_id))
UNION ALL SELECT '감독 회차인데 동의 없이 응시', COUNT(*) FROM attempts a
  JOIN exam_participants p ON p.participant_id = a.participant_id JOIN exam_sessions s ON s.session_id = p.session_id
  WHERE s.proctoring AND NOT EXISTS (SELECT 1 FROM proctor_consents c WHERE c.participant_id = p.participant_id)
UNION ALL SELECT '감독 이벤트가 실전 응시가 아님', COUNT(*) FROM proctor_events e
  JOIN attempts a ON a.attempt_id = e.attempt_id WHERE a.mode <> 'LIVE'
UNION ALL SELECT '감독 이벤트가 시험 시간 밖', COUNT(*) FROM proctor_events e
  JOIN attempts a ON a.attempt_id = e.attempt_id JOIN exam_participants p ON p.participant_id = a.participant_id
  JOIN exam_sessions s ON s.session_id = p.session_id
  WHERE e.started_at NOT BETWEEN s.starts_at AND s.ends_at
UNION ALL SELECT '취소된 회차에 입장·응시 기록', COUNT(*) FROM exam_participants p
  JOIN exam_sessions s ON s.session_id = p.session_id WHERE s.canceled_at IS NOT NULL AND p.entered_at IS NOT NULL
UNION ALL SELECT '원장 잔액 ≠ 이전 잔액 + 증감', COUNT(*) FROM (
    SELECT balance_after, amount, LAG(balance_after, 1, 0) OVER (PARTITION BY user_id ORDER BY ledger_id) AS prev FROM credit_ledger) x
  WHERE x.balance_after <> x.prev + x.amount
UNION ALL SELECT '원장 응시가 다른 회원 것', COUNT(*) FROM credit_ledger l
  JOIN attempts a ON a.attempt_id = l.attempt_id WHERE a.user_id IS DISTINCT FROM l.user_id
UNION ALL SELECT '원장 채팅 턴이 다른 회원 것이거나 AI 턴', COUNT(*) FROM credit_ledger l
  JOIN chat_turns t ON t.turn_id = l.turn_id JOIN attempts a ON a.attempt_id = t.attempt_id
  WHERE a.user_id IS DISTINCT FROM l.user_id OR t.role <> 'USER'
UNION ALL SELECT '롤백 차감인데 롤백 응시가 아님(또는 반대)', COUNT(*) FROM credit_ledger l
  JOIN attempts a ON a.attempt_id = l.attempt_id WHERE (l.reason = 'ROLLBACK') <> (a.forked_from_checkpoint_id IS NOT NULL)
UNION ALL SELECT '자가진단 응시인데 시작 차감 없음', COUNT(*) FROM attempts a
  WHERE a.mode = 'SELF' AND NOT EXISTS (SELECT 1 FROM credit_ledger l WHERE l.attempt_id = a.attempt_id)
UNION ALL SELECT '구매 적립이 결제 완료 건이 아니거나 다른 회원', COUNT(*) FROM credit_ledger l
  JOIN credit_purchases p ON p.purchase_id = l.purchase_id
  WHERE p.status <> 'PAID' OR p.user_id <> l.user_id OR p.credits <> l.amount
UNION ALL SELECT '결제 완료인데 적립 없음', COUNT(*) FROM credit_purchases p
  WHERE p.status = 'PAID' AND NOT EXISTS (SELECT 1 FROM credit_ledger l WHERE l.purchase_id = p.purchase_id)
UNION ALL SELECT '문의 처리자가 관리자가 아님', COUNT(*) FROM company_inquiries q
  JOIN users u ON u.user_id = q.handled_by WHERE u.role <> 'ADMIN'
UNION ALL SELECT '초대 권한 없음(관리자, 또는 같은 회사 매니저의 감독관 초대만)', COUNT(*) FROM company_invites i
  JOIN users u ON u.user_id = i.invited_by
  WHERE NOT (u.role = 'ADMIN' OR (u.role = 'MANAGER' AND u.company_id = i.company_id AND i.role = 'PROCTOR'))
UNION ALL SELECT '초대로 가입한 담당자의 회사·이메일이 초대와 다름', COUNT(*) FROM company_invites i
  JOIN users u ON u.user_id = i.accepted_user_id
  WHERE u.role <> i.role OR u.company_id <> i.company_id OR u.email <> i.email
UNION ALL SELECT '회차에 숨김(HIDDEN) 과제', COUNT(*) FROM exam_session_tasks st
  JOIN tasks t ON t.task_id = st.task_id WHERE t.status = 'HIDDEN'
UNION ALL SELECT '탈퇴 회원에 개인정보가 남음', COUNT(*) FROM users
  WHERE deleted_at IS NOT NULL AND (email NOT LIKE 'deleted-%' OR name <> '탈퇴 회원');

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
  ['없는 상태값(DRAFT) 과제', $q$UPDATE tasks SET status = 'DRAFT' WHERE task_id = (SELECT min(task_id) FROM tasks)$q$],
  ['공개 시각 없이 공개', $q$UPDATE tasks SET status = 'OPEN', published_at = NULL WHERE task_id = (SELECT min(task_id) FROM tasks)$q$],
  ['공개 시각 없이 응시 마감(CLOSED)', $q$UPDATE tasks SET status = 'CLOSED', published_at = NULL WHERE task_id = (SELECT min(task_id) FROM tasks)$q$],
  ['탈퇴 상태인데 탈퇴 시각 없음', $q$UPDATE users SET member_status = 'WITHDRAWN' WHERE user_id = 2$q$],
  ['탈퇴 시각이 있는데 정상 상태', $q$UPDATE users SET deleted_at = now() WHERE user_id = 2$q$],
  ['없는 회원 상태', $q$UPDATE users SET member_status = 'BANNED' WHERE user_id = 2$q$],
  ['같은 체크포인트에 같은 경로 파일 두 번', $q$INSERT INTO checkpoint_files(checkpoint_id,path,content) SELECT checkpoint_id,path,'x' FROM checkpoint_files LIMIT 1$q$],
  ['같은 문항에 같은 인정 답안 두 번', $q$INSERT INTO short_answer_keys(question_id,accepted) SELECT question_id,accepted FROM short_answer_keys LIMIT 1$q$],
  ['같은 코드·직군 체크', format($q$INSERT INTO rubric_checks(item_key,code,track,method,points,label) VALUES (%L,%L,%L,%L,1,'x')$q$, (rc).item_key, (rc).code, (rc).track, (rc).method)],
  ['없는 페이지의 조각', $q$INSERT INTO document_chunks(task_file_id,page_no,chunk_no,content,token_count,embedding) SELECT task_file_id,999,1,'x',1,embedding FROM document_chunks LIMIT 1$q$],
  ['차원이 다른 벡터', $q$INSERT INTO document_chunks(task_file_id,page_no,chunk_no,content,token_count,embedding) SELECT task_file_id,page_no,99,'x',1,'[1,2,3]' FROM document_chunks LIMIT 1$q$],
  ['같은 이메일 회원', $q$INSERT INTO users(email,password_hash,name,role) SELECT email,'x','x','USER' FROM users LIMIT 1$q$],
  ['회사 없는 매니저', $q$INSERT INTO users(email,password_hash,name,role) VALUES ('nocompany@x','x','x','MANAGER')$q$],
  ['회사 없는 감독관', $q$INSERT INTO users(email,password_hash,name,role) VALUES ('nocompany2@x','x','x','PROCTOR')$q$],
  ['회사에 속한 일반 회원', $q$INSERT INTO users(email,password_hash,name,role,company_id) VALUES ('usercompany@x','x','x','USER',1)$q$],
  ['없는 권한(COMPANY)', $q$INSERT INTO users(email,password_hash,name,role,company_id) VALUES ('oldrole@x','x','x','COMPANY',1)$q$],
  ['응시자 권한으로 기업 초대', $q$INSERT INTO company_invites(company_id,email,role,token_hash,invited_by,expires_at) VALUES (1,'x@x','USER',repeat('b',64),1,now() + interval '7 days')$q$],
  ['회사 없는 회차', $q$INSERT INTO exam_sessions(title,starts_at,ends_at,created_by) SELECT 'x',starts_at,ends_at,created_by FROM exam_sessions LIMIT 1$q$],
  ['같은 입장 링크 토큰', $q$INSERT INTO exam_participants(session_id,email,name,invite_token_hash) SELECT session_id,'new@x','x',invite_token_hash FROM exam_participants LIMIT 1$q$],
  ['종료가 시작보다 이른 회차', $q$INSERT INTO exam_sessions(company_id,title,starts_at,ends_at,created_by) SELECT company_id,'x',ends_at,starts_at,created_by FROM exam_sessions LIMIT 1$q$],
  ['같은 회차에 같은 과제 두 번', $q$INSERT INTO exam_session_tasks(session_id,task_id,sort_order) SELECT session_id,task_id,99 FROM exam_session_tasks LIMIT 1$q$],
  ['같은 회차에 같은 순서 두 번', $q$INSERT INTO exam_session_tasks(session_id,task_id,sort_order) SELECT st.session_id,t.task_id,st.sort_order FROM exam_session_tasks st JOIN tasks t ON t.usage = 'LIVE' WHERE NOT EXISTS (SELECT 1 FROM exam_session_tasks x WHERE x.session_id = st.session_id AND x.task_id = t.task_id) LIMIT 1$q$],
  ['같은 대상자가 같은 과제 두 번 응시', $q$INSERT INTO attempts(participant_id,task_id,mode,status,assistant_model) SELECT participant_id,task_id,'LIVE','SOLVING','x' FROM attempts WHERE participant_id IS NOT NULL LIMIT 1$q$],
  ['대상자 없는 실전 응시', $q$INSERT INTO attempts(task_id,mode,status,assistant_model) SELECT (SELECT task_id FROM tasks WHERE usage = 'LIVE' LIMIT 1),'LIVE','SOLVING','x'$q$],
  ['대상자가 연결된 자가진단 응시', $q$INSERT INTO attempts(user_id,participant_id,task_id,mode,status,assistant_model) SELECT 2,3,task_id,'SELF','SOLVING','x' FROM attempts LIMIT 1$q$],
  ['같은 회차에 같은 이메일 초대', $q$INSERT INTO exam_participants(session_id,email,name,invite_token_hash) SELECT session_id,email,'x',repeat('0',64) FROM exam_participants LIMIT 1$q$],
  ['같은 대상자에 감독 동의 두 번', $q$INSERT INTO proctor_consents(participant_id,consent_version,env_check) SELECT participant_id,'v2','{}' FROM proctor_consents LIMIT 1$q$],
  ['없는 감독 이벤트 종류', $q$INSERT INTO proctor_events(attempt_id,type,started_at) SELECT attempt_id,'SCREENSHOT',started_at FROM proctor_events LIMIT 1$q$],
  ['확신도 1 초과', $q$INSERT INTO proctor_events(attempt_id,type,started_at,confidence) SELECT attempt_id,'NO_FACE',started_at,1.5 FROM proctor_events LIMIT 1$q$],
  ['회원이 연결된 실전 응시', $q$INSERT INTO attempts(user_id,participant_id,task_id,mode,status,assistant_model) SELECT 2,3,(SELECT task_id FROM tasks WHERE usage = 'LIVE' LIMIT 1),'LIVE','SOLVING','x'$q$],
  ['회원 없는 자가진단 응시', $q$INSERT INTO attempts(task_id,mode,status,assistant_model) SELECT task_id,'SELF','SOLVING','x' FROM attempts LIMIT 1$q$],
  ['없는 감독 판단', $q$UPDATE proctor_events SET review='MAYBE', reviewed_by=4, reviewed_at=now() WHERE proctor_event_id=(SELECT min(proctor_event_id) FROM proctor_events)$q$],
  ['판단자 없는 감독 판단', $q$UPDATE proctor_events SET review='OK', reviewed_by=NULL, reviewed_at=NULL WHERE proctor_event_id=(SELECT max(proctor_event_id) FROM proctor_events)$q$],
  ['자가진단 과제로 실전 응시', $q$INSERT INTO attempts(participant_id,task_id,mode,status,assistant_model) SELECT 3,(SELECT task_id FROM tasks WHERE usage = 'SELF' LIMIT 1),'LIVE','SOLVING','x'$q$],
  ['기업용 과제로 자가진단 응시', $q$INSERT INTO attempts(user_id,task_id,mode,status,assistant_model) SELECT 2,(SELECT task_id FROM tasks WHERE usage = 'LIVE' LIMIT 1),'SELF','SOLVING','x'$q$],
  ['자가진단 과제를 회차에 걸기', $q$INSERT INTO exam_session_tasks(session_id,task_id,sort_order) SELECT 1,(SELECT task_id FROM tasks WHERE usage = 'SELF' LIMIT 1),9$q$],
  ['회차 과제 용도를 SELF로', $q$INSERT INTO exam_session_tasks(session_id,task_id,task_usage,sort_order) SELECT 1,(SELECT task_id FROM tasks WHERE usage = 'SELF' LIMIT 1),'SELF',9$q$],
  ['없는 과제 용도', $q$UPDATE tasks SET usage = 'BOTH' WHERE task_id = (SELECT max(task_id) FROM tasks)$q$],
  ['실전 응시에 공유 링크', $q$UPDATE attempts SET share_token_hash = repeat('a',64), shared_at = now() WHERE attempt_id = (SELECT max(attempt_id) FROM attempts WHERE mode = 'LIVE')$q$],
  ['시작한 뒤 회차 취소', $q$UPDATE exam_sessions SET canceled_at = starts_at + interval '1 minute' WHERE session_id = 1$q$],
  ['잔액이 음수가 되는 차감', $q$INSERT INTO credit_ledger(user_id,amount,balance_after,reason,attempt_id) SELECT 2,-10,-1,'ATTEMPT_START',max(attempt_id) FROM attempts WHERE mode = 'SELF' AND attempt_id NOT IN (SELECT attempt_id FROM credit_ledger WHERE attempt_id IS NOT NULL)$q$],
  ['같은 채팅 턴 두 번 차감', $q$INSERT INTO credit_ledger(user_id,amount,balance_after,reason,turn_id) SELECT user_id,-1,0,'CHAT_TURN',turn_id FROM credit_ledger WHERE turn_id IS NOT NULL LIMIT 1$q$],
  ['같은 응시 시작 두 번 차감', $q$INSERT INTO credit_ledger(user_id,amount,balance_after,reason,attempt_id) SELECT user_id,-10,0,'ATTEMPT_START',attempt_id FROM credit_ledger WHERE reason = 'ATTEMPT_START' LIMIT 1$q$],
  ['사용인데 양수', $q$INSERT INTO credit_ledger(user_id,amount,balance_after,reason,turn_id) SELECT 2,5,5,'CHAT_TURN',max(turn_id) FROM chat_turns$q$],
  ['구매 없이 구매 적립', $q$INSERT INTO credit_ledger(user_id,amount,balance_after,reason) VALUES (2,100,100,'PURCHASE')$q$],
  ['결제 키 없이 결제 완료', $q$UPDATE credit_purchases SET status = 'PAID', paid_at = now() WHERE status = 'READY'$q$],
  ['회사 없이 문의 승인', $q$UPDATE company_inquiries SET status = 'APPROVED', handled_by = 1, handled_at = now() WHERE status = 'PENDING'$q$],
  ['처리자 없이 문의 거절', $q$UPDATE company_inquiries SET status = 'REJECTED' WHERE status = 'PENDING'$q$],
  ['같은 기업 초대 토큰', $q$INSERT INTO company_invites(company_id,email,role,token_hash,invited_by,expires_at) SELECT company_id,'new@x',role,token_hash,invited_by,now() + interval '7 days' FROM company_invites LIMIT 1$q$]];
BEGIN
  FOR i IN 1..array_length(tests, 1) LOOP
    BEGIN
      EXECUTE tests[i][2];
      INSERT INTO bad VALUES (tests[i][1], '안 막힘 ✗');
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'undo' THEN
        INSERT INTO bad VALUES (tests[i][1], CASE WHEN SQLSTATE LIKE '42%' THEN '검사 SQL 오류 ✗ ' || SQLERRM ELSE '막힘 (' || SQLSTATE || ')' END);
      END IF;
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
SELECT c.name AS 회사, s.title AS 회차, (SELECT COUNT(*) FROM exam_session_tasks st WHERE st.session_id = s.session_id) AS 과제,
       COUNT(DISTINCT p.participant_id) AS 초대, COUNT(DISTINCT p.participant_id) FILTER (WHERE p.entered_at IS NOT NULL) AS 입장,
       COUNT(DISTINCT a.attempt_id) AS 응시, COUNT(e.proctor_event_id) AS 감독_이벤트,
       COUNT(e.proctor_event_id) FILTER (WHERE e.snapshot_key IS NOT NULL) AS 스냅샷
FROM exam_sessions s JOIN companies c ON c.company_id = s.company_id JOIN exam_participants p ON p.session_id = s.session_id
LEFT JOIN attempts a ON a.participant_id = p.participant_id LEFT JOIN proctor_events e ON e.attempt_id = a.attempt_id
GROUP BY c.name, s.session_id, s.title;
\echo '-- 대상자별 과제 진행 (기업 화면)'
SELECT p.name AS 대상자, t.title AS 과제, st.sort_order AS 순서, COALESCE(a.status, '미시작') AS 상태
FROM exam_participants p JOIN exam_session_tasks st ON st.session_id = p.session_id JOIN tasks t ON t.task_id = st.task_id
LEFT JOIN attempts a ON a.participant_id = p.participant_id AND a.task_id = st.task_id ORDER BY p.participant_id, st.sort_order;
\echo '-- 응시별 감독 주의 구간 (리포트용, 앞 10개)'
SELECT attempt_id, type, started_at, duration_ms, confidence FROM proctor_events ORDER BY attempt_id, started_at LIMIT 10;
\echo '-- 회원별 크레딧 잔액과 사용 내역 (최신 원장의 처리 후 잔액)'
SELECT DISTINCT ON (l.user_id) l.user_id AS 회원, u.name AS 이름, l.balance_after AS 잔액,
       (SELECT COUNT(*) FROM credit_ledger x WHERE x.user_id = l.user_id AND x.reason = 'CHAT_TURN') AS 채팅_턴
FROM credit_ledger l JOIN users u ON u.user_id = l.user_id ORDER BY l.user_id, l.ledger_id DESC;
\echo '-- 자가진단 과제 목록 (기업용 과제는 나오지 않아야 함)'
SELECT task_id, code, usage, status FROM tasks WHERE usage = 'SELF' AND status IN ('OPEN', 'CLOSED') ORDER BY task_id;
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
