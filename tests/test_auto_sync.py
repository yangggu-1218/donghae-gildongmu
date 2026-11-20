"""자동 정보 갱신 0~1단계 점검 (docs/20_AUTO_SYNC.md) — 가짜 소스(data/sync/fixtures)로, 돈·네트워크 없음, 임시 폴더에 저장.
돌리는 법: py tests/test_auto_sync.py   → 마지막 줄 "자동 갱신 점검 실패 0건"
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
tmp = Path(tempfile.mkdtemp())
conf = tmp / "conf"
shutil.copytree(ROOT / "data" / "sync" / "fixtures", conf)
os.environ.update({"CMS_FILE": str(tmp / "cms.json"), "REPORTS_DIR": str(tmp / "reports"), "SYNC_CONF": str(conf), "AI_USAGE_FILE": "0",
                   "ADMIN_ID": "owner", "ADMIN_PASSWORD": "test-owner-pw-1", "SYNC_TOKEN": "test-sync-token-1"})   # 점검용 임시 값
os.environ.setdefault("PYTHONUTF8", "1")
sys.path[:0] = [str(ROOT / "backend"), str(Path(__file__).resolve().parent)]

from fastapi.testclient import TestClient  # noqa: E402
from fake_claude import FakeClaude  # noqa: E402
from app.main import app, PLACES  # noqa: E402
from app import ai, cms, sync  # noqa: E402

c = TestClient(app)
fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


tok = c.post("/api/admin/login", json={"id": "owner", "password": "test-owner-pw-1"}).json()["token"]
H = {"x-admin-token": tok}
T = {"x-sync-token": "test-sync-token-1"}
fake = FakeClaude(); ai.set_client(fake)   # 0~1단계는 AI를 부르지 않아야 한다
orig = {k: PLACES[k].phone for k in ("cave", "pencil_museum")}
orig_coord = {k: (PLACES[k].lat, PLACES[k].lon) for k in ("nongol", "haeamjeong")}

# 관리자가 무릉별유천지 운영시간을 직접 고침 → API 값과 다르면 '충돌'이어야 한다
r = c.post("/api/admin/places/mureung", json={"fields": {"open": "10:00", "close": "17:00"}, "segments": None, "reason": "현장 확인"}, headers=H)
check("(준비) 관리자가 운영시간 직접 고침", r.status_code == 200, r.text[:200])

# ---------- 실행 권한 ----------
check("토큰·로그인 없으면 실행 못 함", c.post("/api/admin/sync/run").status_code in (401, 403))
check("틀린 토큰은 거절", c.post("/api/admin/sync/run", headers={"x-sync-token": "wrong"}).status_code in (401, 403))
r = c.post("/api/admin/sync/run?scope=all", headers=T)
res = r.json()
check("전용 토큰으로 실행 (GitHub Actions 방식)", r.status_code == 200 and res["ran"] == 5 and res["errors"] == 0, r.text[:300])

rows = sync.changes()
by = lambda pid, f: [x for x in rows if x.get("place_id") == pid and x["field"] == f]  # noqa: E731
check("전화 바뀜 → 자동 반영", PLACES["cave"].phone == "033-539-3700" and by("cave", "phone")[0]["result"] == "auto", str(by("cave", "phone"))[:200])
h = next((x for x in cms.load()["history"] if x["id"] == by("cave", "phone")[0].get("history_id")), None)
check("자동 반영도 cms 이력에 '자동 갱신'으로 (출처·근거 포함)", bool(h) and h["who"].startswith("자동 갱신") and "fake-tour" in h["reason"] and "033-539-3700" in h["reason"], str(h)[:200])
check("같은 값이면 변경 건 없음", not by("cave", "address"))
check("같아도 '마지막 확인'은 남김", sync.last_checked("cave").get("address", {}).get("source", "").startswith("한국관광공사"))
nc = by("nongol", "coord")
check("좌표 약 30m → 자동", nc and nc[0]["result"] == "auto" and nc[0]["moved_m"] <= 50 and abs(PLACES["nongol"].lat - 37.55243) < 1e-6, str(nc)[:200])
hc = by("haeamjeong", "coord")
check("좌표 약 120m → 검수", hc and hc[0]["result"] == "review" and hc[0]["moved_m"] > 50 and PLACES["haeamjeong"].lat == orig_coord["haeamjeong"][0], str(hc)[:200])
mh = by("mureung", "hours")
check("관리자가 고친 운영시간 ≠ API → 충돌 검수", mh and mh[0]["kind"] == "conflict" and mh[0]["result"] == "review" and PLACES["mureung"].open == "10:00", str(mh)[:200])
ph = by("pencil_museum", "hours")
check("운영시간은 검수 (자동 아님)", ph and ph[0]["result"] == "review" and PLACES["pencil_museum"].close == "18:00")
acc = [x for x in by("haeamjeong", "access.wheelchair") if x["grade"] == 1]
check("공식 API라도 무장애 정보는 자동 금지 + 현장 확인 필요", acc and acc[0]["result"] == "review" and acc[0].get("site_check") and PLACES["haeamjeong"].wheelchair != "가능", str(acc)[:200])
blog = [x for x in rows if x["source_id"] == "fake-blog"]
check("블로그에서만 나온 내용 → 반영 없이 '다시 확인 요청'만", len(blog) == 2 and all(x["kind"] == "recheck" for x in blog) and PLACES["cave"].close == "18:00", str(blog)[:200])
mm = [x for x in by("pencil_museum", "phone") if x["kind"] == "mismatch"]
check("출처끼리 값이 다르면 불일치 검수 (두 값 나란히)", mm and len(mm[0]["options"]) == 2 and {o["value"] for o in mm[0]["options"]} == {"033-532-1011", "033-532-1012"}, str(mm)[:300])
check("불일치면 자동 반영한 것도 되돌림", PLACES["pencil_museum"].phone == orig["pencil_museum"], PLACES["pencil_museum"].phone)
ev = [e for e in cms.events() if e["name"].startswith("동해 무장애 해변 걷기 축제")]
check("새 행사 → 자동 반영 (행사 달력)", len(ev) == 1 and ev[0]["start"] == "2099-05-01")
check("지난 행사는 버림", not [e for e in cms.events() if e["name"].startswith("이미 끝난")])
check("AI 호출 0번 (0~1단계)", len(fake.calls) == 0)

# ---------- 원문이 같으면 다시 돌려도 아무 일 없음 ----------
n0 = len(sync.changes())
r = c.post("/api/admin/sync/run?scope=all", headers=T).json()
check("원문 변경 없음 → 새 변경 0건", len(sync.changes()) == n0 and r["unchanged"] == 5, str(r)[:200])

# ---------- 식당 폐업: 2번 연속 빠지면 '폐업 의심' ----------
src = json.loads((conf / "sources.json").read_text(encoding="utf-8"))
def use_licence(fn):
    for s in src["sources"]:
        if s["id"] == "fake-licence":
            s["file"] = fn
    (conf / "sources.json").write_text(json.dumps(src, ensure_ascii=False), encoding="utf-8")
use_licence("licence_2.json"); c.post("/api/admin/sync/run?source=fake-licence", headers=T)
check("한 번 빠지면 아직 아님", "가짜폐업식당" not in sync.suspect_eateries())
use_licence("licence_3.json"); c.post("/api/admin/sync/run?source=fake-licence", headers=T)
cl = [x for x in sync.changes() if x["field"] == "closure"]
check("두 번 연속 빠지면 '폐업 의심' 자동 표시 + 숨기기 검수", "가짜폐업식당" in sync.suspect_eateries() and cl and cl[-1]["result"] == "review", str(cl)[:200])

# ---------- 관리자 [자동 갱신] 화면 ----------
ov = c.get("/api/admin/sync", headers=H).json()
check("검수 대기 목록", len(ov["pending"]) >= 7 and all(p["result"] == "review" for p in ov["pending"]), str(len(ov["pending"])))
check("소스 상태(마지막 성공)", all(s.get("last_ok") for s in ov["sources"]))
check("관리자 아니면 못 봄", c.get("/api/admin/sync").status_code in (401, 403))
pend = {(p.get("place_id"), p["field"], p["kind"]): p for p in ov["pending"]}

r = c.post(f"/api/admin/sync/changes/{pend[('haeamjeong', 'coord', 'update')]['id']}", json={"action": "approve"}, headers=H)
check("좌표 검수 승인 → 반영", r.status_code == 200 and abs(PLACES["haeamjeong"].lat - 37.48010) < 1e-6, r.text[:200])
r = c.post(f"/api/admin/sync/changes/{pend[('pencil_museum', 'hours', 'update')]['id']}", json={"action": "approve", "value": "10:00~17:30"}, headers=H)
check("고쳐서 승인", r.status_code == 200 and PLACES["pencil_museum"].close == "17:30", r.text[:200])
mid = pend[("pencil_museum", "phone", "mismatch")]["id"]
check("불일치는 값을 골라야 승인", c.post(f"/api/admin/sync/changes/{mid}", json={"action": "approve"}, headers=H).status_code == 400)
r = c.post(f"/api/admin/sync/changes/{mid}", json={"action": "approve", "value": "033-532-1012"}, headers=H)
check("불일치에서 고른 값으로 반영", r.status_code == 200 and PLACES["pencil_museum"].phone == "033-532-1012")
r = c.post(f"/api/admin/sync/changes/{pend[('haeamjeong', 'access.wheelchair', 'access')]['id']}", json={"action": "reject", "memo": "현장 확인 전"}, headers=H)
check("거절", r.status_code == 200 and PLACES["haeamjeong"].wheelchair != "가능")
check("이미 처리한 건은 다시 못 함", c.post(f"/api/admin/sync/changes/{mid}", json={"action": "reject"}, headers=H).status_code == 400)
cid = next(p["id"] for p in ov["pending"] if p["field"] == "closure")
c.post(f"/api/admin/sync/changes/{cid}", json={"action": "approve"}, headers=H)
check("폐업 의심 숨기기 승인 → 식당 목록에서 숨김", "가짜폐업식당" in sync.hidden_eateries())
rc = next(p for p in ov["pending"] if p["kind"] == "recheck" and p["field"] == "hours")
c.post(f"/api/admin/sync/changes/{rc['id']}", json={"action": "approve"}, headers=H)
check("다시 확인 요청 '확인함'은 값을 바꾸지 않음", PLACES["cave"].close == "18:00")

auto_phone = by("cave", "phone")[0]["id"]
r = c.post(f"/api/admin/sync/changes/{auto_phone}/revert", headers=H)
check("자동 반영 되돌리기", r.status_code == 200 and PLACES["cave"].phone == orig["cave"], PLACES["cave"].phone)

# ---------- 자동 갱신 설정 ----------
r = c.post("/api/admin/sync/rules", json={"rules": {"contact": "review", "access": "auto"}}, headers=H).json()
check("설정: 항목별로 바꿈 (총괄 관리자)", r["contact"] == "review")
check("설정: 무장애 정보는 '자동'으로 못 바꿈", r["access"] == "review")
tour = json.loads((conf / "tour.json").read_text(encoding="utf-8"))
tour["items"][0]["value"] = "033-539-3800"
(conf / "tour.json").write_text(json.dumps(tour, ensure_ascii=False), encoding="utf-8")
c.post("/api/admin/sync/run?source=fake-tour", headers=T)
nc = [x for x in sync.changes() if x.get("place_id") == "cave" and x["field"] == "phone"][-1]
check("규칙을 검수로 바꾸면 전화도 검수로", nc["result"] == "review" and PLACES["cave"].phone == orig["cave"], str(nc)[:200])

ai.set_client(None)
print(f"자동 갱신 점검 실패 {len(fails)}건")
