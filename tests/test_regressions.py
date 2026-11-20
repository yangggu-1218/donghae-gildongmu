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

# 8) 지형 참고 안내 (DEM 90m): 장소 지형, 걷는 구간 오르막. 판정에는 쓰지 않음 (2026-11-21)
from app import terrain, public_apis
lh, port, beach = PLACES["mukho_lighthouse"], PLACES["mukho_port"] if "mukho_port" in PLACES else None, PLACES["mangsang"]
check("지형: 묵호등대는 언덕 위", lh.terrain.get("kind") == "hill" and lh.terrain.get("rise_m", 0) >= 25, str(lh.terrain))
check("지형: 망상해변은 평지", beach.terrain.get("kind") == "flat", str(beach.terrain))
check("지형: 좌표 있는 장소는 모두 값이 있음", all(x.terrain for x in PLACES.values() if x.lat is not None))
cl = terrain.climb((37.5490, 129.1170), (lh.lat, lh.lon))
check("지형: 묵호항 → 등대 걷는 길 오르막", cl and cl["up_m"] >= 25, str(cl))
check("지형: 격자 밖은 None", terrain.elev(35.0, 127.0) is None and terrain.climb((35.0, 127.0), (35.01, 127.01)) is None)
check("지형: 접근성 판정은 지형과 무관", engine.grade_place(lh, "wheel") == engine.grade_place(lh.model_copy(update={"terrain": {}}), "wheel"))
_av, _tl = public_apis.odsay_available, public_apis.transit_leg
try:   # ODsay 없이 대중교통 구간을 흉내 내 '내린 정류장 → 장소' 오르막이 붙는지
    public_apis.odsay_available = lambda: True
    public_apis.transit_leg = lambda a, b, sp: {"mode": "transit", "min": 20, "ride_min": 12, "walk_m": 400, "walk_min": 8, "transfers": 0, "lines": ["버스 1"], "payment": 1500, "alight": [37.5490, 129.1170]}
    rr = engine.schedule_order(PLACES, Conditions(start="동해역", date="2026-11-24", start_time="10:00", order=["mukho_lighthouse"]), ["mukho_lighthouse"])
    lg = (rr.transit_legs or [{}])[0]
    check("지형: 대중교통 걷는 구간에 오르막 붙음", rr.drive_source == "transit" and (lg.get("climb") or {}).get("up_m", 0) >= 25, str(lg.get("climb")))
finally:
    public_apis.odsay_available, public_apis.transit_leg = _av, _tl

# 9) 전수 QA(2026-11-21)에서 고친 것
r = c.post("/api/photo-check", files={"photo": ("a.jpg", b"not an image", "image/jpeg")})
check("QA: 깨진 사진은 서버 오류 대신 400 안내", r.status_code == 400 and "사진" in r.json().get("detail", ""), r.text[:120])
check("QA: 부서 설정 잘못된 형식도 서버 오류 없음", c.post("/api/admin/city-settings", json={"depts": "x"}, headers=H).status_code == 200)
check("QA: 자동 갱신 규칙 잘못된 형식은 400", c.post("/api/admin/sync/rules", json={"rules": "x"}, headers=H).status_code == 400)
base_w = {"who": "혼자", "move": ["휠체어"], "style": ["바다 보기"], "days": "당일", "start": "동해역", "memo": "", "wish": [], "lang": "ko",
          "date": "2026-11-24", "start_time": "10:00", "flat_only": True}
cr = c.post("/api/course", json=base_w).json()
ed = c.post("/api/edit", json={"conditions": cr["conditions"], "course_ids": [s["id"] for s in cr["course"]["stops"]], "action": "indoor", "target": None}).json()
outdoor = [s["id"] for s in ed["course"]["stops"] if s["kind"] == "sight" and not PLACES[s["id"]].indoor]
check("QA: '실내로'인데 바깥 장소가 남으면 그렇게 말함", (not outdoor) or ed["reply"].startswith("이동 조건에 맞는 실내 관광지가 적어"), ed["reply"][:80])
check("QA: 없는 장소 주소는 404", c.get("/api/places/no-such-place").status_code == 404)

# 10) 전문가 검토(보안·이동약자 정보) 반영 (2026-11-21)
os.environ["DEMO_LOGIN"] = "1"
li = c.get("/api/admin/login-info").json()
check("보안: 로그인 안내에 비밀번호·아이디 없음", li.get("demo") is True and "password" not in li and "id" not in li, str(li)[:80])
dl = c.post("/api/admin/demo-login", json={})
dtok = dl.json().get("token", "")
check("보안: 임시 로그인은 시연 계정(권한 줄임)", dl.status_code == 200 and dl.json()["user"]["role"] == "demo" and "accounts" not in dl.json()["user"]["perms"])
check("보안: 시연 계정은 계정 관리·백업 불가", c.get("/api/admin/accounts", headers={"x-admin-token": dtok}).status_code == 403
      and c.get("/api/admin/backup", headers={"x-admin-token": dtok}).status_code == 403)
check("보안: 시연 계정은 제보자 연락처 불가", c.get("/api/admin/city-contact/x", headers={"x-admin-token": dtok}).status_code == 403)
os.environ["DEMO_LOGIN"] = "0"
check("보안: DEMO_LOGIN 꺼지면 임시 로그인 막힘", c.post("/api/admin/demo-login", json={}).status_code == 403)
check("보안: 한글 아이디 로그인도 서버 오류 없음", c.post("/api/admin/login", json={"id": "관리자", "password": "비밀번호"}).status_code == 401)
from app import sitelock
class _R:
    def __init__(self, xff): self.headers = {"x-forwarded-for": xff}; self.client = None
check("보안: 접속 주소는 프록시가 붙인 맨 오른쪽 값", sitelock._ip(_R("1.1.1.1, 9.9.9.9")) == "9.9.9.9")
c.post("/api/reports", data={"category": "step", "lat": "37.55", "lon": "129.11", "note": "=HYPERLINK(\"http://x\",\"y\")"})
csv_txt = c.get("/api/admin/city-export.csv?t=" + H["x-admin-token"]).text
check("보안: CSV 수식 주입 막음", "접수번호" in csv_txt[:60] and "'=HYPERLINK" in csv_txt and ",=HYPERLINK" not in csv_txt, csv_txt[:120])
check("정보: 확인 전(예시) 자료로는 휠체어 '가능' 등급 없음", engine.grade_place(PLACES["dokkaebi"], "wheel") != "G")
check("정보: 확인 전 자료는 휠체어 '확인 전'으로 보임", PLACES["dokkaebi"].wheelchair == "확인 전" and PLACES["mureung"].wheelchair == "확인 전")
check("정보: 다른 곳의 화장실은 '인근'으로", all("장애인 화장실" != f or True for f in PLACES["nongol"].facilities) and
      not ("장애인 화장실" in PLACES["nongol"].facilities and "장애인 화장실(인근)" in PLACES["nongol"].facilities))

print(f"회귀 점검 실패 {len(fails)}건")
sys.exit(1 if fails else 0)
