"""대화형 동이: 말은 LLM이, 갈 수 있는지·시간 계산은 엔진이.
- LLM 경로: Anthropic Messages API 도구 호출(tool use). 동이는 도구 결과에 있는 사실만 말한다.
- 규칙 경로: 키가 없거나 LLM이 실패하면 같은 도구를 규칙으로 불러 대화를 이어 간다 (시연이 멈추지 않게).
코스(장소·판정·시각)는 언제나 engine.plan 결과만 화면에 보낸다. LLM이 만든 코스는 쓰지 않는다."""
import json, os, re
from pathlib import Path
from typing import Callable

import httpx

from . import engine, llm, public_data
from .schemas import Conditions, Place

PROMPT = (Path(__file__).parent / "prompts" / "talk.md").read_text(encoding="utf-8")
TALK_MODEL = os.getenv("TALK_MODEL") or os.getenv("LLM_MODEL") or "claude-sonnet-5-5"
TALK_TIMEOUT = float(os.getenv("TALK_TIMEOUT") or 20)

WHO = ["혼자", "연인·친구", "부모님과", "아이와", "단체"]
MOVE = ["휠체어", "오래 걷기 어려움", "계단 어려움", "유모차"]
STYLE = ["바다 보기", "자연·산책", "카페", "맛집", "역사·문화"]
HELP_KINDS = ["info_center", "charger", "mobility_van", "city_tour", "events", "lodging", "restaurants", "parking", "taxi", "hospital_pharmacy"]

TOOLS = [
    {"name": "set_conditions", "description": "사용자가 말한 여행 조건을 저장한다. 말한 항목만 넣는다. move가 '없음'이면 move_none=true.",
     "input_schema": {"type": "object", "properties": {
         "who": {"type": "string", "enum": WHO}, "move": {"type": "array", "items": {"type": "string", "enum": MOVE}},
         "move_none": {"type": "boolean"}, "style": {"type": "array", "items": {"type": "string", "enum": STYLE}},
         "days": {"type": "string", "enum": ["당일", "1박 2일"]}, "start": {"type": "string", "enum": ["동해역", "묵호역", "자가용"]},
         "rain": {"type": "boolean"}, "memo": {"type": "string"}}}},
    {"name": "make_course", "description": "저장된 조건으로 코스를 계산한다. 누구와·이동 조건을 알면 부른다. 결과의 판정(G 가능/Y 주의/R 불가)과 시각만 말할 것.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "edit_course", "description": "현재 코스를 고친다. rain=실내 위주, less_walk=덜 걷기, add/remove=장소 넣기·빼기(place_id 필요).",
     "input_schema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["rain", "less_walk", "add", "remove"]},
                                                       "place_id": {"type": "string"}}, "required": ["action"]}},
    {"name": "place_info", "description": "장소 하나의 정보(구간 판정, 시설, 주변 이야기, 택시, 주차, 행사, 관람시간)를 가져온다.",
     "input_schema": {"type": "object", "properties": {"place_id": {"type": "string"}}, "required": ["place_id"]}},
    {"name": "find_help", "description": "여행 도움 정보: info_center(관광안내소·외국어), charger(전동휠체어 충전기), mobility_van(휠체어 차량 예약), city_tour, events(행사·축제), lodging(숙박, zone 필요), restaurants(식당, zone 필요), parking, taxi, hospital_pharmacy.",
     "input_schema": {"type": "object", "properties": {"kind": {"type": "string", "enum": HELP_KINDS},
                                                       "zone": {"type": "string", "enum": ["chuam", "mureung", "cheongok", "mukho", "mangsang", "station"]}},
                      "required": ["kind"]}},
]


class Session:
    """한 번의 /api/talk 요청 동안의 상태. 도구가 조건·코스를 바꾸면 여기에 남는다."""

    def __init__(self, places: dict[str, Place], body: dict):
        self.places = places
        self.c = Conditions(**body.get("conditions", {}))
        self.state = dict(body.get("state") or {})          # {"move_known": bool}
        self.course_ids = list(body.get("course_ids") or [])
        self.course = None
        self.lat, self.lon = body.get("lat") or 37.5245, body.get("lon") or 129.1143
        self.cards: list[dict] = []                          # 화면에 붙일 정보 카드

    # ---- 도구 ----
    def set_conditions(self, who=None, move=None, move_none=None, style=None, days=None, start=None, rain=None, memo=None):
        if who in WHO: self.c.who = who; self.state["who_known"] = True
        if move: self.c.move = sorted(set(self.c.move) | {m for m in move if m in MOVE}); self.state["move_known"] = True
        if move_none: self.c.move = []; self.state["move_known"] = True
        if style: self.c.style = [s for s in style if s in STYLE]
        if days in ("당일", "1박 2일"): self.c.days = days
        if start in ("동해역", "묵호역", "자가용"): self.c.start = start
        if rain is not None: self.c.rain = bool(rain)
        if memo: self.c.memo = memo[:200]
        return {"saved": self.c.model_dump(include={"who", "move", "style", "days", "start", "rain"})}

    def make_course(self):
        rain = bool(self.c.rain)
        res = engine.plan(self.places, self.c, rain)
        return self._course_result(res)

    def edit_course(self, action, place_id=None):
        places = self.places
        if action == "rain": self.c.rain = True
        elif action == "less_walk": self.c.move = sorted(set(self.c.move) | {"오래 걷기 어려움"})
        elif action == "add" and place_id in self.places:
            self.c.wish = list(dict.fromkeys([*self.course_ids, place_id])); self.c.must = list(dict.fromkeys([*self.c.must, place_id]))
        elif action == "remove" and place_id in self.places:
            self.c.wish = [i for i in self.course_ids if i != place_id]; places = {k: v for k, v in self.places.items() if k != place_id}
        else:
            return {"error": "알 수 없는 장소예요", "places": {k: v.name_ko for k, v in self.places.items()}}
        return self._course_result(engine.plan(places, self.c, bool(self.c.rain)))

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

    def find_help(self, kind, zone=None):
        lat, lon = self.lat, self.lon
        if self.course_ids and self.places[self.course_ids[0]].lat:
            p = self.places[self.course_ids[0]]; lat, lon = p.lat, p.lon
        zone = zone or (self.places[self.course_ids[-1]].zone if self.course_ids else "mukho")
        data = {
            "info_center": lambda: public_data.info_centers(lat, lon, self.c.lang, 2),
            "charger": lambda: public_data.chargers(lat, lon, 2),
            "mobility_van": lambda: public_data.mobility_center(),
            "city_tour": lambda: public_data.city_tour(self.course_ids),
            "events": lambda: public_data.events()["upcoming"][:3],
            "lodging": lambda: public_data.lodging(zone, 5),
            "restaurants": lambda: public_data.restaurants(zone, None, 5),
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
def _llm(s: Session, message: str, history: list[dict]) -> dict | None:
    if not llm.API_KEY:
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
    ctx = {"conditions": s.c.model_dump(include={"who", "move", "style", "days", "start", "rain", "lang"}),
           "state": s.state, "course": s.course_ids, "places": {k: v.name_ko for k, v in s.places.items()}}
    user = f"[현재 상태]{json.dumps(ctx, ensure_ascii=False)}\n[사용자]{message}"
    if merged and merged[-1]["role"] == "user":
        merged[-1]["content"] += "\n" + user
    else:
        merged.append({"role": "user", "content": user})
    try:
        for _ in range(5):   # 도구 호출은 최대 5번
            r = httpx.post("https://api.anthropic.com/v1/messages",
                           headers=llm.headers(),
                           json={"model": TALK_MODEL, "max_tokens": 700, "system": PROMPT, "tools": TOOLS, "messages": merged},
                           timeout=TALK_TIMEOUT)
            r.raise_for_status()
            out = r.json()
            merged.append({"role": "assistant", "content": out["content"]})
            uses = [b for b in out["content"] if b.get("type") == "tool_use"]
            if not uses:
                text = "".join(b.get("text", "") for b in out["content"] if b.get("type") == "text").strip()
                return s.result(text, "llm") if text else None
            merged.append({"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": u["id"], "content": json.dumps(s.call(u["name"], u.get("input") or {}), ensure_ascii=False)}
                for u in uses]})
    except Exception as e:
        print("[talk] llm fallback:", e, getattr(getattr(e, "response", None), "text", "")[:300])
    return None


# ---------------- 규칙 경로 ----------------
HELP_KW = [("charger", r"충전|charg"), ("mobility_van", r"휠체어\s*(차|택시|콜)|이동지원|장애인\s*콜|wheelchair (van|taxi)"),
           ("info_center", r"안내소|통역|외국어|interpret|info\w*\s*(center|centre|desk)|information"), ("city_tour", r"시티\s*투어|버스|city tour|bus"),
           ("events", r"행사|축제|공연|festival|event"), ("lodging", r"숙소|숙박|호텔|펜션|게스트|hotel|stay"),
           ("restaurants", r"식당|밥집|맛집|먹을|restaurant"), ("parking", r"주차|parking"), ("taxi", r"택시|taxi"),
           ("hospital_pharmacy", r"약국|병원|아파|다쳤|응급|pharmacy|hospital")]
WHO_KW = [("부모님과", r"부모|엄마|아빠|어머니|아버지|할머니|할아버지|parents?|mom|dad"), ("아이와", r"아이|아기|애기|딸|아들|kid|child|baby"),
          ("연인·친구", r"친구|연인|여자친구|남자친구|friend"), ("단체", r"단체|동아리|회사|group"), ("혼자", r"혼자|alone|solo")]
MOVE_KW = [("휠체어", r"휠체어|wheelchair"), ("유모차", r"유모차|stroller|pram"), ("계단 어려움", r"계단"),
           ("오래 걷기 어려움", r"무릎|오래\s*못\s*걷|걷기\s*(힘|어려)|다리가?\s*(아프|불편)|지팡이|walk")]
STYLE_KW = [("바다 보기", r"바다|해변|sea|beach"), ("자연·산책", r"자연|산책|계곡|숲|nature"), ("카페", r"카페|커피|cafe"),
            ("맛집", r"맛집|회|먹|food"), ("역사·문화", r"역사|문화|절|유적|history|culture")]
NO_MOVE = r"없어요|없음|괜찮|문제\s*없|다\s*잘\s*걸|no one|none|we're fine|no$"
GO = r"코스|짜\s*줘|추천|만들어|plan|course|go$"
ZONE_KW = [("mukho", "묵호|도째비"), ("chuam", "추암|촛대"), ("mureung", "무릉|삼화"), ("mangsang", "망상"), ("cheongok", "천곡|동굴")]

SAY = {
    "ko": {"ask_who": "누구랑 오셨어요? 편하게 말씀해 주세요.",
           "ask_move": "혹시 휠체어, 유모차를 쓰시거나 오래 걷기 힘든 분이 계세요? 없으면 '없어요'라고 해 주세요.",
           "made": "조건에 맞춰 {n}곳으로 코스를 짰어요.{caution} 바꾸고 싶은 게 있으면 말씀해 주세요.",
           "remade": "말씀하신 대로 코스를 다시 짰어요.{caution}",
           "caution": " 주의할 곳이 {k}곳 있으니 카드를 확인해 주세요.",
           "help": "찾아봤어요. 아래 카드를 확인해 주세요.",
           "none": "비, 덜 걷기, 장소 넣기·빼기를 말씀해 주시거나 충전기·안내소·숙소 같은 걸 물어봐 주세요."},
    "en": {"ask_who": "Who are you travelling with?",
           "ask_move": "Does anyone use a wheelchair or stroller, or find long walks hard? If not, just say 'none'.",
           "made": "I planned {n} stops for you.{caution} Tell me if you'd like any changes.",
           "remade": "Done — I re-planned the course.{caution}",
           "caution": " {k} of them need care — please check the cards.",
           "help": "Here's what I found — see the cards below.",
           "none": "Tell me about rain, less walking, or a place to add or remove — or ask about chargers, info centers or places to stay."},
}


def _rule(s: Session, message: str) -> dict:
    L = SAY[s.c.lang]
    low = message.lower()
    # 1) 도움 질문
    if re.search(r"아파|다쳤|응급|쓰러", message):
        s.find_help("hospital_pharmacy")
        return s.result("많이 놀라셨죠. 위급하면 바로 119에 전화해 주세요. 화면 위 '안심' 버튼에서 가까운 병원·약국을 보여 드려요." if s.c.lang == "ko"
                        else "If it's an emergency, call 119 now. Tap 'Safety' at the top for nearby hospitals and pharmacies.", "rule")
    for kind, pat in HELP_KW:
        if re.search(pat, low):
            zone = next((z for z, pz in ZONE_KW if re.search(pz, message)), None)
            s.find_help(kind, zone)
            return s.result(L["help"], "rule")
    # 2) 코스가 있으면 수정
    if s.course_ids:
        edit = llm.chat_edit(message, s.course_ids, {k: v.name_ko for k, v in s.places.items()}, s.c.lang)
        if edit["action"] != "none":
            s.edit_course(edit["action"], edit.get("place_id"))
            return s.result(_made(s, L, again=True), "rule")
    # 3) 조건 채우기
    who = next((w for w, p in WHO_KW if re.search(p, low)), None)
    move = [m for m, p in MOVE_KW if re.search(p, low)]
    style = [st for st, p in STYLE_KW if re.search(p, low)]
    s.set_conditions(who=who, move=move or None, move_none=bool(re.search(NO_MOVE, low)) and not move, style=style or None,
                     days="1박 2일" if re.search(r"1박|하룻밤|overnight", low) else None,
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


def _made(s: Session, L: dict, again: bool = False) -> str:
    k = sum(1 for st in s.course.stops if st.grade and st.grade != "G")
    dropped = [n for n in s.course.notes if "담아" in n]   # 넣어 달라고 한 곳을 못 넣은 이유는 꼭 말한다
    note = (" " + dropped[0]) if dropped and s.c.lang == "ko" else ""
    return L["remade" if again else "made"].format(n=len(s.course.stops), caution=L["caution"].format(k=k) if k else "") + note


def talk(places: dict[str, Place], body: dict) -> dict:
    s = Session(places, body)
    msg = (body.get("message") or "").strip()[:500]
    return _llm(s, msg, body.get("history") or []) or _rule(Session(places, body), msg)
