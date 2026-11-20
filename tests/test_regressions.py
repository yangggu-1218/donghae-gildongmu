"""배포 전 버그 검사에서 고친 것들이 다시 생기지 않는지 (2026-11-21).
돌리는 법: py tests/test_regressions.py   → 마지막 줄 "회귀 점검 실패 0건\""""
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ.update({"CMS_FILE": str(tmp / "cms.json"), "REPORTS_DIR": str(tmp / "reports"), "AI_USAGE_FILE": "0", "AI_COURSE": "0",
                   "ADMIN_ID": "owner", "ADMIN_PASSWORD": "test-owner-pw-1"})   # 점검용 임시 값
for k in ("KAKAO_REST_API_KEY", "ODSAY_API_KEY", "ANTHROPIC_API_KEY"):
    os.environ.pop(k, None)
os.environ.setdefault("PYTHONUTF8", "1")
sys.path[:0] = [str(Path(__file__).resolve().parents[1] / "backend")]

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app, PLACES  # noqa: E402
from app import ai, ai_judge, engine  # noqa: E402
from app.schemas import Conditions  # noqa: E402

ai.set_client(None)
c = TestClient(app)
fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


H = {"x-admin-token": c.post("/api/admin/login", json={"id": "owner", "password": "test-owner-pw-1"}).json()["token"]}

# 1) 관리자 장소 정보에서 구간을 저장해도 등급·선택 구간·측정값이 지워지지 않는다
p = c.get("/api/places/chotdae").json()
raw = p["segments_raw"]
check("상세 응답에 원본 구간", any(s.get("optional") for s in raw) and all("grade" in s for s in raw), str(raw)[:200])
before = engine.grade_place(PLACES["chotdae"], "wheel")
raw[0]["note"] = (raw[0].get("note") or "") + " (점검)"
r = c.post("/api/admin/places/chotdae", json={"fields": {}, "segments": raw, "reason": "점검: 메모 한 줄"}, headers=H)
check("구간 저장 성공", r.status_code == 200, r.text[:200])
check("저장 뒤에도 선택 구간·등급 유지 (휠체어 판정 그대로)", engine.grade_place(PLACES["chotdae"], "wheel") == before == "G",
      f"{before} → {engine.grade_place(PLACES['chotdae'], 'wheel')}")
cave = c.get("/api/places/cave").json()["segments_raw"]
c.post("/api/admin/places/cave", json={"fields": {}, "segments": cave, "reason": "점검"}, headers=H)
check("동굴 저장 뒤에도 어르신 '불가' 유지", engine.grade_place(PLACES["cave"], "walk") == "R")
seg = [{"name": "경사로", "slope_deg": 6.5, "rise_m": 0.12, "source": "현장 답사", "alt_route": "엘리베이터"}]
c.post("/api/admin/places/haerang", json={"fields": {}, "segments": seg, "reason": "점검: 11/21 측정 경사 6.5° 높이 12cm"}, headers=H)
s0 = PLACES["haerang"].segments[0]
check("높이(rise_m)·대체 경로(글자) 저장", s0.rise_m == 0.12 and s0.alt_route == "엘리베이터" and engine.assess(s0, "wheel")[0] == 3, str(s0))

# 2) 출처가 '관람 불가'면 상세 판정도 어려움 (구간이 없어도)
j = ai_judge.judge(PLACES["gobulgae"], "wheel", "ko", [])
check("구간 없는 '관람 불가' 장소도 규칙 판정 R", j["verdict"] == "R", str(j)[:200])

# 3) 쓸 수 있는 시간 때문에 식당을 못 넣으면 그렇게 말한다
r = engine.preview_stops(PLACES, Conditions(date="2026-11-22", start_time="10:00", budget_min=120), False)
check("시간 때문이면 '문 연 식당 없음'이라고 하지 않음", not any("문을 연 식당을 찾지 못했어요" in n for n in r.notes), str(r.notes))

# 4) 관리자용 검증 기록은 공개 응답에 없다
check("공개 장소 응답에 verify 없음", "verify" not in c.get("/api/places/cave").json() and all("verify" not in x for x in c.get("/api/places").json()))

# 5) 제보 묶음 [떼어 내기]: 묶음 이름이 된 첫 제보도 실제로 떨어지고, 화면이 옛 묶음 번호를 보내도 된다 (2026-11-21)
cl = c.get("/api/admin/city?sample=1", headers=H).json()["clusters"]
big = next((x for x in cl if x["count"] >= 3), None)
if big:
    anchor, other = big["id"], [r["id"] for r in big["reports"] if r["id"] != big["id"]][0]
    r1 = c.post(f"/api/admin/city/{anchor}/merge", json={"split": anchor}, headers=H)
    r2 = c.post(f"/api/admin/city/{anchor}/merge", json={"split": other}, headers=H)   # 옛 묶음 번호
    after = {y["id"]: [r["id"] for r in y["reports"]] for y in c.get("/api/admin/city?sample=1", headers=H).json()["clusters"]}
    check("첫 제보 떼어 내기", r1.status_code == 200 and after.get(f"solo-{anchor}") == [anchor], str(after)[:200])
    check("옛 묶음 번호로도 떼어 내기", r2.status_code == 200 and after.get(f"solo-{other}") == [other], r2.text[:120])

# 6) 일정 카드 끌어서 순서 바꾸기: 정한 순서 그대로, 장소는 그대로, 시각은 다시 계산 (2026-11-21)
base = {"who": "어르신", "move": ["휠체어"], "style": [], "days": "당일", "start": "동해역", "memo": "", "wish": [], "lang": "ko",
        "date": "2026-11-24", "start_time": "10:00", "must": ["dokkaebi", "chotdae"], "lunch": "food_daege", "cap": 4, "rest": True}
order = ["dokkaebi", "cafe_clam", "food_daege", "chotdae"]
r = c.post("/api/reorder", json={"conditions": base, "order": order}).json()
st = r["course"]["stops"]
check("순서 바꾸기: 정한 순서 그대로", [x["id"] for x in st] == order, str([x["id"] for x in st]))
check("순서 바꾸기: 시각이 앞에서부터 이어짐", all(st[i]["depart"] <= st[i + 1]["arrive"] for i in range(len(st) - 1)), str([(x["arrive"], x["depart"]) for x in st]))
check("순서 바꾸기: 조건에 순서가 남음(저장·공유용)", r["conditions"]["order"] == order and r["action"] == "reorder")
check("순서 바꾸기: 빈 순서는 400", c.post("/api/reorder", json={"conditions": base, "order": []}).status_code == 400)
late = c.post("/api/reorder", json={"conditions": {**base, "start_time": "16:30"}, "order": order}).json()["course"]["stops"]
check("순서 바꾸기: 운영 시간이 아니어도 빼지 않고 '운영 안 함'으로", len(late) == 4 and any(x["open_state"] == "closed" for x in late), str([x["open_state"] for x in late]))

# 7) AI 동선 최적화: 장소는 그대로, 운영시간 위반을 줄이고 이동을 줄이며, 고정한 장소는 제자리 (2026-11-21)
bad = ["chotdae", "dokkaebi", "cafe_clam", "food_daege"]
o = c.post("/api/optimize", json={"conditions": base, "order": bad, "locked": []}).json()
check("최적화: 장소 구성은 그대로", sorted(o["order_after"]) == sorted(bad) and o["order_before"] == bad)
check("최적화: 바꾸면 이동·위반이 줄어듦", (not o["changed"]) or (len(o["after"]["closed"]) < len(o["before"]["closed"])
      or o["after"]["move_min"] + o["after"]["wait_min"] < o["before"]["move_min"] + o["before"]["wait_min"]), str((o["before"], o["after"])))
check("최적화: 추정이면 거리 수치를 만들지 않음", o["after"]["source"] != "estimate" or (o["after"]["distance_m"] is None and o["before"]["distance_m"] is None))
check("최적화: 운영시간 모르는 곳은 '확인 필요'로 따로", "food_daege" in o["unknown"] and "food_daege" not in o["free"], str(o["unknown"]))
check("최적화: 결과는 바로 적용되지 않고 돌려주기만", o["result"]["action"] == "reorder" and [x["id"] for x in o["result"]["course"]["stops"]] == o["order_after"])
ol = c.post("/api/optimize", json={"conditions": base, "order": bad, "locked": ["chotdae"]}).json()
check("최적화: 고정한 장소는 제자리", ol["order_after"][0] == "chotdae", str(ol["order_after"]))
check("최적화: 한 곳이면 400", c.post("/api/optimize", json={"conditions": base, "order": ["chotdae"]}).status_code == 400)

print(f"회귀 점검 실패 {len(fails)}건")
sys.exit(1 if fails else 0)
