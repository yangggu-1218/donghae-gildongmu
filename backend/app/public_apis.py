"""공공 API 중계: 안심(병원·약국·응급실)과 날씨. 키는 서버에만 두고, 웹 화면은 이 서버만 부른다.
엔드포인트 이름은 공공데이터포털 각 API의 활용가이드(참고문서)로 한 번 더 확인할 것."""
from typing import Optional
import math, os, sys, time, datetime as dt
import xml.etree.ElementTree as ET
import httpx

KEY = os.getenv("DATA_GO_KR_KEY", "")
NMC = "https://apis.data.go.kr/B552657"
KMA = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"


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
            {"name": "○○약국", "kind": "약국", "until": "21:00", "dist_m": 350, "tel": "033-000-0000"},
            {"name": "△△의원", "kind": "의원", "until": "18:00", "dist_m": 800, "tel": "033-000-0000"},
            {"name": "지역 응급실", "kind": "응급실", "until": "24시간", "dist_m": 2100, "tel": "033-000-0000"}]}
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    out = []
    common = {"serviceKey": KEY, "WGS84_LON": lon, "WGS84_LAT": lat, "pageNo": 1, "numOfRows": 20}
    for kind, items in (_dh_all() or {}).items():
        for it in items:
            # 지역 목록에는 요일별 운영시간이 있다. 위치 기반 결과처럼 운영시간이 없으면 '운영시간 확인'
            ok, until = _open_now(it, now)
            if ok or "dutyTime1s" not in it:
                out.append({"name": it.get("dutyName"), "kind": kind, "until": until or "운영시간 확인",
                            "dist_m": _dist_m(lat, lon, it["_lat"], it["_lon"]), "tel": it.get("dutyTel1", "")})
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


_MED_CACHE: dict = {}
MED_DIAG: list = []   # 마지막 호출의 결과 코드·메시지·개수 (키는 담지 않는다)


def _items_diag(text: str) -> tuple[list[dict], str, str]:
    """목록과 함께 공공데이터포털의 결과 코드·메시지를 돌려준다 (인증 오류는 OpenAPI_ServiceResponse 형식)."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return [], "", " ".join(text[:80].split())
    g = lambda t: (root.findtext(f".//{t}") or "").strip()
    code = g("resultCode") or g("returnReasonCode")
    msg = g("resultMsg") or g("returnAuthMsg") or g("errMsg")
    return [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")], code, msg


# 동해시 약국·병의원 전체 목록: 지역 목록 조회(시도·시군구)를 먼저 쓰고, 0곳이면 위치 기반 조회로 한 번 더 시도.
# 위치 기반 조회는 키가 정상(00)이어도 0곳을 돌려준 적이 있어(2026-11-20 실서버) 지역 목록을 기본으로 둔다.
LIST = {"약국": ("/ErmctInsttInfoInqireService/getParmacyListInfoInqire", "/ErmctInsttInfoInqireService/getParmacyLcinfoInqire"),
        "병의원": ("/HsptlAsembySearchService/getHsptlMdcncListInfoInqire", "/HsptlAsembySearchService/getHsptlMdcncLcinfoInqire")}
DH_CENTER = (37.5245, 129.1143)


def _fetch(kind: str, diag: list) -> list[dict]:
    lst, loc = LIST[kind]
    tries = [("목록", lst, {"Q0": q0, "Q1": "동해시", "pageNo": 1, "numOfRows": 500}) for q0 in ("강원특별자치도", "강원도")]
    tries.append(("위치", loc, {"WGS84_LON": DH_CENTER[1], "WGS84_LAT": DH_CENTER[0], "pageNo": 1, "numOfRows": 100}))
    for how, path, extra in tries:
        try:
            r = httpx.get(NMC + path, params={"serviceKey": KEY, **extra}, timeout=12)
            items, code, msg = _items_diag(r.text)
            diag.append({"kind": kind, "how": how, "q0": extra.get("Q0", ""), "http": r.status_code, "code": code, "msg": msg, "n": len(items)})
        except Exception as e:
            items = []
            diag.append({"kind": kind, "how": how, "q0": extra.get("Q0", ""), "http": None, "code": "", "msg": type(e).__name__, "n": 0})
        print("[nmc list]", diag[-1], flush=True)
        good = []
        for it in items:
            try:
                la = float(it.get("wgs84Lat") or it.get("latitude")); lo = float(it.get("wgs84Lon") or it.get("longitude"))
            except (TypeError, ValueError):
                continue
            good.append({**it, "_lat": la, "_lon": lo})
        if good:
            return good
    return []


def _dh_all() -> Optional[dict]:
    """{'약국': [...], '병의원': [...]} 1시간 보관. 키가 없거나 둘 다 0곳이면 None."""
    if not KEY:
        return None
    hit = _MED_CACHE.get("raw")
    if hit and time.time() - hit[0] < 3600:
        return hit[1]
    diag: list = []
    got = {k: _fetch(k, diag) for k in LIST}
    MED_DIAG[:] = diag
    if not any(got.values()):
        return None
    _MED_CACHE["raw"] = (time.time(), got)
    return got


def medical_list() -> Optional[list]:
    """편의시설 지도용 약국·병의원 목록 (긴급·도움과 같은 국립중앙의료원 API). 실패하면 None → 화면은 예시 데이터."""
    got = _dh_all()
    if not got:
        return None
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    out = []
    for kind, items in got.items():
        for it in items:
            ok, until = _open_now(it, now)
            out.append({"name": it.get("dutyName"), "kind": kind, "lat": it["_lat"], "lon": it["_lon"], "tel": it.get("dutyTel1", ""),
                        "road": it.get("dutyAddr", ""), "open_now": bool(ok), "until": until, "div": it.get("dutyDivNam", "")})
    return out


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
            if j["temperature_2m_max"][i] is None or j["temperature_2m_min"][i] is None:
                continue   # 예보 끝자락에 값이 빈 날이 있으면 그날만 건너뛴다 (전체를 버리지 않게)
            code, pop, mm = int(j["weather_code"][i] or 0), int(j["precipitation_probability_max"][i] or 0), float(j["precipitation_sum"][i] or 0)
            ko, en, icon = _kind(code)
            wet = code in RAIN_CODES or code in SNOW_CODES
            days.append({"date": d, "code": code, "ko": ko, "en": en, "icon": icon, "pop": pop, "mm": round(mm, 1),
                         "tmax": round(j["temperature_2m_max"][i]), "tmin": round(j["temperature_2m_min"][i]),
                         "wind": round((j["wind_speed_10m_max"][i] or 0) / 3.6, 1),          # m/s
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


def rain_today(lat: float = 37.5245, lon: float = 129.1143) -> dict:
    """오늘 10~18시 중 강수확률 60% 이상인 시간이 있으면 rain=True."""
    if not KEY:
        return {"sample": True, "rain": False, "hours": []}
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    nx, ny = to_grid(lat, lon)
    d, h = _base(now)
    try:
        r = httpx.get(KMA, params={"serviceKey": KEY, "pageNo": 1, "numOfRows": 300, "dataType": "JSON",
                                   "base_date": d, "base_time": h, "nx": nx, "ny": ny}, timeout=5)
        items = r.json()["response"]["body"]["items"]["item"]
    except Exception as e:
        print("[kma]", e); return {"sample": True, "rain": False, "hours": []}
    today = now.strftime("%Y%m%d")
    pops = [(i["fcstTime"], int(i["fcstValue"])) for i in items
            if i["category"] == "POP" and i["fcstDate"] == today and "1000" <= i["fcstTime"] <= "1800"]
    return {"sample": False, "rain": any(p >= 60 for _, p in pops), "hours": pops, "grid": [nx, ny]}
