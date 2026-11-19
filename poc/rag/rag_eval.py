"""RAG 기술검증 A, C, D: PDF 추출 비교, 임베딩 모델 비교, 조각 방식 비교.

입력: pages.json (extract/ 로 만든 쪽별 추출 결과), questions.json (질문 20개와 정답 문구)
정답 판정: 검색된 조각이 정답 문구가 있는 위치와 겹치면 적중 (공백 무시).
임베딩은 emb_cache.json 에 저장해 다시 돌릴 때 돈이 들지 않게 한다. API 키는 OPENAI_API_KEY 에서만 읽는다.

실행: python rag_eval.py
"""
import json, math, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = json.load(open(os.path.join(HERE, "pages.json"), encoding="utf-8"))
QS = json.load(open(os.path.join(HERE, "questions.json"), encoding="utf-8"))
CACHE_PATH = os.path.join(HERE, "emb_cache.json")
CACHE = json.load(open(CACHE_PATH, encoding="utf-8")) if os.path.exists(CACHE_PATH) else {}
TOKENS = {}


def embed(texts, model, dims=None):
    key = lambda t: f"{model}|{dims}|{t}"
    todo = [t for t in dict.fromkeys(texts) if key(t) not in CACHE]
    for i in range(0, len(todo), 64):
        body = {"model": model, "input": todo[i:i + 64]}
        if dims: body["dimensions"] = dims
        req = urllib.request.Request("https://api.openai.com/v1/embeddings", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"], "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.load(r)
        for t, d in zip(todo[i:i + 64], res["data"]):
            CACHE[key(t)] = d["embedding"]
        TOKENS[model] = TOKENS.get(model, 0) + res["usage"]["total_tokens"]
    json.dump(CACHE, open(CACHE_PATH, "w", encoding="utf-8"))
    return [CACHE[key(t)] for t in texts]


def pattern(phrase):  # 공백을 무시하고 찾는 정규식
    return re.compile(r"\s*".join(re.escape(c) for c in phrase if not c.isspace()))


# ── C. 추출 비교 ─────────────────────
def check_extract():
    print("\n[C] PDF 추출 비교")
    broken = pattern("기존 스탠다드 가입자 가운데 14%가 라이트로 옮겨 가는 하향 이동")
    for field in ("pdfbox", "pdfbox_raw", "tika"):
        found = sum(any(any(pattern(k).search(p[field]) for k in q["keys"]) for p in PAGES) for q in QS)
        two_col = any(broken.search(p[field]) for p in PAGES)
        chars = sum(len(re.sub(r"\s", "", p[field])) for p in PAGES)
        print(f"  {field:11s} 정답 문구 {found}/{len(QS)} 찾음, 2단 문장 이어짐 {'O' if two_col else 'X'}, 글자 {chars}자")


# ── 조각 나누기 ─────────────────────
def chunks(field, how):
    out = []  # (doc, page, text)
    for p in PAGES:
        text = re.sub(r"[ \t]*\n[ \t]*", " ", p[field]).strip()
        text = re.sub(r"\s+", " ", text)
        if how == "page":
            out.append((p["doc"], p["page"], text))
        else:
            size, overlap = how
            step = size - overlap
            for s in range(0, max(1, len(text) - overlap), step):
                out.append((p["doc"], p["page"], text[s:s + size]))
    return out


def hit(chunk_text, q):
    return any(pattern(k).search(chunk_text) for k in q["keys"])


def cos(a, b):
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def evaluate(field, how, model, dims=None):
    cs = chunks(field, how)
    # 문구가 조각 경계에 걸려 어느 조각에도 통째로 없으면, 그 질문은 이 방식에서 찾을 수 없는 것으로 센다
    vecs = embed([c[2] for c in cs], model, dims)
    qv = embed([q["q"] for q in QS], model, dims)
    top1 = top3 = 0; rr = 0.0; t = time.time()
    for q, v in zip(QS, qv):
        ranked = sorted(range(len(cs)), key=lambda i: -cos(v, vecs[i]))
        ranks = [r for r, i in enumerate(ranked[:10]) if hit(cs[i][2], q)]
        if ranks:
            top1 += ranks[0] == 0; top3 += ranks[0] < 3; rr += 1 / (ranks[0] + 1)
    avg_len = sum(len(c[2]) for c in cs) / len(cs)
    return dict(chunks=len(cs), avg_len=round(avg_len), top1=top1, top3=top3, mrr=round(rr / len(QS), 2))


def main():
    check_extract()
    print("\n[A] 임베딩 모델 (조각: 고정 400자, 겹침 80자, 추출: pdfbox_raw)")
    for model, dims in (("text-embedding-3-small", None), ("text-embedding-3-large", None), ("text-embedding-3-large", 1536)):
        r = evaluate("pdfbox_raw", (400, 80), model, dims)
        print(f"  {model}{'/' + str(dims) if dims else ''}: 상위1 {r['top1']}/20, 상위3 {r['top3']}/20, MRR {r['mrr']}")
    print("\n[D] 조각 방식 (모델: text-embedding-3-small)")
    for how in ("page", (800, 150), (400, 80), (200, 40)):
        r = evaluate("pdfbox_raw", how, "text-embedding-3-small")
        name = "쪽 단위" if how == "page" else f"고정 {how[0]}자/겹침 {how[1]}자"
        print(f"  {name}: 조각 {r['chunks']}개(평균 {r['avg_len']}자), 상위1 {r['top1']}/20, 상위3 {r['top3']}/20, MRR {r['mrr']}")
    print("\n[토큰] " + ", ".join(f"{k} {v}" for k, v in TOKENS.items()) if TOKENS else "\n[토큰] 캐시만 사용")


if __name__ == "__main__":
    main()
