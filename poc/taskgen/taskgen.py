"""기술검증 F: AI 과제 생성. 관리자 폼(직군, 난이도, 주제, 함정)만으로 LLM 이 개발 과제를 만들고,
그 과제가 실제로 쓸 수 있는지 Docker 샌드박스에서 자동 확인한다.

확인 기준 (과제 1개)
  1. 형식: 필수 필드, 파일 경로(src/, test/), 정답 코드는 src/ 파일만
  2. 시작 코드 + 공개 테스트가 컴파일된다
  3. 시작 코드에서 숨은 테스트가 1개 이상 실패한다 (버그가 실제로 있다)
  4. 정답 코드로 바꾸면 공개 + 숨은 테스트가 전부 통과한다
  5. 30초 안에 끝난다

실행: python poc/taskgen/taskgen.py [개수(기본 10)] [모델(기본 gpt-6.1-terra)]
준비: OPENAI_API_KEY 환경 변수, Docker (poc/sandbox 의 pair-sandbox 이미지를 쓴다)
"""
import json, os, re, subprocess, sys, tarfile, io, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
MODEL = sys.argv[2] if len(sys.argv) > 2 else "gpt-6.1-terra"
ENV = dict(os.environ, MSYS_NO_PATHCONV="1")

# 관리자 폼 입력 10개 (직군, 난이도, 주제, 함정)
FORMS = [
    ("백엔드", "중", "주문 처리 재고 차감", "상품 두 개를 서로 반대 순서로 잠가 생기는 교착 상태"),
    ("백엔드", "중", "쿠폰 할인 계산", "쿠폰 두 장을 겹쳐 쓰면 할인이 중복 적용됨"),
    ("백엔드", "하", "게시글 목록 페이지 나누기", "마지막 페이지에서 한 개가 빠지는 경계값 오류"),
    ("백엔드", "중", "정산 금액 계산", "double 로 계산해 원 단위 반올림이 틀어짐"),
    ("백엔드", "중", "결제 요청 중복 방지", "같은 요청 번호로 두 번 결제되는 문제"),
    ("백엔드", "상", "캐시를 쓰는 상품 조회", "가격을 바꿔도 캐시가 무효화되지 않아 옛 가격이 보임"),
    ("백엔드", "중", "외부 호출 재시도", "실패 시 재시도 횟수 제한이 없어 무한 반복"),
    ("백엔드", "하", "회원 목록 정렬", "비교 함수가 동점 처리를 잘못해 정렬 결과가 매번 달라짐"),
    ("백엔드", "중", "예약 가능 시간 계산", "시간대(타임존)를 무시해 자정 근처 예약이 하루 밀림"),
    ("백엔드", "상", "포인트 적립 동시 처리", "여러 스레드가 동시에 적립하면 일부 적립이 사라짐"),
]

FILE = {"type": "object", "additionalProperties": False, "required": ["path", "content"],
        "properties": {"path": {"type": "string"}, "content": {"type": "string"}}}
SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["title", "description", "requirements", "answer", "files", "hiddenTests", "solution"],
          "properties": {
              "title": {"type": "string"},
              "description": {"type": "array", "items": {"type": "string"}},
              "requirements": {"type": "array", "items": {"type": "string"}},
              "answer": {"type": "string", "description": "숨은 정답 설명: 원인과 올바른 수정 방법"},
              "files": {"type": "array", "items": FILE, "description": "응시자에게 주는 시작 코드(src/...)와 공개 테스트(test/...)"},
              "hiddenTests": {"type": "array", "items": FILE, "description": "채점용 숨은 테스트(test/...). 버그를 잡아야 함"},
              "solution": {"type": "array", "items": FILE, "description": "버그를 고친 src/ 파일(바뀐 파일만, 전체 내용)"}}}

SYSTEM = """당신은 AI 활용 역량 평가 플랫폼의 개발 과제 출제자입니다. 응시자는 60분 동안 AI 어시스턴트와 함께 버그를 찾아 고칩니다.
규칙:
- 순수 Java 21 + JUnit 5 만 씁니다. 외부 라이브러리, 파일, 네트워크, Spring 은 쓰지 않습니다.
- 패키지는 하나(예: shop)이고 경로는 src/<패키지>/X.java, test/<패키지>/XTest.java 입니다.
- 시작 코드에는 함정으로 주어진 버그가 실제로 있어야 하며, 코드만 봐서는 바로 드러나지 않게 자연스럽게 섞습니다. 버그 위치를 주석으로 알려 주지 않습니다.
- 공개 테스트는 시작 코드에서 통과하는 기본 동작만 확인합니다.
- 숨은 테스트는 시작 코드에서 반드시 실패하고, 올바르게 고치면 반드시 통과해야 합니다. 동시성 테스트는 assertTimeoutPreemptively 로 10초 안에 끝나게 하고, 결과가 흔들리지 않게 충분히 반복합니다.
- 정답(solution)은 시작 코드의 src 파일 중 바뀐 파일의 전체 내용입니다. 테스트 파일은 바꾸지 않습니다.
- 설명과 요구사항은 한국어로, 실제 회사의 장애 보고처럼 씁니다. 파일 3~6개 규모로 만듭니다."""


def generate(form):
    job, level, topic, trap = form
    user = f"직군: {job}\n난이도: {level}\n주제: {topic}\n함정: {trap}\n위 조건으로 과제를 만들어 주세요."
    body = {"model": MODEL, "reasoning_effort": "medium", "max_completion_tokens": 32000,
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "task", "strict": True, "schema": SCHEMA}}}
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"], "Content-Type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=600) as r:
        res = json.load(r)
    task = json.loads(res["choices"][0]["message"]["content"])
    return task, res["usage"], time.time() - t


def tar_of(files):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tf:
        for f in files:
            data = f["content"].encode()
            info = tarfile.TarInfo(f["path"]); info.size = len(data); info.mode = 0o644
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def run_tests(files, name):
    """파일들을 샌드박스 컨테이너에 넣고 컴파일 + JUnit 실행. (컴파일 성공, 통과 수, 실패 수, 걸린 초, 출력 끝부분)"""
    subprocess.run(["docker", "rm", "-f", name], capture_output=True, env=ENV)
    subprocess.run(["docker", "run", "-d", "--init", "--name", name, "--network", "none", "--memory", "512m", "--cpus", "1",
                    "--pids-limit", "256", "--tmpfs", "/tmp:size=64m,exec,uid=10001", "--cap-drop", "ALL",
                    "pair-sandbox", "sleep", "infinity"], capture_output=True, env=ENV, check=True)
    try:
        subprocess.run(["docker", "exec", "-i", name, "tar", "-C", "/workspace", "-xf", "-"], input=tar_of(files), capture_output=True, env=ENV)
        t = time.time()
        r = subprocess.run(["docker", "exec", name, "timeout", "-s", "KILL", "30", "sh", "-c",
                            "javac -encoding UTF-8 -d /tmp/out -cp /opt/junit.jar $(find src test -name '*.java') 2>&1 && echo COMPILED && "
                            "java -jar /opt/junit.jar execute -cp /tmp/out --scan-class-path --disable-banner --details=summary 2>&1"],
                           capture_output=True, env=ENV)
        out = r.stdout.decode(errors="replace")
        ok = re.search(r"\[\s*(\d+) tests successful", out); bad = re.search(r"\[\s*(\d+) tests failed", out)
        return "COMPILED" in out, int(ok.group(1)) if ok else 0, int(bad.group(1)) if bad else 0, round(time.time() - t, 1), out[-600:]
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, env=ENV)


def validate(i, task):
    v = {}
    paths = [f["path"] for f in task["files"] + task["hiddenTests"] + task["solution"]]
    v["형식"] = (all(re.fullmatch(r"(src|test)/[\w/]+\.java", p) for p in paths)
                and all(f["path"].startswith("src/") for f in task["solution"])
                and any(f["path"].startswith("test/") for f in task["files"]) and len(task["hiddenTests"]) > 0
                and len(task["solution"]) > 0)
    hint = re.compile(r"(//|/\*|\*).*(버그|bug|BUG|TODO|FIXME|함정|일부러|잘못된|문제가 있)", re.I)
    v["버그 힌트 주석 없음"] = not any(hint.search(f["content"]) for f in task["files"] if f["path"].startswith("src/"))
    c1, p1, f1, s1, o1 = run_tests(task["files"], f"pair-poc-gen{i}a")
    v["시작 코드 컴파일"] = c1
    v["공개 테스트 통과(시작 코드)"] = c1 and f1 == 0 and p1 > 0
    c2, p2, f2, s2, o2 = run_tests(task["files"] + task["hiddenTests"], f"pair-poc-gen{i}b")
    v["숨은 테스트가 버그를 잡음"] = c2 and f2 > 0
    sol = {f["path"]: f for f in task["files"]}
    for f in task["solution"]: sol[f["path"]] = f
    c3, p3, f3, s3, o3 = run_tests(list(sol.values()) + task["hiddenTests"], f"pair-poc-gen{i}c")
    v["정답 코드는 전부 통과"] = c3 and f3 == 0 and p3 > 0
    v["30초 이내"] = max(s1, s2, s3) < 30
    detail = {"시작": [p1, f1], "시작+숨은": [p2, f2], "정답+숨은": [p3, f3], "초": [s1, s2, s3],
              "출력": {"시작+숨은": o2 if not v["숨은 테스트가 버그를 잡음"] else "", "정답+숨은": o3 if not v["정답 코드는 전부 통과"] else ""}}
    return v, detail


def one(i):
    form = FORMS[i % len(FORMS)]
    d = os.path.join(OUT, f"{i + 1:02d}")
    os.makedirs(d, exist_ok=True)
    try:
        task, usage, sec = generate(form)
    except Exception as e:
        return i, form, None, {"오류": str(e)[:300]}, None, 0
    json.dump(task, open(os.path.join(d, "task.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    v, detail = validate(i, task)
    json.dump({"form": form, "checks": v, "detail": detail, "usage": usage, "seconds": round(sec)},
              open(os.path.join(d, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return i, form, v, detail, usage, sec


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print(f"[설정] {N}개, 모델 {MODEL}", flush=True)
    passed, tin, tout = 0, 0, 0
    with ThreadPoolExecutor(3) as ex:
        for i, form, v, detail, usage, sec in ex.map(one, range(N)):
            if v is None:
                print(f"[{i + 1:02d}] {form[2]}: 생성 실패 {detail}", flush=True); continue
            ok = all(v.values()); passed += ok
            tin += usage["prompt_tokens"]; tout += usage["completion_tokens"]
            fails = [k for k, x in v.items() if not x]
            print(f"[{i + 1:02d}] {form[2]} ({form[1]}): {'통과' if ok else '실패 ' + ', '.join(fails)} / 테스트 {detail['시작+숨은']}→{detail['정답+숨은']} / 생성 {round(sec)}초", flush=True)
    print(f"[결과] {passed}/{N} 통과, 토큰 입력 {tin} 출력 {tout}", flush=True)
