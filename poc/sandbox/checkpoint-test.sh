#!/usr/bin/env bash
# 8번 기술검증: 시점 롤백 후 이어 풀기. 컨테이너 작업 폴더를 tar 로 저장하고 되돌린다.
source "$(dirname "$0")/common.sh"
build_image
OUT=$(mktemp -d)
TASK="$ROOT/backend/src/main/resources/tasks/order-deadlock/files"
A=pair-poc-a; B=pair-poc-b; stop_box $A; stop_box $B

save()     { local t=$(ms); docker exec $1 tar -C /workspace -cf - . > "$OUT/$2.tar"; echo "[저장 $2] $(( $(ms) - t ))ms, $(( $(wc -c < "$OUT/$2.tar") / 1024 ))KB"; }
restore()  { local t=$(ms); docker exec $1 sh -c 'find /workspace -mindepth 1 -delete'; docker exec -i $1 tar -C /workspace -xf - < "$OUT/$2.tar"; echo "[복원 $2 → $1] $(( $(ms) - t ))ms"; }
manifest() { docker exec $1 sh -c 'cd /workspace && find . -type f | sort | xargs sha256sum'; }
same()     { [ "$(manifest $1)" = "$(cat "$OUT/$2.sum")" ] && echo "일치" || echo "불일치"; }
tests()    { docker exec $1 sh -c 'javac -encoding UTF-8 -d /tmp/out -cp /opt/junit.jar $(find src test -name "*.java") && java -jar /opt/junit.jar execute -cp /tmp/out --scan-class-path --disable-banner --details=summary 2>&1 | grep -E "tests (successful|failed)"' | tr -s ' \n' ' '; }

start_box $A; put_dir $A "$TASK"
save $A cp1; manifest $A > "$OUT/cp1.sum"
echo "[CP1 테스트] $(tests $A)"

# 응시자가 이어서 작업: 정답 코드로 고치고, 새 파일 추가, 기존 파일 삭제
docker exec -i $A sh -c 'cat > src/shop/OrderService.java' < "$ROOT/backend/src/test/resources/solutions/order-deadlock/OrderService.java"
docker exec $A sh -c 'echo "class Extra {}" > src/shop/Extra.java; rm NOTES.md'
save $A cp2; manifest $A > "$OUT/cp2.sum"
echo "[CP2 테스트] $(tests $A)"
sha_before=$(sha256sum "$OUT/cp1.tar" "$OUT/cp2.tar")

# 1) 롤백: A 를 CP1 로 되돌림
restore $A cp1
echo "[롤백 파일 복원] CP1 과 $(same $A cp1) / Extra.java: $(docker exec $A test -e src/shop/Extra.java && echo 남음 || echo 없음) / NOTES.md: $(docker exec $A test -e NOTES.md && echo 있음 || echo 없음)"
echo "[롤백 후 이어 풀기] $(tests $A)"

# 2) 기존 풀이 보존: CP2 를 새 분기 B 로 띄워도 A 와 저장본이 그대로인지
start_box $B; restore $B cp2
echo "[분기 B] CP2 와 $(same $B cp2) / [분기 A] CP1 과 $(same $A cp1) / 저장본 변경: $([ "$sha_before" = "$(sha256sum "$OUT/cp1.tar" "$OUT/cp2.tar")" ] && echo 없음 || echo 있음)"
echo "[분기 B 테스트] $(tests $B)"

stop_box $A; stop_box $B
rm -f "$OUT/cp1.tar" "$OUT/cp2.tar" "$OUT/cp1.sum" "$OUT/cp2.sum"; rmdir "$OUT"
