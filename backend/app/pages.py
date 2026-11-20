"""v4 페이지용 데이터: 장소 상세, 교통 안내, 편의시설 지도, 출처·판정 기준, 행사 달력.

모두 이미 반영한 공공데이터(public_data.json)와 장소 상세(place_details.json)를 다시 묶는 것뿐이라
새로 지어낸 값은 없다. 좌표가 없는 자료는 지도에 찍지 않고 목록으로만 보여 준다.
"""
import datetime as dt
import json
import math
from pathlib import Path

from . import details, engine, public_data
from .schemas import Place

DATA = Path(__file__).resolve().parents[2] / "data"
_T = json.loads((DATA / "public" / "toilets.json").read_text(encoding="utf-8")) if (DATA / "public" / "toilets.json").exists() else {"items": []}
TOILETS = _T["items"]
TOILET_META = {"as_of": _T.get("as_of", ""), "source": _T.get("source", "")}

SEG_KO = {"G": "이동 가능", "Y": "주의", "R": "어려움"}


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
        lv, why = engine.assess(s, m)
        out.append({"name": s.name, "grade": g, "facts": facts, "note": s.note or "", "source": s.source or "", "optional": s.optional,
                    "measured": any(v is not None for v in (s.steps, s.curb_cm, s.slope_deg, s.width_m, s.surface)),
                    "level": lv, "level_name": engine.LEVEL_NAME[lv], "why": why, "uphill_min": uphill_min(s, m)})
    return out


# 휠체어 오르막 참고 속도 (m/s): 김충식 외 2010 그림 3의 근삿값 (젊은 이용자·수동휠체어·오르막만). 내리막·유모차·걷기는 근거 없음 → 계산 안 함
UPHILL = [(4.09, 0.43), (4.76, 0.41), (5.71, 0.385), (7.13, 0.315), (9.46, 0.255)]


def uphill_min(s, mode: str):
    if mode != "wheel" or s.slope_deg is None or not s.distance_m or s.slope_deg < 3.18:
        return None
    v = next((v for lim, v in UPHILL if s.slope_deg <= lim), None)
    return math.ceil(s.distance_m / v / 60) if v else None


def place_page(p: Place, lang: str = "ko", mode: str = "wheel") -> dict:
    now = dt.datetime.now(public_data.KST)
    wd, at = now.isoweekday() % 7, now.hour * 60 + now.minute
    ok, why, _ = details.open_check(p, wd, at, 0)
    today = ("closed" if why == "closed_day" else "always" if why == "always" else "unknown" if why == "unknown"
             else "open" if ok else "closed_now")
    from . import public_apis
    return {"segments": segments(p, mode), "today": today, "hours_text": details.hours_text(p, lang),
            "nearby": details.nearby(p, lang, wd, at), "toilets": toilets_near(p.lat, p.lon),
            "bus_stops": public_apis.bus_stops_near(p.lat, p.lon) if p.type not in ("숙박",) else []}


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
    """편의시설 지도 층: 숙소 · 약국/병원 · 공영주차장 · 관광안내소 · 장애인 화장실 · 충전기."""
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
        "medical": [{**m, "kind": m["kind"] if m["kind"] != "병의원" else (m["div"] or "병의원")} for m in details.MED if m["kind"] != "응급실"],
        "lodging": [{"name": l["name"], "kind": l["kind"], "road": l["address"], "tel": l["tel"], "lat": l["lat"], "lon": l["lon"]}
                    for l in public_data.lodging("", 0)["items"] if l.get("lat")],
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
    datasets.append({"name": "한국관광공사 열린관광 모두의 여행 '떠나자, 감성 뿜뿜 동해로!' (공공누리, 한국관광공사의 저작물에 기초): 무릉계곡·천곡동굴·망상·추암·논골담길·묵호등대 이동약자 구간, 무릉건강숲·망상오토캠핑리조트 편의시설, 식당 3곳 좌석·화장실, 시내버스 번호",
                     "file": "access.visitkorea.or.kr", "count": "장소 14곳", "as_of": "2019 작성 · 2023-09-22 수정"})
    photos = []
    pc = DATA / "photos.csv"
    if pc.exists():
        import csv
        photos = list(csv.DictReader(pc.open(encoding="utf-8")))
    return {"datasets": datasets, "criteria": CRITERIA, "notes": NOTES, "photos": photos}


# 이동 난이도 5단계 (engine.assess 와 같은 값). 1·2 = 이동 가능, 3·4 = 주의(4는 보조 필요), 5 = 통행 불가
CRITERIA = [
    {"item": "경사 (휠체어·유모차)", "l1": "1/18 이하 (3.18°)", "l2": "1/12 이하 (4.76°)", "l3": "1/10 이하 (5.71°) · 높이 15cm 이하면 1/8까지",
     "l4": "1/8 이하 (7.13°) · 1/6 미만 (9.46°)", "l5": "1/6 이상", "law": "법(1/18·1/12) · 김충식 외 2010(1/10·1/8·1/6·높이 15cm)"},
    {"item": "경사 높이", "l1": "", "l2": "", "l3": "높이 0.75m 넘고 중간 참 없으면 한 단계 위", "l4": "", "l5": "", "law": "법(0.75m마다 참)"},
    {"item": "턱 (휠체어·유모차)", "l1": "2cm 이하", "l2": "2cm 이하", "l3": "2~5cm", "l4": "5~10cm", "l5": "10cm 넘음", "law": "법(2cm) · 팀(5·10cm)"},
    {"item": "폭 (휠체어·유모차)", "l1": "1.2m 이상", "l2": "1.2m 이상", "l3": "0.9~1.2m", "l4": "0.7~0.9m", "l5": "0.7m 미만", "law": "법(1.2m·기존 0.9m) · 김충식 외 2010(휠체어 폭 0.7m)"},
    {"item": "계단 (휠체어·유모차)", "l1": "없음", "l2": "없음", "l3": "", "l4": "대체 경로(경사로·승강기) 있음", "l5": "대체 경로 없음", "law": "법(경사로·승강기 대체)"},
    {"item": "노면", "l1": "포장·데크", "l2": "포장·데크", "l3": "자갈·데크 이음새 (걷기: 흙길)", "l4": "", "l5": "모래·흙길·산길 (걷기: 모래·산길)", "law": "팀 기준"},
    {"item": "걷기 불편 — 경사", "l1": "1/18 이하", "l2": "1/12 이하", "l3": "1/8 이하", "l4": "1/8 넘음", "l5": "", "law": "법(1/18·1/12) · 팀(1/8)"},
    {"item": "걷기 불편 — 계단·거리", "l1": "", "l2": "", "l3": "계단 10개 이하 · 300m 넘는 구간", "l4": "", "l5": "계단 10개 넘음", "law": "팀 기준"},
]
NOTES = [
    "단계: 1 매우 쉬움 · 2 쉬움 → 이동 가능 / 3 주의 · 4 보조 필요 → 주의 / 5 통행 불가. 구간에서 가장 어려운 항목이 그 구간의 단계예요.",
    "법 = 장애인·노인·임산부 등의 편의증진 보장에 관한 법률 시행규칙 별표1. 김충식 외 2010 = 「경사로의 기울기와 높이에 따른 휠체어 사용자의 사용성 및 생리적 특성 분석」(대한인간공학회지 29권 4호). 팀 = 근거 문헌이 없어 팀이 정한 값.",
    "휠체어 오르막 참고 시간은 김충식 외 2010의 실험 속도(1/12 약 0.41m/s, 1/8 약 0.32m/s, 젊은 이용자·수동휠체어·오르막만)로 계산해요. 내리막·유모차·걷기는 근거가 없어 계산하지 않아요.",
    "측정값(경사·턱·폭·계단·노면)이 있으면 위 기준으로 계산하고, 없으면 출처 자료의 판정을 그대로 써요.",
    "이름에 '(예시)'가 붙은 식당·카페, '예시 시간'이라고 쓴 영업시간은 확인 전 값입니다.",
    "숙박업소는 공공데이터에 좌표와 객실 접근성 정보가 없어, 이동약자 객실 여부는 '확인 전'으로 둡니다.",
    "장애인 화장실은 공공데이터 주소가 다른 공공데이터(관광명소·주차장·충전기)의 주소와 같을 때만 지도에 표시합니다.",
]
