"""추천 엔진: 장소를 고르는 건 코드가, 말은 AI가 한다.
판정 기준은 장애인등편의법 시행규칙 별표 1(기울기 1/12≈4.8°, 턱 2cm, 문 폭 0.9m)과 팀 규칙(데이터·답사 시트 참고)."""
import math
from .schemas import Segment, Place, Conditions, Course, Stop, Mode

RANK = {"G": 0, "Y": 1, "R": 2}
STARTS = {  # 출발점 좌표 (WGS84)
    "동해역": (37.4995, 129.1240),
    "묵호역": (37.5480, 129.1160),
    "자가용": (37.4995, 129.1240),
}
START_TIME = 10 * 60   # 10:00 출발 (남은 과제: 사용자가 고르게)


def worst(grades):
    gs = [g for g in grades if g]
    return max(gs, key=lambda g: RANK[g]) if gs else None


def grade_segment(s: Segment, mode: Mode) -> str:
    """측정값이 있으면 규칙으로 판정하고, 없으면 저장된 휠체어 기준 판정을 쓴다."""
    measured = any(v is not None for v in (s.steps, s.curb_cm, s.slope_deg, s.width_m, s.surface))
    if measured:
        g = "G"
        surface = (s.surface or "").strip()
        if (s.steps or 0) > 0:
            g = "Y" if s.alt_route else "R"
        if s.curb_cm is not None:
            if s.curb_cm > 5: g = worst([g, "R"])
            elif s.curb_cm > 2: g = worst([g, "Y"])
        if s.slope_deg is not None:
            if s.slope_deg > 7.1: g = worst([g, "R"])
            elif s.slope_deg > 4.8: g = worst([g, "Y"])
        if s.width_m is not None:
            if s.width_m < 0.9: g = worst([g, "R"])
            elif s.width_m < 1.2: g = worst([g, "Y"])
        if surface in ("모래", "흙길", "산길"): g = worst([g, "R"])
        elif surface in ("자갈", "데크 이음새"): g = worst([g, "Y"])
    else:
        g = s.grade or "Y"   # 정보 없음 = 확인 필요(주의)
    if mode == "walk":       # 오래 걷기·계단 어려움: 대부분 주의로 보되, 계단 10개 초과·산길은 불가 유지
        hard = (s.steps or 0) > 10 or (s.surface or "") in ("산길", "모래")
        if g == "R" and not hard: g = "Y"
        if (s.distance_m or 0) > 300: g = worst([g, "Y"])
    elif mode == "stroller" and s.curb_cm is not None and 2 < s.curb_cm <= 5:
        g = worst([g, "Y"])
    return g


def grade_place(p: Place, mode: Mode, less_walk: bool = False):
    if mode == "none":
        return None
    segs = p.segments
    if less_walk:   # 긴 걷기 구간(300m 초과 또는 '전망' 구간)은 빼고 판정
        segs = [s for s in segs if not ((s.distance_m or 0) > 300 or "전망 데크" in s.name)] or segs
    return worst(grade_segment(s, mode) for s in segs) or "Y"


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


def hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def score(p: Place, c: Conditions, rain: bool) -> float:
    s = 0.0
    s += 2.0 * len(set(p.styles) & set(c.style))
    if rain:
        s += 3.0 if p.indoor else -2.0
    if p.id in c.wish:
        s += 10.0
    if any(seg.source == "현장 답사" for seg in p.segments):
        s += 1.0                         # 직접 확인한 곳을 조금 더 믿는다
    if c.who in ("부모님과", "아이와") and "체험" in p.styles:
        s += 1.0
    if mode_from(c.move) != "none":      # 이동이 불편하면 평지·벤치 있는 곳을 먼저
        s += {"평지": 1.5, "완만한경사": 0.5}.get(p.walk_load, 0.0) + (0.5 if p.benches else 0.0)
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


def plan(places: dict[str, Place], c: Conditions, rain: bool) -> Course:
    """작업2: 요일 휴무·브레이크타임·마지막 입장까지 맞춘 코스.
    시작 시각부터 이동·체류·대기 시간을 쌓아 가며, 도착 시각에 '영업 중'인 곳만 넣는다."""
    from . import details as D
    mode = mode_from(c.move)
    less = "오래 걷기 어려움" in c.move
    cap = c.cap or (6 if c.days == "1박 2일" else 4)
    day = trip_date(c)
    wd = weekday_of(day)
    notes, skipped = [], []

    pool = [p for p in places.values() if (p.type != "숙박" or c.days == "1박 2일") and p.lat is not None and p.id not in c.exclude]
    if mode != "none":   # 이동에 어려움이 있으면 접근성을 확인한 곳만 (담아 둔·넣어 달라고 한 곳은 '확인 필요'로 남김)
        unv = [p for p in pool if not p.verified and p.id not in c.must]
        pool = [p for p in pool if p not in unv]
        if unv:
            notes.append(f"접근성을 아직 확인하지 못한 {len(unv)}곳은 코스에서 뺐어요.")
    if c.flat_only:
        pool = [p for p in pool if p.walk_load == "평지" or p.type in ("식당", "카페")]
    ok = [p for p in pool if grade_place(p, mode, less) != "R"]
    dropped = [p.name_ko for p in pool if (p.id in c.wish or p.id in c.must) and p not in ok]
    if dropped:
        notes.append(f"담아 두신 {D.josa(', '.join(dropped), '은는')} 이 조건으로 갈 수 없어 뺐어요.")
    # 정기휴무
    for p in list(ok):
        if wd in p.closed_day_nums:
            ok.remove(p)
            if p.id in c.must or p.id in c.wish or p.id == c.lunch:
                skipped.append({"id": p.id, "name": p.name_ko, "reason": f"{D.WD_KO[wd]}요일 휴무"})
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
        arrive = t + dm
        okk, why, wait = D.open_check(p, wd, arrive, p.stay_min)
        st = "always" if why == "always" else "unknown" if why == "unknown" else "open"
        t = arrive + wait
        stops.append(Stop(id=p.id, arrive=hhmm(t), drive_min=dm, grade=grade_place(p, mode, less), kind=kind,
                          depart=hhmm(t + p.stay_min), open_state=st, hours_text=D.hours_text(p, c.lang),
                          hours_sample=p.hours_source not in ("공공데이터", "상시 개방"), wait_min=wait))
        t += p.stay_min
        cur, cur_id = (p.lat or cur[0], p.lon or cur[1]), p.id
        seen.add(p.id)

    def first_open(cands, kind):
        """지금 위치에서 가까운 순으로, 도착 시각에 영업 중인 첫 곳."""
        best = None
        for p in cands:
            if p.id in seen:
                continue
            dm = drive(cur_id, cur, p)
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
                notes.append("방문 시각에 문을 연 식당을 찾지 못했어요. 시작 시간을 바꿔 보세요.")
            continue
        if need_cafe and not need_lunch and sum(1 for s in stops if s.kind == "sight") >= 2:
            pick = first_open(cafes, "cafe")
            need_cafe = False
            if pick:
                visit(pick, "cafe")
                continue
        if not rest:
            if need_lunch and t < 11 * 60 and stops:
                # 점심때가 아직 멀면: 일정을 줄여 달라고 한 경우엔 앞 장소에서 여유 있게 머물고,
                # 아니면 가까운 곳 한 곳으로 시간을 채운다 (한 번만).
                fill = None if (c.cap is not None or filled) else first_open(spare, "sight")
                filled = True
                if fill:
                    spare.remove(fill); visit(fill, "sight")
                    notes.append(f"점심때까지 시간이 남아 {D.josa(fill.name_ko, '을를')} 넣었어요.")
                    continue
                last = stops[-1]
                extra = 11 * 60 + 20 - 15 - t
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
    back = t + drive_min(cur, start)
    for s in skipped:
        notes.append(f"{D.josa(s['name'], '은는')} {s['reason']}라서 뺐어요.")

    return Course(mode=mode, stops=stops, overall=worst(s.grade for s in stops) if mode != "none" else None,
                  back_at=hhmm(back), notes=notes, date=day.isoformat(), weekday=wd, start_time=hhmm(t0), skipped=skipped)
