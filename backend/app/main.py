"""동해 길동무 API 서버.
실행: cd backend && uvicorn app.main:app --reload --port 8000
키가 없어도 data/places.json(없으면 data/places_seed.json) 예시 데이터로 동작한다."""
import io, json, os, re, uuid, datetime as dt
import anyio
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import Header, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from .schemas import trip_days, Place, Conditions, ChatEdit
from . import ai, ai_course, ai_extract, city, reports_store, sync as sync_mod, ai_judge, ai_status as ai_stat, cms, edits, pages, engine, llm, public_apis, public_data, details, kto_access, bigdata, talk as talk_mod, terrain

DATA = Path(__file__).resolve().parents[2] / "data"
app = FastAPI(title="동해 길동무 API")
from . import sitelock
app.middleware("http")(sitelock.middleware)   # SITE_PASSWORD 가 있으면 비밀번호 화면부터


@app.middleware("http")
async def _ai_client_ip(request, call_next):
    """AI 요청 한도를 접속 주소별로 세려고 주소를 기억해 둔다 (backend/app/ai.py gate)."""
    ai.CLIENT_IP.set(sitelock._ip(request))
    return await call_next(request)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])


def load_places() -> dict[str, Place]:
    f = DATA / "places.json"
    if not f.exists():
        f = DATA / "places_seed.json"
    places = {p["id"]: Place(**p) for p in json.loads(f.read_text(encoding="utf-8"))}
    places = public_data.enrich(places)   # 공공데이터로 좌표·전화·소개 보정, 장소 추가
    places = details.apply(places)        # 영업시간·어르신 접근성 상세, 식당·카페
    places = kto_access.apply(places)     # 한국관광공사 열린관광 이동약자 편의정보 (분류 아이콘·편의시설·출입구)
    places = cms.apply(places)            # 관리자가 바꾼 값 (덮어쓰기·임시 알림)
    places = kto_access.drop_vision(places)   # 시각장애 편의 내용은 다루지 않음 (관리자 값까지 정리)
    public_data.link_eateries(places)     # 인허가 식당 목록에서 이미 아는 식당 표시
    for p in places.values():             # 지형 참고 안내 (DEM 90m, 관리자가 바꾼 좌표 기준). 판정에는 쓰지 않음
        p.terrain = terrain.place_terrain(p.lat, p.lon) if p.lat is not None and p.lon is not None else {}
    return places


PLACES = load_places()
ai.set_overrides(cms.load().get("ai_models"))   # 관리자 화면 [AI 설정]에서 고른 모델 등급
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
            "llm": bool(llm.API_KEY), "ai": llm.status(), "public_api": bool(public_apis.KEY), "public_files": public_data.sources(),
            "routes": {"kakao": public_apis.ROUTE_STATS, "odsay": {**public_apis.TRANSIT_STATS, "key": public_apis.odsay_available()}, "tago": public_apis.TAGO_STATS, "stops_odsay": public_apis.STOP_STATS}}   # 키 값 없음, 오류 문구만


@app.get("/api/places")
def places(mode: str = "none"):
    return [{**p.model_dump(exclude={"verify"}), "verified": p.verified, "grade": engine.grade_place(p, mode) if p.verified else None} for p in PLACES.values()]


@app.get("/api/places/{pid}")
def place_detail(pid: str, lang: str = "ko", mode: str = "wheel"):
    """장소 상세: 기본 정보 + 주변 향토유산 이야기 + 지나는 걷기길 + 가까운 관광안내소."""
    p = PLACES.get(pid)
    if not p:
        raise HTTPException(404, "알 수 없는 장소예요")
    out = {**p.model_dump(exclude={"verify"}), "verified": p.verified, **extras(p, lang), **pages.place_page(p, lang, mode), "last_visit": last_visit(pid)}
    out["segments_raw"] = [s.model_dump() for s in p.segments]   # 표시용 segments 와 달리 측정값·등급·선택 구간 그대로 (관리자 편집용)
    return out


def extras(p: Place, lang: str = "ko") -> dict:
    return {"stories": public_data.stories(p.lat, p.lon), "trail_info": public_data.trails(p.trails),
            "info_center": (public_data.info_centers(p.lat, p.lon, lang, limit=1) or [None])[0] if p.lat else None,
            "parking_near": public_data.parking_near(p.lat, p.lon), "taxi": public_data.taxi_for(p.id),
            "signals": public_data.signals_near(p.lat, p.lon), "charger": (public_data.chargers(p.lat, p.lon, 1) or [None])[0],
            "park": public_data.parks_near(p.lat, p.lon), "events_here": public_data.events_near(p.lat, p.lon),
            "hours": p.hours, "closed_days": p.closed_days, "fee": p.fee}


@app.post("/api/course-preview")
def course_preview(c: Conditions):
    """조건을 고르는 동안 보여 줄 후보 (gangRG님). 규칙 엔진만 — AI·카카오·날씨 API를 절대 부르지 않는다(비용·요청 수 영향 없음)."""
    draft = engine.preview_stops(PLACES, c, c.rain is True or c.weather_pref == "실내")
    return [{"id": s.id, "kind": s.kind, "grade": s.grade} for s in draft.stops]


@app.post("/api/course")
def course(c: Conditions):
    public_apis.prefetch_daily()   # 일별 예보를 코스 설계와 함께 미리 받는다
    if c.memo:   # 자유 입력에서 조건을 보충 (AI 실패 시 규칙 기반)
        extra = llm.parse_conditions(c.memo)
        c.move = sorted(set(c.move) | set(extra.get("move", [])) - {"없어요"})
        if c.rain is None and extra.get("rain"):
            c.rain = True
    rain = engine.rain_for(c)
    result, planner = plan_course(c, rain, c.memo)
    for s in result.stops:   # AI가 쓴 '고른 이유'가 없으면 장소 한 줄 설명
        if not s.why:
            p = PLACES[s.id]
            s.why = (p.tip_ko if c.lang == "ko" else p.tip_en) or ""
    return {**course_payload(result, c, rain, ""), "planner": planner}


def plan_course(c: Conditions, rain: bool, hint: str = ""):
    """① AI 코스 설계 에이전트가 먼저, 안 되면 규칙 엔진 (AI_COURSE=0 이면 규칙만)."""
    if os.getenv("AI_COURSE", "1") != "0":
        got = ai_course.plan(PLACES, c, rain, hint)
        if got and got[0] is not None:
            return got
        if got:   # AI 코스를 버리고 규칙으로 — 이유를 planner 에 남긴다
            return engine.plan(PLACES, c, rain), {"by": "rule", "reason": got[1].get("reason", "")}
    return engine.plan(PLACES, c, rain), {"by": "rule"}


@app.post("/api/reorder")
def reorder(body: dict):
    """일정 카드를 끌어서 바꾼 순서 그대로: body {conditions, order:[장소 id …]}.
    장소를 빼거나 바꾸지 않고, 바뀐 순서로 이동시간(ODsay·카카오, 안 되면 추정)·방문 시각·돌아오는 시각을 다시 계산한다.
    이동 조건(휠체어 등)은 그대로라 걷는 속도·접근성 판정도 그대로 쓴다."""
    c = Conditions(**(body.get("conditions") or {}))
    ids = [i for i in (body.get("order") or []) if isinstance(i, str) and i in PLACES][:12]
    if not ids:
        raise HTTPException(400, "순서를 바꿀 장소가 없어요")
    c.order = ids
    result = engine.schedule_order(PLACES, c, ids)
    out = course_payload(result, c, engine.rain_for(c))
    out.update({"action": "reorder", "via": "rule"})
    return out


@app.post("/api/optimize")
def optimize(body: dict):
    """AI 동선 최적화: body {conditions, order:[지금 순서], locked:[고정한 장소]}.
    장소는 그대로 두고, 운영시간·휴무를 먼저 지키면서 이동이 가장 짧은 순서를 찾는다. 바로 바꾸지 않고 변경 전후를 함께 돌려준다."""
    c = Conditions(**(body.get("conditions") or {}))
    ids = [i for i in (body.get("order") or []) if isinstance(i, str) and i in PLACES][:12]
    if len(ids) < 2:
        raise HTTPException(400, "순서를 바꿀 장소가 두 곳 이상 있어야 해요")
    locked = [i for i in (body.get("locked") or []) if i in ids]
    en = c.lang == "en"
    opt = engine.optimize_order(PLACES, c, ids, locked)
    new = opt["order"]
    c.order = ids
    before = engine.schedule_order(PLACES, c, ids)
    mb = engine.route_metric(PLACES, c, before)
    if new != ids:
        c2 = c.model_copy(update={"order": new})
        after = engine.schedule_order(PLACES, c2, new)
        ma = engine.route_metric(PLACES, c2, after)
    else:
        c2, after, ma = c, before, mb
    changed = new != ids
    if changed:   # 실제 길찾기로 다시 재 보니 더 나쁘면 바꾸지 않는다
        same = ma["source"] == mb["source"]
        worse = len(ma["closed"]) > len(mb["closed"]) or (len(ma["closed"]) == len(mb["closed"]) and same and ma["move_min"] + ma["wait_min"] > mb["move_min"] + mb["wait_min"])
        if worse:
            changed, c2, after, ma = False, c, before, mb
    n = len(ids)
    if not changed and new == ids:
        reason = "The current order already keeps opening hours with the least travel." if en else "지금 순서가 이미 운영시간을 지키면서 이동이 가장 적은 순서예요. 바꿀 필요가 없어요."
    elif not changed:
        reason = "Checked with real routes: your current order is better, so nothing changes." if en else "추천 순서를 실제 길찾기로 다시 재 보니 지금 순서가 더 나아서 그대로 두었어요."
    else:
        reason = ("Opening hours first, then the shortest travel among all possible orders." if en
                  else "운영시간·휴무를 먼저 지키고, 그 안에서 이동이 가장 짧은 순서를 찾았어요.")
    import math as _m
    if opt["method"] == "exact":
        method = (f"Compared every possible order ({_m.factorial(n - len(locked))}) with branch-and-bound using estimated stop-to-stop times."
                  if en else f"가능한 순서 {_m.factorial(n - len(locked)):,}가지를 모두 따져(분기한정) 후보를 골랐어요. 후보끼리는 장소 사이 추정 이동시간으로 비교했어요.")
    else:
        method = ("Too many stops for a full search, so improved step by step (move one stop / swap) until no gain." if en
                  else "장소가 많아 한 곳씩 옮겨 보며 더 나아지지 않을 때까지 개선했어요.")
    if ma["source"] == "estimate":
        method += (" Real routing was unavailable, so all times are estimates." if en else " 실제 길찾기를 불러오지 못해 시간은 모두 추정값이에요.")
    else:
        method += (" The before/after numbers are from real routing." if en else " 위 전후 비교 숫자는 실제 길찾기 값이에요.")
    kinds = opt["kinds"]
    final = [s.id for s in after.stops]
    kept = [i for i in ids if kinds[i] == "timed" and i not in locked and final.index(i) == ids.index(i)] if changed else []
    mode = engine.mode_from(c.move)
    access = []
    if mode != "none":
        caution = [PLACES[s.id].name_ko for s in after.stops if s.grade and s.grade != "G"]
        if caution:
            access.append((f"Access caution: {', '.join(caution)} (order changes don't change access ratings)." if en
                           else f"{', '.join(caution)}: 접근 주의 구간이 있어요. 순서를 바꿔도 장소의 접근성 판정은 그대로예요."))
        access.append(("Travel times are by car/transit; a short drive doesn't mean an easy wheelchair path. Check each stop's access details." if en
                       else "이동시간은 자동차·대중교통 기준이에요. 차로 가깝다고 휠체어 동선이 쉬운 것은 아니니 장소마다 [상세]의 접근 정보를 확인하세요."))
        if after.drive_source == "transit":
            access.append(("Walking parts between transit are not verified for wheelchairs." if en
                           else "대중교통 사이 걷는 구간은 계단·경사가 확인되지 않은 일반 보행 경로예요."))
    out = course_payload(after, c2, engine.rain_for(c2))
    out.update({"action": "reorder", "via": "rule"})
    return {"changed": changed, "reason": reason, "order_before": ids, "order_after": final if changed else ids,
            "before": mb, "after": ma, "result": out, "kept": kept, "locked": locked,
            "timed": [i for i in ids if kinds[i] == "timed"], "free": [i for i in ids if kinds[i] == "always"],
            "unknown": [i for i in ids if kinds[i] == "unknown"], "access": access, "checked": opt["checked"], "method": method}


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


def course_for_display(result) -> dict:
    """코스 + 장소별 방문 시간대 단기예보(기상청, 발표 범위 안일 때만)."""
    visits = [(s.id, PLACES[s.id].lat, PLACES[s.id].lon, engine._mins(s.arrive), engine._mins(s.depart))
              for s in result.stops if s.id in PLACES and s.depart]
    forecasts = public_apis.visit_forecasts(result.date, visits) if result.date else {}
    course = result.model_dump()
    for stop in course["stops"]:
        if stop["id"] in forecasts:
            stop["weather"] = forecasts[stop["id"]]
    return course


def course_payload(result, c: Conditions, rain: bool, summary: str = "") -> dict:
    """코스 응답 하나로 통일 (/api/course, /api/edit, /api/talk)."""
    for s in result.stops:
        if not s.why:
            p = PLACES[s.id]
            s.why = p.tip_ko if c.lang == "ko" else (p.tip_en or p.tip_ko)
    on_day = public_data.events_on(result.date)
    wday = next((d for d in (public_apis.forecast() or {}).get("days", []) if d["date"] == result.date), None)
    return {"course": course_for_display(result), "rain": rain, "summary": summary, "conditions": c.model_dump(), "weather": wday,
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


@app.get("/api/medical")
def medical():
    """편의시설 지도 '약국·병원': 긴급·도움과 같은 국립중앙의료원 실데이터. 키가 없으면 예시."""
    live = public_apis.medical_list()
    if live:
        return {"sample": False, "source": "국립중앙의료원 약국·병의원 정보 (공공데이터포털)", "items": live}
    return {"sample": False, "source": "국립중앙의료원 약국·병의원 정보 (2026-11-20 저장본, 운영시간 없음)", "items": pages.facilities()["medical"], "why": public_apis.MED_DIAG if public_apis.KEY else "서버에 DATA_GO_KR_KEY 없음"}


# ---------- AI 기능 (docs/17_AI_FEATURES.md) ----------
def _recent_reports(pid: str, days: int = 90) -> list[dict]:
    """그 장소의 최근 제보·길 메모 (반려 제외, 최신순)."""
    since = (dt.datetime.now() - dt.timedelta(days=days)).isoformat(timespec="seconds")
    p = PLACES.get(pid)
    def here(r):   # 그 장소로 보낸 제보 + 장소 300m 안 위치로 보낸 불편 제보
        if r.get("place_id") == pid:
            return True
        return bool(p and p.lat and r.get("place_id") is None and r.get("lat") is not None and city.meters((r["lat"], r["lon"]), (p.lat, p.lon)) <= 300)
    rows = [r for r in reports_store.real() if here(r) and r.get("status") not in ("반려", "중복") and (r.get("created_at") or "") >= since]
    return sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)


@app.get("/api/ai/judge/{pid}")
def ai_judge_place(pid: str, mode: str = "wheel", lang: str = "ko"):
    """② AI 접근성 판정관: 근거를 읽고 이 사람 기준으로 판정 + 근거·확신도·주의·물어볼 것."""
    p = PLACES.get(pid)
    if not p:
        raise HTTPException(404, "알 수 없는 장소예요")
    return ai_judge.judge(p, mode, "en" if lang == "en" else "ko", _recent_reports(pid))


@app.post("/api/place-notes")
def place_note(body: dict):
    """커뮤니티 '한 줄 후기·길 메모'를 서버에도 저장 → ③ 최근 길 상태 요약의 재료. 닉네임·연락처는 저장하지 않는다."""
    pid, text = body.get("place_id"), " ".join(str(body.get("text") or "").split())
    if pid not in PLACES:
        raise HTTPException(404, "알 수 없는 장소예요")
    if not 2 <= len(text) <= 300:
        raise HTTPException(400, "2~300자로 적어 주세요")
    rec = {"id": uuid.uuid4().hex[:12], "place_id": pid, "kind": "길 메모" if body.get("tip") else "한 줄 후기", "note": text,
           "status": "접수", "source": "커뮤니티", "created_at": dt.datetime.now().isoformat(timespec="seconds"), "photo": None}
    with (REPORTS / "reports.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return {"ok": True, "id": rec["id"]}


@app.get("/api/places/{pid}/status")
def place_status(pid: str):
    """③ 최근 길 상태 (AI 요약). 제보가 없으면 state=none. 제안은 관리자 [AI 제안]으로만 보낸다."""
    p = PLACES.get(pid)
    if not p:
        raise HTTPException(404, "알 수 없는 장소예요")
    out = ai_stat.summarize(p, _recent_reports(pid))
    ai_stat.save_proposals(pid, out.pop("proposals", []) or [])
    return out


@app.get("/api/admin/ai/proposals")
def admin_ai_proposals(x_admin_token: str | None = Header(None)):
    """AI 제안 목록 (근거 제보 원문 포함)."""
    _admin(x_admin_token, "reports")
    reps = {r["id"]: r for r in _jsonl("reports.jsonl")}
    out = []
    for x in ai_stat.proposals():
        out.append({**x, "name": PLACES[x["place_id"]].name_ko if x["place_id"] in PLACES else x["place_id"],
                    "evidence_rows": [{"id": e, "date": (reps.get(e, {}).get("created_at") or "")[:10], "kind": reps.get(e, {}).get("kind"),
                                       "note": reps.get(e, {}).get("note"), "photo": reps.get(e, {}).get("photo")} for e in x.get("evidence", [])]})
    return out + [{**x, "name": PLACES[x["place_id"]].name_ko if x["place_id"] in PLACES else x["place_id"], "evidence_rows": []}
                  for x in _sample_admin().get("proposals", [])]   # 가상 제안 (반영 불가)


@app.post("/api/admin/ai/proposals/{prop_id}")
def admin_ai_decide(prop_id: str, body: dict, x_admin_token: str | None = Header(None)):
    """AI 제안 승인/반려. 승인하면 알림·운영시간·편의시설이 바로 바뀌고 변경 이력에 남는다(되돌리기 가능)."""
    s = _admin(x_admin_token, "reports")
    if any(x["id"] == prop_id for x in _sample_admin().get("proposals", [])):
        raise HTTPException(400, "가상 제안은 화면 확인용이라 반영·반려할 수 없어요. [제보·민원 › 설정·백업]에서 가상 데이터를 지울 수 있어요.")
    approve = bool(body.get("approve"))
    if approve:
        x = next((p for p in ai_stat.proposals() if p["id"] == prop_id), None)
        if x and not cms.can(s, "notice" if x.get("type") == "notice" else "place"):
            raise HTTPException(403, "이 제안을 반영할 권한이 없어요")
    return _guard(lambda: ai_stat.decide(prop_id, approve, PLACES, _who(s), str(body.get("memo") or "")))


@app.post("/api/admin/ai/refresh")
def admin_ai_refresh(x_admin_token: str | None = Header(None)):
    """최근 90일 제보가 있는 장소를 모두 다시 정리해 새 제안을 만든다."""
    _admin(x_admin_token, "reports")
    pids = sorted({r["place_id"] for r in _jsonl("reports.jsonl") if r.get("place_id") in PLACES})
    done, new = 0, 0
    for pid in pids:
        reps = _recent_reports(pid)
        if not reps:
            continue
        out = ai_stat.summarize(PLACES[pid], reps)
        new += ai_stat.save_proposals(pid, out.get("proposals", []) or [])
        done += 1
    return {"places": done, "new_proposals": new}


@app.post("/api/admin/ai/extract")
async def admin_ai_extract(place_id: str = Form(...), url: str = Form(""), file: UploadFile | None = File(None), x_admin_token: str | None = Header(None)):
    """④ 한글·PDF 파일이나 공개 링크를 AI가 읽고 [장소 정보] 칸에 넣을 초안을 만든다. 저장은 관리자가 확인한 뒤에."""
    _admin(x_admin_token, "place")
    p = PLACES.get(place_id)
    if not p:
        raise HTTPException(404, "알 수 없는 장소예요")
    try:
        if file is not None and file.filename:
            data = await file.read(ai_extract.MAX_FILE + 1)
            if len(data) > ai_extract.MAX_FILE:
                raise ai_extract.BadInput("파일이 너무 커요 (15MB까지).")
            kind, name = ai_extract.kind_of(file.filename, data), file.filename
        elif url.strip():
            kind, data, name = await anyio.to_thread.run_sync(ai_extract.fetch_url, url.strip())
        else:
            raise ai_extract.BadInput("파일을 올리거나 링크를 넣어 주세요.")
        return await anyio.to_thread.run_sync(ai_extract.extract, p.model_dump(), kind, data, name)
    except ai_extract.BadInput as e:
        raise HTTPException(400, str(e))


@app.post("/api/admin/ai/work")
async def admin_ai_work(url: str = Form(""), place_id: str = Form(""), file: UploadFile | None = File(None), x_admin_token: str | None = Header(None)):
    """AI로 작업하기: 자료(한글·PDF·링크)만 주면 어느 장소인지 알아서 찾고, 지금 사이트 값과 달라진 칸만 돌려준다.
    저장은 관리자가 고른 것만 [장소 정보 고치기]와 같은 길로 (이동약자 정보는 꼭 사람이 확인)."""
    _admin(x_admin_token, "place")
    try:
        if file is not None and file.filename:
            data = await file.read(ai_extract.MAX_FILE + 1)
            if len(data) > ai_extract.MAX_FILE:
                raise ai_extract.BadInput("파일이 너무 커요 (15MB까지).")
            kind, name = ai_extract.kind_of(file.filename, data), file.filename
        elif url.strip():
            kind, data, name = await anyio.to_thread.run_sync(ai_extract.fetch_url, url.strip())
        else:
            raise ai_extract.BadInput("파일을 올리거나 링크를 넣어 주세요.")
        pool = [p.model_dump() for p in PLACES.values() if p.type != "숙박"]
        if place_id:
            if place_id not in PLACES:
                raise HTTPException(404, "알 수 없는 장소예요")
            who = {"place_id": place_id, "name": PLACES[place_id].name_ko, "how": "admin", "reason": "관리자가 고른 장소", "candidates": [],
                   "mismatch": ai_extract.other_place(kind, data, pool, place_id)}
        else:
            who = await anyio.to_thread.run_sync(ai_extract.identify, kind, data, pool)
        if not who.get("place_id"):
            return {"ok": False, "why": who["reason"], "place": who, "source": name}
        cur = PLACES[who["place_id"]].model_dump()
        got = await anyio.to_thread.run_sync(ai_extract.extract, cur, kind, data, name)
        if not got.get("ok"):
            return {**got, "place": who, "source": name}
        return {**got, "place": who, "changes": ai_extract.changes(cur, got.get("fields") or {})}
    except ai_extract.BadInput as e:
        raise HTTPException(400, str(e))


@app.post("/api/admin/ai/tidy")
def admin_ai_tidy(body: dict, x_admin_token: str | None = Header(None)):
    """장소 정보 화면의 AI 간단 작업: 소개·팁 글을 간결한 객관형으로 다듬은 미리 보기 (저장은 관리자가 [저장]으로)."""
    _admin(x_admin_token, "place")
    p = PLACES.get(body.get("place_id") or "")
    if not p:
        raise HTTPException(404, "알 수 없는 장소예요")
    try:
        return ai_extract.tidy(p.model_dump(), body.get("field") or "", body.get("text") or "")
    except ai_extract.BadInput as e:
        raise HTTPException(400, str(e))


@app.get("/api/admin/ai/settings")
def admin_ai_settings(x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "reports")
    return {**ai.settings(), "connected": ai.available(), "usage": ai.USAGE, "last": ai.LAST, "limits": ai.limits()}


@app.post("/api/admin/ai/settings")
def admin_ai_settings_set(body: dict, x_admin_token: str | None = Header(None)):
    """작업별 모델 등급 (fast=Haiku / smart=Sonnet). 총괄 관리자만."""
    s = _admin(x_admin_token, "accounts")
    tiers = {k: v for k, v in (body.get("tiers") or {}).items() if k in ai.TASKS and v in ai.MODELS}
    with cms._lock:
        db = cms.load()
        db["ai_models"] = tiers
        cms._log(db, "ai_models", "settings", None, tiers, "AI 모델 설정", _who(s))
        cms.save(db)
    ai.set_overrides(tiers)
    return ai.settings()


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
        return {"edit": edit.model_dump(), "course": course_for_display(res), "conditions": c.model_dump()}
    res = engine.plan(PLACES, c, engine.rain_for(c))
    return {"edit": edit.model_dump(), "course": course_for_display(res), "conditions": c.model_dump()}


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
        r.update({k: pl[k] for k in ("course", "extras", "stay", "events", "events_on_day", "move")})
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
    """이동약자 여행 정보: 동해시 음식점(food)·숙소(stay)·관광지(sight)·문화시설(culture)."""
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
    """장소 상세의 빅데이터 묶음: 붐빔 예측, 함께 가는 곳, 근처 이동약자 음식점·숙소, 해설 듣기."""
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


@app.post("/api/course-name")
def course_name(body: dict):
    """코스 이름 (AI). body {ids:[장소 id], move, who, lang}. AI가 없거나 실패하면 {by:'none'} → 화면이 규칙 이름을 쓴다."""
    ids = [i for i in (body.get("ids") or []) if isinstance(i, str) and i in PLACES][:12]
    if not ids:
        return {"by": "none"}
    t = llm.course_name([{"name": PLACES[i].name_ko, "type": PLACES[i].type, "styles": PLACES[i].styles} for i in ids],
                        [m for m in (body.get("move") or []) if isinstance(m, str)][:5], str(body.get("who") or "")[:20], str(body.get("lang") or "ko"))
    return {"by": "ai", "title": t} if t else {"by": "none"}


@app.post("/api/brief")
def brief(body: dict):
    """동이 브리핑 (AI). 화면이 보낸 근거(조건·예보·장소별 판정·붐빔·뺀 곳)로 카드 조각을 만든다. 실패하면 by=none."""
    return llm.brief(body) or {"by": "none"}


@app.post("/api/photo-check")
async def photo_check(photo: UploadFile = File(...), move: str = Form(""), lang: str = Form("ko")):
    """사진으로 물어보기: 사진은 저장하지 않고(위치 정보도 지운 사본만) AI에게 한 번 보여 준 뒤 버린다."""
    try:   # 사진이 아니거나 깨진 파일이면 서버 오류 대신 안내 (QA 2026-11-21)
        img = Image.open(io.BytesIO(await photo.read())).convert("RGB")
    except Exception:
        raise HTTPException(400, "사진을 읽지 못했어요. 다른 사진으로 다시 보내 주세요.")
    img.thumbnail((1024, 1024)); buf = io.BytesIO(); img.save(buf, "JPEG", quality=80)
    return llm.photo_check(buf.getvalue(), [m for m in move.split(",") if m], lang)


# ---------- 불편 제보 (이용자 → 시 담당자, docs/19_CITY_REPORTS.md) ----------
_REPORT_HITS: dict[str, list[float]] = {}
REPORT_PER_HOUR = int(os.getenv("REPORT_PER_HOUR") or 10)   # 같은 접속 주소에서 1시간에 보낼 수 있는 제보 수 (스팸 방지, AI와 별개)


def _exif_gps(img) -> tuple[float, float] | None:
    """'사진 찍은 위치 쓰기'에 동의했을 때만 부른다. 좌표만 읽고 사진은 위치 정보 없이 다시 저장한다."""
    try:
        g = img.getexif().get_ifd(0x8825)

        def deg(v, ref):
            d, m, s_ = (float(x) for x in v)
            x = d + m / 60 + s_ / 3600
            return -x if ref in ("S", "W") else x
        lat, lon = deg(g[2], g[1]), deg(g[4], g[3])
        return (lat, lon) if 36.5 < lat < 38.5 and 128.0 < lon < 130.5 else None   # 동해시 근처만
    except Exception:  # noqa: BLE001 — 위치가 없거나 형식이 다르면 안 쓴다
        return None


def _city_cfg() -> dict:
    c = cms.load().get("city") or {}
    return {"depts": {**city.DEPTS, **(c.get("depts") or {})}}


def _code() -> str:
    import secrets
    return "DH-" + str(secrets.randbelow(90000) + 10000)


def today_kst() -> str:
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)).date().isoformat()


@app.post("/api/reports")
async def report(request: Request, place_id: str = Form(""), kind: str = Form(""), note: str = Form(""), photo: UploadFile | None = File(None),
                 photos: list[UploadFile] | None = File(None), category: str = Form(""), who: str = Form(""), lat: str = Form(""), lon: str = Form(""),
                 loc_how: str = Form(""), use_exif: str = Form(""), contact: str = Form(""), consent: str = Form(""), source: str = Form("")):
    """불편 제보. 예전 방식(place_id·kind·note·photo)도 그대로 받는다.
    사진은 다시 저장하며 위치 정보(EXIF)를 지운다. 연락처는 동의했을 때만 따로 저장(AI에 보내지 않음)."""
    import time as _t
    ip = sitelock._ip(request)
    hits = [x for x in _REPORT_HITS.get(ip, []) if _t.time() - x < 3600]
    if REPORT_PER_HOUR > 0 and len(hits) >= REPORT_PER_HOUR:
        raise HTTPException(429, "잠시 뒤에 다시 보내 주세요. (1시간에 보낼 수 있는 제보 수를 넘었어요)")
    if place_id and place_id not in PLACES:
        raise HTTPException(404, "알 수 없는 장소예요")
    try:
        la, lo = (float(lat), float(lon)) if lat and lon else (None, None)
    except ValueError:
        la = lo = None
    if la is not None and not (36.5 < la < 38.5 and 128.0 < lo < 130.5):
        raise HTTPException(400, "동해시 근처 위치만 받을 수 있어요")
    cat = category if category in city.CATS else city.OLD_KIND.get(kind, "sidewalk" if place_id else "etc")
    whos = [w for w in who.split(",") if w in city.WHO]
    files = [f for f in ([photo] if photo and photo.filename else []) + list(photos or []) if f and f.filename][:3]
    if not (note.strip() or files or category or kind):
        raise HTTPException(400, "사진이나 한마디, 종류 중 하나는 알려 주세요")
    imgs = []
    for f in files:
        try:
            img = Image.open(io.BytesIO(await f.read(12 * 1024 * 1024)))
            img.load()
        except Exception:  # noqa: BLE001
            raise HTTPException(400, "사진을 열지 못했어요. JPG·PNG 사진을 올려 주세요.")
        if use_exif == "1" and la is None:
            g = _exif_gps(img)
            if g:
                la, lo, loc_how = g[0], g[1], "exif"
        imgs.append(img)
    if not place_id and la is None:
        raise HTTPException(400, "어디인지 알려 주세요 (내 위치·지도·관광지)")
    rid = uuid.uuid4().hex[:12]
    names, jpegs = [], []
    REPORTS.mkdir(parents=True, exist_ok=True)
    for i, img in enumerate(imgs):
        img = img.convert("RGB")                       # 다시 저장하면서 위치 정보(EXIF)를 지운다
        img.thumbnail((1600, 1600))
        name = f"{rid}{'' if i == 0 else f'_{i}'}.jpg"
        img.save(REPORTS / name, "JPEG", quality=85)
        names.append(name)
        small = img.copy(); small.thumbnail((1024, 1024)); buf = io.BytesIO(); small.save(buf, "JPEG", quality=80)
        jpegs.append(buf.getvalue())
    pname = PLACES[place_id].name_ko if place_id else ""
    depts = _city_cfg()["depts"]
    tri = await anyio.to_thread.run_sync(lambda: city.triage(cat, whos, note, pname, jpegs, depts))
    rec = {"id": rid, "code": _code(), "source": source if source in ("불편 알리기", "코스 결과", "동이 대화") else ("불편 알리기" if category else "제보"),
           "place_id": place_id or None, "lat": la, "lon": lo,
           "loc_how": loc_how if loc_how in ("gps", "map", "place", "exif") else ("place" if place_id else ""),
           "kind": kind or city.CATS[cat], "category": cat, "who": whos, "note": " ".join(note.split())[:500], "status": "접수",
           "created_at": dt.datetime.now().isoformat(timespec="seconds"), "photo": names[0] if names else None, "photos": names,
           "triage": tri, "ai": city.legacy_ai(tri), "history": [{"status": "접수", "at": reports_store.now(), "by": "제보"}], "reply": "",
           "has_contact": bool(contact.strip() and consent == "1")}
    if rec["has_contact"]:
        reports_store.add_contact(rid, contact.strip())
    reports_store.append(rec)
    _REPORT_HITS[ip] = hits + [_t.time()]
    same = next((c for c in city.clusters(reports_store.real(), PLACES) if rid in c["members"]), None)
    if same and same["count"] > 1 and same["status"] in ("확인", "처리 중"):
        reply = next((r.get("reply") for r in reports_store.real() if r["id"] in same["members"] and r.get("reply")), "")
        def follow(r):
            r["status"] = same["status"]; r["reply"] = reply
            r["history"].append({"status": same["status"], "at": reports_store.now(), "by": "같은 곳 제보 묶음"})
        reports_store.update({rid}, follow)
        rec["status"] = same["status"]
    return {"ok": True, "id": rid, "code": rec["code"], "ai": rec["ai"], "status": rec["status"],
            "triage": {k: tri.get(k) for k in ("by", "category", "severity", "summary")}, "same": (same or {}).get("count", 1)}


def _public_report(r: dict) -> dict:
    """이용자에게 보여 줄 것만 (사진·연락처·AI 내부 값 없음)."""
    return {"id": r["id"], "code": r.get("code"), "category": city.cat_of(r), "status": r["status"], "created_at": r.get("created_at"),
            "place": PLACES[r["place_id"]].name_ko if r.get("place_id") in PLACES else "", "note": (r.get("note") or "")[:120],
            "summary": (r.get("triage") or {}).get("summary", ""), "reply": r.get("reply", ""), "after_photo": bool(r.get("after_photo")),
            "steps": [{"status": h.get("status"), "at": h.get("at")} for h in r.get("history", []) if h.get("status")], "sample": bool(r.get("sample"))}


@app.get("/api/reports/mine")
def reports_mine(ids: str = "", code: str = ""):
    """내 제보: 이 기기에 저장한 제보 id 들, 또는 접수번호(DH-12345)로 찾기."""
    want = set(ids.split(",")) - {""}
    code = code.strip().upper()
    rows = reports_store.all_rows(True)
    return [_public_report(r) for r in rows if r["id"] in want or (code and r.get("code") == code)][:30]


@app.get("/api/reports/public-map")
def reports_public_map():
    """공개 지도 '알려진 불편': 2명 이상 알린 묶음만, 사진·개별 좌표 없이. 가상 제보는 관리자 화면에서만 쓴다."""
    rows = [r for r in reports_store.all_rows(False) if r["status"] not in ("반려", "중복")]
    out = []
    for c in city.clusters(rows, PLACES):
        if c["count"] >= 2 and c["lat"]:
            out.append({**{k: c[k] for k in ("id", "count", "category", "severity", "status", "lat", "lon", "sample")},
                        "near": (c.get("near") or {}).get("name") or c.get("landmark") or "", "label": city.CATS[c["category"]], "label_en": city.CATS_EN[c["category"]]})
    return out


@app.get("/api/reports/after/{rid}")
def report_after_photo(rid: str):
    """고친 뒤 사진(담당자가 올린 것)은 공개해도 된다 — 이용자 [내 제보]에서 보인다."""
    r = next((r for r in reports_store.all_rows(True) if r["id"] == rid), None)
    if not r or not r.get("after_photo") or not (REPORTS / r["after_photo"]).exists():
        raise HTTPException(404, "사진이 없어요")
    return FileResponse(REPORTS / r["after_photo"], media_type="image/jpeg")


# ---------- 관리자 [제보·민원] ----------
def _cluster_view(include_sample: bool) -> tuple[list[dict], dict]:
    rows = reports_store.all_rows(include_sample)
    by_id = {r["id"]: r for r in rows}
    cls = city.clusters(rows, PLACES)
    depts = _city_cfg()["depts"]
    for c in cls:
        members = [by_id[i] for i in c["members"]]
        pname = PLACES[c["place_id"]].name_ko if c.get("place_id") in PLACES else ""
        c.update(city.cluster_summary(c, members, pname))
        c.update(place_name=pname, dept_name=depts.get(c["dept"], c["dept"]), category_name=city.CATS[c["category"]],
                 severity_name=city.SEV[c["severity"]], priority_name=city.PRI[c["priority"]])
    return cls, by_id


def _find_cluster(cid: str) -> dict:
    cls, _ = _cluster_view(True)
    c = next((x for x in cls if x["id"] == cid), None)
    if not c:
        raise HTTPException(404, "묶음을 찾지 못했어요")
    return c


@app.get("/api/admin/city")
def admin_city(sample: int = 1, x_admin_token: str | None = Header(None)):
    """묶음 목록 (+ 각 묶음의 개별 제보). 사진은 관리자 토큰이 있어야 열린다."""
    _admin(x_admin_token, "reports")
    inc = bool(sample) and reports_store.sample_loaded()
    cls, by_id = _cluster_view(inc)
    keys = ("id", "code", "source", "category", "who", "note", "status", "created_at", "photos", "reply", "has_contact",
            "triage", "final", "sample", "lat", "lon", "loc_how", "history", "after_photo", "notice_id")
    for c in cls:
        c["reports"] = [{**{k: r.get(k) for k in keys}, "category_name": city.CATS[city.cat_of(r)]}
                        for r in sorted((by_id[i] for i in c["members"]), key=lambda r: r.get("created_at") or "", reverse=True)]
    order = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    cls.sort(key=lambda c: (c["status"] in ("완료", "반려", "중복"), order.get(c["priority"], 9), -c["count"], c["first_at"]))
    return {"clusters": cls, "cats": city.CATS, "sev": city.SEV, "pri": city.PRI, "depts": _city_cfg()["depts"], "statuses": reports_store.STATUSES,
            "sample_loaded": reports_store.sample_loaded(), "persistent": reports_store.persistent(), "ai": ai.available()}


@app.get("/api/admin/city-photo/{name}")
def admin_city_photo(name: str, t: str = ""):
    """제보 사진은 담당자만 (img 태그라 토큰을 주소로 받는다)."""
    _admin(t, "reports")
    if not re.fullmatch(r"[0-9a-f]{12}(_\d|_after)?\.jpg", name) or not (REPORTS / name).exists():
        raise HTTPException(404, "사진이 없어요")
    return FileResponse(REPORTS / name, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@app.get("/api/admin/city-contact/{rid}")
def admin_city_contact(rid: str, x_admin_token: str | None = Header(None)):
    """제보자가 동의하고 남긴 연락처 (보는 것도 이력에 남긴다)."""
    s = _admin(x_admin_token, "reports")
    c = reports_store.contact_of(rid)
    if c:
        with cms._lock:
            db = cms.load(); cms._log(db, "contact_view", rid, None, None, "제보자 연락처 확인", _who(s)); cms.save(db)
    return {"contact": c}


@app.post("/api/admin/city/{cid}")
def admin_city_update(cid: str, body: dict, x_admin_token: str | None = Header(None)):
    """묶음 처리: status·reply(이용자에게 보일 답변)·memo, 분류 고치기(category·severity·dept·priority). 묶음의 모든 제보에 적용."""
    s = _admin(x_admin_token, "reports")
    c = _find_cluster(cid)
    st = body.get("status")
    if st and st not in reports_store.STATUSES:
        raise HTTPException(400, "처리 상태가 올바르지 않아요")
    if st == "반려" and not str(body.get("memo") or body.get("reply") or "").strip():
        raise HTTPException(400, "반려할 때는 사유를 적어 주세요")
    allowed = {"category": city.CATS, "severity": city.SEV, "dept": _city_cfg()["depts"], "priority": city.PRI}
    fix = {k: body[k] for k in allowed if body.get(k) and body[k] in allowed[k]}
    who = _who(s)

    def apply(r):
        if fix:
            r["final"] = {**(r.get("final") or {}), **fix, "by": who, "at": reports_store.now()}
        if st and st != r["status"]:
            r["status"] = st
            r.setdefault("history", []).append({"status": st, "at": reports_store.now(), "by": who, "memo": str(body.get("memo") or "")[:300]})
        if body.get("reply") is not None:
            r["reply"] = str(body.get("reply") or "")[:500]
        if body.get("memo"):
            r["memo"] = str(body["memo"])[:300]
    return {"ok": True, "updated": reports_store.update(set(c["members"]), apply)}


@app.post("/api/admin/city/{cid}/merge")
def admin_city_merge(cid: str, body: dict, x_admin_token: str | None = Header(None)):
    """묶음 합치기(into = 다른 묶음 id) 또는 한 제보 떼어 내기(split = 제보 id)."""
    _admin(x_admin_token, "reports")
    cls, _ = _cluster_view(True)
    if body.get("split"):
        rid = body["split"]
        # 화면의 묶음 구성이 그사이 바뀌었어도(다른 제보를 떼었거나 새 제보가 붙어서) 묶음 번호와 상관없이 그 제보를 떼어 낸다
        if not any(rid in x["members"] for x in cls):
            raise HTTPException(404, "제보를 찾지 못했어요")
        # 'solo-' 묶음: 묶음 이름이 된 첫 제보를 떼어도 실제로 떨어지고, 새 제보가 이 칸에 붙지 않는다
        reports_store.update({rid}, lambda r: r.__setitem__("cluster_override", f"solo-{rid}"))
        return {"ok": True}
    src = next((x for x in cls if x["id"] == cid), None)
    if not src:
        raise HTTPException(404, "묶음을 찾지 못했어요")
    dst = next((x for x in cls if x["id"] == body.get("into")), None)
    if not dst or dst["id"] == cid:
        raise HTTPException(400, "합칠 묶음을 골라 주세요")
    reports_store.update(set(src["members"]) | set(dst["members"]), lambda r: r.__setitem__("cluster_override", dst["id"]))
    return {"ok": True}


@app.post("/api/admin/city/{cid}/after-photo")
async def admin_city_after(cid: str, photo: UploadFile = File(...), x_admin_token: str | None = Header(None)):
    """고친 뒤 사진: 이용자 [내 제보]에 보인다 (위치 정보 지움)."""
    _admin(x_admin_token, "reports")
    c = _find_cluster(cid)
    try:
        img = Image.open(io.BytesIO(await photo.read(12 * 1024 * 1024))).convert("RGB")
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "사진을 열지 못했어요")
    img.thumbnail((1600, 1600))
    name = f"{c['members'][0]}_after.jpg"
    REPORTS.mkdir(parents=True, exist_ok=True)
    img.save(REPORTS / name, "JPEG", quality=85)
    reports_store.update(set(c["members"]), lambda r: r.__setitem__("after_photo", name))
    return {"ok": True}


@app.post("/api/admin/city/{cid}/notice")
def admin_city_notice(cid: str, body: dict, x_admin_token: str | None = Header(None)):
    """[여행 정보에 알리기]: 관광지 임시 알림으로 올린다 (기존 알림·이력·되돌리기 그대로)."""
    _admin(x_admin_token, "notice")
    c = _find_cluster(cid)
    if not c.get("place_id"):
        raise HTTPException(400, "관광지와 이어진 묶음만 알림으로 올릴 수 있어요")
    if c["sample"]:
        raise HTTPException(400, "가상 제보로는 실제 사이트 알림을 올리지 않아요")
    rec = _guard(lambda: cms.add_notice({"place_id": c["place_id"], "level": body.get("level") or "warn",
                                         "title": str(body.get("title") or c.get("title") or "")[:80], "body": str(body.get("body") or c.get("summary") or ""),
                                         "start": body.get("start") or today_kst(), "end": body.get("end") or None, "from_report": cid},
                                        f"제보 묶음 {cid} ({c['count']}건)"))
    reports_store.update(set(c["members"]), lambda r: r.__setitem__("notice_id", rec["id"]))
    refresh()
    return {"ok": True, "notice": rec}


@app.get("/api/admin/city-summary")
def admin_city_summary(start: str = "", end: str = "", sample: int = 1, ai_text: int = 0, x_admin_token: str | None = Header(None)):
    """기간 요약: 숫자는 서버가 계산, ai_text=1 이면 AI 보고서 문장(Sonnet)까지."""
    _admin(x_admin_token, "reports")
    end = end or today_kst()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", end):
        raise HTTPException(400, "기간을 바르게 골라 주세요")
    start = start or (dt.date.fromisoformat(end) - dt.timedelta(days=6)).isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start) or start > end:
        raise HTTPException(400, "기간을 바르게 골라 주세요")
    inc = bool(sample) and reports_store.sample_loaded()
    cls, _ = _cluster_view(inc)
    st = city.stats(reports_store.all_rows(inc), cls, start, end, _city_cfg()["depts"])
    by = {c["id"]: c for c in cls}
    hot, stale = [by[i] for i in st["hot"]], [by[i] for i in st["stale"]]
    keys = ("id", "title", "count", "category_name", "status", "age_days", "severity_name", "dept_name", "place_name", "sample", "lat", "lon")
    out = {"stats": st, "hot": [{k: c.get(k) for k in keys} for c in hot], "stale": [{k: c.get(k) for k in keys} for c in stale]}
    if ai_text:
        out["report"] = city.period_report(st, hot, stale)
    return out


@app.get("/api/admin/city-export.csv")
def admin_city_export(t: str = "", sample: int = 0):
    """CSV 내려받기 (외부 민원 시스템으로 옮기기 쉽게). 연락처·사진은 넣지 않는다."""
    _admin(t, "reports")
    import csv
    rows = reports_store.all_rows(bool(sample) and reports_store.sample_loaded())
    cid = {m: c["id"] for c in city.clusters(rows, PLACES) for m in c["members"]}
    depts = _city_cfg()["depts"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["접수번호", "접수일시", "묶음", "상태", "분류", "심각도", "담당 부서", "우선순위", "위도", "경도", "가까운 관광지", "누가 불편", "내용", "AI 요약", "정리", "답변", "가상"])
    for r in sorted(rows, key=lambda r: r.get("created_at") or ""):
        cat = city.cat_of(r)
        w.writerow([r.get("code") or r["id"], r.get("created_at"), cid.get(r["id"]), r["status"], city.CATS[cat],
                    city.SEV.get(city.val(r, "severity", "minor"), ""), depts.get(city.val(r, "dept", city.CAT_DEPT[cat]), ""),
                    city.PRI.get(city.val(r, "priority", ""), ""), r.get("lat") or "", r.get("lon") or "",
                    PLACES[r["place_id"]].name_ko if r.get("place_id") in PLACES else "", ",".join(r.get("who") or []), city.scrub(r.get("note") or ""),
                    (r.get("triage") or {}).get("summary", ""), "담당자" if r.get("final") else (r.get("triage") or {}).get("by", ""),
                    r.get("reply", ""), "가상" if r.get("sample") else ""])
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=reports_{today_kst()}.csv"})


@app.post("/api/admin/city-settings")
def admin_city_settings(body: dict, x_admin_token: str | None = Header(None)):
    """부서 이름 바꾸기 (총괄 관리자). 키는 그대로, 보이는 이름만."""
    s = _admin(x_admin_token, "accounts")
    raw = body.get("depts") if isinstance(body.get("depts"), dict) else {}   # 잘못된 형식은 빈 값으로 (QA)
    depts = {k: str(v).strip()[:40] for k, v in raw.items() if k in city.DEPTS and str(v).strip()}
    with cms._lock:
        db = cms.load()
        before = (db.get("city") or {}).get("depts")
        db["city"] = {**(db.get("city") or {}), "depts": depts}
        cms._log(db, "city_settings", "depts", before, depts, "제보 담당 부서 이름", _who(s))
        cms.save(db)
    return _city_cfg()


@app.post("/api/admin/city-sample")
def admin_city_sample(body: dict, x_admin_token: str | None = Header(None)):
    """가상 제보·문의 넣기(load) / 모두 지우기(clear). 실제 제보·문의 파일은 건드리지 않는다."""
    _admin(x_admin_token, "reports")
    if body.get("action") == "load":
        n = reports_store.load_samples()
        _load_sample_inquiries()
        _load_sample_admin()
        return {"ok": True, "loaded": n}
    if body.get("action") == "clear":
        (REPORTS / "sample_inquiries.jsonl").unlink(missing_ok=True)
        (REPORTS / SAMPLE_ADMIN).unlink(missing_ok=True)
        return {"ok": True, "cleared": reports_store.clear_samples()}
    raise HTTPException(400, "action 은 load 또는 clear")


@app.get("/api/admin/city-backup")
def admin_city_backup(t: str = ""):
    """제보 백업 zip (제보·연락처·사진). 디스크가 없는 요금제에서는 재배포 전에 꼭 내려받기."""
    _admin(t, "backup")
    return Response(reports_store.backup_zip(), media_type="application/zip",
                    headers={"Content-Disposition": f"attachment; filename=reports_backup_{today_kst()}.zip"})


@app.post("/api/admin/city-restore")
async def admin_city_restore(file: UploadFile = File(...), x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "backup")
    try:
        n = reports_store.restore_zip(await file.read(200 * 1024 * 1024))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"백업 파일을 열지 못했어요 ({type(e).__name__})")
    return {"ok": True, "files": n}


# ---------- 자동 정보 갱신 (docs/20_AUTO_SYNC.md, 0~1단계: AI 없이) ----------
@app.post("/api/admin/sync/run")
def admin_sync_run(scope: str = "all", source: str = "", x_admin_token: str | None = Header(None), x_sync_token: str | None = Header(None)):
    """소스를 돌려 비교·반영·검수함. GitHub Actions 예약 실행은 X-Sync-Token(전용 토큰)으로, 관리자는 [지금 실행]으로."""
    if not sync_mod.token_ok(x_sync_token):
        _admin(x_admin_token, "data")
    if scope not in ("all", "daily", "weekly"):
        raise HTTPException(400, "scope 는 all·daily·weekly")
    return sync_mod.run(PLACES, scope, source or None, refresh)


@app.get("/api/admin/sync")
def admin_sync(x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "place")
    return sync_mod.overview(PLACES)


@app.post("/api/admin/sync/changes/{cid}")
def admin_sync_decide(cid: str, body: dict, x_admin_token: str | None = Header(None)):
    """검수: action = approve | reject, value = 고쳐서 승인할 값(불일치는 고른 값)."""
    s = _admin(x_admin_token, "place")
    out = _guard(lambda: sync_mod.decide(cid, str(body.get("action") or ""), PLACES, _who(s), body.get("value"), str(body.get("memo") or "")))
    refresh()
    return out


@app.post("/api/admin/sync/changes/{cid}/revert")
def admin_sync_revert(cid: str, x_admin_token: str | None = Header(None)):
    s = _admin(x_admin_token, "history")
    out = _guard(lambda: sync_mod.undo(cid, _who(s)))
    refresh()
    return out


@app.post("/api/admin/sync/rules")
def admin_sync_rules(body: dict, x_admin_token: str | None = Header(None)):
    """[자동 갱신 설정] 항목별 auto·review·off (총괄 관리자만, 이동약자 정보는 auto 불가)."""
    s = _admin(x_admin_token, "accounts")
    rules = body.get("rules")
    if not isinstance(rules, dict):
        raise HTTPException(400, "설정 형식이 올바르지 않아요")
    return sync_mod.set_rules(rules, _who(s))


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
    reps = reports_store.real()
    inq = _real_inquiries()
    visits = _jsonl("visits.jsonl")
    week = (dt.date.fromisoformat(day) + dt.timedelta(days=7)).isoformat()
    return {"today": day,   # 숫자·경고 색은 진짜만, 가상은 따로 센다
            "reports": {"new": sum(r.get("status") == "접수" for r in reps), "doing": sum(r.get("status") in ("확인", "처리 중") for r in reps), "total": len(reps),
                        "sample": len(reports_store.samples())},
            "inquiries": {"new": sum(r.get("status") == "접수" for r in inq), "total": len(inq), "sample": len(_jsonl("sample_inquiries.jsonl"))},
            "examples": _dash_examples(db, day),
            "notices": [{**n, "name": PLACES[n["place_id"]].name_ko if n.get("place_id") in PLACES else None} for n in db["notices"] if cms.active(n, day)][:8],
            "banner": cms.site(day)["banner"],
            "overrides": len(db["overrides"]) + len(db["segments"]),
            "visits": {"total": len(visits), "last": max((v["date"] for v in visits if v.get("date")), default=None)},
            "events_week": [e for e in cms.events() if e.get("start", "") <= week and (e.get("end") or e.get("start", "")) >= day][:5],
            "recent": db["history"][:8]}


def _dash_examples(db: dict, day: str) -> dict:
    """알림·최근 변경이 하나도 없을 때만 보여 줄 가상 예시 (사이트에는 안 나가고, 화면에 '가상' 표시)."""
    if os.getenv("SEED_SAMPLES", "1") == "0":
        return {}
    ex: dict = {}
    if not any(cms.active(n, day) for n in db["notices"]):
        ex["notices"] = [{"id": "ex1", "level": "warn", "title": "호수 전망 데크 보수 공사 (우회로 이용)", "name": "무릉별유천지", "start": day, "end": ""},
                         {"id": "ex2", "level": "closed", "title": "내부 정비로 하루 휴관", "name": "천곡황금박쥐동굴", "start": day, "end": day}]
    if not db["history"]:
        now = dt.datetime.now().replace(microsecond=0)
        ex["recent"] = [{"id": f"ex{i}", "at": (now - dt.timedelta(hours=h)).isoformat(), "who": w, "summary": t}
                        for i, (h, w, t) in enumerate([(2, "편집자", "추암 촛대바위 운영시간 수정"), (5, "총괄 관리자", "무릉별유천지 임시 알림 올림"),
                                                       (26, "현장 조사원", "묵호항 구간 정보 '주의'로 바꿈")])]
    return ex


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
    rows = reports_store.real()
    for r in rows:
        r["name"] = PLACES[r["place_id"]].name_ko if r.get("place_id") in PLACES else (r.get("place_id") or "위치 제보")
    return sorted(rows, key=lambda r: r["created_at"], reverse=True)


@app.post("/api/admin/reports/{rid}")
def admin_review(rid: str, body: dict, x_admin_token: str | None = Header(None)):
    """제보 검수: status = 접수 / 확인 중 / 반영 / 반려."""
    s = _admin(x_admin_token, "reports")
    rows = reports_store.real()
    for r in rows:
        if r["id"] == rid:
            st = reports_store.OLD.get(body.get("status") or "", body.get("status")) or r["status"]
            if st != r["status"]:
                r.setdefault("history", []).append({"status": st, "at": reports_store.now(), "by": _who(s)})
            r["status"] = st
            r["memo"] = (body.get("memo") or r.get("memo") or "")[:300]
            r["reviewed_at"] = dt.datetime.now().isoformat(timespec="seconds")
            r["reviewed_by"] = _who(s)
            n = body.get("notice")   # [반영] + 알림으로 올리기 → 사이트에 바로 보인다
            if r["status"] == "완료" and n and n.get("level") and cms.can(s, "notice") and r.get("place_id"):
                rec = _guard(lambda: cms.add_notice({**n, "place_id": r["place_id"], "from_report": rid}, f"제보 {rid} 반영"))
                r["notice_id"] = rec["id"]
    reports_store.save_real(rows)
    return {"ok": True}


# ---------- 문의하기 (커뮤니티 > 문의) : 관리자 [문의] 탭에서 읽고 답한다 ----------
SAMPLE_INQUIRIES = [   # 관리자 화면 점검용 가상 문의 (실제 사람 아님, sample=True)
    ("휠씨", "이용 방법", "전동휠체어로 다니는데 코스에 충전할 수 있는 곳도 같이 넣어 줄 수 있나요?", 0, "접수", ""),
    ("묵호여행", "장소 정보", "무릉별유천지 월요일에 쉬는 게 맞나요? 지난주 월요일에 갔는데 열려 있었어요.", 1, "확인 중", ""),
    ("유모차맘", "접근성·길 정보", "추암 출렁다리까지 유모차로 갈 수 있는지 궁금해요. 계단이 있나요?", 2, "답변 완료",
     "주차장에서 출렁다리 입구까지는 경사로로 갈 수 있어요. 다리 위는 흔들림이 있어 유모차는 천천히 밀어 주세요."),
    ("동해시민", "오류 신고", "천곡동굴 전화번호가 예전 번호로 나와요.", 3, "확인 중", ""),
    ("방문자", "기타", "부모님 모시고 가기 좋은 식당도 추천해 주시면 좋겠어요.", 5, "답변 완료", "코스를 짤 때 '부드러운 메뉴'를 고르면 어르신이 드시기 편한 식당을 먼저 넣어 드려요."),
]


def _load_sample_inquiries():
    now = dt.datetime.now().replace(microsecond=0)
    rows = [{"id": f"sample{i:02d}", "nick": n, "contact": "", "category": c, "text": t, "status": st, "answer": a,
             "created_at": (now - dt.timedelta(days=d, hours=i * 3)).isoformat(), "sample": True,
             **({"answered_at": (now - dt.timedelta(days=max(0, d - 1))).isoformat()} if a else {})}
            for i, (n, c, t, d, st, a) in enumerate(SAMPLE_INQUIRIES)]
    _save_jsonl("sample_inquiries.jsonl", rows)


# 관리자 화면 점검용 가상 알림·행사·AI 제안·현장 기록. 공개 화면·코스 엔진·장소 페이지는 이 파일을 읽지 않는다.
SAMPLE_ADMIN = "sample_admin.json"


def _load_sample_admin():
    t = dt.date.today()
    d = lambda n: (t + dt.timedelta(days=n)).isoformat()   # noqa: E731
    now = dt.datetime.now().replace(microsecond=0).isoformat()
    data = {
        "notices": [
            {"id": "snt1", "place_id": "mukho_lighthouse", "level": "closed", "title": "[가상] 내부 정비로 하루 휴관", "body": "관리자 화면 점검용", "start": d(1), "end": d(1)},
            {"id": "snt2", "place_id": "mureung", "level": "warn", "title": "[가상] 호수 전망 데크 보수 — 휠체어는 방문자센터 쪽 우회로", "body": "", "start": d(0), "end": d(14)},
            {"id": "snt3", "place_id": "", "level": "info", "title": "[가상] 주말 동해역 셔틀버스 증편 안내", "body": "", "start": d(0), "end": d(7)}],
        "events": [
            {"id": "sev1", "name": "[가상] 무릉별유천지 야간 개장", "start": d(3), "end": d(5), "venue": "무릉별유천지", "tel": "", "url": "", "kind": "행사", "access": "휠체어 관람석·장애인 화장실"},
            {"id": "sev2", "name": "[가상] 묵호항 수산물 장터", "start": d(8), "end": d(8), "venue": "묵호항", "tel": "", "url": "", "kind": "행사", "access": ""}],
        "proposals": [
            {"id": "sap1", "place_id": "mukho_port", "type": "notice", "level": "warn", "title": "[가상] 묵호항 보도 파손 — 휠체어 주의", "detail": "가상 제보 5건을 묶은 점검용 제안", "end_date": d(14), "evidence": [], "status": "pending", "created_at": now},
            {"id": "sap2", "place_id": "chotdae", "type": "facility_add", "facility": "휠체어 대여", "title": "[가상] 편의시설 추가: 휠체어 대여", "detail": "", "evidence": [], "status": "pending", "created_at": now},
            {"id": "sap3", "place_id": "cave", "type": "hours", "open": "09:00", "close": "18:00", "title": "[가상] 운영시간 09:00~18:00", "detail": "", "evidence": [], "status": "pending", "created_at": now}],
        "visits": [
            {"id": "svs1", "place_id": "mangsang", "name": "망상해변", "date": d(-3), "who": "[가상] 현장 조사원", "segment": "주차장 → 해변", "slope_deg": 2.5, "curb_cm": 1, "width_m": 1.5, "surface": "데크", "toilet": "있음", "note": "점검용 가상 기록"},
            {"id": "svs2", "place_id": "chotdae", "name": "추암해변·촛대바위", "date": d(-6), "who": "[가상] 현장 조사원", "segment": "촛대바위 전망 지점", "steps": 24, "surface": "계단", "note": "점검용 가상 기록"}],
    }
    for rows in data.values():
        for r in rows:
            r["sample"] = True
    (REPORTS / SAMPLE_ADMIN).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _sample_admin() -> dict:
    f = REPORTS / SAMPLE_ADMIN
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


@app.get("/api/admin/samples")
def admin_samples(x_admin_token: str | None = Header(None)):
    """관리자 [공지·알림]에 함께 보여 줄 가상 알림·행사 (사이트에는 안 나감)."""
    _admin(x_admin_token)
    d = _sample_admin()
    return {"notices": [{**n, "name": PLACES[n["place_id"]].name_ko if n.get("place_id") in PLACES else None} for n in d.get("notices", [])],
            "events": d.get("events", [])}


def _real_inquiries() -> list[dict]:
    return [r for r in _jsonl("inquiries.jsonl") if not r.get("sample")]   # 예전에 진짜 파일에 섞여 들어간 가상 문의는 빼고 읽는다


def _seed_samples():
    """관리자 화면을 확인할 수 있게, 비어 있으면 가상 제보·문의를 넣는다.
    SEED_SAMPLES=0 이거나 관리자가 [가상 데이터 모두 지우기]를 했으면 안 넣는다. 공개 화면에는 쓰지 않는다."""
    if os.getenv("SEED_SAMPLES", "1") == "0" or reports_store.samples_cleared():
        return
    try:
        if not reports_store.sample_loaded():
            reports_store.load_samples()
        if not (REPORTS / "sample_inquiries.jsonl").exists():
            _load_sample_inquiries()
        if not (REPORTS / SAMPLE_ADMIN).exists():
            _load_sample_admin()
    except Exception as e:   # 가상 데이터는 없어도 서비스는 돈다
        print("가상 데이터 넣기 실패:", e)


_seed_samples()

INQ_CATS = {"이용 방법", "장소 정보", "접근성·길 정보", "오류 신고", "기타"}


@app.post("/api/inquiries")
def inquiry_new(body: dict):
    text = (body.get("text") or "").strip()
    if len(text) < 5:
        raise HTTPException(400, "문의 내용을 5자 이상 적어 주세요")
    rec = {"id": uuid.uuid4().hex[:12], "nick": (body.get("nick") or "방문자").strip()[:20], "contact": (body.get("contact") or "").strip()[:60],
           "category": body.get("category") if body.get("category") in INQ_CATS else "기타", "text": text[:1000],
           "status": "접수", "answer": "", "created_at": dt.datetime.now().isoformat(timespec="seconds")}
    rows = _real_inquiries(); rows.append(rec); _save_jsonl("inquiries.jsonl", rows)
    return {"ok": True, "id": rec["id"]}


@app.get("/api/inquiries/mine")
def inquiry_mine(ids: str = ""):
    """내가 보낸 문의의 처리 상태·답변 (문의 id는 그 기기에만 저장)."""
    want = set(ids.split(",")) - {""}
    return [{k: r.get(k) for k in ("id", "category", "text", "status", "answer", "created_at", "answered_at")} for r in _real_inquiries() if r["id"] in want]


@app.get("/api/admin/inquiries")
def admin_inquiries(x_admin_token: str | None = Header(None)):
    _admin(x_admin_token, "reports")
    return sorted(_real_inquiries() + _jsonl("sample_inquiries.jsonl"), key=lambda r: r["created_at"], reverse=True)


@app.post("/api/admin/inquiries/{iid}")
def admin_inquiry(iid: str, body: dict, x_admin_token: str | None = Header(None)):
    """문의 처리: status = 접수 / 확인 중 / 답변 완료, answer = 답변. 진짜·가상 문의 각자 파일에 저장."""
    s = _admin(x_admin_token, "reports")
    for name, rows in (("inquiries.jsonl", _real_inquiries()), ("sample_inquiries.jsonl", _jsonl("sample_inquiries.jsonl"))):
        hit = [r for r in rows if r["id"] == iid]
        for r in hit:
            r["status"] = body.get("status", r["status"])
            r["answer"] = (body.get("answer") if body.get("answer") is not None else r.get("answer", ""))[:1000]
            r["answered_at"] = dt.datetime.now().isoformat(timespec="seconds"); r["answered_by"] = _who(s)
        if hit:
            _save_jsonl(name, rows)
    return {"ok": True}


@app.get("/api/admin/visits")
def admin_visits(x_admin_token: str | None = Header(None)):
    """현장 확인 기록 (팀 답사)."""
    _admin(x_admin_token, "visits")
    return sorted(_jsonl("visits.jsonl") + _sample_admin().get("visits", []), key=lambda r: r["date"], reverse=True)   # 가상 기록은 장소 페이지 '현장 확인'에 안 쓰임


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
@app.get("/map-config.js", include_in_schema=False)
def public_map_config():
    """카카오 지도 JavaScript 키를 서버 환경변수에서 화면으로 (gangRG님). JS 키는 원래 브라우저에 보이는 키이고,
    카카오 개발자센터에서 허용 도메인(사이트 주소·localhost)을 정해 두어야 지도가 뜬다."""
    js_key = os.getenv("KAKAO_JS_KEY") or os.getenv("NEXT_PUBLIC_KAKAO_JS_KEY") or ""
    return Response("window.gildongmuKakaoJsKey=" + json.dumps(js_key) + ";", media_type="application/javascript",
                    headers={"Cache-Control": "no-cache"})


WEB = Path(__file__).resolve().parents[2] / "web"
if (WEB / "index.html").exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
