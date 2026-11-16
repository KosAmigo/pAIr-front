# ERD 샘플 데이터 검증 (2026-11-16)

ERD 확정 전에 실제 데이터를 넣어 구조를 검증했다.

## 실행
```bash
python docs/erd/sample/make_sample.py   # csv/*.csv 생성
python docs/erd/sample/embed.py         # csv/document_chunks.csv (OpenAI text-embedding-3-small, 1536차원)
bash docs/erd/sample/load.sh            # eXERD용 Docker DB(pair-erd-pg)에 적재

# N배 검증 (예: 5배)
python docs/erd/sample/scale.py 5       # csv5/ 생성 (git 에 안 올림)
bash docs/erd/sample/load.sh csv5
docker exec -i pair-erd-pg psql -U pair -d pair < docs/erd/sample/verify.sql
```

## 데이터
- 실제: 과제 2개와 파일, 샘플 응시 7건(대화, 작업 기록, 작업 파일, 후속 답변), 6개 역량 채점 결과 7건(체크 결과, 모델별 판정, 근거), 프롬프트 버전 2개
- 예시로 만듦: 회원 3명, 비개발 객관식·단답형 문항과 답, 대화 첨부 2건, 체크포인트 1건과 거기서 롤백한 응시 1건
- 비개발 자료 2개(설문 요약, 매출 CSV)는 PDF라고 가정해 페이지 5장, 조각 7개로 나눔
- 28개 테이블 약 1,300행

## 결과
| 검증 | 결과 |
|---|---|
| 외래 키 순서로 전체 적재 | 오류 없음 |
| 잘못된 데이터 차단 (외부 업로드 첨부, 원본 없는 과제 자료 첨부, 중복 턴 번호, 없는 응시, 같은 문항 두 번 답, 같은 코드·직군 체크, 없는 페이지의 조각, 차원이 다른 벡터) | 8종 모두 차단 |
| 감점 합으로 계산한 총점 vs 실제 리포트 총점 | 7/7 일치 |
| 활용 쿼리 (근거 문서 2개 미만 문항, 첨부 vs 정답 근거, 판정 엇갈림 체크, 롤백 횟수, jsonb 조회, 토큰 합계) | 모두 의도대로 동작 |
| 한국어 의미 검색 (질문 5개) | 정답 조각이 1위 4개, 3위 안 5개 |

## 발견한 것
- **번호를 직접 넣어 적재하면 자동 번호(시퀀스)를 맞춰야 한다.** 안 하면 다음 INSERT 가 1번과 겹친다. `load.sh` 에 반영했다.
- **attempts ↔ checkpoints 는 서로를 가리킨다.** 적재할 때 롤백 출발점(forked_from_checkpoint_id)은 체크포인트를 넣은 뒤에 채워야 한다.
- **검색은 상위 3개를 쓰는 게 안전하다.** "가격 때문에 떠난 고객은…" 질문은 정답 조각(유사도 0.429)과 다른 조각(0.436)의 점수 차가 매우 작았다.
- **숫자 표(CSV)는 RAG 보다 표 전체를 넘기는 게 낫다.** 행이 비슷비슷해 조각끼리 점수 차가 작다. 표가 작으면 통째로 채점 모델에 넘기고, RAG 는 글 문서에 쓰는 것을 권장한다.

## 5배 검증 (2026-11-16)
과제·문항·채점 기준·프롬프트 버전은 그대로 두고, 회원과 응시 아래 데이터만 번호를 밀어 5벌 복제했다(회원 15명, 응시 40건, 채점 35건, 약 5,600행). 복제본은 내용이 원본과 같으므로 데이터 다양성이 아니라 **번호가 엉키지 않는지, 제약과 쿼리가 늘어난 양에서도 그대로인지**를 본 검증이다. 의미 검색은 문서 조각이 그대로라 다시 하지 않았다.

| 검증 | 결과 |
|---|---|
| 5배 적재 | 오류 없음, 5초 |
| 총점 (원본 채점 7건 × 5벌) | 35건 모두 원본과 같음 (96, 96, 93, 68, 45, 96, 60) |
| 다른 벌과 섞인 참조 6종 (판정↔호출 채점, 롤백↔체크포인트 회원, 체크포인트 턴, 보기↔문항, 답변↔과제, 첨부↔과제) | 모두 0건 |
| 잘못된 데이터 차단 (기존 8종 + 같은 이메일 회원) | 9종 모두 차단 |
| 적재 후 새 행 자동 번호 | 41번 (기존 최댓값 40 다음) |
| 활용 쿼리 6개 | 결과가 정확히 5배로 나옴 |
| 리포트 한 건 조회 | 0.5ms |

### 발견한 것
- **외래 키 컬럼 22개에 인덱스가 없다.** PostgreSQL 은 외래 키에 인덱스를 자동으로 만들지 않는다. 리포트 조회에서 `judge_verdicts` 는 이미 1,530행 전체를 훑었다(지금은 0.5ms 지만 응시가 1만 건이면 판정이 수십만 행). → 자주 조회하는 7개에 인덱스를 추가했다(`pair_schema.sql` 6절). 리포트 조회가 `idx_scorings_attempt_id`, `idx_judge_verdicts_result_id` 를 타는 것을 확인했다(지금 데이터 양에선 PostgreSQL 이 통째로 읽는 쪽을 고를 수 있어, 확인은 순차 읽기를 끄고 했다): `judge_verdicts.result_id`, `judge_calls.scoring_id`, `scorings.attempt_id`, `attempts.user_id`, `attempt_events.attempt_id`, `checkpoints.attempt_id`, `chat_attachments.turn_id`.
- **Windows Git Bash 에서 `docker exec ... /sample` 경로가 `C:/Program Files/Git/sample` 로 바뀐다.** 그래서 처음엔 이전 CSV 가 그대로 다시 들어갔다. `load.sh` 에 `MSYS_NO_PATHCONV=1` 을 넣어 고쳤다.
