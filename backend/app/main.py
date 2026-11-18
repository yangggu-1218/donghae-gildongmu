"""동해 길동무 API 서버.
실행: cd backend && uvicorn app.main:app --reload --port 8000
키가 없어도 data/places.json(없으면 data/places_seed.json) 예시 데이터로 동작한다."""
import io, json, os, uuid, datetime as dt
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import Header, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from .schemas import trip_days, Place, Conditions, ChatEdit
from . import cms, edits, pages, engine, llm, public_apis, public_data, details, bigdata, talk as talk_mod

DATA = Path(__file__).resolve().parents[2] / "data"
app = FastAPI(title="동해 길동무 API")
from . import sitelock
app.middleware("http")(sitelock.middleware)   # SITE_PASSWORD 가 있으면 비밀번호 화면부터
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])


def load_places() -> dict[str, Place]:
    f = DATA / "places.json"
    if not f.exists():
        f = DATA / "places_seed.json"
    places = {p["id"]: Place(**p) for p in json.loads(f.read_text(encoding="utf-8"))}
    places = public_data.enrich(places)   # 공공데이터로 좌표·전화·소개 보정, 장소 추가
    places = details.apply(places)        # 영업시간·어르신 접근성 상세, 예시 식당·카페
    places = cms.apply(places)            # 관리자가 바꾼 값 (덮어쓰기·임시 알림)
    public_data.link_eateries(places)     # 인허가 식당 목록에서 이미 아는 식당 표시
    return places


PLACES = load_places()
# 제보·현장 기록은 서버를 다시 켜도 남는 곳에 (배포 때 REPORTS_DIR=/var/data/reports 처럼 디스크 경로로)
REPORTS = Path(os.getenv("REPORTS_DIR") or DATA / "reports")
REPORTS.mkdir(parents=True, exist_ok=True)


def refresh():
    """관리자가 저장하면 곧바로 다시 읽는다 — 다음 요청부터 모든 화면·코스 추천에 반영."""
    fresh = load_places()
    PLACES.clear()
    PLACES.update(fresh)


@app.get("/api/health")
def health():
    return {"ok": True, "places": len(PLACES), "verified": sum(p.verified for p in PLACES.values()),
            "official_coords": sum(bool(p.coord_source) for p in PLACES.values()),
            "llm": bool(llm.API_KEY), "ai": llm.status(), "public_api": bool(public_apis.KEY), "public_files": public_data.sources()}


@app.get("/api/places")
def places(mode: str = "none"):
    return [{**p.model_dump(), "verified": p.verified, "grade": engine.grade_place(p, mode) if p.verified else None} for p in PLACES.values()]


@app.get("/api/places/{pid}")
def place_detail(pid: str, lang: str = "ko", mode: str = "wheel"):
    """장소 상세: 기본 정보 + 주변 향토유산 이야기 + 지나는 걷기길 + 가까운 관광안내소."""
    p = PLACES.get(pid)
    if not p:
        raise HTTPException(404, "알 수 없는 장소예요")
    return {**p.model_dump(), "verified": p.verified, **extras(p, lang), **pages.place_page(p, lang, mode), "last_visit": last_visit(pid)}


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
    rain = engine.rain_for(c)
    result = engine.plan(PLACES, c, rain)
    stops = [{"id": s.id, "name": PLACES[s.id].name_ko if c.lang == "ko" else PLACES[s.id].name_en,
              "grade": s.grade, "facilities": PLACES[s.id].facilities,
              "tip": PLACES[s.id].tip_ko if c.lang == "ko" else PLACES[s.id].tip_en} for s in result.stops]
    # 장소별 이유·한 줄 요약은 화면의 '동이 브리핑'(/api/brief)이 따로 받아 온다 → 코스는 바로 돌려준다
    for st in stops:
        nxt = next(x for x in result.stops if x.id == st["id"])
        nxt.why = st["tip"] or ""
    return course_payload(result, c, rain, "")


@app.post("/api/edit")
def edit(body: dict):
    """작업3: AI 없이 규칙으로 코스 고치기. body: {conditions, course_ids, text? | action?, target?}
    빼기·바꾸기·날짜/시간 변경 모두 조건만 바꾸고 엔진이 처음부터 다시 계산한다(영업시간 재검사)."""
    c, result, reply, act, target, changed = edits.run(PLACES, Conditions(**body.get("conditions", {})), body.get("course_ids", []),
                                                       (body.get("text") or "")[:300], body.get("action") or "", body.get("target"))
    out = course_payload(result, c, engine.rain_for(c))
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
    wday = next((d for d in (public_apis.forecast() or {}).get("days", []) if d["date"] == result.date), None)
    return {"course": result.model_dump(), "rain": rain, "summary": summary, "conditions": c.model_dump(), "weather": wday,
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


@app.get("/api/transport")
def transport(lang: str = "ko"):
    return pages.transport(lang)


@app.get("/api/facilities")
def facilities():
    return pages.facilities()


@app.get("/api/sources")
def sources():
    return {**pages.sources(), "ai": llm.status()}


@app.get("/api/events/all")
def events_all():
    """행사 달력: 지난 행사까지 모두."""
    return {"events": public_data.events("0000-00-00")["upcoming"], "as_of": public_data.events()["as_of"]}


@app.get("/api/stats")
def stats():
    return public_data.stats()


@app.get("/api/chargers")
def chargers(lat: float = 37.5245, lon: float = 129.1143):
    return public_data.chargers(lat, lon, limit=10)


@app.get("/api/city-tour")
def city_tour():
    return public_data.city_tour()


@app.get("/api/eateries")
def eateries(lat: float, lon: float, group: str = "", r: int = 800, limit: int = 8, sort: str = "pick"):
    """좌표 주변 일반음식점 (동해시 인허가 현황 + 카카오 주소 좌표). 접근성은 확인 전."""
    return public_data.eateries(lat, lon, group, max(100, min(r, 3000)), max(1, min(limit, 30)), sort)


@app.get("/api/restaurants")
def restaurants(zone: str, kind: str = "", limit: int = 10):
    return public_data.restaurants(zone, [k for k in kind.split(",") if k], limit)


def stay_hint(result, c: Conditions):
    """밤을 묵는 날이면 마지막 관광지 권역의 숙박업소 수를 알려 준다 (접근성은 확인 전)."""
    if c.day_no >= trip_days(c.days) or not result.stops:   # 밤을 묵는 날만
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
        res = engine.plan(PLACES_wo, c, engine.rain_for(c))
        return {"edit": edit.model_dump(), "course": res.model_dump(), "conditions": c.model_dump()}
    res = engine.plan(PLACES, c, engine.rain_for(c))
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
        pl = course_payload(res, c, engine.rain_for(c))
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
    """오늘과 앞으로 16일 예보. 일별 예보를 못 받으면 기상청 단기예보(오늘)로 대신한다."""
    fc = public_apis.forecast()
    if not fc:
        return public_apis.rain_today()
    today = engine.trip_date(Conditions()).isoformat()
    t = next((d for d in fc["days"] if d["date"] == today), fc["days"][0])
    return {"sample": False, "rain": t["rain"], "today": t, "days": fc["days"], "source": fc["source"], "updated": fc["updated"]}


# ---------------- 한국관광공사 빅데이터 ----------------
@app.get("/api/bf")
def bf_list(kind: str = "food"):
    """무장애 여행 정보: 동해시 음식점(food)·숙소(stay)·관광지(sight)·문화시설(culture)."""
    return {**bigdata.barrier_free(kind), "labels": bigdata.BF_LABEL}


@app.get("/api/crowd")
def crowd_all():
    """관광지 집중률 예측: 우리 장소별 앞으로 30일 붐빔(%)"""
    out = {}
    for pid, p in PLACES.items():
        if p.sample or p.type in ("숙박", "식당", "카페"):
            continue
        rows = bigdata.crowd_for(p.name_ko)
        if rows:
            out[pid] = rows
    return {"places": out, "source": bigdata.crowd()["source"], "ok": bool(out)}


@app.get("/api/visitors")
def visitors():
    return bigdata.visitors()


@app.get("/api/place/{pid}/bigdata")
def place_bigdata(pid: str, lang: str = "ko"):
    """장소 상세의 빅데이터 묶음: 붐빔 예측, 함께 가는 곳, 근처 무장애 음식점·숙소, 해설 듣기."""
    if pid not in PLACES:
        raise HTTPException(404, "알 수 없는 장소예요")
    p = PLACES[pid]
    plain = not p.sample and p.type not in ("숙박", "식당", "카페")
    rel = []
    for r in (bigdata.related_for(p.name_ko) if plain else []):   # 우리 사이트에 있는 장소면 상세로 이어 준다
        hit = next((q for q in PLACES.values() if not q.sample and any(bigdata.same_place(r["name"], x) for x in bigdata._parts(q.name_ko))), None)
        rel.append({**r, "id": hit.id if hit else None, "name_en": hit.name_en if hit else ""})
    return {"crowd": bigdata.crowd_for(p.name_ko) if plain else [],
            "related": rel,
            "food": bigdata.bf_near(p.lat, p.lon, "food", 2500, 4),
            "stay": bigdata.bf_near(p.lat, p.lon, "stay", 3000, 3),
            "audio": bigdata.audio(p.lat, p.lon, 800, "ko" if lang == "ko" else "en"),
            "labels": bigdata.BF_LABEL}


@app.get("/api/admin/probe")
def admin_probe(x_admin_token: str | None = Header(None)):
    """관리자: 공공 빅데이터 API가 실제로 응답하는지 점검 (캐시를 비우고 다시 부른다)."""
    _admin(x_admin_token, "data")
    return bigdata.probe()


@app.post("/api/brief")
def brief(body: dict):
    """동이 브리핑 (AI). 화면이 보낸 근거(조건·예보·장소별 판정·붐빔·뺀 곳)로 카드 조각을 만든다. 실패하면 by=none."""
    return llm.brief(body) or {"by": "none"}


@app.post("/api/photo-check")
async def photo_check(photo: UploadFile = File(...), move: str = Form(""), lang: str = Form("ko")):
    """사진으로 물어보기: 사진은 저장하지 않고(위치 정보도 지운 사본만) AI에게 한 번 보여 준 뒤 버린다."""
    img = Image.open(io.BytesIO(await photo.read())).convert("RGB")
    img.thumbnail((1024, 1024)); buf = io.BytesIO(); img.save(buf, "JPEG", quality=80)
    return llm.photo_check(buf.getvalue(), [m for m in move.split(",") if m], lang)


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
        out = REPORTS / f"{rid}.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, "JPEG", quality=85)
        rec["photo"] = out.name
        # AI 비전 분석: 관리자 검수용 제안 (판정은 사람이 확인한 뒤에만 바뀐다)
        small = img.copy(); small.thumbnail((1024, 1024)); buf = io.BytesIO(); small.save(buf, "JPEG", quality=80)
        rec["ai"] = llm.analyze_photo(buf.getvalue(), PLACES[place_id].name_ko, kind, note)
    log = REPORTS / "reports.jsonl"
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return {"ok": True, "id": rid, "ai": rec.get("ai")}


def _admin(token: str | None, perm: str | None = None) -> dict:
    """관리자 확인: [로그인]으로 받은 토큰을 X-Admin-Token 헤더로 보낸다. perm = 이 일을 할 수 있는 역할인지."""
    if not cms.account()[1]:
        raise HTTPException(503, ".env 에 ADMIN_PASSWORD(관리자 비밀번호)를 먼저 설정해 주세요")
    s = cms.check(token)
    if not s:
        raise HTTPException(401, "다시 로그인해 주세요")
    if not cms.can(s, perm):
        raise HTTPException(403, f"{cms.ROLES.get(s['role'], s['role'])} 계정은 이 일을 할 수 없어요. 총괄 관리자에게 부탁해 주세요.")
    cms.ACTOR.set(f"{s['name']} ({s['id']})")   # 변경 이력의 '누가'
    return s


def _who(s: dict) -> str:
    return f"{s['name']} ({s['id']})"


@app.get("/api/admin/login-info")
def admin_login_info():
    """로그인 화면: [임시 로그인] 버튼을 보여 줄지. DEMO_LOGIN=1 일 때만 계정을 돌려준다(본선 시연용)."""
    if cms.demo_login_enabled():
        uid, pw = cms.account()
        return {"demo": True, "id": uid, "password": pw}
    return {"demo": False}


@app.post("/api/admin/login")
def admin_login(body: dict):
    try:
        r = cms.login(body.get("id", ""), body.get("password", ""))
    except ValueError as e:
        raise HTTPException(401, str(e))
    return {**r, "hours": cms.SESSION_HOURS}


@app.get("/api/admin/me")
def admin_me(x_admin_token: str | None = Header(None)):
    s = _admin(x_admin_token)
    return {"id": s["id"], "name": s["name"], "role": s["role"], "must_change": s.get("must_change", False), "role_name": cms.ROLES[s["role"]],
            "perms": sorted(cms.PERMS[s["role"]]), "expires_at": dt.datetime.fromtimestamp(s["exp"]).isoformat(timespec="minutes")}


@app.post("/api/admin/password")
def admin_password(body: dict, x_admin_token: str | None = Header(None)):
    """내 비밀번호 바꾸기 (총괄 관리자는 서버 설정에서)."""
    s = _admin(x_admin_token)
    try:
        cms.change_own_password(s["id"], body.get("old", ""), body.get("new", ""))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.get("/api/admin/accounts")
def admin_accounts(x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "accounts")
    return {"accounts": cms.accounts(), "roles": cms.ROLES, "perms": {k: sorted(v) for k, v in cms.PERMS.items()}}


@app.post("/api/admin/accounts")
def admin_add_account(body: dict, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "accounts")
    try:
        return cms.add_account(body.get("id", ""), body.get("name", ""), body.get("role", ""), body.get("password", ""))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/admin/accounts/{uid}")
def admin_update_account(uid: str, body: dict, x_admin_token: str | None = Header(None)):
    """역할 바꾸기·사용 멈춤/다시 쓰기·이름·임시 비밀번호 새로 발급."""
    _admin(x_admin_token, "accounts")
    try:
        return cms.update_account(uid, body.get("role"), body.get("active"), body.get("name"), body.get("password"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/admin/dashboard")
def admin_dashboard(x_admin_token: str | None = Header(None)):
    """한눈에: 처리할 제보, 지금 걸린 알림·공지, 이번 주 행사, 최근 변경(누가)."""
    _admin(x_admin_token)
    db = cms.load()
    day = _today()
    reps = _jsonl("reports.jsonl")
    visits = _jsonl("visits.jsonl")
    week = (dt.date.fromisoformat(day) + dt.timedelta(days=7)).isoformat()
    return {"today": day,
            "reports": {"new": sum(r.get("status") == "접수" for r in reps), "doing": sum(r.get("status") == "확인 중" for r in reps), "total": len(reps)},
            "notices": [{**n, "name": PLACES[n["place_id"]].name_ko if n.get("place_id") in PLACES else None} for n in db["notices"] if cms.active(n, day)][:8],
            "banner": cms.site(day)["banner"],
            "overrides": len(db["overrides"]) + len(db["segments"]),
            "visits": {"total": len(visits), "last": max((v["date"] for v in visits if v.get("date")), default=None)},
            "events_week": [e for e in cms.events() if e.get("start", "") <= week and (e.get("end") or e.get("start", "")) >= day][:5],
            "recent": db["history"][:8]}


@app.post("/api/admin/logout")
def admin_logout(x_admin_token: str | None = Header(None)):
    cms.logout(x_admin_token)
    return {"ok": True}


def _today() -> str:
    return dt.datetime.now(public_data.KST).strftime("%Y-%m-%d")


@app.get("/api/site")
def site():
    """모든 화면 공통: 공지 배너, 전체 알림."""
    return cms.site(_today())


@app.get("/api/admin/cms")
def admin_cms(x_admin_token: str | None = Header(None)):
    """관리 화면 첫 데이터: 덮어쓴 값, 알림, 배너, 추가 행사, 변경 이력 (계정 정보는 빼고)."""
    _admin(x_admin_token)
    return cms.backup()


def _guard(fn):
    try:
        out = fn()
    except ValueError as e:
        raise HTTPException(400, str(e))
    refresh()
    return out


@app.post("/api/admin/places/{pid}")
def admin_place(pid: str, body: dict, x_admin_token: str | None = Header(None)):
    """장소 정보 고치기: {fields:{...}, segments?:[...], reason}"""
    _admin(x_admin_token, "place")
    if pid not in PLACES:
        raise HTTPException(404, "알 수 없는 장소예요")
    cur = PLACES[pid].model_dump()
    return _guard(lambda: cms.set_place(pid, body.get("fields") or {}, body.get("segments"), body.get("reason") or "", cur))


@app.post("/api/admin/notices")
def admin_add_notice(body: dict, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "notice")
    if body.get("place_id") and body["place_id"] not in PLACES:
        raise HTTPException(404, "알 수 없는 장소예요")
    return _guard(lambda: cms.add_notice(body, body.get("reason") or ""))


@app.post("/api/admin/notices/{nid}/delete")
def admin_del_notice(nid: str, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "notice")
    return _guard(lambda: {"ok": cms.remove_notice(nid)})


@app.post("/api/admin/banner")
def admin_banner(body: dict, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "site")
    return _guard(lambda: {"banner": cms.set_banner(body)})


@app.post("/api/admin/events")
def admin_add_event(body: dict, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "site")
    return _guard(lambda: cms.add_event(body))


@app.post("/api/admin/events/{eid}/delete")
def admin_del_event(eid: str, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "site")
    return _guard(lambda: {"ok": cms.remove_event(eid)})


@app.post("/api/admin/history/{hid}/revert")
def admin_revert(hid: str, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "history")
    return _guard(lambda: cms.revert(hid))


@app.get("/api/admin/backup")
def admin_backup(x_admin_token: str | None = Header(None)):
    """백업 내려받기 (서버 디스크가 지워지는 호스팅 대비). 계정·비밀번호는 넣지 않는다."""
    _admin(x_admin_token, "backup")
    return cms.backup()


@app.post("/api/admin/restore")
def admin_restore(body: dict, x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "backup")
    return _guard(lambda: cms.restore(body) or {"ok": True})


@app.post("/api/admin/reset")
def admin_reset(body: dict, x_admin_token: str | None = Header(None)):
    """시연 뒤 처음 상태로 (이력·계정은 남는다)."""
    _admin(x_admin_token, "backup")
    return _guard(lambda: cms.reset_all(body.get("reason") or "") or {"ok": True})


def _jsonl(name: str) -> list[dict]:
    f = REPORTS / name
    return [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()] if f.exists() else []


def _save_jsonl(name: str, rows: list[dict]):
    f = REPORTS / name
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


@app.get("/api/admin/report")
def admin_report(x_admin_token: str | None = Header(None)):
    """관리자 리포트: 장소별 제보 수."""
    _admin(x_admin_token, "reports")
    counts: dict[str, int] = {}
    for r in _jsonl("reports.jsonl"):
        counts[r["place_id"]] = counts.get(r["place_id"], 0) + 1
    return sorted(({"place_id": k, "name": PLACES[k].name_ko, "reports": v} for k, v in counts.items() if k in PLACES), key=lambda x: -x["reports"])


@app.get("/api/admin/reports")
def admin_reports(x_admin_token: str | None = Header(None)):
    """이용자 제보 전체 (최신순) — AI 사진 분석 결과 포함, 사람이 검수한다."""
    _admin(x_admin_token, "reports")
    rows = _jsonl("reports.jsonl")
    for r in rows:
        r["name"] = PLACES[r["place_id"]].name_ko if r["place_id"] in PLACES else r["place_id"]
    return sorted(rows, key=lambda r: r["created_at"], reverse=True)


@app.post("/api/admin/reports/{rid}")
def admin_review(rid: str, body: dict, x_admin_token: str | None = Header(None)):
    """제보 검수: status = 접수 / 확인 중 / 반영 / 반려."""
    s = _admin(x_admin_token, "reports")
    rows = _jsonl("reports.jsonl")
    for r in rows:
        if r["id"] == rid:
            r["status"] = body.get("status", r["status"])
            r["memo"] = (body.get("memo") or r.get("memo") or "")[:300]
            r["reviewed_at"] = dt.datetime.now().isoformat(timespec="seconds")
            r["reviewed_by"] = _who(s)
            n = body.get("notice")   # [반영] + 알림으로 올리기 → 사이트에 바로 보인다
            if r["status"] == "반영" and n and n.get("level") and cms.can(s, "notice"):
                rec = _guard(lambda: cms.add_notice({**n, "place_id": r["place_id"], "from_report": rid}, f"제보 {rid} 반영"))
                r["notice_id"] = rec["id"]
    _save_jsonl("reports.jsonl", rows)
    return {"ok": True}


@app.get("/api/admin/visits")
def admin_visits(x_admin_token: str | None = Header(None)):
    """현장 확인 기록 (팀 답사)."""
    _admin(x_admin_token, "visits")
    return sorted(_jsonl("visits.jsonl"), key=lambda r: r["date"], reverse=True)


@app.post("/api/admin/visits")
def admin_add_visit(body: dict, x_admin_token: str | None = Header(None)):
    """현장 확인 기록 추가: {place_id, date, who, segment, slope_deg?, curb_cm?, width_m?, steps?, surface?, toilet?, note}"""
    s = _admin(x_admin_token, "visits")
    if body.get("place_id") not in PLACES:
        raise HTTPException(404, "알 수 없는 장소예요")
    keep = ("place_id", "date", "who", "segment", "slope_deg", "curb_cm", "width_m", "steps", "surface", "toilet", "note")
    rec = {k: body.get(k) for k in keep}
    rec["who"] = rec.get("who") or s["name"]
    rec["entered_by"] = _who(s)
    rec["id"] = uuid.uuid4().hex[:12]
    rec["name"] = PLACES[rec["place_id"]].name_ko
    rows = _jsonl("visits.jsonl") + [rec]
    _save_jsonl("visits.jsonl", rows)
    return {"ok": True, "id": rec["id"]}


def last_visit(pid: str) -> dict | None:
    vs = [v for v in _jsonl("visits.jsonl") if v["place_id"] == pid]
    return max(vs, key=lambda v: v["date"]) if vs else None


# ------------------------------------------------------------------ 웹 화면 (배포용)
# gildongmu/web/index.html 이 있으면 같은 서버에서 화면도 보여 준다 (API 경로가 먼저 잡히도록 맨 끝에 둔다).
WEB = Path(__file__).resolve().parents[2] / "web"
if (WEB / "index.html").exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
