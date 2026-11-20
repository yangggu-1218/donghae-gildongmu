"""대중교통(ODsay)·버스 정류장(TAGO) 점검 — 가짜 응답으로, 네트워크·키 없이.
돌리는 법: py tests/test_transit.py   → 마지막 줄 "대중교통 점검 실패 0건\""""
import datetime as dt
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ.update({"CMS_FILE": str(tmp / "cms.json"), "REPORTS_DIR": str(tmp / "reports"), "AI_USAGE_FILE": "0", "AI_COURSE": "0"})
for k in ("KAKAO_REST_API_KEY", "ODSAY_API_KEY"):
    os.environ.pop(k, None)
os.environ.setdefault("PYTHONUTF8", "1")
sys.path[:0] = [str(Path(__file__).resolve().parents[1] / "backend")]

from app.main import PLACES  # noqa: E402
from app import engine, public_apis  # noqa: E402
from app.schemas import Conditions  # noqa: E402

fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


class Resp:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise public_apis.httpx.HTTPStatusError("bad", request=None, response=None)

    def json(self):
        return self.body


MODE = {"odsay": "ok"}
CALLS = []


def fake_get(url, params=None, headers=None, timeout=None):
    CALLS.append(url)
    if "odsay" in url:
        if MODE["odsay"] == "error":
            raise public_apis.httpx.ConnectError("down")
        if MODE["odsay"] == "near":
            return Resp({"error": [{"code": "-98", "message": "출, 도착지가 700m이내입니다."}]})
        return Resp({"result": {"path": [{"pathType": 2, "info": {"totalTime": 30, "payment": 1500, "busTransitCount": 1, "subwayTransitCount": 0, "totalWalk": 420},
                                          "subPath": [{"trafficType": 3, "distance": 210, "sectionTime": 3},
                                                      {"trafficType": 2, "distance": 5200, "sectionTime": 18, "lane": [{"busNo": "12-4"}]},
                                                      {"trafficType": 3, "distance": 210, "sectionTime": 3}]}]}})
    if "BusSttnInfoInqireService" in url:
        return Resp({"response": {"body": {"items": {"item": [
            {"nodenm": "먼 정류장", "gpslati": params["gpsLati"] + 0.003, "gpslong": params["gpsLong"], "nodeid": "B2"},
            {"nodenm": "가까운 정류장", "gpslati": params["gpsLati"] + 0.001, "gpslong": params["gpsLong"], "nodeid": "B1"}]}}}})
    raise AssertionError("이 점검에서 부르면 안 되는 주소: " + url)


public_apis.httpx.get = fake_get
day = (dt.date.today() + dt.timedelta(days=1)).isoformat()

# ---------- 구간 하나 ----------
check("키 없으면 None (추정 그대로)", public_apis.transit_leg((37.5, 129.12), (37.55, 129.11), 1.0) is None)
os.environ["ODSAY_API_KEY"] = "test-odsay-key"   # 점검용 가짜 값
public_apis._odsay.cache_clear()
leg = public_apis.transit_leg((37.5, 129.12), (37.55, 129.11), 0.7)
check("버스 구간: 타는 시간 + 걷기(이용자 속도로 다시 계산)", leg and leg["mode"] == "transit" and leg["ride_min"] == 18 and leg["walk_m"] == 420
      and leg["walk_min"] == 10 and leg["min"] == 28 and leg["lines"] == ["버스 12-4"], str(leg))
check("일반 속도(1.0m/s)면 걷기 7분", public_apis.transit_leg((37.5, 129.12), (37.55, 129.11), 1.0)["walk_min"] == 7)
MODE["odsay"] = "near"; public_apis._odsay.cache_clear()
leg = public_apis.transit_leg((37.5, 129.12), (37.502, 129.12), 0.7)
check("700m 안(-98)이면 걸어서", leg and leg["mode"] == "walk" and leg["ride_min"] == 0 and leg["walk_min"] >= 1, str(leg))
MODE["odsay"] = "error"; public_apis._odsay.cache_clear()
check("오류면 None", public_apis.transit_leg((37.5, 129.12), (37.56, 129.1), 0.7) is None)

# ---------- 코스에 적용 ----------
MODE["odsay"] = "ok"; public_apis._odsay.cache_clear()
c = Conditions(date=day, start_time="10:00", start="동해역", move=["휠체어"])
r = engine.plan(PLACES, c, False)
check("역 출발이면 대중교통 시간으로", r.drive_source == "transit" and r.transit_legs and len(r.transit_legs) == len(r.stops) + 1, f"{r.drive_source} {len(r.transit_legs or [])}")
check("구간 시간 = 정류장까지 걷기 포함 28분", all(s.drive_min == 28 for s in r.stops), str([s.drive_min for s in r.stops]))
check("구간에 출발·도착 이름", r.transit_legs[0]["from"] == "동해역" and r.transit_legs[-1]["to"] == "동해역")
r2 = engine.plan(PLACES, c.model_copy(update={"start": "자가용"}), False)
check("자가용이면 대중교통 안 씀", r2.drive_source == "estimate" and not r2.transit_legs)
MODE["odsay"] = "error"; public_apis._odsay.cache_clear()
r3 = engine.plan(PLACES, c.model_copy(update={"date": day}), False)
check("ODsay 실패면 추정 그대로", r3.drive_source == "estimate", r3.drive_source)
os.environ.pop("ODSAY_API_KEY")

# ---------- 버스 정류장 ----------
public_apis.KEY = ""
check("공공데이터 키 없으면 정류장 []", public_apis.bus_stops_near(37.5, 129.12) == [])
public_apis.KEY = "test-data-key"   # 점검용 가짜 값
stops = public_apis.bus_stops_near(37.5, 129.12)
check("가까운 순으로 정류장", stops and stops[0]["name"] == "가까운 정류장" and stops[0]["dist_m"] < stops[1]["dist_m"], str(stops))

print(f"대중교통 점검 실패 {len(fails)}건")
sys.exit(1 if fails else 0)
