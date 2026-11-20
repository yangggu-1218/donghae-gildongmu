"""① AI 코스 설계 에이전트 (docs/17_AI_FEATURES.md).

AI(기본 Sonnet)가 도구로 장소를 찾아보고(find_places), 자세히 보고(place_detail), 짠 순서를 검산(check_plan)한 뒤
최종 코스(장소 id·순서·종류·고른 이유)를 JSON으로 낸다. 도착 시각·영업시간·이동 시간 계산은 서버가 한다(check_plan, fixed_schedule).
AI가 없거나 실패·규칙 위반이 심하면 None → 부르는 쪽이 규칙 엔진(engine.plan)으로 대신한다."""
from __future__ import annotations

import json

from . import ai, engine
from . import details as D
from .schemas import Conditions, Course, Place, Stop

STYLES = ["바다 보기", "자연·산책", "산·등산", "카페", "맛집", "역사·문화", "체험"]
ZONES = ["mukho", "mangsang", "chuam", "mureung", "cheongok"]
WD = ["일", "월", "화", "수", "목", "금", "토"]

SYSTEM = """너는 '동해 길동무'의 코스 설계 에이전트다. 동해시 하루 여행 코스를 이 사람에게 꼭 맞게 직접 설계한다.

일하는 순서
1. 서버가 먼저 조회한 후보와 여행 조건을 읽는다. 적합한 후보가 충분하면 바로 check_plan 으로 넘어간다. 후보가 부족하면 find_places 로 더 찾고, 접근성 등 확인이 필요하면 place_detail 로 본다.
2. 순서를 정해 check_plan 으로 검산한다. 서버가 도착 시각·이동 시간·그날 휴무·영업시간을 계산해 문제를 알려 준다.
3. 문제가 있으면 장소나 순서를 바꿔 다시 check_plan 한다. 문제가 없으면 최종 JSON 을 낸다.

꼭 지킬 것
- 장소 id 는 서버가 먼저 조회한 후보나 도구 결과에 나온 것만 쓴다. 숙박 시설은 넣지 않는다.
- [꼭 넣을 곳]은 모두 넣는다. [뺄 곳]은 넣지 않는다. [앞 날에 간 곳]도 넣지 않는다.
- 이동 조건이 있으면 access 가 R(어려움)인 곳은 넣지 않고, verified=false(접근성 확인 전)인 곳은 꼭 넣을 곳이 아니면 피한다.
- 장소 수는 [하루 장소 수]를 따른다 (식사·카페 포함). 점심 식당(kind=lunch)은 11:20~14:00 사이에 도착하게 한 곳 넣는다 (점심 빼기면 넣지 않음). [쉬는 카페]가 예면 관광지 두 곳 뒤에 카페(kind=cafe) 한 곳.
- 비 예보거나 실내를 원하면 실내 장소를 먼저 고른다. 이동이 멀어지지 않게 가까운 권역끼리 묶는다.
- 마지막에 고른 순서 그대로 check_plan 을 통과한(problems 가 빈) 코스를 낸다. 끝까지 문제가 남으면 가장 문제가 적은 안을 내고 notes 에 적는다.
- why 는 이 사람에게 왜 맞는지 한 문장(쉬운 존댓말, 40자 안팎). 언어가 en 이면 영어.
- 최종 답은 JSON 만 낸다.
"""

TOOLS = [
    {"name": "find_places", "description": "조건에 맞는 동해 장소 후보 목록. 각 장소의 종류·권역·특징·실내·그날 운영시간·이 사람 기준 접근성(access: G/Y/R, verified)·머무는 시간을 준다.",
     "input_schema": {"type": "object", "properties": {
         "styles": {"type": "array", "items": {"type": "string", "enum": STYLES}, "description": "이 특징 중 하나라도 있는 곳"},
         "zone": {"type": "string", "enum": ZONES}, "types": {"type": "array", "items": {"type": "string", "enum": ["관광지", "식당", "카페"]}},
         "indoor_only": {"type": "boolean"}, "keyword": {"type": "string", "description": "이름·소개에 들어 있는 말"}},
         "additionalProperties": False}},
    {"name": "place_detail", "description": "장소 하나의 자세한 정보: 소개, 구간별 길 정보, 편의시설, 보호자 꿀팁, 이동약자 정보, 임시 알림.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"], "additionalProperties": False}},
    {"name": "check_plan", "description": "고른 순서대로 서버가 도착·떠나는 시각, 이동 시간, 그날 영업 여부를 계산해 문제(problems)를 알려 준다. 최종 답 전에 반드시 부른다.",
     "input_schema": {"type": "object", "properties": {"stops": {"type": "array", "items": {"type": "object", "properties": {
         "id": {"type": "string"}, "kind": {"type": "string", "enum": ["sight", "lunch", "cafe"]}}, "required": ["id", "kind"], "additionalProperties": False}}},
         "required": ["stops"], "additionalProperties": False}},
]

FINAL = {
    "type": "object",
    "properties": {
        "stops": {"type": "array", "items": {"type": "object", "properties": {
            "id": {"type": "string"}, "kind": {"type": "string", "enum": ["sight", "lunch", "cafe"]}, "why": {"type": "string"}},
            "required": ["id", "kind", "why"], "additionalProperties": False}},
        "summary": {"type": "string"},
        "notes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["stops", "summary", "notes"],
    "additionalProperties": False,
}


def _mins(hm: str) -> int:
    return engine._mins(hm)


def fixed_schedule(places: dict[str, Place], c: Conditions, items: list[tuple[str, str]]) -> tuple[Course, list[str]]:
    """정해진 순서 그대로 시각을 쌓는다 (engine.plan 의 visit 과 같은 계산). 돌려주는 값: (코스, 문제 목록)."""
    mode = engine.mode_from(c.move)
    less = "오래 걷기 어려움" in c.move
    day = engine.trip_date(c)
    wd = engine.weekday_of(day)
    day_s = day.isoformat()
    start = engine.STARTS[c.start]
    t = t0 = _mins(c.start_time or "10:00")
    cur, cur_id = start, c.start
    stops, problems = [], []
    for pid, kind in items:
        p = places[pid]
        dm = engine.drive(cur_id, cur, p)
        arrive = engine.q15(t + dm)
        okk, why, wait = D.open_check(p, wd, arrive, p.stay_min)
        if not okk:
            reason = {"break": "브레이크타임", "after_last_entry": "마지막 입장 시간이 지남", "not_open_yet": "아직 문을 열기 전",
                      "closed_day": f"{WD[wd]}요일 휴무"}.get(why, why)
            problems.append(f"{p.name_ko}({pid}): {engine.hhmm(arrive)} 도착 — {reason}")
        if kind == "lunch" and not (11 * 60 + 20 <= arrive + wait <= 14 * 60 + 30 or arrive + wait >= 17 * 60):
            problems.append(f"{p.name_ko}({pid}): 점심 도착 {engine.hhmm(arrive + wait)} — 11:20~14:00 밖")
        notice = next((n for n in p.notices if n.get("level") in ("closed", "warn") and (not n.get("start") or n["start"] <= day_s)
                       and (not n.get("end") or day_s <= n["end"])), None)
        if notice and notice.get("level") == "closed":
            problems.append(f"{p.name_ko}({pid}): 임시 휴무 — {notice.get('title')}")
        st = "always" if why == "always" else "unknown" if why == "unknown" else "open"
        t = engine.q15(arrive + (wait if okk else 0))
        stay = engine.q15(t + p.stay_min) - t
        stops.append(Stop(id=pid, arrive=engine.hhmm(t), drive_min=dm, grade=engine.grade_place(p, mode, less), kind=kind,
                          depart=engine.hhmm(t + stay), open_state=st, hours_text=D.hours_text(p, c.lang),
                          hours_sample=bool(p.open) and p.hours_source not in ("공공데이터", "상시 개방", "관리자 확인"),
                          wait_min=wait if okk else 0, notice=(notice or {}).get("title", "") if notice and notice.get("level") == "warn" else ""))
        t += stay
        cur, cur_id = (p.lat or cur[0], p.lon or cur[1]), p.id
    back = engine.q15(t + engine.drive_min(cur, start))
    if t > 20 * 60:
        problems.append(f"일정이 {engine.hhmm(t)}까지 이어져요 — 너무 늦어요")
    course = Course(mode=mode, stops=stops, overall=engine.worst(s.grade for s in stops) if mode != "none" else None,
                    back_at=engine.hhmm(back), notes=[], date=day_s, weekday=wd, start_time=engine.hhmm(t0), skipped=[])
    return course, problems


class _Agent:
    def __init__(self, places: dict[str, Place], c: Conditions, rain: bool):
        self.places, self.c, self.rain = places, c, rain
        self.mode = engine.mode_from(c.move)
        self.day = engine.trip_date(c)
        self.wd = engine.weekday_of(self.day)
        self.blocked = set(c.exclude)

    def _row(self, p: Place) -> dict:
        g = engine.grade_place(p, self.mode) if (self.mode != "none" and p.segments) else None
        closed = self.wd in p.closed_day_nums
        return {"id": p.id, "name": p.name_ko, "type": p.type, "zone": p.zone, "styles": p.styles, "indoor": p.indoor,
                "stay_min": p.stay_min, "hours_today": "휴무" if closed else D.hours_text(p, "ko"),
                "access": g, "verified": p.verified, "tip": (p.tip_ko or p.intro_ko or "")[:70]}

    def find_places(self, styles=None, zone=None, types=None, indoor_only=False, keyword=None):
        types = [x for x in (types or ["관광지", "식당", "카페"]) if x in ("관광지", "식당", "카페")]
        out = []
        for p in self.places.values():
            ptype = p.type if p.type in ("식당", "카페") else "관광지"
            if p.type == "숙박" or p.lat is None or p.id in self.blocked or ptype not in types:
                continue
            if zone and p.zone != zone:
                continue
            if styles and not set(styles) & set(p.styles):
                continue
            if indoor_only and not p.indoor:
                continue
            if keyword and keyword.replace(" ", "") not in f"{p.name_ko}{p.intro_ko}{p.tip_ko}".replace(" ", ""):
                continue
            out.append(self._row(p))
        return {"count": len(out), "places": out[:30]}

    def place_detail(self, id):
        p = self.places.get(id)
        if not p or p.type == "숙박":
            return {"error": "없는 장소 id 예요. find_places 결과의 id 를 쓰세요."}
        segs = [{"name": s.name, "grade": engine.grade_segment(s, self.mode) if self.mode != "none" else s.grade, "note": s.note} for s in p.segments]
        return {**self._row(p), "intro": (p.intro_ko or "")[:300], "segments": segs, "facilities": p.facilities, "carer_tip": p.carer_tip,
                "barrier_free": (p.access_kto or {}).get("cats", []), "notices": [n.get("title") for n in p.notices][:3], "fee": p.fee}

    def check_plan(self, stops):
        items, errs = [], []
        for s in stops or []:
            pid, kind = s.get("id"), s.get("kind", "sight")
            p = self.places.get(pid)
            if not p or p.type == "숙박":
                errs.append(f"{pid}: 없는 장소이거나 숙박 시설"); continue
            if pid in self.blocked:
                errs.append(f"{p.name_ko}({pid}): 빼야 하는 곳"); continue
            if kind not in ("sight", "lunch", "cafe"):
                kind = "sight"
            items.append((pid, kind))
        if not items:
            return {"problems": errs or ["장소가 없어요"]}
        course, problems = fixed_schedule(self.places, self.c, items)
        if self.mode != "none":
            for st in course.stops:
                if st.grade == "R":
                    problems.append(f"{self.places[st.id].name_ko}({st.id}): 이 이동 조건으로는 어려움(R)")
        missing = [m for m in self.c.must if m in self.places and m not in {i for i, _ in items}]
        if missing:
            problems.append("꼭 넣을 곳이 빠짐: " + ", ".join(f"{self.places[m].name_ko}({m})" for m in missing))
        return {"schedule": [{"id": s.id, "name": self.places[s.id].name_ko, "kind": s.kind, "arrive": s.arrive, "depart": s.depart,
                              "drive_min": s.drive_min, "access": s.grade} for s in course.stops],
                "back_at": course.back_at, "problems": errs + problems}

    def call(self, name: str, args: dict):
        if name == "find_places":
            return self.find_places(**{k: v for k, v in args.items() if k in ("styles", "zone", "types", "indoor_only", "keyword")})
        if name == "place_detail":
            return self.place_detail(args.get("id", ""))
        if name == "check_plan":
            return self.check_plan(args.get("stops", []))
        raise ValueError(f"없는 도구: {name}")

    def brief(self, hint: str = "", used: list[str] | None = None) -> str:
        c, P = self.c, self.places
        cap = c.cap or 4
        rest = c.rest if c.rest is not None else self.mode in ("wheel", "walk")
        nm = lambda i: f"{P[i].name_ko}({i})" if i in P else i
        lines = [
            f"[언어] {c.lang}",
            f"[날짜] {self.day.isoformat()} ({WD[self.wd]}요일) · [출발] {c.start} {c.start_time or '10:00'}",
            f"[누구와] {c.who} · [이동 조건] {', '.join(c.move) or '없음'} (판정 기준: {self.mode})",
            f"[취향] {', '.join(c.style) or '상관없음'} · [식사 바람] {', '.join(c.meal) or '없음'} · [날씨] {'비 예보 → 실내 먼저' if self.rain else '맑음/보통'}{' · 실내 원함' if c.weather_pref == '실내' else ' · 바깥 원함' if c.weather_pref == '실외' else ''}",
            f"[하루 장소 수] {cap} · [쉬는 카페] {'예' if rest else '아니요'} · [점심] {'빼기' if c.skip_lunch else '넣기'} · [평지만] {'예' if c.flat_only else '아니요'}",
            f"[꼭 넣을 곳] {', '.join(nm(i) for i in (c.must or [])) or '없음'} · [담아 둔 곳(되도록)] {', '.join(nm(i) for i in (c.wish or [])) or '없음'}",
            f"[뺄 곳] {len(c.exclude)}곳 (find_places 에서 이미 빠져 있음)",
        ]
        if c.lunch:
            lines.append(f"[점심은 이 식당으로] {nm(c.lunch)}")
        if c.day_no and c.day_no > 1:
            lines.append(f"[여행 {c.day_no}째 날] 앞 날에 간 곳은 뺄 곳에 들어 있음")
        if hint or c.memo:
            lines.append(f"[이 사람이 한 말] {(hint or c.memo)[:300]}")
        return "\n".join(lines)


def plan(places: dict[str, Place], c: Conditions, rain: bool, hint: str = "") -> tuple[Course | None, dict] | None:
    """AI가 설계한 코스. 실패하면 None.
    AI 코스를 만들었지만 카카오 실제 이동시간을 넣으니 문 닫는 곳이 생겨 버리면 (None, {"reason": …}) — 부르는 쪽은 규칙으로 가고 이유를 남긴다."""
    if not ai.available():
        return None
    places = {pid: p for pid, p in places.items() if p.lat is not None and p.lon is not None}
    ag = _Agent(places, c, rain)
    # 먼저 조회한 후보 (gangRG님): 꼭 넣을·담은 곳 + 종류별 상위 6곳을 미리 넣어 도구 왕복을 줄인다
    candidates = {}
    for pid in [*c.must, *c.wish, c.lunch]:
        if pid in places and pid not in ag.blocked and places[pid].type != "숙박":
            candidates[pid] = ag._row(places[pid])
    for category in ("관광지", "식당", "카페"):
        rows = ag.find_places(types=[category])["places"]
        rows.sort(key=lambda row: (
            row["hours_today"] == "휴무", row["access"] == "R",
            ag.mode != "none" and not row["verified"],
            (rain or c.weather_pref == "실내") and not row["indoor"],
            -len(set(c.style).intersection(row["styles"])),
        ))
        candidates.update((row["id"], row) for row in rows[:6])
    prompt = ag.brief(hint) + "\n[먼저 조회한 후보]\n" + json.dumps(list(candidates.values()), ensure_ascii=False, separators=(",", ":")) \
        + "\n\n위 조건으로 코스를 설계해 주세요."
    res = ai.run_tools("course", SYSTEM, [{"role": "user", "content": prompt}],
                       TOOLS, ag.call, schema=FINAL, max_rounds=8, max_tokens=8000)
    if not res:
        return None
    text, _msg = res
    try:
        data = json.loads(text)
    except ValueError:
        ai.LAST["course"] = {"why": "최종 JSON 을 못 읽음", "head": text[:200]}
        return None
    items, whys, seen = [], {}, set()
    for s in data.get("stops") or []:
        pid = s.get("id")
        p = places.get(pid)
        if not p or p.type == "숙박" or pid in seen or pid in ag.blocked:
            continue
        if ag.mode != "none" and p.segments and engine.grade_place(p, ag.mode) == "R":   # 안전: 어려움(R)은 AI가 넣어도 뺀다
            continue
        seen.add(pid)
        items.append((pid, s.get("kind") if s.get("kind") in ("sight", "lunch", "cafe") else "sight"))
        whys[pid] = str(s.get("why") or "")[:120]
    if not items:
        return None
    course, problems = fixed_schedule(places, c, items)
    for st in course.stops:
        st.why = whys.get(st.id, "")
    notes = [str(n)[:160] for n in (data.get("notes") or [])[:3] if n]
    missing = [m for m in c.must if m in places and m not in seen]
    if missing:
        notes.append(("꼭 넣을 곳 중 이번 코스에 못 넣은 곳: " if c.lang == "ko" else "Could not fit: ") + ", ".join(places[m].name_ko for m in missing))
    if problems:
        notes.append(("확인해 주세요: " if c.lang == "ko" else "Please check: ") + "; ".join(problems[:2]))
    from . import public_apis
    tok = public_apis.route_deadline()
    try:
        issue = engine.apply_route(places, c, course)
    finally:
        public_apis._ROUTE_DEADLINE.reset(tok)
    if issue is not None:
        why = f"AI 코스에 {'대중교통' if issue.get('via') == 'transit' else '카카오'} 실제 이동시간을 넣으니 '{issue['name']}'에 {issue['reason']} — 규칙 코스로 바꿨어요"
        ai.LAST["course"] = {"why": why, "at": __import__("time").strftime("%Y-%m-%d %H:%M:%S")}
        return None, {"reason": why}
    used = engine._mins(course.back_at) - engine._mins(course.start_time)
    if c.budget_min and used > c.budget_min:
        why = f"AI 코스가 쓸 수 있는 시간({c.budget_min // 60}시간)을 넘어 규칙 코스로 바꿨어요"
        ai.LAST["course"] = {"why": why, "at": __import__("time").strftime("%Y-%m-%d %H:%M:%S")}
        return None, {"reason": why}
    course.notes = notes
    return course, {"by": "ai", "model": ai.model_for("course"), "summary": str(data.get("summary") or "")[:200], "problems": problems}
