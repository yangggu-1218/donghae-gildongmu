"""추천 엔진: 장소를 고르는 건 코드가, 말은 AI가 한다.
판정 기준은 장애인등편의법 시행규칙 별표 1(기울기 1/12≈4.8°, 턱 2cm, 문 폭 0.9m)과 팀 규칙(데이터·답사 시트 참고)."""
import math
from .schemas import Segment, Place, Conditions, Course, Stop, Mode

RANK = {"G": 0, "Y": 1, "R": 2}
STARTS = {  # 출발점 좌표 (WGS84)
    "동해역": (37.498198, 129.123794),   # 2026-11 역 좌표 바로잡음 (gangRG님)
    "묵호역": (37.546824, 129.107692),
    "동해종합버스터미널": (37.5213, 129.1137),   # city.py LANDMARKS '동해버스터미널'과 같음
    "자가용": (37.498198, 129.123794),
}
START_TIME = 10 * 60   # 10:00 출발 (남은 과제: 사용자가 고르게)


def worst(grades):
    gs = [g for g in grades if g]
    return max(gs, key=lambda g: RANK[g]) if gs else None


# ---------------- 이동 난이도 5단계 (docs/22_ACCESS_GRADING.md) ----------------
# 1 매우 쉬움 · 2 쉬움 → G / 3 주의 · 4 보조 필요 → Y / 5 통행 불가 → R
# 근거: 법 = 장애인등편의법 시행규칙 별표1 (접근로 1/18, 부득이 1/12, 단차 2cm, 유효폭 1.2m·기존 0.9m, 경사로 높이 0.75m마다 참)
#       김충식 외 2010 = 「경사로의 기울기와 높이에 따른 휠체어 사용자의 사용성 및 생리적 특성 분석」 대한인간공학회지 29(4)
#       팀 = 근거 문헌이 없어 팀이 정한 값 (화면에 '팀 기준'으로 밝힘)
LEVEL_NAME = {1: "매우 쉬움", 2: "쉬움", 3: "주의", 4: "보조 필요", 5: "통행 불가"}
LEVEL_GRADE = {1: "G", 2: "G", 3: "Y", 4: "Y", 5: "R"}
GRADE_LEVEL = {"G": 2, "Y": 3, "R": 5}            # 측정값 없이 자료가 정한 등급
SLOPE = [(3.18, 1, "1/18 이하 — 법: 접근로 기준"), (4.76, 2, "1/12 이하 — 법: 경사로 기준"),
         (5.71, 3, "1/10 이하 — 김충식 외 2010: 1/12와 차이 작음"), (7.13, 4, "1/8 이하 — 김충식 외 2010: 높이 15cm 넘으면 부담 큼"),
         (9.46, 4, "1/6 미만 — 김충식 외 2010: 사용성 크게 낮음")]


def _ratio(deg: float) -> str:
    t = math.tan(math.radians(deg))
    return f"1/{round(1 / t)}" if t > 0 else "평지"


def assess(s: Segment, mode: Mode) -> tuple[int, list[str]]:
    """측정값으로 5단계와 그 까닭(근거)을 낸다. 측정값이 없으면 자료의 등급(G/Y/R)을 단계로 옮긴다."""
    measured = any(v is not None for v in (s.steps, s.curb_cm, s.slope_deg, s.width_m, s.surface))
    if not measured:
        return GRADE_LEVEL.get(s.grade or "Y", 3), ["측정값 없음 — 자료(" + (s.source or "출처 없음") + ") 판정"]
    lv, why = 1, []

    def up(n, text):
        nonlocal lv
        if n > lv:
            lv = n
        if n >= 3:
            why.append(text)
    surface = (s.surface or "").strip()
    if s.slope_deg is not None:
        deg = s.slope_deg
        if mode == "walk":       # 걷기: 법의 1/12까지 쉬움, 그 위는 휠체어 근거 준용 없이 '주의'·'보조 필요'(팀)
            n = 1 if deg <= 3.18 else 2 if deg <= 4.76 else 3 if deg <= 7.13 else 4
            up(n, f"경사 {deg:g}°({_ratio(deg)}) — " + ("법 기준 초과 (팀: 걷기 주의)" if n == 3 else "급경사 (팀: 보조 필요)"))
        else:
            n, txt = 5, "1/6 이상 — 김충식 외 2010: 지양"
            for lim, lv_, t in SLOPE:
                if deg <= lim:
                    n, txt = lv_, t
                    break
            if n == 4 and deg <= 7.13 and s.rise_m is not None and s.rise_m <= 0.15:
                n, txt = 3, "1/8 이하·높이 15cm 이하 — 김충식 외 2010: 완화 가능"
            if 2 <= n <= 3 and s.rise_m is not None and s.rise_m > 0.75:
                n, txt = n + 1, txt + " · 높이 0.75m 초과 — 법: 중간 참 필요"
            up(n, f"경사 {deg:g}°({_ratio(deg)}) — {txt}")
    if s.curb_cm is not None and s.curb_cm > 2:
        if mode == "walk":
            up(3 if s.curb_cm <= 5 else 4, f"턱 {s.curb_cm:g}cm — 법 기준(2cm) 초과")
        else:
            n = 3 if s.curb_cm <= 5 else 4 if s.curb_cm <= 10 else 5
            up(n, f"턱 {s.curb_cm:g}cm — 법 기준(2cm) 초과" + ("" if n == 3 else " (팀: 5cm 넘으면 보조, 10cm 넘으면 불가)"))
    if s.width_m is not None and mode != "walk" and s.width_m < 1.2:
        n = 3 if s.width_m >= 0.9 else 4 if s.width_m >= 0.7 else 5
        up(n, f"폭 {s.width_m:g}m — " + ("법: 기존 시설 완화(0.9m) 수준" if n == 3 else "김충식 외 2010: 휠체어 폭 0.7m" + (" 미만" if n == 5 else " 근접")))
    if (s.steps or 0) > 0:
        if mode == "walk":
            up(3 if s.steps <= 10 else 5, f"계단 {s.steps}개" + (" (팀: 10개 넘으면 계단이 어려운 분은 통행 불가)" if s.steps > 10 else ""))
        elif s.alt_route:
            up(4, f"계단 {s.steps}개 · 대체 경로({s.alt_route}) — 법: 경사로·승강기로 대체")
        else:
            up(5, f"계단 {s.steps}개 · 대체 경로 없음")
    if surface in ("모래", "흙길", "산길"):
        up(5 if mode != "walk" or surface in ("모래", "산길") else 3, f"노면 {surface} (팀 기준)")
    elif surface in ("자갈", "데크 이음새"):
        up(3, f"노면 {surface} (팀 기준)")
    if mode == "walk" and (s.distance_m or 0) > 300:
        up(3, f"거리 {s.distance_m:g}m (팀: 300m 넘으면 주의)")
    return lv, why


def grade_segment(s: Segment, mode: Mode) -> str:
    """5단계를 G/Y/R로. 측정값이 없으면 자료의 등급을 그대로 (어르신 모드도 '불가'를 낮추지 않음)."""
    lv, _ = assess(s, mode)
    g = LEVEL_GRADE[lv]
    measured = any(v is not None for v in (s.steps, s.curb_cm, s.slope_deg, s.width_m, s.surface))
    if not measured:
        g = s.grade or "Y"
        if mode == "walk" and (s.distance_m or 0) > 300:
            g = worst([g, "Y"])
    return g


def grade_place(p: Place, mode: Mode, less_walk: bool = False):
    if mode == "none":
        return None
    segs = [s for s in p.segments if not s.optional] or p.segments
    if less_walk:   # 긴 걷기 구간(300m 초과 또는 '전망' 구간)은 빼고 판정
        segs = [s for s in segs if not ((s.distance_m or 0) > 300 or "전망 데크" in s.name)] or segs
    g = worst(grade_segment(s, mode) for s in segs) or "Y"
    if (p.access_scope.get(mode) or {}).get("level") in ("입구까지", "관람 불가"):   # 출처상 안으로 못 들어가면 불가
        g = "R"
    return g


def why_not(p: Place, mode: Mode) -> str:
    """갈 수 없는 이유 한 줄: 출처의 접근 범위 메모, 없으면 첫 '불가' 구간."""
    sc = (p.access_scope.get(mode) or {}).get("note")
    if sc:
        return sc
    r = next((s for s in p.segments if not s.optional and grade_segment(s, mode) == "R"), None)
    return (f"{r.name}: {r.note}" if r.note else r.name) if r else ""


def mode_from(move: list[str]) -> Mode:
    if "휠체어" in move: return "wheel"
    if "유모차" in move: return "stroller"
    if "오래 걷기 어려움" in move or "계단 어려움" in move: return "walk"
    return "none"


def drive_min(a, b) -> int:
    """직선거리 x 1.4 를 시속 35km로 달린다고 보고 주차 5분을 더한 추정값.
    본선 전에는 scripts/travel_matrix.py 로 만든 이동 시간표로 바꾼다."""
    (la1, lo1), (la2, lo2) = a, b
    r = 6371.0
    d = 2 * r * math.asin(math.sqrt(math.sin(math.radians(la2 - la1) / 2) ** 2 +
                                    math.cos(math.radians(la1)) * math.cos(math.radians(la2)) *
                                    math.sin(math.radians(lo2 - lo1) / 2) ** 2))
    return round(d * 1.4 / 35 * 60) + 5


_MATRIX = None


def drive(from_id: str, from_xy, p: Place) -> int:
    """data/travel_matrix.json(scripts/travel_matrix.py)이 있으면 그 값을, 없으면 추정값을 쓴다."""
    global _MATRIX
    if _MATRIX is None:
        from pathlib import Path
        import json
        f = Path(__file__).resolve().parents[2] / "data" / "travel_matrix.json"
        _MATRIX = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    if from_id in _MATRIX and p.id in _MATRIX[from_id]:
        return _MATRIX[from_id][p.id]
    return drive_min(from_xy, (p.lat, p.lon)) if p.lat else 15


def q15(m: int) -> int:
    """시간표는 15분 단위로 (11:16 → 11:30). 남는 몇 분은 이동·주차 여유가 된다."""
    return -(-m // 15) * 15


def hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def score(p: Place, c: Conditions, rain: bool) -> float:
    s = 0.0
    s += 2.0 * len(set(p.styles) & set(c.style))
    if c.weather_pref == "실외":         # 바깥을 직접 고르면 예보보다 그 선택을 따른다
        s += 1.5 if not p.indoor else -1.0
    elif rain or c.weather_pref == "실내":   # 비 예보이거나 실내를 골랐으면 실내 먼저
        s += 3.0 if p.indoor else -2.0
    if p.sample:                         # 예시 장소는 실제 장소가 없을 때만
        s -= 4.0
    if p.id in c.wish:
        s += 10.0
    if any(seg.source == "현장 답사" for seg in p.segments):
        s += 1.0                         # 직접 확인한 곳을 조금 더 믿는다
    if c.who in ("부모님과", "아이와") and "체험" in p.styles:
        s += 1.0
    mode = mode_from(c.move)
    if mode != "none":                   # 이동이 불편하면 평지·벤치 있는 곳을 먼저, '주의'보다 '가능'을 먼저
        s += {"평지": 1.5, "완만한경사": 0.5}.get(p.walk_load, 0.0) + (0.5 if p.benches else 0.0)
        if grade_place(p, mode, "오래 걷기 어려움" in c.move) == "Y":
            s -= 3.0
    if c.toilet_first and any("장애인 화장실" in f for f in p.facilities):
        s += 1.5
    if p.type in ("식당", "카페"):
        if "부드러운 메뉴" in c.meal and p.soft_menu: s += 2.0
        if "입식" in c.meal and p.table == "입식": s += 1.0     # 혼합보다 완전 입식을 먼저
        if "주차 편한 곳" in c.meal and p.parking_easy: s += 2.0
    return s


# ---------------- 날짜·요일 ----------------
import datetime as _dt
KST = _dt.timezone(_dt.timedelta(hours=9))


def trip_date(c: Conditions) -> _dt.date:
    if c.date:
        try:
            return _dt.date.fromisoformat(c.date)
        except ValueError:
            pass
    return _dt.datetime.now(KST).date()


def weekday_of(d: _dt.date) -> int:
    return d.isoweekday() % 7          # 0=일 ~ 6=토


def _mins(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def rain_for(c: Conditions) -> bool:
    """비 판단: 사용자가 말한 값이 먼저, 없으면 그 날짜의 일별 예보."""
    if c.rain is not None:
        return bool(c.rain)
    from . import public_apis
    return public_apis.rain_on(trip_date(c).isoformat())


MAX_REPLAN = 3   # 카카오 이동시간을 넣었더니 문 닫는 곳이 생기면 그곳을 빼고 다시 짜는 횟수 상한


def plan(places: dict[str, Place], c: Conditions, rain: bool) -> Course:
    """규칙 코스 + 카카오 실제 이동시간(키가 있을 때). 이동시간을 넣으면 문 닫는 곳이 생기면 그곳을 빼고 다시 짠다(최대 3번).
    카카오가 없거나 실패·시간 초과면 추정 이동시간 그대로(drive_source="estimate")."""
    from . import public_apis
    tok = public_apis.route_deadline()
    try:
        unavailable: list[dict] = []
        excluded = list(c.exclude)
        result = preview_stops(places, c, rain)
        for _ in range(MAX_REPLAN + 1):
            result.skipped.extend(unavailable)
            issue = apply_route(places, c, result)
            if issue is None:
                return result
            if len(unavailable) >= MAX_REPLAN:
                break
            unavailable.append(issue)
            excluded.append(issue["id"])
            result = preview_stops(places, c.model_copy(update={"exclude": excluded}), rain)
        # 다시 짜기 상한에 걸리면 마지막으로 짠 코스를 추정 이동시간으로 (실제 이동시간을 넣으면 맞지 않는 곳이 있다고 알린다)
        result = preview_stops(places, c.model_copy(update={"exclude": excluded}), rain)
        result.skipped.extend(unavailable)
        result.notes.append("실제 이동시간을 넣으면 시간이 맞지 않는 곳이 있어, 이동시간은 추정값으로 보여 드려요." if c.lang == "ko"
                            else "Some stops don't fit with real driving times, so times shown are estimates.")
        return result
    finally:
        public_apis._ROUTE_DEADLINE.reset(tok)


def apply_route(places: dict[str, Place], c: Conditions, result: Course, strict: bool = True) -> dict | None:
    """역·터미널 출발이면 ODsay 대중교통으로, 안 되면(키 없음·실패) 카카오 자동차로, 그것도 안 되면 추정 그대로.
    strict=False(사용자가 순서를 직접 바꾼 코스): 영업시간이 안 맞아도 장소를 빼거나 되돌리지 않고 open_state='closed' 로 알린다."""
    issue = apply_transit_route(places, c, result, strict)
    if result.drive_source == "transit" or issue is not None:
        return issue
    return apply_driving_route(places, c, result, strict)


def apply_transit_route(places: dict[str, Place], c: Conditions, result: Course, strict: bool = True) -> dict | None:
    """ODsay 대중교통 시간으로 도착·출발 시각을 다시 계산한다. 문제없으면 None(적용), 못 가게 된 곳이 생기면 그 장소."""
    from . import details, public_apis
    if c.start == "자가용" or not result.stops or not public_apis.odsay_available():
        return None
    station = STARTS[c.start]
    pts = [station, *[(places[s.id].lat, places[s.id].lon) for s in result.stops], station]
    if any(lat is None or lon is None for lat, lon in pts):
        return None
    speed = 0.7 if c.move else 1.0      # m/s — public_data.transit 과 같은 근거
    legs = []
    for a, b in zip(pts, pts[1:]):
        leg = public_apis.transit_leg(a, b, speed)
        if leg is None:
            return None
        legs.append(leg)
    clock = _mins(result.start_time)
    planned = [(s.arrive, s.depart, s.drive_min, s.wait_min, s.visit_at, s.open_state) for s in result.stops]
    for stop, leg in zip(result.stops, legs[:-1]):
        place = places[stop.id]
        stay = _mins(stop.depart) - _mins(stop.arrive)
        arrival = clock + leg["min"]
        ok, state, wait = details.open_check(place, result.weekday, arrival, stay)
        if not strict and (not ok or clock >= 20 * 60):
            ok, state, wait = True, "closed", 0
        if not ok or clock >= 20 * 60:
            for s, old in zip(result.stops, planned):
                s.arrive, s.depart, s.drive_min, s.wait_min, s.visit_at, s.open_state = old
            return {"id": stop.id, "name": place.name_ko, "reason": "대중교통 시간을 반영하면 방문 가능한 시간을 벗어나요", "via": "transit"}
        clock = arrival + wait + stay
        stop.drive_min, stop.wait_min = leg["min"], wait
        stop.arrive, stop.depart = hhmm(arrival), hhmm(clock)
        stop.visit_at = hhmm(arrival + wait) if wait else None
        stop.open_state = state if state in ("always", "unknown", "closed") else "open"
    names = [c.start, *[places[s.id].name_ko for s in result.stops], c.start]
    result.drive_source = "transit"
    from . import terrain   # 걷는 구간(내린 정류장 → 장소, 걸어서만 가는 구간) 오르막 참고 (DEM 90m 추정, 판정에는 안 씀)
    for leg, a, b in zip(legs, pts, pts[1:]):
        w0 = a if leg["mode"] == "walk" else leg.get("alight")
        leg["climb"] = terrain.climb(w0, b) if w0 else None
    result.transit_legs = [{**leg, "from": a, "to": b} for leg, a, b in zip(legs, names, names[1:])]
    result.back_drive_min = legs[-1]["min"]
    result.back_at = hhmm(clock + result.back_drive_min)
    return None


def apply_driving_route(places: dict[str, Place], c: Conditions, result: Course, strict: bool = True) -> dict | None:
    """카카오 자동차 길찾기로 도착·출발 시각을 다시 계산한다. 문제없으면 None, 이동시간 때문에 못 가게 된 곳이 있으면 그 장소.
    카카오를 못 쓰면(키 없음·실패) 아무것도 바꾸지 않고 None (추정 이동시간 유지)."""
    from . import details, public_apis
    result.start_point = STARTS[c.start]
    if not result.stops:
        return None
    station = STARTS[c.start]
    points = [(places[s.id].lat, places[s.id].lon) for s in result.stops]
    if any(lat is None or lon is None for lat, lon in points):
        return None
    route = public_apis.driving_route([station, *points, station])
    if route is None:
        return None
    path, durations, costs, instructions, section_ranges = route
    if len(durations) != len(result.stops) + 1:
        return None
    clock = _mins(result.start_time)
    planned = [(s.arrive, s.depart, s.drive_min, s.wait_min, s.visit_at, s.open_state) for s in result.stops]
    for stop, seconds in zip(result.stops, durations[:-1]):
        place = places[stop.id]
        stay = _mins(stop.depart) - _mins(stop.arrive)   # 미리 짠 코스의 arrive 는 기다린 뒤 시각이라 depart-arrive 가 머무는 시간
        drive_minutes = math.ceil(seconds / 60)
        arrival = clock + drive_minutes
        ok, state, wait = details.open_check(place, result.weekday, arrival, stay)
        if not strict and (not ok or clock >= 20 * 60):
            ok, state, wait = True, "closed", 0
        if not ok or clock >= 20 * 60:
            for s, old in zip(result.stops, planned):   # 반만 바뀐 코스가 남지 않게 되돌린다
                s.arrive, s.depart, s.drive_min, s.wait_min, s.visit_at, s.open_state = old
            return {"id": stop.id, "name": place.name_ko, "reason": "이동시간을 반영하면 방문 가능한 시간을 벗어나요"}
        clock = arrival + wait + stay
        stop.drive_min, stop.wait_min = drive_minutes, wait
        stop.arrive, stop.depart = hhmm(arrival), hhmm(clock)
        stop.visit_at = hhmm(arrival + wait) if wait else None
        stop.open_state = state if state in ("always", "unknown", "closed") else "open"
    result.drive_source = "kakao"
    result.driving_path = path
    result.driving_sections = section_ranges
    result.driving_guides = instructions
    result.route_costs = costs
    result.back_drive_min = math.ceil(durations[-1] / 60)
    result.back_at = hhmm(clock + result.back_drive_min)
    return None


def order_stops(places: dict[str, Place], c: Conditions, ids: list[str]) -> Course:
    """사용자가 끌어서 정한 순서 그대로 시각을 다시 쌓는다 (장소를 빼거나 바꾸지 않음).
    이동시간은 추정값으로 쌓고, 실제 길찾기(ODsay·카카오)는 schedule_order 가 덮어쓴다.
    방문 시각에 운영하지 않으면 open_state='closed' 로 알리고, 접근성 판정(grade)은 이동 조건 그대로."""
    from . import details as D
    mode = mode_from(c.move)
    less = "오래 걷기 어려움" in c.move
    day = trip_date(c)
    wd = weekday_of(day)
    day_s = day.isoformat()

    def notice_on(p, level):
        return next((n for n in p.notices if n.get("level") == level and (not n.get("start") or n["start"] <= day_s)
                     and (not n.get("end") or day_s <= n["end"])), None)
    start = STARTS[c.start]
    t = _mins(c.start_time or "10:00")
    t0 = t
    cur, cur_id, stops, seen = start, c.start, [], set()
    for pid in ids:
        p = places.get(pid)
        if not p or p.lat is None or p.lon is None or pid in seen:
            continue
        seen.add(pid)
        kind = "lunch" if p.type == "식당" else "cafe" if p.type == "카페" else "sight"
        dm = drive(cur_id, cur, p)
        arrive = q15(t + dm)
        okk, why, wait = D.open_check(p, wd, arrive, p.stay_min)
        closed = (not okk) or bool(notice_on(p, "closed")) or (bool(p.market_days) and day.day % 10 not in p.market_days)
        st = "closed" if closed else "always" if why == "always" else "unknown" if why == "unknown" else "open"
        if closed:
            wait = 0
        t = q15(arrive + wait)
        stay = q15(t + p.stay_min) - t
        stops.append(Stop(id=p.id, arrive=hhmm(t), drive_min=dm, grade=grade_place(p, mode, less), kind=kind,
                          depart=hhmm(t + stay), open_state=st, hours_text=D.hours_text(p, c.lang),
                          hours_sample=bool(p.open) and p.hours_source not in ("공공데이터", "상시 개방", "관리자 확인"), wait_min=wait,
                          notice=(notice_on(p, "warn") or {}).get("title", "")))
        t += stay
        cur, cur_id = (p.lat, p.lon), p.id
    back = q15(t + drive_min(cur, start))
    return Course(start_point=STARTS[c.start], mode=mode, stops=stops, overall=worst(s.grade for s in stops) if mode != "none" else None,
                  back_at=hhmm(back), notes=[], date=day.isoformat(), weekday=wd, start_time=hhmm(t0), skipped=[])


def schedule_order(places: dict[str, Place], c: Conditions, ids: list[str]) -> Course:
    """순서 고정 코스 + 실제 이동시간(역·터미널 출발이면 ODsay 대중교통, 자가용이면 카카오 자동차). 둘 다 안 되면 추정(drive_source='estimate')."""
    from . import public_apis
    tok = public_apis.route_deadline()
    try:
        result = order_stops(places, c, ids)
        apply_route(places, c, result, strict=False)
        return result
    finally:
        public_apis._ROUTE_DEADLINE.reset(tok)


# ---------- AI 동선 최적화 (시간창이 있는 순회 문제, 장소 수가 적어 분기한정으로 정확히) ----------
# 1순위: 운영시간·휴무·입장 마감을 어기지 않기 (어기면 큰 벌점)
# 2순위: 이동시간 합계 (가까운 곳끼리 묶이고 A→B→A 같은 왕복이 사라진다)
# 3순위: 문 열 때까지 기다리는 시간, 점심 식당은 11:30~13:30 도착
# 후보 비교는 장소 사이 추정 이동시간표(drive)로, 마지막 비교는 실제 길찾기(schedule_order)로 한다.
OPT_EXACT_MAX = 9
LUNCH_FROM, LUNCH_TO = 11 * 60 + 30, 13 * 60 + 30


def hours_kind(p: Place) -> str:
    """운영시간 분류: timed(시간 제약 있음) / always(상시 개방) / unknown(운영시간 확인 필요, 상시로 보지 않음)."""
    from . import details as D
    o, cl = D.mins(p.open), D.mins(p.close)
    if o is None or cl is None:
        return "timed" if p.closed_day_nums or p.market_days else "unknown"
    if (o, cl) == (0, 1440):
        return "timed" if p.closed_day_nums or p.market_days else "always"
    return "timed"


def optimize_order(places: dict[str, Place], c: Conditions, ids: list[str], locked: list[str]) -> dict:
    """지금 장소 그대로 가장 좋은 방문 순서를 찾는다. 장소를 빼거나 더하지 않고, 고정(locked)한 장소는 제자리.
    돌려주는 값: order(새 순서), checked(끝까지 계산한 순서 수), method('exact' 또는 'local')."""
    from . import details as D
    ids = [i for i in ids if i in places and places[i].lat is not None and places[i].lon is not None]
    n = len(ids)
    day = trip_date(c)
    wd = weekday_of(day)
    day_s = day.isoformat()
    start = STARTS[c.start]
    t0 = _mins(c.start_time or "10:00")
    P = [places[i] for i in ids]
    static_closed = [any(x.get("level") == "closed" and (not x.get("start") or x["start"] <= day_s) and (not x.get("end") or day_s <= x["end"]) for x in q.notices)
                     or (bool(q.market_days) and day.day % 10 not in q.market_days) for q in P]
    first = [drive(c.start, start, q) for q in P]
    M = [[drive(a.id, (a.lat, a.lon), b) for b in P] for a in P]
    back = [drive_min((q.lat, q.lon), start) for q in P]
    lunch = [q.type == "식당" for q in P]
    memo: dict = {}

    def visit(j, arrive):
        k = (j, arrive)
        if k not in memo:
            memo[k] = D.open_check(P[j], wd, arrive, P[j].stay_min)
        return memo[k]

    def step(j, prev, t):
        """장소 j 를 지금 시각 t 에 이어 붙였을 때 (늘어난 비용, 떠나는 시각)."""
        dm = first[j] if prev < 0 else M[prev][j]
        arrive = q15(t + dm)
        ok, why, wait = visit(j, arrive)
        bad = (not ok) or static_closed[j]
        if bad:
            wait = 0
        t2 = q15(arrive + wait)
        stay = q15(t2 + P[j].stay_min) - t2
        lp = (max(0, LUNCH_FROM - t2) + max(0, t2 - LUNCH_TO)) if lunch[j] else 0
        return (100000 if bad else 0) + dm * 10 + wait * 3 + lp * 4, t2 + stay

    def cost(order):
        tot, t, prev = 0, t0, -1
        for j in order:
            add, t = step(j, prev, t)
            tot += add
            prev = j
        return tot + (back[prev] * 10 if prev >= 0 else 0)

    pos_lock = {k: ids.index(x) for k, x in enumerate(ids) if x in locked}   # 고정된 장소 → 그 자리
    fixed_at = {v: k for k, v in pos_lock.items()}
    cur = list(range(n))
    best = [cost(cur), cur[:]]
    checked = [1]
    if n <= OPT_EXACT_MAX:
        used = [False] * n
        seq: list[int] = []

        def dfs(pos, prev, t, acc):
            if acc >= best[0]:
                return
            if pos == n:
                checked[0] += 1
                total = acc + back[prev] * 10
                if total < best[0]:
                    best[0], best[1] = total, seq[:]
                return
            cand = [fixed_at[pos]] if pos in fixed_at else [j for j in range(n) if not used[j] and j not in pos_lock]
            for j in cand:
                if used[j]:
                    continue
                add, t2 = step(j, prev, t)
                used[j] = True
                seq.append(j)
                dfs(pos + 1, j, t2, acc + add)
                seq.pop()
                used[j] = False
        dfs(0, -1, t0, 0)
        method = "exact"
    else:   # 장소가 많으면: 한 곳 옮기기·구간 뒤집기를 더 나아지지 않을 때까지
        order = cur[:]
        free = [k for k in range(n) if k not in pos_lock]
        improved = True
        while improved:
            improved = False
            for a in free:
                for b in free:
                    if a == b:
                        continue
                    o2 = order[:]
                    x = o2.pop(a)
                    o2.insert(b, x)
                    if any(o2[k] != order[k] for k in fixed_at) or any(o2[k] != fixed_at[k] for k in fixed_at):
                        continue
                    checked[0] += 1
                    cst = cost(o2)
                    if cst < best[0]:
                        best[0], best[1], order, improved = cst, o2[:], o2, True
        method = "local"
    return {"order": [ids[j] for j in best[1]], "checked": checked[0], "method": method,
            "kinds": {i: hours_kind(places[i]) for i in ids}}


def route_metric(places: dict[str, Place], c: Conditions, r: Course) -> dict:
    """코스 하나의 이동 합계 (실제 길찾기면 그 값, 아니면 추정)."""
    if not r.stops:
        return {"move_min": 0, "distance_m": None, "source": r.drive_source or "estimate", "back_at": r.back_at, "total_min": 0, "closed": [], "wait_min": 0}
    last = places[r.stops[-1].id]
    back = r.back_drive_min if r.back_drive_min is not None else drive_min((last.lat, last.lon), STARTS[c.start])
    dist = r.route_costs.distance_m if (r.drive_source == "kakao" and r.route_costs) else None
    return {"move_min": sum(s.drive_min for s in r.stops) + back, "distance_m": dist, "source": r.drive_source or "estimate",
            "back_at": r.back_at, "total_min": _mins(r.back_at) - _mins(r.start_time), "closed": [s.id for s in r.stops if s.open_state == "closed"],
            "wait_min": sum(s.wait_min for s in r.stops)}


def preview_stops(places: dict[str, Place], c: Conditions, rain: bool) -> Course:
    """작업2: 요일 휴무·브레이크타임·마지막 입장까지 맞춘 코스.
    시작 시각부터 이동·체류·대기 시간을 쌓아 가며, 도착 시각에 '영업 중'인 곳만 넣는다."""
    from . import details as D
    mode = mode_from(c.move)
    less = "오래 걷기 어려움" in c.move
    cap = c.cap or 4                     # 하루 4곳 (여러 날 여행은 날마다 따로 짠다)
    day = trip_date(c)
    wd = weekday_of(day)
    notes, skipped = [], []

    pool = [p for p in places.values() if p.type != "숙박" and p.lat is not None and p.lon is not None and p.id not in c.exclude]
    if mode != "none":   # 이동에 어려움이 있으면 접근성을 확인한 곳만 (담아 둔·넣어 달라고 한 곳은 '확인 필요'로 남김)
        unv = [p for p in pool if not p.verified and p.id not in c.must]
        pool = [p for p in pool if p not in unv]
        if unv:
            notes.append(f"접근성을 아직 확인하지 못한 {len(unv)}곳은 코스에서 뺐어요.")
    if c.flat_only:
        pool = [p for p in pool if p.walk_load == "평지" or p.type in ("식당", "카페")]
    ok = [p for p in pool if grade_place(p, mode, less) != "R"]
    for p in [p for p in pool if (p.id in c.wish or p.id in c.must) and p not in ok]:
        why = why_not(p, mode)
        notes.append(f"{D.josa(p.name_ko, '은는')} 이 조건으로 관람이 어려워 뺐어요{f' ({why})' if why else ''}. 대신 갈 수 있는 곳으로 짰어요.")
    # 정기휴무
    # 정기휴무 + 관리자 임시 휴무 알림 (cms.py)
    day_s = day.isoformat()
    def notice_on(p, level):
        return next((n for n in p.notices if n.get("level") == level and (not n.get("start") or n["start"] <= day_s)
                     and (not n.get("end") or day_s <= n["end"])), None)
    for p in list(ok):
        tmp = notice_on(p, "closed")
        if wd in p.closed_day_nums or tmp:
            ok.remove(p)
            if p.id in c.must or p.id in c.wish or p.id == c.lunch:
                skipped.append({"id": p.id, "name": p.name_ko, "reason": f"임시 휴무({tmp['title']})" if tmp else f"{D.WD_KO[wd]}요일 휴무"})
        elif p.market_days and day.day % 10 not in p.market_days:   # 오일장: 장날이 아니면 빼기
            ok.remove(p)
            if p.id in c.must or p.id in c.wish:
                skipped.append({"id": p.id, "name": p.name_ko, "reason": f"장날({'·'.join(map(str, p.market_days))}일)이 아니에요"})
    need_table = "입식" in c.meal
    def food_ok(p):
        return not need_table or p.table in ("입식", "혼합")

    by_score = lambda xs: sorted(xs, key=lambda p: -score(p, c, rain))
    food = by_score([p for p in ok if p.type == "식당" and food_ok(p)])
    cafes = by_score([p for p in ok if p.type == "카페" and food_ok(p)])
    sights = by_score([p for p in ok if p.type not in ("식당", "숙박", "카페")])
    if c.lunch and any(p.id == c.lunch for p in food):   # 대화로 고칠 때 점심은 이어서 쓴다
        food = [p for p in food if p.id == c.lunch] + [p for p in food if p.id != c.lunch]
    want_rest = c.rest if c.rest is not None else mode in ("wheel", "walk")
    n_sights = max(1, cap - 1 - (1 if want_rest and cafes else 0))
    must = [p for p in sights if p.id in c.must]
    chosen = must + [p for p in sights if p not in must][: max(0, n_sights - len(must))]
    spare = [p for p in sights if p not in chosen]          # 문을 닫았을 때 대신 넣을 후보

    start = STARTS[c.start]
    t = _mins(c.start_time or "10:00")
    t0 = t
    cur, cur_id, stops = start, c.start, []
    rest = list(chosen)
    need_lunch, need_cafe = bool(food) and not c.skip_lunch, bool(want_rest and cafes)
    seen = set()
    filled = False

    def visit(p, kind):
        nonlocal t, cur, cur_id
        dm = drive(cur_id, cur, p)
        arrive = q15(t + dm)
        okk, why, wait = D.open_check(p, wd, arrive, p.stay_min)
        st = "always" if why == "always" else "unknown" if why == "unknown" else "open"
        t = q15(arrive + wait)
        stay = q15(t + p.stay_min) - t
        stops.append(Stop(id=p.id, arrive=hhmm(t), drive_min=dm, grade=grade_place(p, mode, less), kind=kind,
                          depart=hhmm(t + stay), open_state=st, hours_text=D.hours_text(p, c.lang),
                          hours_sample=bool(p.open) and p.hours_source not in ("공공데이터", "상시 개방", "관리자 확인"), wait_min=wait,
                          notice=(notice_on(p, "warn") or {}).get("title", "")))
        t += stay
        cur, cur_id = (p.lat or cur[0], p.lon or cur[1]), p.id
        seen.add(p.id)

    def fits(p, dm):
        """쓸 수 있는 시간(budget_min) 안에 이곳을 들르고 출발점까지 돌아올 수 있는지 (이동·머무는 시간, 휴식 미포함)."""
        if not c.budget_min:
            return True
        arrive = q15(t + dm)
        _, _, wait = D.open_check(p, wd, arrive, p.stay_min)
        tt = q15(arrive + wait)
        end = tt + (q15(tt + p.stay_min) - tt)
        return q15(end + drive_min((p.lat, p.lon), start)) - t0 <= c.budget_min

    budget_cut = [False]   # 마지막 first_open 에서 쓸 수 있는 시간 때문에 뺀 곳이 있었는지

    def first_open(cands, kind):
        """지금 위치에서 가까운 순으로, 도착 시각에 영업 중이고 쓸 수 있는 시간 안에 드는 첫 곳."""
        best = None
        budget_cut[0] = False
        for p in cands:
            if p.id in seen:
                continue
            dm = drive(cur_id, cur, p)
            if not fits(p, dm):
                budget_cut[0] = True
                if (p.id in c.must or p.id in c.wish) and not any(s["id"] == p.id for s in skipped):
                    skipped.append({"id": p.id, "name": p.name_ko, "reason": "쓸 수 있는 시간 초과"})
                continue
            okk, why, wait = D.open_check(p, wd, t + dm, p.stay_min)
            if okk:
                cost = dm + wait          # 기다리는 시간도 이동 시간처럼 아깝다
                if best is None or cost < best[0]:
                    best = (cost, p)
                continue
            if p.id in c.must or p.id == c.lunch or p.id in c.wish:
                reason = {"break": "브레이크타임", "after_last_entry": "마지막 입장 시간이 지남", "not_open_yet": "아직 문을 열기 전"}.get(why, why)
                if not any(s["id"] == p.id for s in skipped):
                    skipped.append({"id": p.id, "name": p.name_ko, "reason": reason})
        return best[1] if best else None

    def meal_time():
        return 11 * 60 + 20 <= t <= 14 * 60 + 30 or t >= 17 * 60

    guard = 0
    while (rest or need_lunch or need_cafe) and guard < 20 and t < 20 * 60:
        guard += 1
        if need_lunch and meal_time():
            # 점심: 앞쪽 후보(대화로 고정한 곳 포함)부터 영업 중인 곳
            pick = (first_open(food[:1], "lunch") if c.lunch else None) or first_open(food[:4], "lunch") or first_open(food, "lunch")
            need_lunch = False
            if pick:
                visit(pick, "lunch")
            else:
                notes.append("쓸 수 있는 시간 안에 식사를 넣기 어려워 식당은 뺐어요." if budget_cut[0] else "방문 시각에 문을 연 식당을 찾지 못했어요. 시작 시간을 바꿔 보세요.")
            continue
        if need_cafe and not need_lunch and sum(1 for s in stops if s.kind == "sight") >= 2:
            pick = first_open(cafes, "cafe")
            need_cafe = False
            if pick:
                visit(pick, "cafe")
                continue
        if not rest:
            if need_lunch and t < 11 * 60 and stops:
                if c.budget_min and 11 * 60 + 15 - t0 >= c.budget_min:   # 쓸 시간이 점심 전에 끝나면 점심은 빼고 마친다
                    need_lunch = False
                    continue
                # 점심때가 아직 멀면: 일정을 줄여 달라고 한 경우엔 앞 장소에서 여유 있게 머물고,
                # 아니면 가까운 곳 한 곳으로 시간을 채운다 (한 번만).
                fill = None if (c.cap is not None or filled) else first_open(spare, "sight")
                filled = True
                if fill:
                    spare.remove(fill); visit(fill, "sight")
                    notes.append(f"점심때까지 시간이 남아 {D.josa(fill.name_ko, '을를')} 넣었어요.")
                    continue
                last = stops[-1]
                extra = 11 * 60 + 15 - t
                if extra > 0:
                    t += extra
                    last.depart = hhmm(_mins(last.depart) + extra)
                    notes.append(f"점심 전까지 {D.josa(places[last.id].name_ko, '에서')} {extra}분 더 여유 있게 쉬어요.")
                continue
            if need_lunch:          # 관광이 먼저 끝나면 식사로 마무리
                pick = (first_open(food[:1], "lunch") if c.lunch else None) or first_open(food, "lunch"); need_lunch = False
                if pick: visit(pick, "lunch")
                continue
            if need_cafe:           # 쉬는 카페로 마무리
                pick = first_open(cafes, "cafe"); need_cafe = False
                if pick: visit(pick, "cafe")
            break
        pick = first_open(rest, "sight")
        if not pick:
            # 남은 곳이 다 닫혀 있으면 대신 갈 만한 곳(영업 중)으로 채운다
            for p in rest:   # 사용자가 고른 곳만 알려 주고, 나머지는 조용히 다른 곳으로 바꾼다
                if (p.id in c.must or p.id in c.wish) and not any(s["id"] == p.id for s in skipped):
                    skipped.append({"id": p.id, "name": p.name_ko, "reason": "방문 시각에 운영하지 않음"})
            pick = first_open(spare, "sight")
            rest = []
            if not pick:
                continue
            spare.remove(pick)
        else:
            rest.remove(pick)
        visit(pick, "sight")
    back = q15(t + drive_min(cur, start))
    for s in skipped:
        notes.append(f"{D.josa(s['name'], '은는')} {s['reason']}라서 뺐어요.")

    return Course(start_point=STARTS[c.start], mode=mode, stops=stops, overall=worst(s.grade for s in stops) if mode != "none" else None,
                  back_at=hhmm(back), notes=notes, date=day.isoformat(), weekday=wd, start_time=hhmm(t0), skipped=skipped)
