"""대화형 동이: 말은 LLM이, 갈 수 있는지·시간 계산은 엔진이.
- LLM 경로: Anthropic Messages API 도구 호출(tool use). 동이는 도구 결과에 있는 사실만 말한다.
- 규칙 경로: 키가 없거나 LLM이 실패하면 같은 도구를 규칙으로 불러 대화를 이어 간다 (시연이 멈추지 않게).
코스(장소·판정·시각)는 언제나 engine.plan 결과만 화면에 보낸다. LLM이 만든 코스는 쓰지 않는다."""
import json, os, re, datetime as dt
from pathlib import Path
from typing import Callable

import httpx

from . import edits, engine, llm, public_data
from .schemas import DAY_OPTS, Conditions, Place

PROMPT = (Path(__file__).parent / "prompts" / "talk.md").read_text(encoding="utf-8")
TALK_MODEL = os.getenv("TALK_MODEL") or os.getenv("LLM_MODEL") or "claude-haiku-5-5"
TALK_TIMEOUT = float(os.getenv("TALK_TIMEOUT") or 20)

WHO = ["혼자", "연인·친구", "부모님과", "아이와", "단체"]
MOVE = ["휠체어", "오래 걷기 어려움", "계단 어려움", "유모차"]
STYLE = ["바다 보기", "자연·산책", "산·등산", "카페", "맛집", "역사·문화"]
HELP_KINDS = ["info_center", "charger", "mobility_van", "city_tour", "events", "lodging", "restaurants", "parking", "taxi", "hospital_pharmacy"]

TOOLS = [
    {"name": "set_conditions", "description": "사용자가 말한 여행 조건을 저장한다. 말한 항목만 넣는다. move가 '없음'이면 move_none=true.",
     "input_schema": {"type": "object", "properties": {
         "who": {"type": "string", "enum": WHO}, "move": {"type": "array", "items": {"type": "string", "enum": MOVE}},
         "move_none": {"type": "boolean"}, "style": {"type": "array", "items": {"type": "string", "enum": STYLE}},
         "days": {"type": "string", "enum": list(DAY_OPTS)}, "start": {"type": "string", "enum": ["동해역", "묵호역", "자가용"]},
         "rain": {"type": "boolean"}, "memo": {"type": "string"},
         "date": {"type": "string", "description": "여행 날짜 YYYY-MM-DD. [현재 상태]의 today를 기준으로 '이번 주 금요일' 같은 말을 날짜로 바꾼다"},
         "start_time": {"type": "string", "description": "출발 시각 HH:MM"},
         "meal": {"type": "array", "items": {"type": "string", "enum": ["입식", "부드러운 메뉴", "주차 편한 곳"]}, "description": "식당 바람. 의자·입식 테이블=입식"},
         "weather_pref": {"type": "string", "enum": ["", "실내", "실외"]}}}},
    {"name": "make_course", "description": "저장된 조건으로 코스를 계산한다. 누구와·이동 조건을 알면 부른다. 결과의 판정(G 가능/Y 주의/R 불가)과 시각만 말할 것. "
     "대화에서 드러난 바람(분위기·먹고 싶은 것·보고 싶은 것)에 맞는 장소를 [장소 목록]에서 골라 prefer에 넣으면 그곳을 먼저 넣는다(관광지 최대 3곳, 식당 1곳). "
     "'다른 코스', '별로예요', '새로'면 fresh=true로 지금 코스의 관광지를 빼고 새로 짠다. 싫다는 곳은 avoid에.",
     "input_schema": {"type": "object", "properties": {
         "prefer": {"type": "array", "items": {"type": "string"}, "description": "먼저 넣을 장소 id ([장소 목록]의 id만)"},
         "avoid": {"type": "array", "items": {"type": "string"}, "description": "빼 달라는 장소 id"},
         "fresh": {"type": "boolean", "description": "지금 코스와 다른 곳으로 새로 짜기"}}}},
    {"name": "edit_course", "description": "현재 코스를 고친다. 엔진이 이동·체류 시간과 요일 휴무·브레이크타임을 다시 검사한다. "
     "remove/replace/add=장소 빼기·다른 곳으로 바꾸기·넣기(place_id 필요), replace_lunch=점심 식당 바꾸기, remove_uphill=오르막 있는 곳 빼기, "
     "relax=여유 있게 한 곳 줄이기, indoor=비 와서 실내로, flat=덜 걷는 평지로, add_cafe=중간에 쉴 카페, set_when=날짜·출발 시각 바꾸기(when 필요).",
     "input_schema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["remove", "replace", "add", "replace_lunch", "remove_uphill",
                                                                                           "relax", "indoor", "flat", "add_cafe", "set_when"]},
                                                       "place_id": {"type": "string"},
                                                       "when": {"type": "string", "description": "YYYY-MM-DD HH:MM 중 바꿀 것만 (예: '2026-11-21', '14:00')"}},
                      "required": ["action"]}},
    {"name": "place_info", "description": "장소 하나의 정보(구간 판정, 시설, 주변 이야기, 택시, 주차, 행사, 관람시간)를 가져온다.",
     "input_schema": {"type": "object", "properties": {"place_id": {"type": "string"}}, "required": ["place_id"]}},
    {"name": "transit", "description": "차 없이 다닐 때: 출발역→코스 장소→출발역 구간마다 걸어갈 만한지, 대중교통 길찾기 링크(카카오맵, 실제 버스 노선·시간), 택시 승차대, 시티투어가 지나는 곳, 휠체어 차량을 알려 준다. "
     "버스 번호는 결과의 bus_2019(2019년 자료)에 있는 것만, 연도를 밝혀서 말한다. 시간표는 없으니 지어내지 말고 '카드의 길찾기 링크에서 볼 수 있어요'라고 말한다.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "weather", "description": "동해시 날씨 예보(최대 16일). 여행 날짜와 앞뒤 며칠의 날씨·비 올 확률·기온.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "find_help", "description": "여행 도움 정보: info_center(관광안내소·외국어), charger(전동휠체어 충전기), mobility_van(휠체어 차량 예약), city_tour, events(행사·축제), lodging(숙박, zone 필요), restaurants(근처 식당: 동해시 일반음식점 1,400여 곳에서 거리순, 코스 점심 장소나 zone 기준. 음식 종류를 말하면 food에 넣는다), parking, taxi, hospital_pharmacy.",
     "input_schema": {"type": "object", "properties": {"kind": {"type": "string", "enum": HELP_KINDS},
                                                       "zone": {"type": "string", "enum": ["chuam", "mureung", "cheongok", "mukho", "mangsang", "station"]},
                                                       "food": {"type": "string", "enum": ["한식", "회·해산물", "고기·탕", "중식", "분식·국수", "양식·일식", "치킨"]}},
                      "required": ["kind"]}},
]


# 프롬프트 캐싱: 매번 똑같은 시스템 프롬프트·장소 목록·도구 설명은 캐시해서 두 번째 호출부터 입력 비용을 크게 줄인다
SYSTEM = [{"type": "text", "text": PROMPT, "cache_control": {"type": "ephemeral"}}]
ZONE_KO = {"mukho": "묵호", "mangsang": "망상", "chuam": "추암", "mureung": "무릉", "cheongok": "천곡", "station": "동해역"}
_CAT: dict = {}


def catalog(places: dict[str, Place]) -> str:
    """동이가 대화에 맞춰 고를 수 있게 넘기는 장소 목록 (관광지·식당·카페). 바뀔 때만 다시 만든다."""
    key = tuple(sorted(places))
    if _CAT.get("key") != key:
        rows = [f"{p.id}|{p.name_ko}|{p.type}|{ZONE_KO.get(p.zone, p.zone)}|{','.join(p.styles)}|{'실내' if p.indoor else '실외'}|{(p.tip_ko or '').replace(chr(10), ' ')[:50]}"
                for p in places.values() if p.type != "숙박" and p.lat is not None]
        _CAT.update(key=key, text="[장소 목록] id|이름|종류|권역|특징|실내외|한 줄 설명\n" + "\n".join(rows))
    return _CAT["text"]


def system_for(places: dict[str, Place]) -> list:
    return [{"type": "text", "text": PROMPT}, {"type": "text", "text": catalog(places), "cache_control": {"type": "ephemeral"}}]
CACHED_TOOLS = TOOLS[:-1] + [{**TOOLS[-1], "cache_control": {"type": "ephemeral"}}]


class Session:
    """한 번의 /api/talk 요청 동안의 상태. 도구가 조건·코스를 바꾸면 여기에 남는다."""

    def __init__(self, places: dict[str, Place], body: dict):
        self.places = places
        self.c = Conditions(**body.get("conditions", {}))
        self.state = dict(body.get("state") or {})          # {"move_known": bool}
        self.course_ids = list(body.get("course_ids") or [])
        self.course_ids_before = list(self.course_ids)
        self.course = None
        self.lat, self.lon = body.get("lat") or 37.5245, body.get("lon") or 129.1143
        self.cards: list[dict] = []                          # 화면에 붙일 정보 카드

    # ---- 도구 ----
    def set_conditions(self, who=None, move=None, move_none=None, style=None, days=None, start=None, rain=None, memo=None,
                       date=None, start_time=None, meal=None, weather_pref=None):
        if who in WHO: self.c.who = who; self.state["who_known"] = True
        if move: self.c.move = sorted(set(self.c.move) | {m for m in move if m in MOVE}); self.state["move_known"] = True
        if move_none: self.c.move = []; self.state["move_known"] = True
        if style: self.c.style = [s for s in style if s in STYLE]
        if days in DAY_OPTS: self.c.days = days
        if start in ("동해역", "묵호역", "자가용"): self.c.start = start
        if rain is not None: self.c.rain = bool(rain)
        if memo: self.c.memo = memo[:200]
        if date and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(date)):
            try:
                d = dt.date.fromisoformat(date)
                if engine.trip_date(Conditions()) <= d <= engine.trip_date(Conditions()) + dt.timedelta(days=90): self.c.date = date
            except ValueError:
                pass
        if start_time and re.fullmatch(r"\d{1,2}:\d{2}", str(start_time)): self.c.start_time = start_time.zfill(5)
        if meal: self.c.meal = [m for m in meal if m in ("입식", "부드러운 메뉴", "주차 편한 곳")]
        if weather_pref in ("", "실내", "실외"): self.c.weather_pref = weather_pref
        return {"saved": self.c.model_dump(include={"who", "move", "style", "days", "start", "rain", "date", "start_time", "meal", "weather_pref"})}

    def make_course(self, prefer=None, avoid=None, fresh=False):
        P = self.places
        if fresh and self.course_ids:   # 지금 코스의 관광지를 빼고 새로 (점심·카페는 다시 고른다)
            sights = [i for i in self.course_ids if i in P and P[i].type not in ("식당", "카페")]
            self.c.exclude = sorted(set(self.c.exclude) | set(sights))
            self.c.must = [m for m in self.c.must if m not in sights]
            self.c.lunch = None
        if avoid:
            self.c.exclude = sorted(set(self.c.exclude) | {i for i in avoid if i in P})
        if prefer:
            ok = [i for i in prefer if i in P and i not in self.c.exclude and P[i].type != "숙박"]
            sights = [i for i in ok if P[i].type not in ("식당", "카페")][:3]
            if sights:
                self.c.must = sights
            food = next((i for i in ok if P[i].type == "식당"), None)
            if food:
                self.c.lunch = food
        rain = engine.rain_for(self.c)
        res = engine.plan(P, self.c, rain)
        if fresh and sum(1 for s in res.stops if s.kind == "sight") < 2 and self.course_ids:
            # 조건이 까다로워 갈 곳이 모자라면 앞 코스의 절반만 빼고 다시
            back = [i for i in self.course_ids if i in P and P[i].type not in ("식당", "카페")][1::2]
            self.c.exclude = [x for x in self.c.exclude if x not in back]
            res = engine.plan(P, self.c, rain)
        return self._course_result(res)

    def transit(self):
        ids = self.course_ids or []
        pts = [(i, self.places[i].name_ko if self.c.lang == "ko" else (self.places[i].name_en or self.places[i].name_ko), self.places[i].lat, self.places[i].lon)
               for i in ids if i in self.places]
        data = public_data.transit(pts, self.c.start, self.c.move, self.c.lang)
        self.cards.append({"kind": "transit", "data": data})
        return {"start": data["start"], "hops": [{k: h[k] for k in ("from", "to", "km", "how", "walk_min", "car_min", "bus_2019")} for h in data["hops"]],
                "bus_note": "bus_2019는 " + data["bus_src"] + "의 버스 번호. 말할 때는 '2019년 자료라 바뀌었을 수 있다'고 꼭 덧붙인다",
                "city_tour": bool(data["city_tour"]), "taxi": data["taxi"], "wheelchair_van": bool(data["van"]), "note": data["note"],
                "course_ready": bool(ids)}

    def weather(self):
        from . import public_apis
        fc = public_apis.forecast() or {}
        day = self.c.date or engine.trip_date(self.c).isoformat()
        days = fc.get("days") or []
        i = next((k for k, d in enumerate(days) if d.get("date") == day), 0)
        return {"trip_date": day, "days": days[max(0, i - 1): i + 3]} if days else {"error": "지금은 예보를 불러오지 못했어요"}

    def edit_course(self, action, place_id=None, when=None, text=""):
        """작업3: 규칙 편집기(edits.apply)와 같은 길로 고친다 — AI가 있든 없든 결과가 같다."""
        action = {"rain": "indoor", "less_walk": "flat"}.get(action, action)
        if action in ("remove", "replace", "add") and place_id not in self.places:
            return {"error": "알 수 없는 장소예요", "places": {k: v.name_ko for k, v in self.places.items()}}
        self.c, res, reply, *_ = edits.run(self.places, self.c, self.course_ids, text, action, place_id if action != "set_when" else when)
        self.last_reply = reply
        out = self._course_result(res)
        out["did"] = reply
        return out

    def _course_result(self, res):
        self.course = res
        self.course_ids = [s.id for s in res.stops]
        name = (lambda p: p.name_ko) if self.c.lang == "ko" else (lambda p: p.name_en or p.name_ko)
        return {"mode": res.mode, "overall": res.overall, "back_at": res.back_at, "notes": res.notes,
                "stops": [{"id": s.id, "name": name(self.places[s.id]), "arrive": s.arrive, "grade": s.grade,
                           "verified": self.places[s.id].verified} for s in res.stops]}

    def place_info(self, place_id):
        p = self.places.get(place_id)
        if not p:
            return {"error": "알 수 없는 장소", "places": {k: v.name_ko for k, v in self.places.items()}}
        mode = engine.mode_from(self.c.move)
        segs = [{"name": s.name, "grade": engine.grade_segment(s, mode) if mode != "none" else s.grade, "note": s.note, "source": s.source}
                for s in p.segments]
        return {"name": p.name_ko, "verified": p.verified, "segments": segs, "facilities": p.facilities, "tip": p.tip_ko,
                "intro": p.intro_ko[:200], "phone": p.phone, "hours": p.hours, "closed_days": p.closed_days, "fee": p.fee,
                "stories": public_data.stories(p.lat, p.lon, limit=2), "taxi": public_data.taxi_for(p.id),
                "parking": public_data.parking_near(p.lat, p.lon, limit=1), "events": public_data.events_near(p.lat, p.lon),
                "park": public_data.parks_near(p.lat, p.lon)}

    def find_help(self, kind, zone=None, food=None):
        lat, lon = self.lat, self.lon
        if self.course_ids and self.places[self.course_ids[0]].lat:
            p = self.places[self.course_ids[0]]; lat, lon = p.lat, p.lon
        # 식당: 말한 권역 > 코스 점심 장소 > 코스 첫 장소 > 현재 위치
        elat, elon = lat, lon
        lunch = next((self.places[i] for i in self.course_ids if self.places[i].type in ("식당",) and self.places[i].lat), None)
        if lunch:
            elat, elon = lunch.lat, lunch.lon
        if zone:
            zp = next((p for p in self.places.values() if p.zone == zone and p.type == "관광지" and p.lat and not p.sample), None)
            if zp:
                elat, elon = zp.lat, zp.lon
        zone = zone or (self.places[self.course_ids[-1]].zone if self.course_ids else "mukho")
        data = {
            "info_center": lambda: public_data.info_centers(lat, lon, self.c.lang, 2),
            "charger": lambda: public_data.chargers(lat, lon, 2),
            "mobility_van": lambda: public_data.mobility_center(),
            "city_tour": lambda: public_data.city_tour(self.course_ids),
            "events": lambda: public_data.events()["upcoming"][:3],
            "lodging": lambda: public_data.lodging(zone, 5),
            "restaurants": lambda: public_data.eateries(elat, elon, food or "", 1000, 5)["count"] and public_data.eateries(elat, elon, food or "", 1000, 5) or public_data.eateries(elat, elon, food or "", 3000, 5),
            "parking": lambda: public_data.parking_near(lat, lon, 3000, 2),
            "taxi": lambda: [t for pid in self.course_ids for t in public_data.taxi_for(pid)][:2] or public_data.taxi_at_start(self.c.start),
            "hospital_pharmacy": lambda: {"say": "화면 위 '안심' 버튼에서 지금 문 연 약국·병원과 응급실을 보여 드려요. 위급하면 119."},
        }.get(kind, lambda: {"error": "모르는 종류"})()
        self.cards.append({"kind": kind, "data": data})
        return data

    def call(self, name: str, args: dict):
        fn: Callable = getattr(self, name, None)
        if name not in {t["name"] for t in TOOLS} or fn is None:
            return {"error": "없는 도구"}
        try:
            return fn(**args)
        except TypeError as e:
            return {"error": f"인자 오류: {e}"}

    def result(self, reply: str, via: str) -> dict:
        pose = "happy" if self.course else ("ask" if reply.rstrip().endswith("?") else "neutral")
        return {"reply": reply, "pose": pose, "via": via, "conditions": self.c.model_dump(), "state": self.state,
                "course": self.course.model_dump() if self.course else None, "cards": self.cards}


# ---------------- LLM 경로 ----------------
def days_from(low: str):
    """'2박 3일', '하룻밤', '일주일', '2주', '한 달' → 여행 기간 값."""
    if re.search(r"한\s?달|한달|2주\s?이상|보름 이상|month", low): return "한 달 살기"
    if re.search(r"2주|보름|two weeks", low): return "13박 14일"
    if re.search(r"일주일|1주|6박|a week", low): return "6박 7일"
    m = re.search(r"([1-4])박", low)
    if m: return {"1": "1박 2일", "2": "2박 3일", "3": "3박 4일", "4": "4박 5일"}[m.group(1)]
    if re.search(r"하룻밤|overnight", low): return "1박 2일"
    return None


def _llm(s: Session, message: str, history: list[dict]) -> dict | None:
    if not llm.API_KEY:
        llm.count("talk", False)
        return None
    msgs = [{"role": "user" if h.get("me") else "assistant", "content": h["text"]} for h in history[-10:] if h.get("text")]
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    merged: list[dict] = []
    for m in msgs:   # 같은 역할이 이어지면 합친다 (API 규칙)
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] += "\n" + m["content"]
        else:
            merged.append(m)
    today = engine.trip_date(Conditions())
    ctx = {"today": f"{today.isoformat()} ({'월화수목금토일'[today.weekday()]})",
           "conditions": s.c.model_dump(include={"who", "move", "style", "days", "start", "rain", "lang", "date", "start_time", "meal", "weather_pref"}),
           "state": s.state, "course": s.course_ids}
    user = f"[현재 상태]{json.dumps(ctx, ensure_ascii=False)}\n[사용자]{message}"
    if merged and merged[-1]["role"] == "user":
        merged[-1]["content"] += "\n" + user
    else:
        merged.append({"role": "user", "content": user})
    try:
        for _ in range(5):   # 도구 호출은 최대 5번
            r = httpx.post("https://api.anthropic.com/v1/messages",
                           headers=llm.headers(),
                           json={"model": TALK_MODEL, "max_tokens": 1500, "system": system_for(s.places), "tools": CACHED_TOOLS, "messages": merged},
                           timeout=TALK_TIMEOUT)
            r.raise_for_status()
            out = r.json()
            llm.count("talk", True, sum((out.get("usage") or {}).get(k, 0) for k in ("input_tokens", "output_tokens")))
            merged.append({"role": "assistant", "content": out["content"]})
            uses = [b for b in out["content"] if b.get("type") == "tool_use"]
            text = "".join(b.get("text", "") for b in out["content"] if b.get("type") == "text").strip()
            if not uses:
                return s.result(text or _after(s), "llm")
            merged.append({"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": u["id"], "content": json.dumps(s.call(u["name"], u.get("input") or {}), ensure_ascii=False)}
                for u in uses]})
        return s.result(_after(s), "llm")   # 도구를 다섯 번 써도 말이 없으면 지금 상태로 마무리
    except Exception as e:
        llm.count("talk", False)
        print("[talk] llm fallback:", e, getattr(getattr(e, "response", None), "text", "")[:300])
    return None


# ---------------- 규칙 경로 ----------------
HELP_KW = [("charger", r"충전|charg"), ("mobility_van", r"휠체어\s*(차|택시|콜)|이동지원|장애인\s*콜|wheelchair (van|taxi)"),
           ("info_center", r"안내소|통역|외국어|interpret|info\w*\s*(center|centre|desk)|information"), ("city_tour", r"시티\s*투어|버스|city tour|bus"),
           ("events", r"행사|축제|공연|festival|event"), ("lodging", r"숙소|숙박|호텔|펜션|게스트|hotel|stay"),
           ("restaurants", r"식당|밥집|맛집|먹을|restaurant|짜장|짬뽕|중국집|횟집|국밥|냉면|칼국수|치킨"), ("parking", r"주차|parking"), ("taxi", r"택시|taxi"),
           ("hospital_pharmacy", r"약국|병원|아파|다쳤|응급|pharmacy|hospital")]
WHO_KW = [("부모님과", r"부모|엄마|아빠|어머니|아버지|할머니|할아버지|parents?|mom|dad"), ("아이와", r"아이|아기|애기|딸|아들|kid|child|baby"),
          ("연인·친구", r"친구|연인|여자친구|남자친구|friend"), ("단체", r"단체|동아리|회사|group"), ("혼자", r"혼자|alone|solo")]
MOVE_KW = [("휠체어", r"휠체어|wheelchair"), ("유모차", r"유모차|stroller|pram"), ("계단 어려움", r"계단"),
           ("오래 걷기 어려움", r"무릎|오래\s*못\s*걷|걷기\s*(힘|어려)|다리가?\s*(아프|불편)|지팡이|walk")]
STYLE_KW = [("바다 보기", r"바다|해변|sea|beach"), ("자연·산책", r"자연|산책|계곡|숲|nature"), ("카페", r"카페|커피|cafe"),
            ("맛집", r"맛집|회|먹|food"), ("역사·문화", r"역사|문화|절|유적|history|culture"),
            ("산·등산", r"등산|산행|하이킹|hiking|hike|mountain|봉우리|산에\s*(가|오르)|산\s*(가고|타고|오르)|(^|\s)산(이|을|으로)?(\s|$)")]
NO_MOVE = r"없어요|없음|괜찮|문제\s*없|다\s*잘\s*걸|no one|none|we're fine|no$"
GO = r"코스|짜\s*줘|추천|만들어|plan|course|go$"
OTHER = r"다른\s*(코스|곳|데)|딴\s*(데|곳)|별로|새로\s*(짜|만들)|another|different"
TRANSIT = r"대중교통|차\s*(가|는|도)?\s*없|뚜벅|버스\s*(타|로|노선)|어떻게\s*가|가는\s*(길|법)|by bus|public transport|no car|without a car"
WEATHER = r"날씨|기온|더워|추워|weather"
ZONE_KW = [("mukho", "묵호|도째비"), ("chuam", "추암|촛대"), ("mureung", "무릉|삼화"), ("mangsang", "망상"), ("cheongok", "천곡|동굴")]

SAY = {
    "ko": {"ask_who": "누구랑 오셨어요? 편하게 말씀해 주세요.",
           "ask_move": "혹시 휠체어, 유모차를 쓰시거나 오래 걷기 힘든 분이 계세요? 없으면 '없어요'라고 해 주세요.",
           "made": "조건에 맞춰 {n}곳으로 코스를 짰어요.{caution} 바꾸고 싶은 게 있으면 말씀해 주세요.",
           "remade": "말씀하신 대로 코스를 다시 짰어요.{caution}",
           "caution": " 주의할 곳이 {k}곳 있으니 카드를 확인해 주세요.",
           "help": "찾아봤어요. 아래 카드를 확인해 주세요.",
           "none": "비, 덜 걷기, 장소 넣기·빼기를 말씀해 주시거나 충전기·안내소·숙소 같은 걸 물어봐 주세요.",
           "transit": "차 없이 가는 방법을 구간마다 정리했어요. 카드의 길찾기를 누르면 카카오맵에서 버스 노선과 시간을 바로 볼 수 있어요.",
           "weather": "그날 동해는 {tmin}~{tmax}도, 비 올 확률 {pop}%예요. 비가 오면 '실내로 바꿔 줘'라고 말씀해 주세요.",
           "weather_none": "지금은 날씨 예보를 불러오지 못했어요. 잠시 뒤 다시 물어봐 주세요."},
    "en": {"ask_who": "Who are you travelling with?",
           "ask_move": "Does anyone use a wheelchair or stroller, or find long walks hard? If not, just say 'none'.",
           "made": "I planned {n} stops for you.{caution} Tell me if you'd like any changes.",
           "remade": "Done — I re-planned the course.{caution}",
           "caution": " {k} of them need care — please check the cards.",
           "help": "Here's what I found — see the cards below.",
           "none": "Tell me about rain, less walking, or a place to add or remove — or ask about chargers, info centers or places to stay.",
           "transit": "Here's how to get around without a car, leg by leg. Tap a route link to see live bus routes in Kakao Map.",
           "weather": "Donghae that day: {tmin}–{tmax}°C, {pop}% chance of rain. If it rains, say 'switch to indoor'.",
           "weather_none": "I couldn't load the forecast right now. Please ask again shortly."},
}


def _rule(s: Session, message: str) -> dict:
    L = SAY[s.c.lang]
    low = message.lower()
    # 1) 도움 질문
    if re.search(r"아파|다쳤|응급|쓰러", message):
        s.find_help("hospital_pharmacy")
        return s.result("많이 놀라셨죠. 위급하면 바로 119에 전화해 주세요. 화면 위 '안심' 버튼에서 가까운 병원·약국을 보여 드려요." if s.c.lang == "ko"
                        else "If it's an emergency, call 119 now. Tap 'Safety' at the top for nearby hospitals and pharmacies.", "rule")
    if re.search(TRANSIT, low):
        if re.search(r"차\s*(가|는|도)?\s*없|뚜벅|no car|without a car", low) and s.c.start == "자가용":
            s.c.start = "동해역"
        s.transit()
        return s.result(L["transit"], "rule")
    if re.search(WEATHER, low) and not re.search(r"비\s*(와|오|가)", message):
        w = s.weather()
        d = next((x for x in w.get("days", []) if x.get("date") == w.get("trip_date")), None)
        return s.result(L["weather"].format(**d) if d and all(d.get(k) is not None for k in ("tmin", "tmax", "pop")) else L["weather_none"], "rule")
    for kind, pat in HELP_KW:
        if re.search(pat, low):
            zone = next((z for z, pz in ZONE_KW if re.search(pz, message)), None)
            s.find_help(kind, zone, public_data.eat_group(message) if kind == "restaurants" else None)
            return s.result(L["help"], "rule")
    # 2) 코스가 있으면 수정 ('다른 코스'는 지금 관광지를 빼고 새로)
    if s.course_ids and re.search(OTHER, low):
        s.make_course(fresh=True)
        return s.result(_made(s, L, again=True), "rule")
    if s.course_ids:
        r = edits.apply(s.places, s.c, s.course_ids, message)
        if r["action"] == "nearby":
            s.find_help("parking"); s.find_help("charger")
            return s.result(r["reply"], "rule")
        if r["action"] != "none":
            s.edit_course(r["action"], r["target"], None, message)
            return s.result(s.last_reply, "rule")
    # 3) 조건 채우기
    who = next((w for w, p in WHO_KW if re.search(p, low)), None)
    move = [m for m, p in MOVE_KW if re.search(p, low)]
    style = [st for st, p in STYLE_KW if re.search(p, low)]
    s.set_conditions(who=who, move=move or None, move_none=bool(re.search(NO_MOVE, low)) and not move, style=style or None,
                     days=days_from(low),
                     start=("묵호역" if re.search(r"묵호역|mukho st", low) else "동해역" if re.search(r"동해역|donghae st", low)
                           else "자가용" if re.search(r"차로|자가용|운전|by car|driving", low) else None),
                     rain=True if llm.RAIN.search(message) else None)
    if not s.state.get("who_known") and not who and not s.course_ids:
        return s.result(L["ask_who"], "rule")
    if not s.state.get("move_known"):
        return s.result(L["ask_move"], "rule")
    if not s.course_ids or re.search(GO, low) or who or move or style:
        s.make_course()
        return s.result(_made(s, L), "rule")
    return s.result(L["none"], "rule")


def _after(s: Session) -> str:
    """LLM이 말 없이 끝났을 때의 마무리 한마디 (대화가 끊기지 않게)."""
    L = SAY[s.c.lang]
    if s.course:
        return _made(s, L)
    if s.cards:
        return L["help"]
    return L["none"]


def _made(s: Session, L: dict, again: bool = False) -> str:
    k = sum(1 for st in s.course.stops if st.grade and st.grade != "G")
    dropped = [n for n in s.course.notes if "담아" in n]   # 넣어 달라고 한 곳을 못 넣은 이유는 꼭 말한다
    note = (" " + dropped[0]) if dropped and s.c.lang == "ko" else ""
    return L["remade" if again else "made"].format(n=len(s.course.stops), caution=L["caution"].format(k=k) if k else "") + note


def talk(places: dict[str, Place], body: dict) -> dict:
    s = Session(places, body)
    msg = (body.get("message") or "").strip()[:500]
    return _llm(s, msg, body.get("history") or []) or _rule(Session(places, body), msg)
