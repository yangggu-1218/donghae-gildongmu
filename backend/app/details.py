"""작업1: 영업시간·어르신 접근성 상세를 장소에 붙이고, 장소마다 가까운 주차장·충전기·안내소·병원·약국을 매칭한다.
- data/place_details.json : 영업시간, 휠체어·보행 부담·단차·테이블·벤치·보호자 꿀팁, 예시 식당·카페
- data/medical_sample.json : 예시 병원·약국 (키를 넣으면 국립중앙의료원 실데이터로 대체)
값마다 출처(hours_source / access_source)를 남긴다. '예시'는 답사·전화로 확인 전."""
import json
from pathlib import Path
from typing import Optional

from .schemas import Place, Segment
from . import public_data

DATA = Path(__file__).resolve().parents[2] / "data"
_D = json.loads((DATA / "place_details.json").read_text(encoding="utf-8")) if (DATA / "place_details.json").exists() else {"details": {}, "extra_places": []}
MED = json.loads((DATA / "medical_sample.json").read_text(encoding="utf-8"))["items"] if (DATA / "medical_sample.json").exists() else []
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
                  "table", "benches", "carer_tip", "access_source", "soft_menu", "parking_easy", "stay_min", "type"):
            if k in d and d[k] is not None:
                setattr(p, k, d[k])
        p.closed_day_nums = list(d.get("closed_days", []))
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
        return "운영시간 정보 없음" if lang == "ko" else "Hours unknown"
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
    for kind in ("약국", "의원", "응급실"):
        cand = []
        for m in MED:
            if m["kind"] != kind:
                continue
            d = public_data.dist_m(lat, lon, m["lat"], m["lon"])
            is_open = None
            if weekday is not None and at is not None:
                is_open = weekday not in m["closed_days"] and mins(m["open"]) <= at < mins(m["close"])
            cand.append({**{k: m[k] for k in ("name", "kind", "tel", "open", "close")}, "dist_m": d, "open_then": is_open, "sample": True})
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
