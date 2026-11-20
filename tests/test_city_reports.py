"""시(市)를 위한 기능 점검 — 불편 제보 → AI 정리 → 묶기 → 담당자 처리 → 이용자 확인 (docs/19_CITY_REPORTS.md).
가짜 Claude 클라이언트로 돌려서 돈·네트워크가 들지 않는다. 임시 폴더에 저장한다.
돌리는 법: py tests/test_city_reports.py   → 마지막 줄 "제보 점검 실패 0건"
"""
import io
import json
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ["CMS_FILE"] = str(tmp / "cms.json")
os.environ["REPORTS_DIR"] = str(tmp / "reports")
os.environ["AI_USAGE_FILE"] = "0"
os.environ["ADMIN_ID"] = "owner"
os.environ["ADMIN_PASSWORD"] = "test-owner-pw-1"   # 점검용 임시 값
os.environ["REPORT_PER_HOUR"] = "1000"
os.environ["AI_RATE_PER_IP"] = "1000"   # 이 점검은 한 주소에서 AI를 여러 번 부른다
os.environ.setdefault("PYTHONUTF8", "1")
sys.path[:0] = [str(Path(__file__).resolve().parents[1] / "backend"), str(Path(__file__).resolve().parent)]

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from fake_claude import FakeClaude, json_msg  # noqa: E402
from app.main import app, PLACES  # noqa: E402
from app import ai, city, reports_store  # noqa: E402

c = TestClient(app)
fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


def jpeg(gps=False) -> bytes:
    img = Image.new("RGB", (64, 48), (120, 120, 120))
    buf = io.BytesIO()
    if gps:   # 사진 찍은 위치(EXIF GPS)가 들어 있는 사진
        ex = Image.Exif()
        ex[0x8825] = {1: "N", 2: (37.0, 33.0, 6.0), 3: "E", 4: (129.0, 6.0, 54.0)}
        img.save(buf, "JPEG", exif=ex)
    else:
        img.save(buf, "JPEG")
    return buf.getvalue()


tok = c.post("/api/admin/login", json={"id": "owner", "password": "test-owner-pw-1"}).json()["token"]
H = {"x-admin-token": tok}
AI_OK = {"category": "sidewalk", "severity": "block", "dept": "road", "priority": "high",
         "summary": "보도블록 파손, 12가3456 차량 옆 010-1234-5678", "obstacles": [{"type": "깨진 바닥", "detail": "블록 들뜸"}],
         "faces": True, "plates": False, "confidence": "medium"}

# ---------- 1. 이용자 제보 + AI 정리 ----------
f = FakeClaude(json_msg(AI_OK)); ai.set_client(f)
r = c.post("/api/reports", data={"category": "step", "who": "휠체어,유모차,가짜", "note": "인도 블록이 깨져서 못 지나가요", "lat": "37.5517", "lon": "129.1151",
                                 "loc_how": "map", "contact": "010-9999-0000", "consent": "1"},
           files=[("photos", ("a.jpg", jpeg(), "image/jpeg")), ("photos", ("b.jpg", jpeg(), "image/jpeg"))])
j = r.json()
check("제보 접수 + 접수번호", r.status_code == 200 and j["code"].startswith("DH-") and j["status"] == "접수", r.text[:200])
rec = reports_store.real()[-1]
check("AI가 분류를 바꿈(사진·글 근거)", rec["triage"]["by"] == "ai" and rec["category"] == "step" and city.cat_of(rec) == "sidewalk")
check("사진 2장 저장 + AI에 사진 블록 2개", len(rec["photos"]) == 2 and sum(b.get("type") == "image" for b in f.calls[0]["messages"][0]["content"]) == 2)
check("요약에서 차량 번호·전화번호 지움", "12가3456" not in rec["triage"]["summary"] and "010-1234" not in rec["triage"]["summary"], rec["triage"]["summary"])
check("얼굴 보임 표시", rec["triage"]["faces"] is True)
check("모르는 '누가' 값은 버림", rec["who"] == ["휠체어", "유모차"])
sent = json.dumps(f.calls[0]["messages"], ensure_ascii=False)
check("연락처는 AI에 안 보냄 · 따로 저장", "010-9999-0000" not in sent and reports_store.contact_of(rec["id"]) == "010-9999-0000" and "contact" not in rec)
check("Haiku로 정리", f.calls[0]["model"] == "claude-haiku-5-5")
check("예전 화면용 ai 칸도 채움", (rec.get("ai") or {}).get("suggested_grade") == "R")

# 근거 없는 '지나갈 수 없음'은 한 단계 낮춤
f = FakeClaude(json_msg({**AI_OK, "category": "toilet", "severity": "block", "obstacles": []})); ai.set_client(f)
c.post("/api/reports", data={"category": "toilet", "note": "화장실이 좀 좁아요", "place_id": "cave"})
check("근거 없는 '지나갈 수 없음' → '도움 필요'", reports_store.real()[-1]["triage"]["severity"] == "help")

# AI 실패 → 규칙
f = FakeClaude(RuntimeError("down")); ai.set_client(f)
r = c.post("/api/reports", data={"category": "parking", "who": "휠체어", "note": "장애인 구역에 차가 있어요", "lat": "37.4785", "lon": "129.1575"})
rec = reports_store.real()[-1]
check("AI 실패 → 규칙 분류로 접수", r.status_code == 200 and rec["triage"]["by"] == "rule" and rec["triage"]["dept"] == "traffic" and rec["triage"]["severity"] == "help")

# 하루 비용 한도 → AI 안 부르고 규칙
ai.DAILY_USD = 0.000001
f = FakeClaude(json_msg(AI_OK)); ai.set_client(f)
c.post("/api/reports", data={"category": "ramp", "note": "경사로가 없어요", "lat": "37.5920", "lon": "129.0899"})
check("비용 한도면 AI 안 부름(규칙)", not f.calls and reports_store.real()[-1]["triage"]["by"] == "rule")
ai.DAILY_USD = 1000.0

# 사진 위치(EXIF): 동의했을 때만 쓰고, 저장한 사진엔 남지 않음
ai.set_client(FakeClaude(RuntimeError("x")))
c.post("/api/reports", data={"category": "step", "use_exif": "1", "place_id": ""}, files=[("photos", ("g.jpg", jpeg(True), "image/jpeg"))])
rec = reports_store.real()[-1]
saved = Image.open(Path(os.environ["REPORTS_DIR"]) / rec["photos"][0])
check("동의하면 사진 위치로 좌표", rec["loc_how"] == "exif" and abs(rec["lat"] - 37.5517) < 0.001, str((rec.get("lat"), rec.get("lon"))))
check("저장한 사진엔 위치 정보 없음", not saved.getexif().get_ifd(0x8825))
r = c.post("/api/reports", data={"category": "step", "place_id": ""}, files=[("photos", ("g.jpg", jpeg(True), "image/jpeg"))])
check("동의 안 하면 사진 위치 안 씀 → 위치를 물음", r.status_code == 400)
check("동해 밖 좌표는 거절", c.post("/api/reports", data={"category": "step", "lat": "37.56", "lon": "126.97"}).status_code == 400)
check("예전 방식(place_id·kind·note)도 그대로", c.post("/api/reports", data={"place_id": "nongol", "kind": "계단", "note": "손잡이 없음"}).status_code == 200
      and city.cat_of(reports_store.real()[-1]) == "step")

# ---------- 2. 묶기 · 같은 곳 n명 ----------
ai.set_client(FakeClaude(RuntimeError("x")))
r = c.post("/api/reports", data={"category": "sidewalk", "note": "여기 블록 깨짐", "lat": "37.55175", "lon": "129.11514"}).json()
check("30m 안 같은 종류는 한 묶음 (같은 곳 2명)", r["same"] == 2, str(r))
r = c.post("/api/reports", data={"category": "toilet", "note": "다른 문제", "lat": "37.55175", "lon": "129.11514"}).json()
check("종류가 다르면 따로", r["same"] == 1)

# ---------- 3. 관리자 목록 · 처리 · 이용자 확인 ----------
d = c.get("/api/admin/city", headers=H).json()
big = next(x for x in d["clusters"] if x["count"] == 2)
check("관리자 묶음 목록", big["category"] == "sidewalk" and len(big["reports"]) == 2 and big["dept"] == "road", str(big)[:200])
check("관리자 아니면 못 봄", c.get("/api/admin/city").status_code in (401, 403))
r = c.post(f"/api/admin/city/{big['id']}", json={"status": "처리 중", "reply": "다음 주 보수해요", "priority": "urgent", "dept": "tour"}, headers=H)
check("묶음 상태·답변·분류 고치기", r.status_code == 200 and r.json()["updated"] == 2)
d = c.get("/api/admin/city", headers=H).json()
big = next(x for x in d["clusters"] if x["id"] == big["id"])
check("담당자가 고친 값이 먼저", big["priority"] == "urgent" and big["dept"] == "tour" and big["edited"] and big["status"] == "처리 중")
first = big["reports"][-1]
check("AI가 낸 원래 값은 따로 남음", first["triage"]["dept"] == "road" and first["final"]["dept"] == "tour")
check("반려는 사유 필수", c.post(f"/api/admin/city/{big['id']}", json={"status": "반려"}, headers=H).status_code == 400)
mine = c.get(f"/api/reports/mine?ids={first['id']}").json()
check("이용자 [내 제보]: 상태·답변, 사진·연락처 없음", mine and mine[0]["status"] == "처리 중" and mine[0]["reply"] == "다음 주 보수해요"
      and "photos" not in mine[0] and "contact" not in json.dumps(mine[0]))
check("접수번호로 찾기", c.get(f"/api/reports/mine?code={first['code'].lower()}").json()[0]["id"] == first["id"])
r = c.post("/api/reports", data={"category": "sidewalk", "note": "아직 깨져 있어요", "lat": "37.55176", "lon": "129.11513"}).json()
check("처리 중인 묶음에 새 제보 → 상태·답변 따라감", r["status"] == "처리 중" and r["same"] == 3)
ph = first["photos"][0] if first["photos"] else None
if ph:
    check("제보 사진은 관리자만", c.get(f"/api/admin/city-photo/{ph}").status_code in (401, 403) and c.get(f"/api/admin/city-photo/{ph}?t={tok}").status_code == 200)
check("사진 이름 조작 막음", c.get(f"/api/admin/city-photo/..%2Fcms.json?t={tok}").status_code == 404)
r = c.post(f"/api/admin/city/{big['id']}/after-photo", files={"photo": ("after.jpg", jpeg(), "image/jpeg")}, headers=H)
check("고친 뒤 사진 → 이용자에게 공개", r.status_code == 200 and c.get(f"/api/reports/after/{first['id']}").status_code == 200)
cid_sm = next(x["id"] for x in d["clusters"] if x["count"] == 1 and x["category"] == "toilet" and x.get("lat"))
c.post(f"/api/admin/city/{cid_sm}/merge", json={"into": big["id"]}, headers=H)
d = c.get("/api/admin/city", headers=H).json()
check("묶음 합치기", next(x for x in d["clusters"] if x["id"] == big["id"])["count"] == 4)
c.post(f"/api/admin/city/{big['id']}/merge", json={"split": next(x for x in d["clusters"] if x["id"] == big["id"])["members"][-1]}, headers=H)
d = c.get("/api/admin/city", headers=H).json()
check("한 제보 떼어 내기", next(x for x in d["clusters"] if x["id"] == big["id"])["count"] == 3)
cave = next(x for x in d["clusters"] if x.get("place_id") == "cave")
r = c.post(f"/api/admin/city/{cave['id']}/notice", json={"title": "장애인 화장실 점검 중", "level": "warn"}, headers=H)
check("[여행 정보에 알리기] → 관광지 임시 알림", r.status_code == 200 and any(n["title"] == "장애인 화장실 점검 중" for n in PLACES["cave"].notices))
st = c.get("/api/places/cave/status").json()
check("최근 길 상태 요약도 같은 제보를 씀", st.get("count", 0) >= 1)

# ---------- 4. 공개 지도 · 기간 요약 · 보고서 ----------
pm = c.get("/api/reports/public-map").json()
check("공개 지도: 2명 이상 묶음만, 사진 없음", pm and all(x["count"] >= 2 for x in pm) and "photos" not in json.dumps(pm) and "reports" not in pm[0])
rep = {"headline": "제보 9건 중 2건 처리", "highlights": ["보도 파손 집중", "주차 반복", "x"], "hotspots": ["묵호항 3건"], "delayed": [],
       "by_dept": ["도로: 보수"], "next": ["순찰 강화", "예산 반영"]}
f = FakeClaude(*[json_msg(rep)] * 12); ai.set_client(f)   # 묶음 요약(Haiku) 호출도 먼저 있을 수 있어 넉넉히
s = c.get("/api/admin/city-summary?ai_text=1", headers=H).json()
son = [x for x in f.calls if x["model"] == "claude-sonnet-5-5"]
check("기간 요약 숫자는 서버가 계산", s["stats"]["received"] >= 9 and s["hot"], str(s["stats"])[:200])
check("기간 보고서는 Sonnet + 서버가 준 숫자만", s["report"]["by"] == "ai" and len(son) == 1
      and 'received' in son[0]["messages"][0]["content"], str([x["model"] for x in f.calls]))
check("묶음 요약은 Haiku", all(x["model"] == "claude-haiku-5-5" for x in f.calls if x not in son))
ai.set_client(FakeClaude(RuntimeError("x")))
s2 = c.get("/api/admin/city-summary?ai_text=1&start=2026-01-01", headers=H).json()
check("보고서 AI 실패 → 규칙 문장", s2["report"]["by"] == "rule" and "접수" in s2["report"]["headline"])
csv = c.get(f"/api/admin/city-export.csv?t={tok}")
check("CSV 내려받기 (연락처 없음)", csv.status_code == 200 and "접수번호" in csv.text and "010-9999-0000" not in csv.text)

# ---------- 5. 가상 데이터 ----------
real_n = len(reports_store.real())
r = c.post("/api/admin/city-sample", json={"action": "load"}, headers=H).json()
d = c.get("/api/admin/city", headers=H).json()
sm = [x for x in d["clusters"] if x["sample"]]
check("가상 제보 18건 넣기", r["loaded"] == 18 and sum(x["count"] for x in sm) == 18)
check("가상은 실제 파일과 섞이지 않음", len(reports_store.real()) == real_n and not any(x.get("sample") for x in reports_store.real()))
check("몰리는 곳 3곳 (5·3·3건)", sorted(x["count"] for x in sm)[-3:] == [3, 3, 5], str(sorted(x["count"] for x in sm)))
check("가상 제보는 실제 관광지 알림 못 올림", c.post(f"/api/admin/city/{next(x['id'] for x in sm if x.get('place_id'))}/notice", json={}, headers=H).status_code == 400)
check("가상 제보는 최근 길 상태에 안 섞임", all(not r.get("sample") for r in reports_store.real()))
r = c.post("/api/admin/city-sample", json={"action": "clear"}, headers=H).json()
check("가상 데이터 한 번에 지우기", r["cleared"] == 18 and not reports_store.sample_loaded() and len(reports_store.real()) == real_n)

# ---------- 6. 백업 ----------
z = c.get(f"/api/admin/city-backup?t={tok}")
check("백업 zip", z.status_code == 200 and z.content[:2] == b"PK")
(Path(os.environ["REPORTS_DIR"]) / "reports.jsonl").unlink()
r = c.post("/api/admin/city-restore", files={"file": ("b.zip", z.content, "application/zip")}, headers=H)
check("백업 되살리기", r.status_code == 200 and len(reports_store.real()) == real_n)
check("관리자 아니면 백업 못 받음", c.get("/api/admin/city-backup").status_code in (401, 403))

# ---------- 7. 스팸 막기 ----------
import app.main as m  # noqa: E402
m.REPORT_PER_HOUR = 2
m._REPORT_HITS.clear()
codes = [c.post("/api/reports", data={"category": "etc", "note": "테스트", "lat": "37.52", "lon": "129.11"}).status_code for _ in range(3)]
check("같은 주소 1시간 제보 수 제한", codes == [200, 200, 429], str(codes))

ai.set_client(None)
print(f"제보 점검 실패 {len(fails)}건")
