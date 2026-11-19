-- RAG 기술검증 B: 과제별로 걸러서 검색할 때 HNSW 와 정확 검색 비교 (pgvector 0.8)
-- 데이터: 과제 1,000개 × 조각 50개 = 50,000개, 1536차원 무작위 벡터. 질문 20개(각자 다른 과제)
-- 실행: docker exec -i pair-poc-pgv psql -U poc -d poc < index_test.sql
\timing off
DROP TABLE IF EXISTS chunks, chunks_h, q;
CREATE OR REPLACE FUNCTION rand_vec(seed int) RETURNS vector LANGUAGE sql VOLATILE AS
  $$ SELECT array_agg(random() - 0.5)::vector(1536) FROM generate_series(1, 1536) $$;
CREATE TABLE chunks (id bigserial PRIMARY KEY, task_id int NOT NULL, emb vector(1536) NOT NULL);
\echo '[적재] 50,000개'
\timing on
INSERT INTO chunks (task_id, emb)
SELECT g % 1000, rand_vec(g) FROM generate_series(1, 50000) g;
\timing off
CREATE TABLE chunks_h AS TABLE chunks;
CREATE TABLE q AS SELECT i AS id, (i * 37) % 1000 AS task_id,
  rand_vec(i) AS emb FROM generate_series(1, 20) i;

\echo '[인덱스] 정확 검색용 과제 B-tree / HNSW 만들기 시간'
\timing on
CREATE INDEX ON chunks (task_id);
CREATE INDEX ON chunks_h USING hnsw (emb vector_cosine_ops);
\timing off
ANALYZE chunks; ANALYZE chunks_h;
SELECT pg_size_pretty(pg_total_relation_size('chunks')) AS "표+B-tree", pg_size_pretty(pg_indexes_size('chunks_h')) AS "HNSW 인덱스";

-- 정답: 과제로 거른 뒤 전부 비교 (B-tree)
CREATE TEMP TABLE truth AS SELECT q.id, array(SELECT c.id FROM chunks c WHERE c.task_id = q.task_id ORDER BY c.emb <=> q.emb LIMIT 3) AS ids FROM q;

\echo '[1] 정확 검색 (과제 B-tree로 50개만 꺼내 비교): 질문 20개 전체 시간'
\timing on
SELECT count(*) FROM (SELECT array(SELECT c.id FROM chunks c WHERE c.task_id = q.task_id ORDER BY c.emb <=> q.emb LIMIT 3) FROM q) t;
\timing off

SET enable_seqscan = off;
\echo '[2] HNSW 기본 (거르기 전에 가까운 40개만 보고 과제로 거름)'
CREATE TEMP TABLE r2 AS SELECT q.id, array(SELECT c.id FROM chunks_h c WHERE c.task_id = q.task_id ORDER BY c.emb <=> q.emb LIMIT 3) AS ids FROM q;
\timing on
SELECT count(*) FROM (SELECT array(SELECT c.id FROM chunks_h c WHERE c.task_id = q.task_id ORDER BY c.emb <=> q.emb LIMIT 3) FROM q) t;
\timing off
SELECT round(avg(cardinality(r2.ids)), 2) AS "평균 결과 수(3이 정상)",
       round(avg((SELECT count(*) FROM unnest(r2.ids) x WHERE x = ANY(t.ids))::numeric / 3), 2) AS "재현율"
FROM r2 JOIN truth t USING (id);

\echo '[3] HNSW + 반복 스캔 (iterative_scan = relaxed_order)'
SET hnsw.iterative_scan = relaxed_order;
CREATE TEMP TABLE r3 AS SELECT q.id, array(SELECT c.id FROM chunks_h c WHERE c.task_id = q.task_id ORDER BY c.emb <=> q.emb LIMIT 3) AS ids FROM q;
\timing on
SELECT count(*) FROM (SELECT array(SELECT c.id FROM chunks_h c WHERE c.task_id = q.task_id ORDER BY c.emb <=> q.emb LIMIT 3) FROM q) t;
\timing off
SELECT round(avg(cardinality(r3.ids)), 2) AS "평균 결과 수(3이 정상)",
       round(avg((SELECT count(*) FROM unnest(r3.ids) x WHERE x = ANY(t.ids))::numeric / 3), 2) AS "재현율"
FROM r3 JOIN truth t USING (id);
