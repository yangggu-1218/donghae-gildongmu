"""동해 길동무 API 서버.
실행: cd backend && uvicorn app.main:app --reload --port 8000
키가 없어도 data/places.json(없으면 data/places_seed.json) 예시 데이터로 동작한다."""
import io, json, os, uuid, datetime as dt
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from .schemas import Place, Conditions, ChatEdit
from . import edits, engine, llm, public_apis, public_data, details, talk as talk_mod

DATA = Path(__file__).resolve().parents[2] / "data"
app = FastAPI(title="동해 길동무 API")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])


def load_places() -> dict[str, Place]:
    f = DATA / "places.json"
    if not f.exists():
        f = DATA / "places_seed.json"
    places = {p["id"]: Place(**p) for p in json.loads(f.read_text(encoding="utf-8"))}
    places = public_data.enrich(places)   # 공공데이터로 좌표·전화·소개 보정, 장소 추가
    return details.apply(places)          # 영업시간·어르신 접근성 상세, 예시 식당·카페


PLACES = load_places()


@app.get("/api/health")
def health():
    return {"ok": True, "places": len(PLACES), "verified": sum(p.verified for p in PLACES.values()),
            "official_coords": sum(bool(p.coord_source) for p in PLACES.values()),
            "llm": bool(llm.API_KEY), "ai": llm.status(), "public_api": bool(public_apis.KEY), "public_files": public_data.sources()}


@app.get("/api/places")
def places(mode: str = "none"):
    return [{**p.model_dump(), "verified": p.verified, "grade": engine.grade_place(p, mode) if p.verified else None} for p in PLACES.values()]


@app.get("/api/places/{pid}")
def place_detail(pid: str, lang: str = "ko"):
    """장소 상세: 기본 정보 + 주변 향토유산 이야기 + 지나는 걷기길 + 가까운 관광안내소."""
    p = PLACES.get(pid)
    if not p:
        raise HTTPException(404, "알 수 없는 장소예요")
    return {**p.model_dump(), "verified": p.verified, **extras(p, lang)}


def extras(p: Place, lang: str = "ko") -> dict:
    return {"stories": public_data.stories(p.lat, p.lon), "trail_info": public_data.trails(p.trails),
            "info_center": (public_data.info_centers(p.lat, p.lon, lang, limit=1) or [None])[0] if p.lat else None,
            "parking_near": public_data.parking_near(p.lat, p.lon), "taxi": public_data.taxi_for(p.id),
            "signals": public_data.signals_near(p.lat, p.lon), "charger": (public_data.chargers(p.lat, p.lon, 1) or [None])[0],
            "park": public_data.parks_near(p.lat, p.lon), "events_here": public_data.events_near(p.lat, p.lon),
            "hours": p.hours, "closed_days": p.closed_days, "fee": p.fee}


@app.post("/api/course")
def course(c: Conditions):
    if c.memo:   # 자유 입력에서 조건을 보충 (AI 실패 시 규칙 기반)
        extra = llm.parse_conditions(c.memo)
        c.move = sorted(set(c.move) | set(extra.get("move", [])) - {"없어요"})
        if c.rain is None and extra.get("rain"):
            c.rain = True
    today = engine.trip_date(Conditions()).isoformat()
    rain = c.rain if c.rain is not None else (public_apis.rain_today()["rain"] if (c.date or today) == today else False)
    result = engine.plan(PLACES, c, rain)
    stops = [{"id": s.id, "name": PLACES[s.id].name_ko if c.lang == "ko" else PLACES[s.id].name_en,
              "grade": s.grade, "facilities": PLACES[s.id].facilities,
              "tip": PLACES[s.id].tip_ko if c.lang == "ko" else PLACES[s.id].tip_en} for s in result.stops]
    ex = llm.explain(stops, c.model_dump(), c.lang)
    for s in result.stops:
        s.why = ex["why"].get(s.id, "")
    return course_payload(result, c, rain, ex.get("summary", ""))


@app.post("/api/edit")
def edit(body: dict):
    """작업3: AI 없이 규칙으로 코스 고치기. body: {conditions, course_ids, text? | action?, target?}
    빼기·바꾸기·날짜/시간 변경 모두 조건만 바꾸고 엔진이 처음부터 다시 계산한다(영업시간 재검사)."""
    c, result, reply, act, target, changed = edits.run(PLACES, Conditions(**body.get("conditions", {})), body.get("course_ids", []),
                                                       (body.get("text") or "")[:300], body.get("action") or "", body.get("target"))
    out = course_payload(result, c, bool(c.rain))
    out.update({"reply": reply, "action": act, "target": target, "changed": changed, "via": "rule"})
    return out


def stop_info(p: Place, lang: str, weekday: int, at_min: int) -> dict:
    """작업2-3: 타임라인 카드에 한눈에 보일 값 (보행 난이도, 테이블, 주차·충전기·병원·약국)."""
    keys = ("walk_load", "wheelchair", "entrance_step", "table", "benches", "carer_tip", "indoor", "soft_menu", "parking_easy",
            "hours_source", "access_source", "sample", "type")
    return {**{k: getattr(p, k) for k in keys}, "nearby": details.nearby(p, lang, weekday, at_min)}


def course_payload(result, c: Conditions, rain: bool, summary: str = "") -> dict:
    """코스 응답 하나로 통일 (/api/course, /api/edit, /api/talk)."""
    for s in result.stops:
        if not s.why:
            p = PLACES[s.id]
            s.why = p.tip_ko if c.lang == "ko" else (p.tip_en or p.tip_ko)
    on_day = public_data.events_on(result.date)
    return {"course": result.model_dump(), "rain": rain, "summary": summary, "conditions": c.model_dump(),
            "extras": {s.id: {"phone": PLACES[s.id].phone, "address": PLACES[s.id].address, **extras(PLACES[s.id], c.lang),
                              **stop_info(PLACES[s.id], c.lang, result.weekday, engine._mins(s.arrive))} for s in result.stops},
            "stay": stay_hint(result, c), "events": on_day or public_data.events()["upcoming"][:3], "events_on_day": bool(on_day),
            "move": move_hint(result, c)}


def move_hint(result, c: Conditions):
    """차 없이 오는 경우: 출발역 택시 승차대 + 시티투어(코스 장소를 지나는 경우)."""
    if c.start == "자가용":
        return None
    ids = [s.id for s in result.stops]
    xy = engine.STARTS[c.start]
    return {"taxi": public_data.taxi_at_start(c.start), "city_tour": public_data.city_tour(ids),
            "rentals": public_data.rentals_near(*xy),
            "mobility_center": public_data.mobility_center() if "휠체어" in c.move else None}


@app.get("/api/stats")
def stats():
    return public_data.stats()


@app.get("/api/chargers")
def chargers(lat: float = 37.5245, lon: float = 129.1143):
    return public_data.chargers(lat, lon, limit=10)


@app.get("/api/city-tour")
def city_tour():
    return public_data.city_tour()


@app.get("/api/restaurants")
def restaurants(zone: str, kind: str = "", limit: int = 10):
    return public_data.restaurants(zone, [k for k in kind.split(",") if k], limit)


def stay_hint(result, c: Conditions):
    """1박 2일이면 마지막 관광지 권역의 숙박업소 수를 알려 준다 (접근성은 확인 전)."""
    if c.days != "1박 2일" or not result.stops:
        return None
    zone = PLACES[result.stops[-1].id].zone
    lg = public_data.lodging(zone, limit=5)
    return {"zone": zone, "zone_name": (public_data.ZONE_EN if c.lang == "en" else public_data.ZONE_KO).get(zone, zone), **lg}


@app.post("/api/chat")
def chat(body: dict):
    """body: {message, conditions, course_ids}. 수정 명령을 받아 엔진이 코스를 다시 계산한다."""
    c = Conditions(**body.get("conditions", {}))
    ids = body.get("course_ids", [])
    cand = {pid: p.name_ko for pid, p in PLACES.items()}
    if c.rain is None and c.memo:
        c.rain = bool(llm.parse_conditions(c.memo).get("rain"))
    edit = ChatEdit(**{k: v for k, v in llm.chat_edit(body.get("message", ""), ids, cand, c.lang).items() if k in ("action", "place_id", "reply")})
    if not edit.reply:   # AI 없이 동작할 때 동이의 기본 답변
        name = (PLACES[edit.place_id].name_ko if c.lang == "ko" else PLACES[edit.place_id].name_en) if edit.place_id in PLACES else ""
        edit.reply = {
            "rain": ("비 오는 시간에는 실내 위주로 바꿨어요.", "I switched to indoor stops for the rain."),
            "less_walk": ("걷는 구간이 긴 곳은 줄였어요.", "I cut down the long walks."),
            "add": (f"{name}을(를) 코스에 넣었어요.", f"Added {name}."),
            "remove": (f"{name}을(를) 뺐어요.", f"Removed {name}."),
            "none": ("비, 덜 걷기, 장소 넣기·빼기를 말해 주시면 바꿔 드릴게요.", "Tell me about rain, less walking, or a place to add or remove."),
        }[edit.action][0 if c.lang == "ko" else 1]
    if edit.action == "rain":
        c.rain = True
    elif edit.action == "less_walk":
        c.move = sorted(set(c.move) | {"오래 걷기 어려움"})
    elif edit.action == "add" and edit.place_id:
        c.wish = list(dict.fromkeys([*ids, edit.place_id]))
        c.must = list(dict.fromkeys([*c.must, edit.place_id]))
    elif edit.action == "remove" and edit.place_id:
        c.wish = [i for i in ids if i != edit.place_id]
        PLACES_wo = {k: v for k, v in PLACES.items() if k != edit.place_id}
        res = engine.plan(PLACES_wo, c, bool(c.rain))
        return {"edit": edit.model_dump(), "course": res.model_dump(), "conditions": c.model_dump()}
    res = engine.plan(PLACES, c, bool(c.rain))
    return {"edit": edit.model_dump(), "course": res.model_dump(), "conditions": c.model_dump()}


@app.get("/api/ai")
def ai_status():
    """서비스가 실행 중에 외부 AI API(Anthropic Claude)를 어디에 몇 번 썼는지."""
    return llm.status()


@app.post("/api/talk")
def talk(body: dict):
    """대화형 동이. body: {message, history:[{me,text}], conditions, state, course_ids, lang, lat, lon}
    LLM 키가 있으면 도구 호출로, 없거나 실패하면 규칙으로 답한다. 코스는 항상 엔진이 계산한다."""
    r = talk_mod.talk(PLACES, body)
    if r["course"]:
        lang = r["conditions"].get("lang", "ko")
        c = Conditions(**r["conditions"])
        res = engine.Course(**r["course"])
        pl = course_payload(res, c, bool(c.rain))
        r.update({k: pl[k] for k in ("extras", "stay", "events", "events_on_day", "move")})
    return r


@app.get("/api/safety")
def safety(lat: float, lon: float, lang: str = "ko"):
    r = public_apis.nearby_open(lat, lon)
    r["help"] = public_data.info_centers(lat, lon, lang, limit=2)   # 관광안내소(통역·외국어 안내)
    r["chargers"] = public_data.chargers(lat, lon, limit=2)          # 전동휠체어 급속충전기
    r["mobility_center"] = public_data.mobility_center()             # 교통약자 이동지원(휠체어 차량)
    return r


@app.get("/api/info-centers")
def info_centers(lat: float = 37.5245, lon: float = 129.1143, lang: str = "ko"):
    return public_data.info_centers(lat, lon, lang, limit=10)


@app.get("/api/events")
def events(today: str | None = None):
    return public_data.events(today)


@app.get("/api/trails")
def trails():
    return public_data.trails()


@app.get("/api/lodging")
def lodging(zone: str = "", limit: int = 20):
    return public_data.lodging(zone, limit)


@app.get("/api/weather")
def weather():
    return public_apis.rain_today()


@app.post("/api/reports")
async def report(place_id: str = Form(...), kind: str = Form(...), note: str = Form(""), photo: UploadFile | None = File(None)):
    if place_id not in PLACES:
        raise HTTPException(404, "알 수 없는 장소예요")
    rid = uuid.uuid4().hex[:12]
    rec = {"id": rid, "place_id": place_id, "kind": kind, "note": note[:300], "status": "접수",
           "created_at": dt.datetime.now().isoformat(timespec="seconds"), "photo": None}
    if photo:
        img = Image.open(io.BytesIO(await photo.read())).convert("RGB")   # 다시 저장하면서 위치 정보(EXIF)를 지운다
        img.thumbnail((1600, 1600))
        out = DATA / "reports" / f"{rid}.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, "JPEG", quality=85)
        rec["photo"] = out.name
        # AI 비전 분석: 관리자 검수용 제안 (판정은 사람이 확인한 뒤에만 바뀐다)
        small = img.copy(); small.thumbnail((1024, 1024)); buf = io.BytesIO(); small.save(buf, "JPEG", quality=80)
        rec["ai"] = llm.analyze_photo(buf.getvalue(), PLACES[place_id].name_ko, kind, note)
    log = DATA / "reports" / "reports.jsonl"
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return {"ok": True, "id": rid, "ai": rec.get("ai")}


@app.get("/api/admin/report")
def admin_report():
    """관리자 리포트: 장소별 제보 수. (실서비스에서는 로그인 보호 필요)"""
    log = DATA / "reports" / "reports.jsonl"
    counts: dict[str, int] = {}
    if log.exists():
        for line in log.read_text(encoding="utf-8").splitlines():
            r = json.loads(line); counts[r["place_id"]] = counts.get(r["place_id"], 0) + 1
    return sorted(({"place_id": k, "name": PLACES[k].name_ko, "reports": v} for k, v in counts.items()), key=lambda x: -x["reports"])
