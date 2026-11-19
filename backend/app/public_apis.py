"""공공 API 중계: 안심(병원·약국·응급실)과 날씨. 키는 서버에만 두고, 웹 화면은 이 서버만 부른다.
엔드포인트 이름은 공공데이터포털 각 API의 활용가이드(참고문서)로 한 번 더 확인할 것."""
import math, os, sys, time, datetime as dt
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from threading import Lock
from urllib.parse import unquote
import httpx
from .schemas import RouteCosts

KEY = os.getenv("DATA_GO_KR_KEY", "")
NMC = "https://apis.data.go.kr/B552657"
KMA = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"


@lru_cache(maxsize=32)
def _driving_route(points, time_bucket):
    """방문 순서를 유지하며 자동차 길찾기의 요청당 최대 5개 경유지에 맞춰 나눈다."""
    line = []
    durations = []
    instructions = []
    quotes = []
    for start in range(0, len(points) - 1, 6):
        part = [f"{lon},{lat}" for lat, lon in points[start:start + 7]]
        params = {"origin": part[0], "destination": part[-1]}
        if len(part) > 2:
            params["waypoints"] = "|".join(part[1:-1])
        res = httpx.get("https://apis-navi.kakaomobility.com/v1/directions", params=params,
                        headers={"Authorization": "KakaoAK " + os.environ["KAKAO_REST_API_KEY"]}, timeout=5)
        res.raise_for_status()
        route = res.json()["routes"][0]
        if route["result_code"] != 0 or len(route["sections"]) != len(part) - 1:
            raise ValueError("incomplete driving route")
        summary = route.get("summary") or {}
        fare = summary.get("fare") or {}
        quotes.append((summary.get("distance"), fare.get("toll"), fare.get("taxi")))
        for section in route["sections"]:
            seconds = section["duration"]
            if not isinstance(seconds, int) or seconds < 0:
                raise ValueError("invalid section duration")
            durations.append(seconds)
            instructions.append([{"text": g["guidance"], "lat": g["y"], "lon": g["x"]}
                                 for g in section.get("guides", []) if g.get("guidance") and g.get("x") and g.get("y")])
            for road in section["roads"]:
                coords = road["vertexes"]
                for point in zip(coords[1::2], coords[::2]):
                    if not line or line[-1] != point:
                        line.append(point)
    # 여러 번 나눠 조회한 경우 한 응답이라도 빠진 항목은 전체 금액으로 표시하지 않는다.
    def total(values):
        return sum(values) if all(type(v) is int and v >= 0 for v in values) else None

    distance, toll, taxi = map(total, zip(*quotes))
    return line, durations, RouteCosts(distance_m=distance, toll_won=toll, taxi_won=taxi, quote_parts=len(quotes)), instructions


def driving_route(points):
    if len(points) < 2 or not os.getenv("KAKAO_REST_API_KEY"):
        return None
    try:
        return _driving_route(tuple(points), int(time.monotonic() // 600))
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        return None


def _items(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    return [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]


def _open_now(item: dict, now: dt.datetime) -> tuple[bool, str]:
    """dutyTime{요일}s/c: 1=월 ... 7=일, 8=공휴일. 값은 '0900' 형식."""
    d = now.isoweekday()
    s, c = item.get(f"dutyTime{d}s"), item.get(f"dutyTime{d}c")
    if not s or not c:
        return False, ""
    hm = now.hour * 100 + now.minute
    return int(s) <= hm < int(c), f"{c[:2]}:{c[2:]}"


def _dist_m(lat1, lon1, lat2, lon2) -> int:
    r = 6371000
    p = math.radians
    a = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


def nearby_open(lat: float, lon: float) -> dict:
    """지금 문 연 약국·병의원과 가까운 응급실. 키가 없으면 sample=True 예시를 돌려준다."""
    if not KEY:
        return {"sample": True, "places": [
            {"name": "○○약국 (예시)", "kind": "약국", "until": "21:00", "dist_m": 350, "tel": "033-000-0000"},
            {"name": "△△의원 (예시)", "kind": "의원", "until": "18:00", "dist_m": 800, "tel": "033-000-0000"},
            {"name": "지역 응급실 (예시)", "kind": "응급실", "until": "24시간", "dist_m": 2100, "tel": "033-000-0000"}]}
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    out = []
    common = {"serviceKey": KEY, "WGS84_LON": lon, "WGS84_LAT": lat, "pageNo": 1, "numOfRows": 20}
    for kind, path in (("약국", "/ErmctInsttInfoInqireService/getParmacyLcinfoInqire"),
                       ("병의원", "/HsptlAsembySearchService/getHsptlMdcncLcinfoInqire")):
        try:
            items = _items(httpx.get(NMC + path, params=common, timeout=5).text)
        except Exception as e:
            print("[nmc]", kind, e); items = []
        for it in items:
            # 위치기반 목록에는 운영시간이 없을 수 있다 → 기관코드(hpid)로 상세 조회가 필요하면 여기서 추가
            ok, until = _open_now(it, now)
            if ok or "dutyTime1s" not in it:
                out.append({"name": it.get("dutyName"), "kind": kind, "until": until or "운영시간 확인",
                            "dist_m": _dist_m(lat, lon, float(it.get("latitude", lat)), float(it.get("longitude", lon))),
                            "tel": it.get("dutyTel1", "")})
    try:
        er = _items(httpx.get(NMC + "/ErmctInfoInqireService/getEgytLcinfoInqire", params=common, timeout=5).text)
        for it in er[:1]:
            out.append({"name": it.get("dutyName"), "kind": "응급실", "until": "24시간",
                        "dist_m": _dist_m(lat, lon, float(it.get("latitude", lat)), float(it.get("longitude", lon))),
                        "tel": it.get("dutyTel1", "")})
    except Exception as e:
        print("[nmc] er", e)
    out.sort(key=lambda x: (x["kind"] == "응급실", x["dist_m"]))
    return {"sample": False, "places": out[:5]}


# ---- 기상청 격자 변환 (기상청 공식 LCC 변환식) ----
def to_grid(lat: float, lon: float) -> tuple[int, int]:
    RE, GRID, SLAT1, SLAT2, OLON, OLAT, XO, YO = 6371.00877, 5.0, 30.0, 60.0, 126.0, 38.0, 43, 136
    D = math.pi / 180.0
    re = RE / GRID
    slat1, slat2, olon, olat = SLAT1 * D, SLAT2 * D, OLON * D, OLAT * D
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5))
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5) ** sn * math.cos(slat1) / sn
    ro = re * sf / math.tan(math.pi * 0.25 + olat * 0.5) ** sn
    ra = re * sf / math.tan(math.pi * 0.25 + lat * D * 0.5) ** sn
    theta = lon * D - olon
    theta = (theta + math.pi) % (2 * math.pi) - math.pi
    theta *= sn
    return int(ra * math.sin(theta) + XO + 0.5), int(ro - ra * math.cos(theta) + YO + 0.5)


def _base(now: dt.datetime) -> tuple[str, str]:
    """단기예보 발표 시각(02,05,08,11,14,17,20,23시) 중 10분 이상 지난 가장 최근 것."""
    t = now - dt.timedelta(minutes=10)
    hours = [h for h in (2, 5, 8, 11, 14, 17, 20, 23) if h <= t.hour]
    if not hours:
        t -= dt.timedelta(days=1); h = 23
    else:
        h = hours[-1]
    return t.strftime("%Y%m%d"), f"{h:02d}00"


# ---------- 16일 일별 예보 (키 없이 쓰는 Open-Meteo: 기상청 등 여러 나라 수치예보 모델을 합친 예보) ----------
OM = "https://api.open-meteo.com/v1/forecast"
_FC: dict = {"t": 0.0, "data": None, "fail": 0.0}
RAIN_CODES = set(range(51, 68)) | {80, 81, 82, 95, 96, 99}
SNOW_CODES = set(range(71, 78)) | {85, 86}
KIND = [((0,), "맑음", "Clear", "sun"), ((1, 2), "구름 조금", "Partly cloudy", "part"), ((3,), "흐림", "Cloudy", "cloud"),
        ((45, 48), "안개", "Fog", "fog"), (tuple(range(51, 58)), "이슬비", "Drizzle", "rain"), (tuple(range(61, 68)), "비", "Rain", "rain"),
        (tuple(range(71, 78)) + (85, 86), "눈", "Snow", "snow"), ((80, 81, 82), "소나기", "Showers", "rain"), ((95, 96, 99), "뇌우", "Thunderstorm", "storm")]


def _kind(code: int) -> tuple[str, str, str]:
    for codes, ko, en, icon in KIND:
        if code in codes:
            return ko, en, icon
    return "알 수 없음", "Unknown", "cloud"


def forecast(lat: float = 37.5245, lon: float = 129.1143) -> dict | None:
    """동해시 16일 일별 예보. 1시간 동안 기억하고, 실패하면 10분 동안 다시 부르지 않는다."""
    now = time.time()
    if _FC["data"] and now - _FC["t"] < 3600:
        return _FC["data"]
    if now - _FC["fail"] < 600:
        return None
    try:
        r = httpx.get(OM, params={"latitude": lat, "longitude": lon, "timezone": "Asia/Seoul", "forecast_days": 16,
                                  "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max"},
                      timeout=4)
        body = r.json()
        if "daily" not in body:
            raise ValueError(f"open-meteo {r.status_code}: {str(body)[:200]}")
        j = body["daily"]
        days = []
        for i, d in enumerate(j["time"]):
            code, pop, mm = int(j["weather_code"][i] or 0), int(j["precipitation_probability_max"][i] or 0), float(j["precipitation_sum"][i] or 0)
            ko, en, icon = _kind(code)
            wet = code in RAIN_CODES or code in SNOW_CODES
            days.append({"date": d, "code": code, "ko": ko, "en": en, "icon": icon, "pop": pop, "mm": round(mm, 1),
                         "tmax": round(j["temperature_2m_max"][i]), "tmin": round(j["temperature_2m_min"][i]),
                         "wind": round(j["wind_speed_10m_max"][i] / 3.6, 1),          # m/s
                         "rain": pop >= 60 or mm >= 5 or (wet and pop >= 40)})
        data = {"source": "Open-Meteo 일별 예보 (기상청 등 수치예보 모델 종합)", "updated": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="minutes"), "days": days}
        _FC.update(t=now, data=data)
        return data
    except Exception as e:
        print("[forecast]", e, file=sys.stderr)
    data = _met_norway(lat, lon)          # 두 번째 출처: 노르웨이 기상청 (약 9일)
    if data:
        _FC.update(t=now, data=data)
        return data
    _FC["fail"] = now
    return None


MET = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
_SYM = [("thunder", "뇌우", "Thunderstorm", "storm", 95), ("snow", "눈", "Snow", "snow", 71), ("sleet", "진눈깨비", "Sleet", "snow", 66),
        ("rainshowers", "소나기", "Showers", "rain", 80), ("rain", "비", "Rain", "rain", 61), ("fog", "안개", "Fog", "fog", 45),
        ("cloudy", "흐림", "Cloudy", "cloud", 3), ("partlycloudy", "구름 조금", "Partly cloudy", "part", 2), ("fair", "구름 조금", "Partly cloudy", "part", 1),
        ("clearsky", "맑음", "Clear", "sun", 0)]


def _met_norway(lat: float, lon: float) -> dict | None:
    """MET Norway 시간별 예보를 한국 날짜별로 묶는다. 강수확률이 없어 강수량으로 비를 판단한다."""
    try:
        r = httpx.get(MET, params={"lat": round(lat, 4), "lon": round(lon, 4)}, timeout=5,
                      headers={"User-Agent": "donghae-gildongmu/1.0 github.com/yangggu-1218/donghae-gildongmu"})
        ts = r.json()["properties"]["timeseries"]
    except Exception as e:
        print("[met.no]", e, file=sys.stderr)
        return None
    kst = dt.timezone(dt.timedelta(hours=9))
    by: dict[str, dict] = {}
    for t in ts:
        at = dt.datetime.fromisoformat(t["time"].replace("Z", "+00:00")).astimezone(kst)
        d = by.setdefault(at.date().isoformat(), {"temps": [], "mm": 0.0, "syms": []})
        d["temps"].append(t["data"]["instant"]["details"].get("air_temperature"))
        n1, n6 = t["data"].get("next_1_hours"), t["data"].get("next_6_hours")
        if n1:
            d["mm"] += n1.get("details", {}).get("precipitation_amount", 0) or 0
            if 9 <= at.hour <= 18: d["syms"].append(n1["summary"]["symbol_code"])
        elif n6 and at.hour % 6 == 3:      # 6시간 묶음은 겹치지 않게 (KST 3·9·15·21시)
            d["mm"] += n6.get("details", {}).get("precipitation_amount", 0) or 0
            if 6 <= at.hour <= 15: d["syms"].append(n6["summary"]["symbol_code"])
    days = []
    for date, d in sorted(by.items()):
        temps = [x for x in d["temps"] if x is not None]
        if not temps or not d["syms"]:
            continue
        bases = [s.split("_")[0] for s in d["syms"]]
        # 비·눈 종류는 이름 안에 들어 있으면(lightrain, heavyrainshowers) 같은 것으로, 나머지는 이름이 같을 때만
        sym = next((x for i, x in enumerate(_SYM) if any((x[0] in b) if i < 5 else (b == x[0]) for b in bases)), _SYM[-1])
        mm = round(d["mm"], 1)
        wet = sym[4] >= 61
        days.append({"date": date, "code": sym[4], "ko": sym[1], "en": sym[2], "icon": sym[3], "pop": None, "mm": mm,
                     "tmax": round(max(temps)), "tmin": round(min(temps)), "wind": None, "rain": mm >= 5 or (wet and mm >= 1)})
    if not days:
        return None
    return {"source": "노르웨이 기상청(MET Norway) 예보", "updated": dt.datetime.now(kst).isoformat(timespec="minutes"), "days": days}


def rain_on(date_iso: str) -> bool:
    fc = forecast()
    d = next((x for x in (fc or {}).get("days", []) if x["date"] == date_iso), None)
    return bool(d and d["rain"])


_KST = dt.timezone(dt.timedelta(hours=9))
_grid_pool = ThreadPoolExecutor(max_workers=4)
_grid_cache = {}


@lru_cache(maxsize=128)
def _grid_lock(grid):
    return Lock()


def _grid_forecast(grid, issue):
    """같은 발표의 격자 예보를 재사용한다. 실패한 요청은 1분 뒤 재시도한다."""
    with _grid_lock(grid):
        cached = _grid_cache.get(grid)
        if cached and cached[0] == issue and time.monotonic() < cached[1]:
            return cached[2]
        slots = {}
        try:
            params = {"serviceKey": unquote(KEY), "pageNo": 1, "numOfRows": 1500, "dataType": "JSON",
                      "base_date": issue[0], "base_time": issue[1], "nx": grid[0], "ny": grid[1]}
            res = httpx.get(KMA, params=params, timeout=5)
            res.raise_for_status()
            response = res.json()["response"]
            if response["header"]["resultCode"] == "00":
                for row in response["body"]["items"]["item"]:
                    if row["category"] in ("TMP", "POP", "SKY", "PTY"):
                        stamp = row["fcstDate"] + row["fcstTime"]
                        slots.setdefault(stamp, {})[row["category"]] = int(float(row["fcstValue"]))
        except (httpx.HTTPError, ValueError, TypeError, KeyError) as error:
            print("[kma]", type(error).__name__, file=sys.stderr)
            slots.clear()
        slots = {dt.datetime.strptime(stamp, "%Y%m%d%H%M"): values for stamp, values in sorted(slots.items())
                 if all(k in values for k in ("TMP", "POP", "SKY", "PTY")) and 0 <= values["POP"] <= 100}
        _grid_cache[grid] = (issue, time.monotonic() + (10800 if slots else 60), slots)
        return slots


def visit_forecasts(date, visits):
    """장소별 도착~출발(미포함)에 걸친 단기예보. 발표 범위 밖에는 값을 붙이지 않는다."""
    now = dt.datetime.now(_KST)
    day = dt.date.fromisoformat(date)
    if not KEY or not 0 <= (day - now.date()).days <= 5:
        return {}
    issue = _base(now)
    grids = {pid: to_grid(lat, lon) for pid, lat, lon, _, _ in visits if lat is not None and lon is not None}
    jobs = {grid: _grid_pool.submit(_grid_forecast, grid, issue) for grid in set(grids.values())}
    midnight = dt.datetime.combine(day, dt.time())
    forecasts = {}
    for pid, _, _, arrive, depart in visits:
        grid = grids.get(pid)
        if grid is None:
            continue
        slots = jobs[grid].result()
        hours = []
        stamps = list(slots)
        start = midnight + dt.timedelta(minutes=arrive)
        end = midnight + dt.timedelta(minutes=max(arrive + 1, depart))
        for i, at in enumerate(stamps):
            # 뒤쪽 날짜는 3시간 간격이다. 마지막 발표 시각 이후의 시간대로 연장하지 않는다.
            until = stamps[i + 1] if i + 1 < len(stamps) else at + dt.timedelta(hours=1)
            if at < end and start < min(until, at + dt.timedelta(hours=3)):
                v = slots[at]
                hours.append({"time": at.strftime("%H:%M"), "temp": v["TMP"], "pop": v["POP"], "sky": v["SKY"], "pty": v["PTY"]})
        if hours:
            forecasts[pid] = {"source": "KMA", "issued": dt.datetime.strptime("".join(issue), "%Y%m%d%H%M").replace(tzinfo=_KST).isoformat(timespec="minutes"),
                              "grid": grid, "hours": hours}
    return forecasts


def rain_today(lat: float = 37.5245, lon: float = 129.1143) -> dict:
    """오늘 10~18시 중 강수확률 60% 이상인 시간이 있으면 rain=True."""
    if not KEY:
        return {"sample": True, "rain": False, "hours": []}
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    nx, ny = to_grid(lat, lon)
    slots = _grid_forecast((nx, ny), _base(now))
    pops = [(at.strftime("%H%M"), v["POP"]) for at, v in slots.items() if at.date() == now.date() and 10 <= at.hour <= 18]
    return {"sample": not bool(pops), "rain": any(p >= 60 for _, p in pops), "hours": pops, "grid": [nx, ny]}
