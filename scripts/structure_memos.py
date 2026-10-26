"""AI 작업 ①: TourAPI 무장애 서술형 메모를 항목별로 정리해 '사람 검수용' CSV로 만든다.
사용: python scripts/structure_memos.py
결과: data/review_memos.csv  →  엑셀/구글시트로 열어 approve 칸에 Y/N 을 적는다. Y 인 줄만 build_places.py 가 쓴다."""
import csv, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv; load_dotenv(ROOT / ".env")
from app import llm   # noqa: E402

detail = json.loads((ROOT / "data/raw/tour_with_detail.json").read_text(encoding="utf-8"))
rows = []
for cid, d in detail.items():
    memo = " / ".join(f"{k}: {v}" for k, v in d.get("with", {}).items() if v and k not in ("contentid",))
    if not memo:
        continue
    out = llm.structure_memo(d["title"], memo)
    for it in out["items"]:
        rows.append({"contentid": cid, "place": d["title"], "attr": it.get("attr"), "value": it.get("value"),
                     "grade": it.get("grade") or "", "evidence": it.get("evidence", ""), "approve": ""})
    print(d["title"], len(out["items"]), "항목")

with (ROOT / "data/review_memos.csv").open("w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["contentid", "place", "attr", "value", "grade", "evidence", "approve"])
    w.writeheader(); w.writerows(rows)
print(f"{len(rows)}줄 → data/review_memos.csv (approve 칸을 채워 주세요)")
