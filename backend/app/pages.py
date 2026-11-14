"""v4 페이지용 데이터: 장소 상세, 교통 안내, 편의시설 지도, 출처·판정 기준, 행사 달력.

모두 이미 반영한 공공데이터(public_data.json)와 장소 상세(place_details.json)를 다시 묶는 것뿐이라
새로 지어낸 값은 없다. 좌표가 없는 자료는 지도에 찍지 않고 목록으로만 보여 준다.
"""
import datetime as dt
import json
from pathlib import Path

from . import details, engine, public_data
from .schemas import Place

DATA = Path(__file__).resolve().parents[2] / "data"
_T = json.loads((DATA / "public" / "toilets.json").read_text(encoding="utf-8")) if (DATA / "public" / "toilets.json").exists() else {"items": []}
TOILETS = _T["items"]
TOILET_META = {"as_of": _T.get("as_of", ""), "source": _T.get("source", "")}

SEG_KO = {"G": "갈 수 있어요", "Y": "주의", "R": "어려워요"}


def toilets(with_coords_only: bool = False) -> list[dict]:
    return [t for t in TOILETS if t.get("lat") or not with_coords_only]


def toilets_near(lat, lon, radius: int = 1500, limit: int = 2) -> list[dict]:
    if lat is None:
        return []
    out = []
    seen = set()
    for t in sorted((t for t in TOILETS if t.get("lat")), key=lambda t: public_data.dist_m(lat, lon, t["lat"], t["lon"])):
        d = public_data.dist_m(lat, lon, t["lat"], t["lon"])
        if d > radius or (t["lat"], t["lon"]) in seen:
            continue
        seen.add((t["lat"], t["lon"]))
        out.append({**t, "dist_m": d})
        if len(out) >= limit:
            break
    return out


def segments(p: Place, mode: str) -> list[dict]:
    """장소 상세: 도착부터 떠날 때까지 구간별 판정과 측정값."""
    m = mode if mode in ("wheel", "stroller", "walk") else "wheel"
    out = []
    for s in p.segments:
        g = engine.grade_segment(s, m)
        facts = []
        if s.distance_m: facts.append(f"{s.distance_m:g}m")
        if s.steps: facts.append(f"계단 {s.steps}개" + (" (우회로 있음)" if s.alt_route else ""))
        if s.curb_cm is not None: facts.append(f"턱 {s.curb_cm:g}cm")
        if s.slope_deg is not None: facts.append(f"경사 {s.slope_deg:g}°")
        if s.width_m is not None: facts.append(f"폭 {s.width_m:g}m")
        if s.surface: facts.append(s.surface)
        out.append({"name": s.name, "grade": g, "facts": facts, "note": s.note or "", "source": s.source or "",
                    "measured": any(v is not None for v in (s.steps, s.curb_cm, s.slope_deg, s.width_m, s.surface))})
    return out


def place_page(p: Place, lang: str = "ko", mode: str = "wheel") -> dict:
    now = dt.datetime.now(public_data.KST)
    wd, at = now.isoweekday() % 7, now.hour * 60 + now.minute
    ok, why, _ = details.open_check(p, wd, at, 0)
    today = ("closed" if why == "closed_day" else "always" if why == "always" else "unknown" if why == "unknown"
             else "open" if ok else "closed_now")
    return {"segments": segments(p, mode), "today": today, "hours_text": details.hours_text(p, lang),
            "nearby": details.nearby(p, lang, wd, at), "toilets": toilets_near(p.lat, p.lon)}


def transport(lang: str = "ko") -> dict:
    P = public_data.PUB
    stations = []
    for name, xy in engine.STARTS.items():
        if name == "자가용":
            continue
        stations.append({"name": name, "lat": xy[0], "lon": xy[1], "taxi": public_data.taxi_at_start(name),
                         "toilet": next((t for t in TOILETS if t["name"] == name), None),
                         "rentals": public_data.rentals_near(xy[0], xy[1])})
    parking = [{**{k: r.get(k) for k in ("name", "road", "spaces", "fee_type", "base_min", "base_fee", "wk_open", "wk_close", "tel", "lat", "lon")},
                "disabled": ("면제" + (" (2시간 넘으면 반값)" if "반값" in (r.get("note") or "") else "")) if "장애인" in (r.get("note") or "") and "면제" in (r.get("note") or "") else ""}
               for r in P.get("parking", [])]
    return {"stations": stations, "mobility_center": public_data.mobility_center(),
            "city_tour": (P.get("city_tour") or [None])[0], "city_tour_stops": public_data.city_tour([])["stops"],
            "taxi_stands": [{k: r.get(k) for k in ("name", "road", "spaces", "zone")} for r in P.get("taxi_stands", [])],
            "rentals": [{k: r.get(k) for k in ("name", "road", "cars", "vans", "wk_open", "wk_close", "we_open", "we_close", "tel")} for r in P.get("rentals", [])],
            "parking": sorted(parking, key=lambda r: (-(int(r.get("spaces") or 0)), r["name"])),
            "chargers": facilities()["chargers"]}


def facilities() -> dict:
    """편의시설 지도 층: 장애인 화장실 · 충전기 · 공영주차장 · 관광안내소 · 약국/병원(예시)."""
    P = public_data.PUB
    return {
        "toilets": TOILETS, "toilet_meta": TOILET_META,
        "chargers": [{k: r.get(k) for k in ("name", "spot", "road", "lat", "lon", "wk_open", "wk_close", "sat_open", "sat_close", "hol_open", "hol_close", "slots", "air", "tel")} for r in P.get("wheelchair_chargers", [])],
        "parking": [{**{k: r.get(k) for k in ("name", "road", "spaces", "fee_type", "lat", "lon")}, "disabled": "장애인" in (r.get("note") or "")} for r in P.get("parking", []) if r.get("lat")],
        "info_centers": [{"name": c["name"], "spot": c.get("spot"), "tel": c.get("tel"), "lat": c["lat"], "lon": c["lon"],
                          "languages": [k for k in ("en", "ja", "zh") if c.get(k)], "tourist_info": not c.get("hours_suspect"),
                          "hours": "" if c.get("hours_suspect") else f"{c.get('open_summer')}~{c.get('close_summer')} (여름) / {c.get('open_winter')}~{c.get('close_winter')} (겨울)",
                          "closed": c.get("closed")}
                         for c in P.get("info_centers", []) if c.get("lat") and public_data._good(c)],
        "medical": [{**m, "sample": True} for m in details.MED],
    }


def sources() -> dict:
    """출처·판정 기준 페이지."""
    P = public_data.PUB
    rep = (DATA / "public" / "report.md")
    datasets = []
    if rep.exists():
        for line in rep.read_text(encoding="utf-8").splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) == 5 and cells[0] not in ("종류", "---") and not set(cells[0]) <= {"-"}:
                datasets.append({"name": cells[0], "file": cells[1], "count": cells[3], "as_of": cells[4]})
    datasets.append({"name": "전국공중화장실표준데이터 (동해시, 장애인용 변기 있음)", "file": "공공데이터포털", "count": str(len(TOILETS)), "as_of": TOILET_META["as_of"]})
    photos = []
    pc = DATA / "photos.csv"
    if pc.exists():
        import csv
        photos = list(csv.DictReader(pc.open(encoding="utf-8")))
    return {"datasets": datasets, "criteria": CRITERIA, "notes": NOTES, "photos": photos}


CRITERIA = [
    {"item": "경사로 기울기", "ok": "1/18 이하 (약 3.2°)", "warn": "1/12 이하 (약 4.8°)까지", "no": "1/8 넘음 (약 7.1°)", "law": "장애인등편의법 시행규칙 별표1"},
    {"item": "출입구·통로 턱", "ok": "2cm 이하", "warn": "2~5cm", "no": "5cm 넘음", "law": "장애인등편의법 시행규칙 별표1"},
    {"item": "통로 폭", "ok": "1.2m 이상", "warn": "0.9~1.2m", "no": "0.9m 미만", "law": "장애인등편의법 시행규칙 별표1"},
    {"item": "계단", "ok": "없음", "warn": "있지만 우회로·경사로 있음", "no": "우회로 없음", "law": "현장 답사 기준"},
    {"item": "바닥", "ok": "포장·데크", "warn": "자갈·데크 이음새", "no": "모래·흙길·산길", "law": "현장 답사 기준"},
]
NOTES = [
    "판정은 측정값이 있으면 위 기준으로 계산하고, 없으면 답사 때 기록한 판정을 씁니다. 정보가 없으면 '주의'로 둡니다.",
    "이름에 '(예시)'가 붙은 식당·카페·약국·병원, '예시 시간'이라고 쓴 영업시간은 확인 전 값입니다.",
    "숙박업소는 공공데이터에 좌표와 객실 접근성 정보가 없어, 무장애 객실 여부는 '확인 전'으로 둡니다.",
    "장애인 화장실은 공공데이터 주소가 다른 공공데이터(관광명소·주차장·충전기)의 주소와 같을 때만 지도에 표시합니다.",
]
