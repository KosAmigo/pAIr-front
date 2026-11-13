#!/usr/bin/env bash
# 9번 기술검증: 정해진 파일만 수정 가능, 추가/삭제/이름 변경 불가.
# 방법: 서버가 작업 폴더를 준비할 때 폴더와 파일 주인을 root 로 두고, 폴더는 읽기 전용(555),
#      수정 가능한 파일만 쓰기 허용(666). 응시자 컨테이너는 일반 사용자 + 권한 없음이라 이 규칙을 못 바꾼다.
source "$(dirname "$0")/common.sh"
build_image
B=pair-poc-perm; stop_box $B
TASK="$ROOT/backend/src/main/resources/tasks/order-deadlock/files"
EDITABLE="src/shop/OrderService.java src/shop/InventoryService.java test/shop/OrderServiceTest.java NOTES.md"

# 준비 단계(서버가 하는 일): 권한 있는 임시 컨테이너로 볼륨에 파일을 넣고 규칙 적용
docker volume create $B-ws >/dev/null
tar -C "$TASK" -cf - . | docker run --rm -i -v $B-ws:/workspace $IMAGE-setup sh -c "
  tar -C /workspace -xf - --no-same-owner && chown -R 0:0 /workspace &&
  find /workspace -type d -exec chmod 555 {} + && find /workspace -type f -exec chmod 444 {} + &&
  cd /workspace && chmod 666 $EDITABLE"
start_box $B

check() { # 이름, 기대(허용/차단), 명령
  docker exec $B sh -c "$3" >/dev/null 2>&1 && got=허용 || got=차단
  [ "$got" = "$2" ] && r=OK || r=FAIL; echo "[$r] $1: $got (기대 $2)"
}
check "수정 가능 파일 수정"   허용 "echo '// edit' >> src/shop/OrderService.java"
check "테스트 파일에 테스트 추가" 허용 "echo '// new test' >> test/shop/OrderServiceTest.java"
check "읽기 전용 파일 수정"   차단 "echo x >> src/shop/Db.java"
check "새 파일 추가"          차단 "touch src/shop/New.java"
check "새 폴더 추가"          차단 "mkdir src/extra"
check "파일 삭제"             차단 "rm -f src/shop/OrderService.java && test ! -e src/shop/OrderService.java"
check "파일 이름 변경"        차단 "mv src/shop/OrderService.java src/shop/O.java"
check "권한 바꾸기"           차단 "chmod 666 src/shop/Db.java"
check "편집기식 저장(임시 파일 후 교체)" 차단 "cp NOTES.md /tmp/n && mv /tmp/n NOTES.md"
check "응시자 코드가 파일 생성" 차단 "printf 'public class W { public static void main(String[] a) throws Exception { java.nio.file.Files.writeString(java.nio.file.Path.of(\"/workspace/src/hack.txt\"), \"x\"); } }' > /tmp/W.java && java /tmp/W.java"
check "컴파일과 테스트 실행"  허용 "javac -encoding UTF-8 -d /tmp/out -cp /opt/junit.jar \$(find src test -name '*.java') && java -jar /opt/junit.jar execute -cp /tmp/out --scan-class-path --disable-banner >/dev/null"
echo "[파일 목록 변화] $(docker exec $B sh -c 'find /workspace -type f | wc -l')개 (처음 $(find "$TASK" -type f | wc -l)개)"
stop_box $B
