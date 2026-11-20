"""gangRG님 변경 반영 점검: 카카오 길찾기 · 다시 짜기 상한 · 시간 상한 · 장소별 단기예보 · 미리 보기(AI 안 부름) · 지도 키 · 동이 규칙.
네트워크 없이 가짜 응답으로. 돌리는 법: py tests/test_route_weather.py → 마지막 줄 "길찾기·날씨 점검 실패 0건"
"""
import datetime as dt
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ.update({"CMS_FILE": str(tmp / "cms.json"), "REPORTS_DIR": str(tmp / "reports"), "AI_USAGE_FILE": "0", "AI_RATE_PER_IP": "1000",
                   "ADMIN_ID": "owner", "ADMIN_PASSWORD": "test-owner-pw-1"})
os.environ.pop("KAKAO_REST_API_KEY", None)
os.environ.setdefault("PYTHONUTF8", "1")
sys.path[:0] = [str(Path(__file__).resolve().parents[1] / "backend"), str(Path(__file__).resolve().parent)]

from fastapi.testclient import TestClient  # noqa: E402
from fake_claude import FakeClaude, json_msg  # noqa: E402
from app.main import app, PLACES  # noqa: E402
from app import ai, ai_course, engine, public_apis, talk  # noqa: E402
from app.schemas import Conditions  # noqa: E402

c = TestClient(app)
fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


# ---------- 가짜 카카오 ----------
class Resp:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise public_apis.httpx.HTTPStatusError("bad", request=None, response=None)

    def json(self):
        return self.body


CALLS = []
MODE = {"kind": "ok", "minutes": 12}


def fake_get(url, params=None, headers=None, timeout=None):
    CALLS.append({"url": url, "params": params, "timeout": timeout})
    if "kakaomobility" not in url:
        raise AssertionError("이 점검에서는 카카오 말고 다른 곳을 부르면 안 돼요: " + url)
    if MODE["kind"] == "error":
        raise public_apis.httpx.ConnectError("down")
    pts = [params["origin"]] + (params.get("waypoints", "").split("|") if params.get("waypoints") else []) + [params["destination"]]
    n = len(pts) - 1 - (1 if MODE["kind"] == "short" else 0)
    sections = []
    for i in range(n):
        x1, y1 = map(float, pts[i].split(",")); x2, y2 = map(float, pts[i + 1].split(","))
        sections.append({"duration": MODE["minutes"] * 60, "guides": [{"guidance": f"{i + 1}번째 구간 출발", "x": x1, "y": y1}],
                         "roads": [{"vertexes": [x1, y1, (x1 + x2) / 2, (y1 + y2) / 2, x2, y2]}]})
    return Resp({"routes": [{"result_code": 0, "summary": {"distance": 12345, "fare": {"toll": 0, "taxi": 23000}}, "sections": sections}]})


public_apis.httpx.get = fake_get
base = Conditions(date=(dt.date.today() + dt.timedelta(days=1)).isoformat(), start_time="10:00")


def fresh():
    CALLS.clear(); public_apis._driving_route.cache_clear()


# 키 없음 → 추정, 카카오 안 부름
fresh()
r = engine.plan(PLACES, base, False)
check("키 없으면 추정 이동시간 · 카카오 안 부름", r.drive_source == "estimate" and not CALLS and r.stops, f"{r.drive_source} {len(CALLS)}")
est = [(s.id, s.arrive) for s in r.stops]

os.environ["KAKAO_REST_API_KEY"] = "test-kakao-rest-key"   # 점검용 가짜 값
fresh(); MODE.update(kind="ok", minutes=12)
r = engine.plan(PLACES, base, False)
check("카카오 성공 → 실제 이동시간·경로선·요금", r.drive_source == "kakao" and all(s.drive_min == 12 for s in r.stops) and r.back_drive_min == 12
      and r.route_costs and r.route_costs.taxi_won == 23000 and len(r.driving_sections) == len(r.stops) + 1 and r.driving_path, str(r.route_costs))
check("구간별 길안내", len(r.driving_guides) == len(r.stops) + 1 and r.driving_guides[0][0]["text"].startswith("1번째"))
check("요청 하나에 경유지 5곳까지 (카카오 규칙)", all(len((x["params"].get("waypoints") or "").split("|")) <= 5 for x in CALLS))
check("시간 상한 안에서 부름 (요청마다 제한 시간)", all(0 < x["timeout"] <= 5 for x in CALLS), str([x["timeout"] for x in CALLS]))
calls1 = len(CALLS)
engine.plan(PLACES, base, False)
check("같은 경로는 10분 동안 다시 안 부름 (캐시)", len(CALLS) == calls1)

fresh(); MODE.update(kind="error")
r = engine.plan(PLACES, base, False)
check("카카오 실패 → 추정 이동시간 그대로", r.drive_source == "estimate" and [(s.id, s.arrive) for s in r.stops] == est)
fresh(); MODE.update(kind="short", minutes=12)
r = engine.plan(PLACES, base, False)
check("구간 수가 안 맞으면 버리고 추정", r.drive_source == "estimate" and [(s.id, s.arrive) for s in r.stops] == est)

# 다시 짜기 상한: 이동이 너무 길어 늘 문 닫는 곳이 생기는 경우
fresh(); MODE.update(kind="ok", minutes=400)
n_preview = {"n": 0}
orig_preview = engine.preview_stops
def counting(*a, **k):
    n_preview["n"] += 1
    return orig_preview(*a, **k)
engine.preview_stops = counting
r = engine.plan(PLACES, base, False)
engine.preview_stops = orig_preview
check("문 닫는 곳 빼고 다시 짜기는 최대 3번", n_preview["n"] <= engine.MAX_REPLAN + 2 and len([x for x in r.skipped if "이동시간" in x.get("reason", "")]) <= engine.MAX_REPLAN,
      f"preview {n_preview['n']}, skipped {len(r.skipped)}")
check("상한에 걸리면 추정 이동시간 + 안내", r.drive_source == "estimate" and any("추정" in n for n in r.notes), str(r.notes[-1:]))

# 시간 상한: 마감이 지나면 카카오를 부르지 않는다
fresh(); MODE.update(kind="ok", minutes=12)
tok = public_apis.route_deadline(0.0)
before = public_apis.ROUTE_STATS["skipped_budget"]
got = public_apis.driving_route([(37.5, 129.1), (37.55, 129.12)])
public_apis._ROUTE_DEADLINE.reset(tok)
check("요청 하나의 카카오 시간 상한을 넘으면 안 부름", got is None and not CALLS and public_apis.ROUTE_STATS["skipped_budget"] == before + 1)

# AI 코스 + 카카오: 실제 이동시간을 넣으니 문제가 생기면 규칙으로 + 이유
stops = [{"id": "cave", "kind": "sight", "why": "실내"}, {"id": "food_yeongbin", "kind": "lunch", "why": "점심"}, {"id": "pencil_museum", "kind": "sight", "why": "실내"}]
fresh(); MODE.update(kind="ok", minutes=400)
os.environ.pop("AI_COURSE", None)
ai.set_client(FakeClaude(json_msg({"stops": stops, "summary": "실내", "notes": []})))
res = c.post("/api/course", json={"who": "아이와", "date": base.date}).json()
check("AI 코스가 카카오 시간에 안 맞으면 규칙으로 + planner 에 이유", res["planner"]["by"] == "rule" and "카카오" in res["planner"].get("reason", ""), str(res.get("planner"))[:200])
fresh(); MODE.update(kind="ok", minutes=10)
f = FakeClaude(json_msg({"stops": stops, "summary": "실내", "notes": []})); ai.set_client(f)
res = c.post("/api/course", json={"who": "아이와", "date": base.date, "start_time": "10:00"}).json()
check("AI 코스 + 카카오 이동시간", res["planner"]["by"] == "ai" and res["course"]["drive_source"] == "kakao", str(res.get("planner"))[:200])
check("AI 에게 먼저 조회한 후보를 줌", "[먼저 조회한 후보]" in f.calls[0]["messages"][0]["content"])
os.environ.pop("KAKAO_REST_API_KEY")

# ---------- 미리 보기: AI·카카오·날씨 API 를 부르지 않는다 ----------
fresh()
f = FakeClaude(); ai.set_client(f)
usage0 = sum(u.get("calls", 0) for u in ai.USAGE.values())
os.environ["KAKAO_REST_API_KEY"] = "test-kakao-rest-key"
r = c.post("/api/course-preview", json={"who": "부모님과", "move": ["휠체어"], "date": base.date})
check("미리 보기는 규칙만 (AI 0번·카카오 0번·사용량 그대로)", r.status_code == 200 and isinstance(r.json(), list) and r.json() and not f.calls and not CALLS
      and sum(u.get("calls", 0) for u in ai.USAGE.values()) == usage0, r.text[:200])
os.environ.pop("KAKAO_REST_API_KEY")
ai.set_client(None)

# ---------- 장소별 시간대 단기예보 ----------
public_apis.KEY = "test-data-key"   # 점검용 가짜 값 (격자 예보는 아래에서 가짜로 바꿈)
day = dt.date.today() + dt.timedelta(days=1)
slots = {dt.datetime.combine(day, dt.time(h)): {"TMP": 10 + h % 5, "POP": 20 if h < 13 else 70, "SKY": 1, "PTY": 0} for h in range(9, 16)}
public_apis._grid_forecast = lambda grid, issue: slots
fc = public_apis.visit_forecasts(day.isoformat(), [("cave", 37.5, 129.1, 10 * 60, 11 * 60 + 30), ("late", 37.5, 129.1, 20 * 60, 21 * 60)])
check("방문 시간대만 붙임 (10:00~11:30 → 10·11시)", [h["time"] for h in fc.get("cave", {}).get("hours", [])] == ["10:00", "11:00"], str(fc.get("cave"))[:200])
check("발표 범위(마지막 시각+1시간) 밖이면 안 붙임", "late" not in fc)
far = public_apis.visit_forecasts((dt.date.today() + dt.timedelta(days=7)).isoformat(), [("cave", 37.5, 129.1, 600, 700)])
check("6일 넘는 날짜는 단기예보 없음", far == {})
public_apis.KEY = ""
check("키 없으면 단기예보 없음", public_apis.visit_forecasts(day.isoformat(), [("cave", 37.5, 129.1, 600, 700)]) == {})

# ---------- 지도 키 · 동이 규칙 ----------
os.environ["KAKAO_JS_KEY"] = "test-js-key"
r = c.get("/map-config.js")
check("서버가 카카오 JS 키를 화면에 줌", r.status_code == 200 and 'window.gildongmuKakaoJsKey="test-js-key"' in r.text)
os.environ.pop("KAKAO_JS_KEY")
os.environ["AI_COURSE"] = "0"
r = c.post("/api/talk", json={"message": "근처 장애인 화장실 어디예요?", "history": [], "conditions": {"lang": "ko"}, "state": {"who_known": True, "move_known": True}, "course_ids": []}).json()
check("동이: 화장실 도움", [x["kind"] for x in r["cards"]] == ["toilets"], str(r.get("cards"))[:120])
r = c.post("/api/talk", json={"message": "주차 편한 코스로 짜 줘", "history": [], "conditions": {"lang": "ko"}, "state": {"who_known": True, "move_known": True}, "course_ids": []}).json()
check("동이: '코스' 요청은 도움 검색으로 새지 않음", not r["cards"] and r["course"], str(r.get("cards"))[:120])
check("동이 규칙: 식사 조건(주차 편한 곳)", "주차 편한 곳" in (r["conditions"].get("meal") or []))
r = c.post("/api/talk", json={"message": "내일 오후 2시에 출발해요", "history": [], "conditions": {"lang": "ko"}, "state": {"who_known": True, "move_known": True}, "course_ids": []}).json()
check("동이 규칙: 날짜·시간", r["conditions"]["start_time"] == "14:00" and r["conditions"]["date"] == (dt.date.today() + dt.timedelta(days=1)).isoformat(), str(r["conditions"].get("date")) + " " + str(r["conditions"].get("start_time")))
check("역 좌표 바로잡음", engine.STARTS["묵호역"] == (37.546824, 129.107692))

print(f"길찾기·날씨 점검 실패 {len(fails)}건")
