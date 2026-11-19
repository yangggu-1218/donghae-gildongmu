"""AI·추천 품질 검사: tests/ai_cases.json 의 조건 10세트 + 대화 10세트를 돌려 규칙 위반을 찾는다.
사용: python scripts/eval_ai.py   (AI 키가 있으면 AI로, 없으면 규칙 기반으로 검사)
본선 전 코드를 바꿀 때마다 돌려서 '불가 장소가 코스에 들어가는' 사고를 막는다."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv; load_dotenv(ROOT / ".env")
from fastapi.testclient import TestClient   # noqa: E402
from app.main import app, PLACES            # noqa: E402
from app import llm                         # noqa: E402

cases = json.loads((ROOT / "tests/ai_cases.json").read_text(encoding="utf-8"))
c = TestClient(app)
fail = 0
for k in cases["courses"]:
    r = c.post("/api/course", json=k["cond"]).json()["course"]
    ids = [s["id"] for s in r["stops"]]
    e, bad = k["expect"], []
    if e.get("no_R") and any(s["grade"] == "R" for s in r["stops"]): bad.append("불가 장소 포함")
    if e.get("max_stops") and len(ids) > e["max_stops"]: bad.append(f"장소 {len(ids)}곳 > {e['max_stops']}")
    if e.get("has_lunch") and not any(PLACES[i].type == "식당" for i in ids): bad.append("점심 없음")
    if e.get("overall_none") and r["overall"] is not None: bad.append("조건 없음인데 판정 표시")
    if e.get("first_indoor") and ids and not PLACES[ids[0]].indoor: bad.append("비 오는데 첫 장소가 실외")
    if e.get("excluded") and e["excluded"] in ids: bad.append(f"{e['excluded']}가 들어감")
    fail += bool(bad)
    print(("FAIL " if bad else "ok   ") + k["id"], ids, "; ".join(bad))

cand = {pid: p.name_ko for pid, p in PLACES.items()}
for k in cases["chats"]:
    out = llm.chat_edit(k["msg"], ["dokkaebi", "lunch_sample"], cand)
    ok = out.get("action") == k["expect"] and (not k.get("place") or out.get("place_id") == k["place"])
    fail += not ok
    print(("ok   " if ok else "FAIL ") + k["id"], k["msg"], "→", out.get("action"), out.get("place_id") or "")
print(f"\n실패 {fail}건")
sys.exit(1 if fail else 0)
