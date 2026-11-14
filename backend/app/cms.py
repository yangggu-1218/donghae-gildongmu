"""관리자 페이지 관리(CMS): 관리자가 바꾼 값을 사이트에 바로 반영한다.

원칙
- 공공데이터·장소 상세 원본은 건드리지 않고, 그 위에 '덮어쓰기(overrides)'만 따로 저장한다.
  그래서 공공데이터를 새로 받아도 관리자가 고친 값이 사라지지 않는다.
- 접근성 판정에 영향을 주는 값(걷기 정보, 구간 측정값 등)은 '바꾼 이유(근거)'가 있어야 저장된다.
- 모든 변경은 이력에 남고, 이력 하나를 골라 되돌릴 수 있다.
- 저장소는 JSON 파일 하나(data/cms/cms.json). 서버 디스크가 지워지는 호스팅이면 [백업 내려받기]로 보관한다.
"""
import copy
import datetime as dt
import json
import os
import secrets
import threading
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
FILE = Path(os.getenv("CMS_FILE") or DATA / "cms" / "cms.json")
_lock = threading.Lock()

# 관리자가 고칠 수 있는 장소 필드 (정해진 칸만 — 페이지 모양은 못 바꾼다)
FIELDS = {
    "open": "str", "close": "str", "break_time": "list", "closed_day_nums": "ints", "last_entry": "str", "stay_min": "int",
    "phone": "str", "fee": "str", "intro_ko": "str", "tip_ko": "str", "carer_tip": "str",
    "walk_load": "str", "wheelchair": "str", "entrance_step": "bool", "table": "str", "indoor": "bool", "benches": "bool",
    "soft_menu": "bool", "parking_easy": "bool",
}
ACCESS = {"walk_load", "wheelchair", "entrance_step", "table", "indoor", "benches", "segments"}   # 근거 필수
SEG_FIELDS = ("name", "distance_m", "steps", "alt_route", "curb_cm", "slope_deg", "width_m", "surface", "note", "source")
LEVELS = ("closed", "warn", "info")
NONE = "__없음__"   # 임시 휴무 / 주의(공사·우회) / 안내

EMPTY = {"overrides": {}, "segments": {}, "notices": [], "banner": None, "events": [], "history": []}


def _now() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="seconds")


def load() -> dict:
    if FILE.exists():
        try:
            return {**copy.deepcopy(EMPTY), **json.loads(FILE.read_text(encoding="utf-8"))}
        except (ValueError, OSError):
            pass
    return copy.deepcopy(EMPTY)


def save(db: dict):
    FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(db, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(FILE)


# ------------------------------------------------------------------ 로그인 (대표 계정 하나)
SESSIONS: dict[str, float] = {}
SESSION_HOURS = 12


def account() -> tuple[str, str]:
    return os.getenv("ADMIN_ID") or "admin", os.getenv("ADMIN_PASSWORD") or ""


def demo_login_enabled() -> bool:
    """본선 시연용 [임시 로그인]. DEMO_LOGIN=1 일 때만 계정이 화면에 자동 입력된다. 대회 뒤에는 꺼야 한다."""
    return os.getenv("DEMO_LOGIN", "0") == "1" and bool(account()[1])


def login(uid: str, pw: str) -> str | None:
    want_id, want_pw = account()
    if not want_pw or not (secrets.compare_digest(uid or "", want_id) and secrets.compare_digest(pw or "", want_pw)):
        return None
    tok = secrets.token_urlsafe(24)
    SESSIONS[tok] = dt.datetime.now().timestamp() + SESSION_HOURS * 3600
    return tok


def check(tok: str | None) -> bool:
    exp = SESSIONS.get(tok or "")
    if not exp:
        return False
    if exp < dt.datetime.now().timestamp():
        SESSIONS.pop(tok, None)
        return False
    return True


def logout(tok: str | None):
    SESSIONS.pop(tok or "", None)


# ------------------------------------------------------------------ 값 정리
def _clean(field: str, v):
    kind = FIELDS.get(field)
    if v in ("", None):
        return None
    if kind == "int":
        return int(v)
    if kind == "bool":
        return v if isinstance(v, bool) else str(v).lower() in ("true", "1", "예", "있음", "yes")
    if kind == "ints":
        return sorted({int(x) for x in v if str(x) != "" and 0 <= int(x) <= 6})
    if kind == "list":
        return [str(x) for x in v][:2] if v else None
    return str(v)[:500]


def _seg_clean(s: dict) -> dict:
    out = {}
    for k in SEG_FIELDS:
        v = s.get(k)
        if v in ("", None):
            continue
        if k in ("distance_m", "curb_cm", "slope_deg", "width_m"):
            v = float(v)
        elif k == "steps":
            v = int(v)
        elif k == "alt_route":
            v = bool(v)
        else:
            v = str(v)[:200]
        out[k] = v
    return out


def _log(db, action: str, target: str, before, after, reason: str = "", who: str = "admin") -> dict:
    h = {"id": secrets.token_hex(5), "at": _now(), "who": who, "action": action, "target": target,
         "before": before, "after": after, "reason": reason[:300], "reverted": False}
    db["history"].insert(0, h)
    db["history"] = db["history"][:500]
    return h


# ------------------------------------------------------------------ 바꾸기
def set_place(pid: str, fields: dict, segments: list | None, reason: str, current: dict) -> dict:
    """장소 정보 덮어쓰기. current = 지금 사이트에 보이는 값(이력의 '이전 값'으로 남긴다)."""
    touched = {f for f in fields if f in FIELDS} | ({"segments"} if segments is not None else set())
    if touched & ACCESS and len(reason.strip()) < 4:
        raise ValueError("걷기·휠체어·구간 정보를 바꿀 때는 근거(측정값, 확인한 날짜 등)를 적어 주세요.")
    with _lock:
        db = load()
        ov = db["overrides"].setdefault(pid, {})
        before = {f: current.get(f) for f in touched}
        prev = {f: ov.get(f, NONE) for f in touched if f != "segments"}
        if segments is not None:
            prev["segments"] = db["segments"].get(pid, NONE)
        for f in fields:
            if f in FIELDS:
                ov[f] = _clean(f, fields[f])
        if segments is not None:
            db["segments"][pid] = [_seg_clean(s) for s in segments if s.get("name")]
        after = {**{f: ov.get(f) for f in touched if f != "segments"}, **({"segments": db["segments"][pid]} if segments is not None else {})}
        h = _log(db, "place", pid, before, after, reason)
        h["prev"] = prev
        save(db)
    return h


def add_notice(n: dict, reason: str = "") -> dict:
    if n.get("level") not in LEVELS:
        raise ValueError("알림 종류를 골라 주세요.")
    if not (n.get("title") or "").strip():
        raise ValueError("알림 제목을 적어 주세요.")
    rec = {"id": secrets.token_hex(5), "place_id": n.get("place_id") or None, "level": n["level"], "title": n["title"][:80],
           "body": (n.get("body") or "")[:500], "start": n.get("start") or None, "end": n.get("end") or None,
           "from_report": n.get("from_report"), "created_at": _now()}
    with _lock:
        db = load()
        db["notices"].insert(0, rec)
        _log(db, "notice_add", rec["id"], None, rec, reason)
        save(db)
    return rec


def remove_notice(nid: str) -> bool:
    with _lock:
        db = load()
        old = next((n for n in db["notices"] if n["id"] == nid), None)
        if not old:
            return False
        db["notices"] = [n for n in db["notices"] if n["id"] != nid]
        _log(db, "notice_remove", nid, old, None)
        save(db)
    return True


def set_banner(b: dict | None) -> dict:
    with _lock:
        db = load()
        old = db["banner"]
        db["banner"] = None if not b or not (b.get("text") or "").strip() else {
            "text": b["text"][:200], "level": b.get("level") if b.get("level") in LEVELS else "info", "until": b.get("until") or None}
        _log(db, "banner", "site", old, db["banner"])
        save(db)
        return db["banner"]


def add_event(e: dict) -> dict:
    if not (e.get("name") and e.get("start")):
        raise ValueError("행사 이름과 시작일을 적어 주세요.")
    rec = {"id": secrets.token_hex(5), "name": e["name"][:80], "start": e["start"], "end": e.get("end") or e["start"],
           "venue": (e.get("venue") or "")[:80], "tel": (e.get("tel") or "")[:30], "url": (e.get("url") or "")[:300],
           "kind": (e.get("kind") or "행사")[:30], "access": (e.get("access") or "")[:200], "added_by_admin": True}
    with _lock:
        db = load()
        db["events"].append(rec)
        _log(db, "event_add", rec["id"], None, rec)
        save(db)
    return rec


def remove_event(eid: str) -> bool:
    with _lock:
        db = load()
        old = next((e for e in db["events"] if e["id"] == eid), None)
        if not old:
            return False
        db["events"] = [e for e in db["events"] if e["id"] != eid]
        _log(db, "event_remove", eid, old, None)
        save(db)
    return True


def revert(hid: str) -> dict:
    """이력 하나 되돌리기: 그 변경 직전 값으로 돌린다 (되돌린 것도 이력에 남는다)."""
    with _lock:
        db = load()
        h = next((x for x in db["history"] if x["id"] == hid), None)
        if not h or h["reverted"]:
            raise ValueError("되돌릴 수 없는 이력이에요.")
        a = h["action"]
        if a == "place":
            ov = db["overrides"].setdefault(h["target"], {})
            for f, v in (h.get("prev") or {}).items():   # 그 변경 직전의 덮어쓰기 상태로 (없었으면 원래 값이 다시 보인다)
                box = db["segments"] if f == "segments" else ov
                key = h["target"] if f == "segments" else f
                if v == NONE:
                    box.pop(key, None)
                else:
                    box[key] = v
        elif a == "notice_add":
            db["notices"] = [n for n in db["notices"] if n["id"] != h["target"]]
        elif a == "notice_remove":
            db["notices"].insert(0, h["before"])
        elif a == "banner":
            db["banner"] = h["before"]
        elif a == "event_add":
            db["events"] = [e for e in db["events"] if e["id"] != h["target"]]
        elif a == "event_remove":
            db["events"].append(h["before"])
        elif a == "restore":
            raise ValueError("백업 복원은 되돌리기 대신 다른 백업을 다시 올려 주세요.")
        h["reverted"] = True
        _log(db, "revert", hid, None, None, f"{a} 되돌림")
        save(db)
        return h


def restore(backup: dict):
    keep = {k: backup.get(k, copy.deepcopy(v)) for k, v in EMPTY.items() if k != "history"}
    with _lock:
        db = load()
        keep["history"] = db["history"]
        _log(keep, "restore", "all", None, None, "백업 파일로 복원")
        save(keep)


def reset_all(reason: str = "") -> None:
    """시연이 끝난 뒤 처음 상태로: 덮어쓰기·알림·배너·추가 행사를 모두 지운다 (이력은 남김)."""
    with _lock:
        db = load()
        hist = db["history"]
        db = copy.deepcopy(EMPTY)
        db["history"] = hist
        _log(db, "reset", "all", None, None, reason or "전체 초기화")
        save(db)


# ------------------------------------------------------------------ 사이트에 적용
def active(n: dict, day: str) -> bool:
    return (not n.get("start") or n["start"] <= day) and (not n.get("end") or day <= n["end"])


def apply(places: dict, today: str | None = None) -> dict:
    """원본 장소 목록 위에 관리자 변경을 덮는다. 장소마다 notices(알림 목록)를 붙인다."""
    from .schemas import Segment
    db = load()
    for pid, ov in db["overrides"].items():
        p = places.get(pid)
        if not p:
            continue
        for f, v in ov.items():
            if v is not None and f in FIELDS:
                setattr(p, f, v)
        if any(f in ov for f in ("open", "close", "break_time", "closed_day_nums")):
            p.hours_source = "관리자 확인"
            from . import details
            p.hours = details.hours_text(p, "ko")
        if any(f in ov for f in ACCESS):
            p.access_source = "관리자 확인"
    for pid, segs in db["segments"].items():
        if pid in places:
            places[pid].segments = [Segment(**s) for s in segs]
    for p in places.values():
        p.notices = [n for n in db["notices"] if n.get("place_id") == p.id]
    return places


def site(day: str) -> dict:
    """모든 화면에 공통으로 보이는 것: 공지 배너, 장소 없는 전체 알림."""
    db = load()
    b = db["banner"]
    if b and b.get("until") and b["until"] < day:
        b = None
    return {"banner": b, "notices": [n for n in db["notices"] if not n.get("place_id") and active(n, day)]}


def events() -> list[dict]:
    return load()["events"]
