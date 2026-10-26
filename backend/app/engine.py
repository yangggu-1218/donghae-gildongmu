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
    return s


def plan(places: dict[str, Place], c: Conditions, rain: bool) -> Course:
    mode = mode_from(c.move)
    less = "오래 걷기 어려움" in c.move
    cap = 6 if c.days == "1박 2일" else 4
    notes = []

    pool = [p for p in places.values() if (p.type != "숙박" or c.days == "1박 2일") and p.lat is not None]
    if mode != "none":   # 이동에 어려움이 있으면 접근성을 확인한 곳만 (담아 둔·넣어 달라고 한 곳은 '확인 필요'로 남김)
        unv = [p for p in pool if not p.verified and p.id not in c.must]
        pool = [p for p in pool if p not in unv]
        if unv:
            notes.append(f"접근성을 아직 확인하지 못한 {len(unv)}곳은 코스에서 뺐어요.")
    ok = [p for p in pool if grade_place(p, mode, less) != "R"]
    dropped = [p.name_ko for p in pool if p.id in c.wish and p not in ok]
    if dropped:
        notes.append(f"담아 두신 {', '.join(dropped)}은(는) 이 조건으로 갈 수 없어 뺐어요.")

    food = sorted([p for p in ok if p.type == "식당"], key=lambda p: -score(p, c, rain))
    sights = sorted([p for p in ok if p.type not in ("식당", "숙박")], key=lambda p: -score(p, c, rain))

    must = [p for p in sights if p.id in c.must]
    chosen = must + [p for p in sights if p not in must][: max(0, cap - 1 - len(must))]
    if food:
        chosen.insert(min(1, len(chosen)), food[0])   # 두 번째 자리에 점심
    chosen = chosen[:cap]

    # 관광지는 출발점에서 가까운 순(최근접 이웃)으로 잇고, 점심은 11:20 이후 처음 도착하는 자리에 넣는다
    start = STARTS[c.start]
    lunch = [p for p in chosen if p.type == "식당"][:1]
    rest = [p for p in chosen if p not in lunch]
    t, cur, cur_id, stops = START_TIME, start, c.start, []

    def visit(p):
        nonlocal t, cur, cur_id
        dm = drive(cur_id, cur, p)
        t += dm
        stops.append(Stop(id=p.id, arrive=hhmm(t), drive_min=dm, grade=grade_place(p, mode, less)))
        t += p.stay_min
        cur, cur_id = (p.lat or cur[0], p.lon or cur[1]), p.id

    while rest:
        if lunch and t >= 11 * 60 + 20:
            visit(lunch.pop())
            continue
        nxt = min(rest, key=lambda p: drive(cur_id, cur, p))
        rest.remove(nxt)
        visit(nxt)
    if lunch:
        visit(lunch.pop())
    back = t + drive_min(cur, start)

    return Course(mode=mode, stops=stops, overall=worst(s.grade for s in stops) if mode != "none" else None,
                  back_at=hhmm(back), notes=notes)
