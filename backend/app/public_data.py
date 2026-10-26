"""팀이 받은 공공데이터(파일데이터)를 서비스에 붙인다.
- data/public/public_data.json 은 scripts/ingest_public.py 가 만든다.
- data/public/place_links.csv 로 길동무 장소 id 와 공공데이터 이름을 잇는다 (팀이 고칠 수 있게 CSV로 둠).
쓰는 곳: 장소 좌표·전화·주소·소개 보정, 장소 상세(주변 향토유산 이야기, 걷기길), 관광안내소(외국어), 행사, 숙박."""
import csv, datetime as dt, json, math
from pathlib import Path
from typing import Optional

from .schemas import Place

DATA = Path(__file__).resolve().parents[2] / "data"
PUB_F = DATA / "public" / "public_data.json"
PUB: dict[str, list[dict]] = json.loads(PUB_F.read_text(encoding="utf-8")) if PUB_F.exists() else {}
KST = dt.timezone(dt.timedelta(hours=9))
ZONE_KO = {"chuam": "추암", "mureung": "무릉", "cheongok": "천곡", "mukho": "묵호", "mangsang": "망상", "station": "동해역 주변"}
ZONE_EN = {"chuam": "Chuam", "mureung": "Mureung", "cheongok": "Cheongok", "mukho": "Mukho", "mangsang": "Mangsang", "station": "Donghae Station area"}
LANG_KO = {"en": "영어", "ja": "일본어", "zh": "중국어"}
LANG_EN = {"en": "English", "ja": "Japanese", "zh": "Chinese", "러시아어": "Russian"}


def dist_m(lat1, lon1, lat2, lon2) -> int:
    p = math.radians
    a = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return int(2 * 6371000 * math.asin(math.sqrt(a)))


def _good(r: dict) -> bool:
    return r.get("lat") is not None and r.get("lon") is not None and not r.get("bad_coords")


def _find(name: str) -> list[dict]:
    """같은 이름의 기록을 관광명소 → 관광지 → 향토유산 순으로 찾는다."""
    return [r for k in ("attractions", "tourist_zones", "heritage", "museums") for r in PUB.get(k, []) if r["name"] == name]


def _links() -> dict[str, dict]:
    f = DATA / "public" / "place_links.csv"
    if not f.exists():
        return {}
    out = {}
    for r in csv.DictReader(f.open(encoding="utf-8-sig")):
        vals = list(r.values())
        out[r["id"]] = {"names": [x for x in (vals[1] or "").split("|") if x], "trails": [x for x in (vals[2] or "").split("|") if x]}
    return out


LINKS = _links()


def enrich(places: dict[str, Place]) -> dict[str, Place]:
    """공식 좌표가 있으면 추정 좌표를 바꾸고, 전화·주소·소개·주차 대수를 채운다.
    places_meta.csv 에는 있지만 예시 데이터에 없던 장소도 공식 좌표가 있으면 추가한다(접근성은 '확인 전')."""
    meta = {r["id"]: r for r in csv.DictReader((DATA / "places_meta.csv").open(encoding="utf-8-sig"))}
    en = {r["id"]: r["영문(초안)"] for r in csv.DictReader((DATA / "place_names_en.csv").open(encoding="utf-8-sig"))}
    for pid, link in LINKS.items():
        recs = [r for n in link["names"] for r in _find(n)]
        good = [r for r in recs if _good(r)]
        p = places.get(pid)
        if p is None:
            if not good or pid not in meta:
                continue
            m = meta[pid]
            p = places[pid] = Place(id=pid, name_ko=m["name_ko"], name_en=en.get(pid, ""), zone=m["zone"], type=m["type"],
                                    indoor=m.get("indoor") == "Y", styles=[s for s in m.get("styles", "").split("|") if s])
        if good:
            p.lat, p.lon = good[0]["lat"], good[0]["lon"]
            p.coord_source = good[0]["source"]
        for r in recs:
            p.phone = p.phone or r.get("tel", "")
            p.address = p.address or r.get("road") or r.get("jibun", "")
            if r.get("intro") and not p.intro_ko:
                p.intro_ko, p.intro_source = r["intro"], r["source"]
            if r.get("parking") and p.parking is None:
                p.parking = int(r["parking"])
            if r.get("open") and not p.hours:   # 박물관·미술관: 관람시간·휴관·요금
                p.hours, p.closed_days = f"{r['open']}~{r['close']}", r.get("closed", "")
                p.fee = r.get("fee_note") or (f"어른 {int(r['fee_adult'])}원" if r.get("fee_adult") else "")
            if r.get("public_facilities") and not p.public_facilities:
                p.public_facilities = [x.strip() for x in r["public_facilities"].split(",") if x.strip()]
        p.trails = link["trails"]
    return places


# ---------- 장소 주변 정보 ----------
def stories(lat: Optional[float], lon: Optional[float], radius: int = 600, limit: int = 4) -> list[dict]:
    """주변 향토문화유산 (장소 상세의 '알고 가면 좋은 이야기')."""
    if lat is None:
        return []
    hs = [{**h, "dist_m": dist_m(lat, lon, h["lat"], h["lon"])} for h in PUB.get("heritage", []) if _good(h)]
    hs = sorted((h for h in hs if h["dist_m"] <= radius), key=lambda h: h["dist_m"])
    return [{"name": h["name"], "kind": h["kind"], "era": h["era"], "intro": h["intro"], "dist_m": h["dist_m"]} for h in hs[:limit]]


def trails(names: list[str] | None = None) -> list[dict]:
    ts = PUB.get("trails", [])
    if names is not None:
        ts = [t for t in ts if t["name"] in names]
    return [{"name": t["name"], "intro": t["intro"], "length_km": t["length_km"], "duration": t["duration"],
             "route": t["route"], "start": t["start"], "end": t["end"], "tel": t["tel"]} for t in ts]


def _hours(c: dict, now: dt.datetime) -> tuple[str, str]:
    winter = now.month in (11, 12, 1, 2, 3)
    return (c["open_winter"], c["close_winter"]) if winter else (c["open_summer"], c["close_summer"])


def info_centers(lat: float, lon: float, lang: str = "ko", limit: int = 3, now: Optional[dt.datetime] = None) -> list[dict]:
    """가까운 관광안내소. 운영시간이 이상한 시설(캠핑장 등 입실·퇴실 시각)은 '확인 필요'로 둔다."""
    now = now or dt.datetime.now(KST)
    out = []
    for c in PUB.get("info_centers", []):
        if not _good(c):
            continue
        langs = [k for k in ("en", "ja", "zh") if c.get(k)] + ([c["other_lang"]] if c.get("other_lang") else [])
        names = LANG_EN if lang == "en" else LANG_KO
        o, cl = _hours(c, now)
        if c.get("hours_suspect"):
            status, hours = "check", ""
        else:
            hm = now.strftime("%H:%M")
            status, hours = ("open" if o <= hm < cl else "closed"), f"{o}~{cl}"
        out.append({"name": c["name"], "spot": c["spot"], "tel": c["tel"], "hours": hours, "status": status,
                    "closed_days": c["closed"], "languages": [names.get(x, x) for x in langs],
                    "tourist_info": not c.get("hours_suspect"), "interpret": "통역" in (c.get("service") or ""),
                    "dist_m": dist_m(lat, lon, c["lat"], c["lon"])})
    # 진짜 관광안내소를 먼저, 그다음 거리순
    # 진짜 관광안내소 → (영어 화면이면) 외국어 안내가 되는 곳 → 거리 순
    return sorted(out, key=lambda x: (not x["tourist_info"], lang == "en" and not x["languages"], x["dist_m"]))[:limit]


def events(today: Optional[str] = None) -> dict:
    today = today or dt.datetime.now(KST).strftime("%Y-%m-%d")
    evs = PUB.get("events", [])
    up = sorted((e for e in evs if (e["end"] or e["start"]) >= today), key=lambda e: e["start"])
    return {"as_of": max((e["as_of"] for e in evs), default=""), "today": today,
            "upcoming": [{k: e.get(k) for k in ("name", "venue", "kind", "start", "end", "start_time", "end_time", "fee_type", "fee", "age", "tel", "ticket", "url", "lat", "lon", "festival")} for e in up]}


def events_near(lat, lon, radius: int = 800, today: Optional[str] = None) -> list[dict]:
    if lat is None:
        return []
    return [e for e in events(today)["upcoming"] if e.get("lat") and dist_m(lat, lon, e["lat"], e["lon"]) <= radius]


def lodging(zone: str = "", limit: int = 0) -> dict:
    """숙박업소(공중위생업소 중 숙박업). 좌표가 없어 권역으로만 묶고, 접근성은 확인 전이다."""
    seen, ls = set(), []
    for l in sorted(PUB.get("lodging", []), key=lambda l: not l.get("tourist")):   # 관광숙박업 등록 업소를 먼저
        if (not zone or l["zone"] == zone) and l["name"] not in seen:
            seen.add(l["name"]); ls.append(l)
    items = [{"name": l["name"], "kind": l["kind"], "address": l.get("road") or l.get("jibun", ""), "tel": l["tel"], "zone": l["zone"],
              "tourist": bool(l.get("tourist"))} for l in ls]
    return {"count": len(items), "zone": zone, "accessibility": "확인 전", "items": items[:limit] if limit else items}


def sources() -> list[dict]:
    seen = {}
    for kind, recs in PUB.items():
        for r in recs:
            s = seen.setdefault(r["source"], {"name": r["source"], "count": 0, "as_of": ""})
            s["count"] += 1
            s["as_of"] = max(s["as_of"], r.get("as_of", ""))
    return list(seen.values())


# ---------- 2차 데이터: 이동·편의 ----------
def _near(kind: str, lat, lon, radius: int):
    if lat is None:
        return []
    rs = [{**r, "dist_m": dist_m(lat, lon, r["lat"], r["lon"])} for r in PUB.get(kind, []) if _good(r)]
    return sorted((r for r in rs if r["dist_m"] <= radius), key=lambda r: r["dist_m"])


def signals_near(lat, lon, radius: int = 300) -> dict:
    """주변 신호등 중 잔여시간 표시기·시각장애인용 음향신호기 수 (신호등 1개 = 신호등 머리 1개 기준)."""
    sg = _near("signals", lat, lon, radius)
    return {"radius_m": radius, "total": len(sg), "countdown": sum(s["countdown"] for s in sg), "audio": sum(s["audio"] for s in sg)}


def _open_today(r: dict, now: dt.datetime) -> tuple[bool, str]:
    wd = now.isoweekday()
    o, c = (r["sat_open"], r["sat_close"]) if wd == 6 else (r["hol_open"], r["hol_close"]) if wd == 7 else (r["wk_open"], r["wk_close"])
    if not o or o == c:            # 00:00~00:00 = 그날은 운영하지 않음
        return False, ""
    hm = now.strftime("%H:%M")
    return o <= hm < c, f"{o}~{c}"


def chargers(lat, lon, limit: int = 2, now: Optional[dt.datetime] = None) -> list[dict]:
    """전동휠체어 급속충전기. 공휴일은 날짜만으로 알 수 없어 일요일과 같이 본다."""
    now = now or dt.datetime.now(KST)
    out = []
    for r in _near("wheelchair_chargers", lat, lon, 50000)[:limit]:
        ok, hours = _open_today(r, now)
        out.append({"name": r["name"], "spot": r["spot"], "address": r["road"], "tel": r["tel"], "slots": r["slots"],
                    "open_now": ok, "hours_today": hours, "weekday_hours": f"{r['wk_open']}~{r['wk_close']}",
                    "phone_charge": r["phone_charge"], "dist_m": r["dist_m"]})
    return out


def parking_near(lat, lon, radius: int = 800, limit: int = 2) -> list[dict]:
    return [{"name": r["name"], "spaces": int(r["spaces"] or 0), "fee_type": r["fee_type"],
             "fee": f"{int(r['base_min'])}분 {int(r['base_fee'])}원" if r.get("base_fee") else "",
             "disabled_free": "장애" in (r.get("note") or ""), "note": r.get("note", ""), "dist_m": r["dist_m"]}
            for r in _near("parking", lat, lon, radius)[:limit]]


# 택시 승차대 이름(상세위치) → 길동무 장소
TAXI_PLACE = {"추암해변 입구": ["chotdae", "chuam_bridge", "haeamjeong", "chuam_sculpture", "chuam_camp"],
              "무릉계곡 주차장": ["valley", "samhwasa", "yongchu", "mureung_camp", "forest"],
              "망상해변 입구": ["mangsang", "mangsang_camp", "mangsang_hanok"],
              "동쪽바다중앙시장 입구": ["central_market", "mukho_port", "nongol", "mukho_lighthouse"],
              "묵호항여객선터미널": ["mukho_port", "dokkaebi", "haerang"], "묵호역": [], "동해역": [], "종합버스터미널": []}


def taxi_for(pid: str) -> list[dict]:
    return [{"name": t["name"], "address": t["road"], "spaces": int(t["spaces"] or 0)}
            for t in PUB.get("taxi_stands", []) if pid in TAXI_PLACE.get(t["name"], [])]


def taxi_at_start(start: str) -> Optional[dict]:
    t = next((t for t in PUB.get("taxi_stands", []) if t["name"] == start), None)
    return {"name": t["name"], "address": t["road"], "spaces": int(t["spaces"] or 0)} if t else None


# 시티투어 정류장 이름 → 길동무 장소
TOUR_PLACE = {"동쪽바다중앙시장": ["central_market", "mukho_port"], "묵호시장": ["nongol", "mukho_lighthouse", "dokkaebi", "haerang"],
              "망상해변": ["mangsang", "mangsang_camp", "mangsang_hanok"], "천곡황금박쥐동굴": ["cave"], "무릉별유천지": ["mureung"],
              "무릉계곡": ["valley", "samhwasa", "yongchu", "forest", "mureung_camp"],
              "추암해변": ["chotdae", "chuam_bridge", "haeamjeong", "chuam_sculpture", "chuam_camp"], "감추사": ["gamchu", "hanseom"]}


def city_tour(stop_ids: list[str] | None = None) -> Optional[dict]:
    """동해 시티투어(순환형). 코스 장소 중 몇 곳을 지나는지도 알려 준다. 휠체어 탑승 가능 여부는 자료에 없음."""
    ct = (PUB.get("city_tour") or [None])[0]
    if not ct:
        return None
    import re
    stops = [x.strip() for x in re.split(r"\s*-\s+|\s+-\s*|\)-", ct["route"]) if x.strip()]
    stops = [x + ")" if x.count("(") > x.count(")") else x for x in stops]
    served = set()
    for st in stops:
        for key, ids in TOUR_PLACE.items():
            if key in st:
                served |= set(ids)
    cover = [i for i in (stop_ids or []) if i in served]
    return {"name": ct["name"], "board": ct["board"], "days": ct["days"], "first": ct["first"], "last": ct["last"],
            "interval_min": ct["interval_min"], "fare": ct["fare"].replace("+", " · "), "contact": ct["contact"], "url": ct["url"],
            "stops": stops, "covers": cover, "wheelchair": "확인 전"}


def restaurants(zone: str, kinds: list[str] | None = None, limit: int = 5) -> dict:
    rs = [r for r in PUB.get("restaurants", []) if r["zone"] == zone and (not kinds or r["kind"] in kinds)]
    from collections import Counter
    return {"zone": zone, "count": len(rs), "by_kind": Counter(r["kind"] for r in rs).most_common(5), "accessibility": "확인 전",
            "items": [{"name": r["name"], "kind": r["kind"], "address": r["road"] or r["jibun"], "tel": r["tel"]} for r in rs[:limit]]}


def stats() -> dict:
    """발표용 수치 (받은 데이터에서 바로 계산)."""
    sg = PUB.get("signals", [])
    return {"signals": len(sg), "signals_audio": sum(s["audio"] for s in sg), "signals_countdown": sum(s["countdown"] for s in sg),
            "wheelchair_chargers": len(PUB.get("wheelchair_chargers", [])),
            "chargers_weekend": sum(1 for c in PUB.get("wheelchair_chargers", []) if c["sat_open"] != c["sat_close"]),
            "info_centers_foreign": sum(1 for c in PUB.get("info_centers", []) if c.get("en") and not c.get("hours_suspect")),
            "lodging": len(PUB.get("lodging", [])), "restaurants": len(PUB.get("restaurants", [])),
            "parking_lots": len(PUB.get("parking", [])),
            "mobility_wheelchair_vehicles": (mobility_center() or {}).get("wheelchair_vehicles", 0),
            "tourist_lodging": sum(1 for l in PUB.get("lodging", []) if l.get("tourist")),
            "parking_disabled_zone_listed": sum(1 for p in PUB.get("parking", []) if (p.get("disabled_zone") or "").upper() == "Y")}


# ---------- 3차 데이터 ----------
def mobility_center() -> Optional[dict]:
    """교통약자 이동지원(특별교통수단). 이용 대상이 정해져 있어 관광객은 등록·자격 확인이 먼저다."""
    m = (PUB.get("mobility_center") or [None])[0]
    if not m:
        return None
    return {"name": m["name"], "tel": m["tel"], "app": m["app"], "web": m["web"], "vehicles": int(m["vehicles"] or 0),
            "wheelchair_vehicles": int((m["slope"] or 0) + (m["lift"] or 0)), "hours": f"{m['run_open']}~{m['run_close']}",
            "advance": m["advance"], "area_out": m["area_out"], "fare": m["fare"].replace("+", " · "), "who": m["who"],
            "office_tel": m["office_tel"]}


def parks_near(lat, lon, radius: int = 500, limit: int = 1) -> list[dict]:
    """쉬어 갈 공원 (편의시설 열은 자료에 비어 있어 이름·거리만)."""
    return [{"name": r["name"], "kind": r["kind"], "dist_m": r["dist_m"]} for r in _near("parks", lat, lon, radius)[:limit]]


def rentals_near(lat, lon, radius: int = 1500, limit: int = 3) -> list[dict]:
    return [{"name": r["name"], "tel": r["tel"], "cars": int(r["cars"] or 0), "vans": int(r["vans"] or 0),
             "weekday": f"{r['wk_open']}~{r['wk_close']}", "weekend": f"{r['we_open']}~{r['we_close']}", "dist_m": r["dist_m"]}
            for r in _near("rentals", lat, lon, radius) if r["cars"]][:limit]
