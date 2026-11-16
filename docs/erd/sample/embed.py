"""document_pages 를 조각으로 나눠 OpenAI 임베딩(1536차원)을 붙인 document_chunks.csv 를 만든다.
API 키는 환경 변수 OPENAI_API_KEY 에서 읽고, 화면이나 파일에 남기지 않는다.

실행: python docs/erd/sample/embed.py            → csv/document_chunks.csv
      python docs/erd/sample/embed.py "질문"     → 질문 임베딩을 vector 리터럴로 출력(검색 테스트용)
"""
import csv
import json
import os
import sys
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "csv")
MODEL = "text-embedding-3-small"  # 1536차원


def embed(texts):
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=json.dumps({"model": MODEL, "input": texts}).encode(),
        headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"], "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    return [d["embedding"] for d in body["data"]], body["usage"]["total_tokens"]


def vec(v):
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"


if len(sys.argv) > 1:
    (v,), _ = embed([sys.argv[1]])
    print(vec(v))
    sys.exit()

pages = json.load(open(os.path.join(OUT, "_pages.json"), encoding="utf-8"))
chunks = []  # (task_file_id, page_no, chunk_no, content)
for key, text in pages.items():
    f, p = map(int, key.split(":"))
    if text.lstrip().startswith("월,"):
        # CSV: 머리줄 + 월 3개(9줄)씩 묶어 조각으로 (각 조각에 머리줄을 붙여 뜻이 통하게)
        lines = text.splitlines()
        head, body = lines[0], lines[1:]
        parts = ["\n".join([head] + body[i:i + 9]) for i in range(0, len(body), 9)]
    else:
        # 문서: 빈 줄로 나눈 문단, 너무 짧은 문단은 다음 문단과 합침
        paras = [x.strip() for x in text.split("\n\n") if x.strip()]
        parts, buf = [], ""
        for para in paras:
            buf = (buf + "\n\n" + para).strip()
            if len(buf) >= 120:
                parts.append(buf)
                buf = ""
        if buf:
            parts.append(buf)
    for n, part in enumerate(parts, 1):
        chunks.append((f, p, n, part))

vectors, tokens = embed([c[3] for c in chunks])
with open(os.path.join(OUT, "document_chunks.csv"), "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["chunk_id", "task_file_id", "page_no", "chunk_no", "content", "token_count", "embedding"])
    for i, (c, v) in enumerate(zip(chunks, vectors), 1):
        w.writerow([i, c[0], c[1], c[2], c[3], max(1, round(len(c[3]) / 1.5)), vec(v)])
print(f"조각 {len(chunks)}개, 임베딩 토큰 {tokens}, 차원 {len(vectors[0])}")
