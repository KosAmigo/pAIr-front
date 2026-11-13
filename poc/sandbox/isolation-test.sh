#!/usr/bin/env bash
# 7번 기술검증: 응시자 코드 실행 격리. 나쁜 코드를 컨테이너에서 돌리고 막히는지 확인한다.
source "$(dirname "$0")/common.sh"
TIMEOUT=${TIMEOUT:-30}
build_image
if [ -z "$ONLY_PARALLEL" ]; then
B=pair-poc-iso; stop_box $B
t=$(ms); start_box $B; docker exec $B true; echo "[시작] 컨테이너 시작 $(( $(ms) - t ))ms"
put_dir $B "$HERE/bad"

run() { # 이름, 명령 → 걸린 시간, 종료 코드, 출력 마지막 줄, 컨테이너 생존
  local t=$(ms) out code
  out=$(docker exec $B timeout -s KILL $TIMEOUT sh -c "$2" 2>&1); code=$?
  local left=$(procs $B); cleanup $B
  echo "[$1] $(( ($(ms) - t) / 1000 ))초, 종료코드 $code, 출력: $(echo "$out" | grep -v '^$' | grep -v '^[[:space:]]*at ' | tail -1 | cut -c1-110) / 남은 프로세스: 정리 전 $left, 정리 후 $(procs $B) / 컨테이너: $(alive $B)"
}
run "무한 루프"     "java InfiniteLoop.java"
run "메모리 폭탄"   "java -Xmx2g MemoryBomb.java"
run "인터넷 접속"   "java NetworkCall.java"
run "스레드 폭탄"   "java ThreadBomb.java"
run "디스크(/tmp)"  "java DiskFill.java /tmp 1024"
run "디스크(작업폴더)" "java DiskFill.java /workspace 1024"
run "권한"          "id -u; touch /etc/x"
echo "[호스트] 메모리 사용 상한: $(docker inspect -f '{{.HostConfig.Memory}}' $B) bytes"
stop_box $B
fi

# 실제 과제(order-deadlock) 테스트를 10개 컨테이너에서 동시에 실행
TASK="$ROOT/backend/src/main/resources/tasks/order-deadlock"
W=$(mktemp -d); cp -r "$TASK/files/." "$W/"; cp -r "$TASK/hidden/shop" "$W/test/"
cp "$ROOT/backend/src/test/resources/solutions/order-deadlock/OrderService.java" "$W/src/shop/"
N=${N:-10}; for i in $(seq 1 $N); do stop_box pair-poc-c$i; done
t0=$(ms)
for i in $(seq 1 $N); do (
  b=pair-poc-c$i; t=$(ms); start_box $b; put_dir $b "$W"
  r=$(docker exec $b timeout -s KILL $TIMEOUT sh -c 'javac -encoding UTF-8 -d /tmp/out -cp /opt/junit.jar $(find src test -name "*.java") && java -jar /opt/junit.jar execute -cp /tmp/out --scan-class-path --disable-banner --details=summary 2>&1 | grep -E "tests (successful|failed)"' | tr -s ' \n' ' ')
  echo "[동시 $i] $(( ($(ms) - t) / 1000 ))초 $r"; stop_box $b ) &
done; wait
echo "[동시 전체] ${N}건 $(( ($(ms) - t0) / 1000 ))초"
rm -rf "$W"
