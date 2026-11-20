"""작업1: 영업시간·어르신 접근성 상세를 장소에 붙이고, 장소마다 가까운 주차장·충전기·안내소·병원·약국을 매칭한다.
- data/place_details.json : 영업시간, 휠체어·보행 부담·단차·테이블·벤치·보호자 꿀팁, 식당·카페
- data/public/medical_dh.json : 동해시 실제 약국·병의원·응급실 (국립중앙의료원 자료 저장본. 서버는 요일별 운영시간을 실시간으로 더함)
값마다 출처(hours_source / access_source)를 남긴다. '예시'는 답사·전화로 확인 전."""
import json
from pathlib import Path
from typing import Optional

from .schemas import Place, Segment
from . import public_data

DATA = Path(__file__).resolve().parents[2] / "data"
_D = json.loads((DATA / "place_details.json").read_text(encoding="utf-8")) if (DATA / "place_details.json").exists() else {"details": {}, "extra_places": []}
def _med() -> list[dict]:
    """동해시 실제 약국·병의원·응급실 목록 (data/public/medical_dh.json, 국립중앙의료원 자료를 저장한 것).
    kind: 약국 / 병의원 / 응급실, div: 의원·종합병원·치과의원 등. 운영시간은 서버가 국립중앙의료원에서 받았을 때만 쓴다."""
    f = DATA / "public" / "medical_dh.json"
    if not f.exists():
        return []
    j = json.loads(f.read_text(encoding="utf-8"))
    out = []
    for name, div, lat, lon, tel, road in j["rows"] + j.get("er", []):
        kind = "약국" if div == "약국" else "응급실" if div == "응급실" else "병의원"
        out.append({"name": name, "kind": kind, "div": "" if kind == "약국" else div, "lat": lat, "lon": lon, "tel": tel, "road": road})
    return out


MED = _med()
GP = ("의원", "종합병원", "보건소")   # '가까운 병원'으로 보여 줄 곳 (치과·한의원·요양병원은 지도에만)
WD_KO = ["일", "월", "화", "수", "목", "금", "토"]
WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def _derive(p: Place):
    """상세 값이 없을 때 구간 측정값으로 보행 부담·단차를 짐작한다 (출처: 구간 정보)."""
    segs = p.segments
    if not segs:
        return
    if p.walk_load == "확인 전":
        slope = max((s.slope_deg or 0) for s in segs)
        rough = any((s.surface or "") in ("산길", "흙길", "모래") or (s.steps or 0) > 10 for s in segs)
        p.walk_load = "급경사" if rough or slope > 7.1 else "완만한경사" if slope > 3 or any("경사" in s.note for s in segs) else "평지"
    if p.entrance_step is None:
        cs = [s.curb_cm for s in segs if s.curb_cm is not None]
        if cs:
            p.entrance_step = max(cs) > 2


def apply(places: dict[str, Place]) -> dict[str, Place]:
    for r in _D.get("extra_places", []):
        if r["id"] not in places:
            places[r["id"]] = Place(**{**r, "segments": [Segment(**s) for s in r.get("segments", [])]})
    for pid, d in _D.get("details", {}).items():
        p = places.get(pid)
        if not p:
            continue
        for k in ("open", "close", "break_time", "last_entry", "hours_source", "wheelchair", "walk_load", "entrance_step",
                  "table", "benches", "carer_tip", "access_source", "soft_menu", "parking_easy", "stay_min", "type",
                  "intro_ko", "intro_en", "intro_source", "about", "fee", "fee_detail", "verify", "access_scope"):
            if k in d and d[k] is not None:
                setattr(p, k, d[k])
        if d.get("segments"):   # 공식 자료로 확인한 구간 정보가 있으면 예시 구간을 바꾼다
            p.segments = [Segment(**x) for x in d["segments"]]
        if d.get("facilities"):
            p.facilities = list(d["facilities"])
        p.closed_day_nums = list(d.get("closed_days", p.closed_day_nums if "closed_days" not in d else []))
        if p.open and not p.hours:
            p.hours = "상시 개방" if (p.open, p.close) == ("00:00", "24:00") else f"{p.open}~{p.close}"
        if p.closed_day_nums and not p.closed_days:
            p.closed_days = "·".join(WD_KO[i] for i in p.closed_day_nums) + "요일"
    for p in places.values():
        _derive(p)
    return places


# ---------- 시간 ----------
def mins(hm: Optional[str]) -> Optional[int]:
    if not hm:
        return None
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def open_check(p: Place, weekday: int, arrive: int, stay: int) -> tuple[bool, str, int]:
    """방문 가능 여부. 돌려주는 값: (가능, 이유, 기다릴 분).
    - 정기휴무 요일이면 불가
    - 마지막 입장(없으면 닫기 30분 전)보다 늦게 도착하면 불가
    - 브레이크타임에 걸리면 끝날 때까지 기다리거나(30분 이내) 불가
    - 문 열기 전이면 45분 이내는 기다림"""
    if weekday in p.closed_day_nums:
        return False, "closed_day", 0
    o, c = mins(p.open), mins(p.close)
    if o is None or c is None:
        return True, "unknown", 0
    if (o, c) == (0, 1440):
        return True, "always", 0
    last = mins(p.last_entry) or (c - 30)
    wait = 0
    if arrive < o:
        wait = o - arrive
        if wait > 45:
            return False, "not_open_yet", wait
    t = arrive + wait
    if p.break_time:
        b0, b1 = mins(p.break_time[0]), mins(p.break_time[1])
        if b0 <= t < b1 or (t < b0 < t + min(stay, 45) and p.type in ("식당", "카페")):
            w2 = b1 - t
            if w2 > 30:
                return False, "break", w2
            wait, t = wait + w2, b1
    if t > last:
        return False, "after_last_entry", 0
    return True, "open", wait


def hours_text(p: Place, lang: str = "ko") -> str:
    if not p.open:
        return ""   # 확인 안 된 운영시간은 표시하지 않는다
    if (p.open, p.close) == ("00:00", "24:00"):
        return "상시 개방" if lang == "ko" else "Open 24h"
    t = f"{p.open}~{p.close}"
    if p.break_time:
        t += (f" (쉬는 시간 {p.break_time[0]}~{p.break_time[1]})" if lang == "ko" else f" (break {p.break_time[0]}-{p.break_time[1]})")
    if p.closed_day_nums:
        t += (" · " + "·".join(WD_KO[i] for i in p.closed_day_nums) + " 휴무") if lang == "ko" else (" · closed " + "/".join(WD_EN[i] for i in p.closed_day_nums))
    return t


# ---------- 가까운 시설 매칭 ----------
def medical_near(lat, lon, weekday: Optional[int] = None, at: Optional[int] = None, limit: int = 1) -> dict:
    """가장 가까운 약국·병원(의원)·응급실. 시각을 주면 그 시각에 여는 곳을 먼저."""
    if lat is None:
        return {}
    out = {}
    from . import public_apis
    raw = (public_apis._MED_CACHE.get("raw") or (0, {}))[1]          # 서버가 받아 둔 국립중앙의료원 목록 (요일별 운영시간)
    week = {it.get("dutyName"): it for items in raw.values() for it in items}
    for kind in ("약국", "의원", "응급실"):
        cand = []
        for m in MED:
            if not (m["kind"] == kind or (kind == "의원" and m["kind"] == "병의원" and m["div"] in GP)):
                continue
            d = public_data.dist_m(lat, lon, m["lat"], m["lon"])
            is_open, o, c = (True, "00:00", "24:00") if kind == "응급실" else (None, None, None)
            it = week.get(m["name"])
            if it and weekday is not None:
                n = 7 if weekday == 0 else weekday           # 국립중앙의료원: 1=월 ~ 7=일
                s, e = it.get(f"dutyTime{n}s"), it.get(f"dutyTime{n}c")
                o, c = (f"{s[:2]}:{s[2:]}", f"{e[:2]}:{e[2:]}") if s and e else (None, None)
                if at is not None:
                    is_open = bool(s and e and int(s) <= at // 60 * 100 + at % 60 < int(e))
            cand.append({"name": m["name"], "kind": kind, "tel": m["tel"], "open": o, "close": c, "road": m["road"], "dist_m": d, "open_then": is_open})
        cand.sort(key=lambda x: (x["open_then"] is False, x["dist_m"]))
        if cand:
            out[kind] = cand[0]
    return out


def nearby(p: Place, lang: str = "ko", weekday: Optional[int] = None, at: Optional[int] = None) -> dict:
    """작업1-3: 장소마다 가장 가까운 공영주차장·전동보장구 충전기·관광안내소·병원·약국."""
    if p.lat is None:
        return {}
    pk = public_data.parking_near(p.lat, p.lon, radius=3000, limit=1)
    ch = public_data.chargers(p.lat, p.lon, 1)
    ic = public_data.info_centers(p.lat, p.lon, lang, limit=1)
    if not pk and p.parking:   # 공영주차장 목록에 없으면 장소 자체 주차 정보
        pk = [{"name": f"{p.name_ko} 주차장", "spaces": p.parking, "own": True, "dist_m": 0}]
    return {"parking": pk[0] if pk else None, "charger": ch[0] if ch else None, "info_center": ic[0] if ic else None,
            "medical": medical_near(p.lat, p.lon, weekday, at)}


def josa(word, pair):
    from .edits import josa as j
    return j(word, pair)
