"""csv/ 의 테이블별 CSV 28개를 엑셀 파일 하나(테이블마다 탭)로 합친다. 기존 CSV 는 그대로 둔다.

실행: python docs/erd/sample/make_xlsx.py   → pair_sample.xlsx
"""
import csv
import os
import re

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "csv")
OUT = os.path.join(BASE, "pair_sample.xlsx")
SCHEMA = os.path.join(BASE, "..", "pair_schema.sql")

# load.sh 와 같은 외래 키 순서 (부모 테이블이 먼저)
ORDER = """users tasks task_files document_pages document_chunks task_questions question_choices short_answer_keys
question_sources rubric_items rubric_checks prompt_versions prompt_check_hints attempts attempt_files chat_turns
chat_attachments attempt_events question_answers answer_choices checkpoints checkpoint_files scorings judge_calls
check_results judge_verdicts verdict_evidences question_results""".split()

CELL_MAX = 32767  # 엑셀 셀 하나에 들어가는 최대 글자 수
FONT = "Arial"
HEAD_FILL = PatternFill("solid", fgColor="DDE4EE")
INT = re.compile(r"-?\d{1,15}")

schema = open(SCHEMA, encoding="utf-8").read()
korean = dict(re.findall(r"COMMENT ON TABLE\s+(\w+) IS '([^']*)'", schema))
col_korean = {(t, c): k for t, c, k in re.findall(r"COMMENT ON COLUMN\s+(\w+)\.(\w+) IS '([^']*)'", schema)}

wb = Workbook()
toc = wb.active
toc.title = "목차"
toc.append(["탭", "테이블", "설명", "행 수", "비고"])
cut_total = 0


def tab_name(table):
    """탭 이름 = 테이블 한글명에서 괄호 설명을 뺀 것. 엑셀 탭은 31자 이내, []:*?/\\ 금지."""
    tab = re.sub(r"\(.*\)$", "", korean[table]).strip()
    if len(tab) > 31 or re.search(r"[\[\]:*?/\\]", tab):
        raise SystemExit(f"{table}: 탭 이름으로 못 씀 '{tab}'")
    return tab


for name in ORDER:
    with open(os.path.join(SRC, name + ".csv"), encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh))
    head, body = rows[0], rows[1:]
    tab = tab_name(name)
    ws = wb.create_sheet(tab)
    # 머리줄은 한글 컬럼명(스키마 COMMENT), 영문 컬럼명은 메모로 남긴다
    missing = [h for h in head if (name, h) not in col_korean]
    if missing:
        raise SystemExit(f"{name}: 한글 컬럼명 없음 {missing}")
    ws.append([col_korean[(name, h)] for h in head])
    for c, h in zip(ws[1], head):
        c.comment = Comment(h, "pAIr")
    cut = 0
    for r in body:
        out = []
        for v in r:
            if v == "":
                out.append(None)  # 빈 값 = NULL
            elif INT.fullmatch(v):
                out.append(int(v))
            else:
                if len(v) > CELL_MAX:
                    v = v[:CELL_MAX - 20] + " …(엑셀 한도로 잘림)"
                    cut += 1
                out.append(v)
        ws.append(out)
    cut_total += cut

    for c in ws[1]:
        c.font = Font(name=FONT, bold=True)
        c.fill = HEAD_FILL
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = Font(name=FONT)
            c.alignment = Alignment(vertical="top")
    for i, h in enumerate(head, 1):
        longest = max([len(col_korean[(name, h)]) * 2] + [len(str(r[i - 1]).split("\n")[0]) for r in body[:200]])
        ws.column_dimensions[get_column_letter(i)].width = min(max(longest + 2, 8), 60)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    toc.append([tab, name, korean[name], len(body), f"긴 값 {cut}개 잘림" if cut else None])
    link = toc.cell(row=toc.max_row, column=1)
    link.hyperlink = f"#'{tab}'!A1"
    link.font = Font(name=FONT, color="0563C1", underline="single")

for c in toc[1]:
    c.font = Font(name=FONT, bold=True)
    c.fill = HEAD_FILL
for row in toc.iter_rows(min_row=2):
    for c in row[1:]:
        c.font = Font(name=FONT)
toc.column_dimensions["A"].width = 20
toc.column_dimensions["B"].width = 22
toc.column_dimensions["C"].width = 55
toc.column_dimensions["D"].width = 8
toc.column_dimensions["E"].width = 18
toc.append([])
toc.append(["안내"])
toc.append(["컬럼 이름은 한글로 표시했고, 머리줄 칸에 마우스를 올리면 영문 컬럼명이 보인다."])
toc.append(["빈 칸은 NULL. 원본은 csv/ 폴더의 테이블별 CSV이고, 이 파일은 보기 편하게 합친 사본이다."])
toc.freeze_panes = "A2"

wb.save(OUT)
print(f"탭 {len(ORDER) + 1}개(목차 + 테이블 {len(ORDER)}개), 잘린 값 {cut_total}개 → {OUT}")
