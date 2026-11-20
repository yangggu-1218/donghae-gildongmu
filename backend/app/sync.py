"""자동 정보 갱신 — 0~1단계 (docs/20_AUTO_SYNC.md). AI 없이: 공식 API·공공데이터를 가져와 지난번과 비교하고,
항목별 규칙에 따라 자동 반영 / 검수 / 버림.

- 소스 목록 `data/sync/sources.json` (등급 1 = 공공 API·공공데이터, 2 = 공식 홈페이지(2단계), 3 = 블로그·커뮤니티)
- 실행 기록 `<SYNC_DIR>/state.json` (소스별 마지막 성공·오류·해시, 장소·항목별 마지막 확인, 인허가 사라진 횟수)
- 변경 1건 `<SYNC_DIR>/changes.jsonl` (이전 값·새 값·출처·근거·신뢰도·처리 결과·처리자·cms 이력 id)
- 반영은 모두 cms(덮어쓰기·행사)로 → 변경 이력·되돌리기가 그대로. 관리자가 직접 고친 값은 덮어쓰지 않고 '충돌'.
- 무장애 정보(access.*)는 어떤 경우에도 자동 반영하지 않는다 (검수 + 현장 확인 필요).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import threading
from pathlib import Path

from . import cms, reports_store

CONF = Path(os.getenv("SYNC_CONF") or Path(__file__).resolve().parents[2] / "data" / "sync")   # 점검 때는 가짜 소스 폴더로
GROUPS = {   # 규칙을 정하는 묶음 → 그 안의 항목
    "contact": ["phone", "address", "homepage"], "coord": ["coord"], "event": ["event"], "closure": ["closure"],
    "hours": ["hours"], "closed_days": ["closed_days"], "fee": ["fee"], "notice": ["notice"], "access": ["access"],
}
GROUP_KO = {"contact": "전화·주소·홈페이지", "coord": "좌표", "event": "행사·축제 일정", "closure": "식당 폐업", "hours": "운영시간",
            "closed_days": "휴무일", "fee": "입장료", "notice": "임시 휴무·공사 공지", "access": "무장애 정보(휠체어·구간·턱·장애인 화장실)"}
DEFAULT_RULES = {"contact": "auto", "coord": "auto", "event": "auto", "closure": "auto", "hours": "review", "closed_days": "review",
                 "fee": "review", "notice": "review", "access": "review"}
LOCKED = {"access"}            # 설정에서도 '자동'으로 못 바꿈
COORD_AUTO_M = 50              # 좌표가 이만큼 안에서 움직이면 자동
STALE_DAYS = 90
GRADE_PTS = {1: 50, 2: 35, 3: 10}
ACTOR = "자동 갱신"
_lock = threading.RLock()


def group_of(field: str) -> str:
    if field.startswith("access"):
        return "access"
    return next((g for g, fs in GROUPS.items() if field in fs), "notice")


def now() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def today() -> str:
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)).date().isoformat()


def sync_dir() -> Path:
    p = Path(os.getenv("SYNC_DIR") or reports_store.root() / "sync")
    p.mkdir(parents=True, exist_ok=True)
    return p


# ---------------- 저장 ----------------
def _read_json(f: Path, default):
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else default
    except (ValueError, OSError):
        return default


def state() -> dict:
    return _read_json(sync_dir() / "state.json", {"sources": {}, "checked": {}, "licence": {}})


def save_state(st: dict):
    f = sync_dir() / "state.json"; tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8"); os.replace(tmp, f)


def changes() -> list[dict]:
    f = sync_dir() / "changes.jsonl"
    return [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()] if f.exists() else []


def save_changes(rows: list[dict]):
    f = sync_dir() / "changes.jsonl"; tmp = f.with_suffix(".tmp")
    tmp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows[-3000:]), encoding="utf-8"); os.replace(tmp, f)


def sources() -> list[dict]:
    return _read_json(CONF / "sources.json", {"sources": []}).get("sources", [])


def allow() -> list[str]:
    return _read_json(CONF / "allow.json", {"domains": []}).get("domains", [])


def rules() -> dict:
    got = cms.load().get("sync_rules") or {}
    out = {**DEFAULT_RULES, **{k: v for k, v in got.items() if k in DEFAULT_RULES and v in ("auto", "review", "off")}}
    for k in LOCKED:
        if out[k] == "auto":
            out[k] = "review"
    return out


def set_rules(new: dict, who: str) -> dict:
    clean = {k: v for k, v in (new or {}).items() if k in DEFAULT_RULES and v in ("auto", "review", "off") and not (k in LOCKED and v == "auto")}
    with cms._lock:
        db = cms.load()
        before = db.get("sync_rules")
        db["sync_rules"] = clean
        cms._log(db, "sync_rules", "rules", before, clean, "자동 갱신 규칙", who)
        cms.save(db)
    return rules()


def token_ok(tok: str | None) -> bool:
    want = os.getenv("SYNC_TOKEN", "")
    return bool(want) and bool(tok) and hmac.compare_digest(str(tok), want)


# ---------------- 가져오기 (소스 종류별) ----------------
def fetch(src: dict) -> list[dict]:
    """소스 하나 → 기록 목록 [{place_id, field, value, evidence, url, valid_from, valid_to}]"""
    prov = src.get("provider", "fixture")
    if prov == "fixture":
        f = CONF / src["file"]
        d = _read_json(f, None)
        if d is None:
            raise RuntimeError(f"가짜 소스 파일이 없어요: {src['file']}")
        if "licence" in d:
            return [{"field": "licence", "value": sorted(d["licence"])}]
        return d.get("items", [])
    if prov == "tourapi_list":
        return _tourapi_list(src)
    if prov == "tourapi_festival":
        return _tourapi_festival(src)
    if prov == "licence":
        from . import public_data
        return [{"field": "licence", "value": sorted({r[0] for r in public_data.EAT.get("rows", [])})}]
    raise RuntimeError(f"모르는 소스 종류: {prov}")


def _tourapi_list(src: dict) -> list[dict]:
    """한국관광공사 TourAPI 지역 목록 → 우리 장소와 이름으로 짝지어 전화·주소·좌표."""
    from . import bigdata
    if not bigdata.KEY:
        raise RuntimeError("서버에 DATA_GO_KR_KEY 가 없어요")
    items = []
    for area, sig in bigdata.AREA:
        items = bigdata._try([("KorService2/areaBasedList2", {"areaCode": area, "sigunguCode": sig, "numOfRows": 500, "pageNo": 1, "arrange": "A"}),
                              ("KorService2/areaBasedList2", {"lDongRegnCd": area, "lDongSignguCd": sig, "numOfRows": 500, "pageNo": 1, "arrange": "A"})], "sync_list")
        if items:
            break
    if not items:
        raise RuntimeError("TourAPI 목록을 받지 못했어요")
    from .main import PLACES
    out = []
    for it in items:
        title = it.get("title", "")
        p = next((q for q in PLACES.values() if any(bigdata.same_place(title, n) for n in bigdata._parts(q.name_ko))), None)
        if not p:
            continue
        url = f"https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid={it.get('contentid', '')}"
        if it.get("tel"):
            out.append({"place_id": p.id, "field": "phone", "value": it["tel"].split(",")[0].strip(), "url": url, "evidence": f"tel: {it['tel']}"})
        if it.get("addr1"):
            out.append({"place_id": p.id, "field": "address", "value": it["addr1"].strip(), "url": url, "evidence": f"addr1: {it['addr1']}"})
        if it.get("mapy") and it.get("mapx"):
            out.append({"place_id": p.id, "field": "coord", "value": [float(it["mapy"]), float(it["mapx"])], "url": url, "evidence": f"mapy,mapx: {it['mapy']},{it['mapx']}"})
    return out


def _tourapi_festival(src: dict) -> list[dict]:
    from . import bigdata
    if not bigdata.KEY:
        raise RuntimeError("서버에 DATA_GO_KR_KEY 가 없어요")
    start = today().replace("-", "")
    items = []
    for area, sig in bigdata.AREA:
        items = bigdata._try([("KorService2/searchFestival2", {"eventStartDate": start, "areaCode": area, "sigunguCode": sig, "numOfRows": 100, "pageNo": 1}),
                              ("KorService2/searchFestival2", {"eventStartDate": start, "lDongRegnCd": area, "lDongSignguCd": sig, "numOfRows": 100, "pageNo": 1})], "sync_fest")
        if items:
            break
    d = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:8]}" if s and len(s) == 8 else ""  # noqa: E731
    return [{"place_id": None, "field": "event", "value": {"name": it.get("title", ""), "start": d(it.get("eventstartdate", "")), "end": d(it.get("eventenddate", "")),
             "venue": it.get("addr1", ""), "tel": it.get("tel", "")}, "url": f"https://korean.visitkorea.or.kr/detail/fes_detail.do?cotid={it.get('contentid', '')}",
             "evidence": f"{it.get('title', '')} {it.get('eventstartdate', '')}~{it.get('eventenddate', '')}"} for it in items if it.get("title")]


# ---------------- 비교 ----------------
def _norm(field: str, v):
    if field == "phone":
        return re.sub(r"\D", "", str(v or ""))
    if field in ("address", "homepage", "fee"):
        return " ".join(str(v or "").split())
    if field == "closed_days":
        return sorted(int(x) for x in (v or []))
    return v


def current(p, field: str):
    if field == "coord":
        return [p.lat, p.lon] if p.lat is not None else None
    if field == "hours":
        return f"{p.open}~{p.close}" if p.open else ""
    if field == "closed_days":
        return list(p.closed_day_nums or [])
    if field.startswith("access."):
        return getattr(p, field.split(".", 1)[1], None)
    return getattr(p, field, "")


def meters(a, b) -> float:
    return math.hypot((a[0] - b[0]) * 111_000, (a[1] - b[1]) * 111_000 * math.cos(math.radians(a[0])))


def admin_set(pid: str, field: str):
    """관리자가 직접 고친 값이 있는지 (자동 갱신이 넣은 값은 제외). 있으면 그 값."""
    db = cms.load()
    ov = db["overrides"].get(pid, {})
    keys = {"coord": ["lat", "lon"], "hours": ["open", "close"], "closed_days": ["closed_day_nums"]}.get(field, [field.split(".", 1)[-1]])
    if not any(k in ov for k in keys):
        return None
    last = next((h for h in db["history"] if h["action"] == "place" and h["target"] == pid and not h.get("reverted")
                 and any(k in (h.get("after") or {}) for k in keys)), None)
    if last and str(last.get("who", "")).startswith(ACTOR):
        return None
    if field == "hours":
        return f"{ov.get('open') or ''}~{ov.get('close') or ''}"
    return [ov.get(k) for k in keys] if len(keys) > 1 else ov.get(keys[0])


def confidence(grade: int, agree: int, has_evidence: bool, fresh_days: int | None) -> int:
    """코드로 계산하는 신뢰도 (AI 자기 평가 아님): 등급 + 같은 값을 낸 다른 소스 + 근거 + 최신성."""
    c = GRADE_PTS.get(grade, 10) + min(agree, 2) * 15 + (10 if has_evidence else 0)
    if fresh_days is not None:
        c += 10 if fresh_days <= 30 else 5 if fresh_days <= 90 else 0
    return min(100, c)


# ---------------- 반영 ----------------
def _apply(ch: dict, places: dict, who: str, value=None) -> str | None:
    """변경 1건을 cms 에 반영하고 이력 id 를 돌려준다."""
    v = ch["new"] if value is None else value
    f, pid = ch["field"], ch.get("place_id")
    tok = cms.ACTOR.set(who)
    try:
        if f == "event":
            ev = cms.add_event({**v, "kind": "축제·행사", "url": ch.get("url") or ""})
            return next((h["id"] for h in cms.load()["history"] if h["action"] == "event_add" and h["target"] == ev["id"]), None)
        if f == "closure":
            with cms._lock:
                db = cms.load()
                hidden = set(db.get("hidden_eateries") or [])
                hidden.add(v["name"]); db["hidden_eateries"] = sorted(hidden)
                h = cms._log(db, "eatery_hide", v["name"], None, v, f"폐업 의심 숨김 ({ch.get('source_id')})", who)
                cms.save(db)
                return h["id"]
        if f == "recheck":
            return None
        p = places.get(pid)
        cur = {"lat": p.lat, "lon": p.lon, "open": p.open, "close": p.close, "closed_day_nums": p.closed_day_nums, **{k: getattr(p, k, None) for k in cms.FIELDS}} if p else {}
        if f == "coord":
            fields = {"lat": v[0], "lon": v[1]}
        elif f == "hours":
            o, c = str(v).split("~")
            fields = {"open": o.strip(), "close": c.strip()}
        elif f == "closed_days":
            fields = {"closed_day_nums": v}
        elif f.startswith("access."):
            fields = {f.split(".", 1)[1]: v}
        else:
            fields = {f: v}
        h = cms.set_place(pid, fields, None, f"자동 갱신: {ch.get('source_id')} · {ch.get('url') or ''} · {(ch.get('evidence') or '')[:80]}", cur)
        return h["id"]
    finally:
        cms.ACTOR.reset(tok)


def hidden_eateries() -> set[str]:
    return set(cms.load().get("hidden_eateries") or [])


def suspect_eateries() -> set[str]:
    return {n for n, x in state().get("licence", {}).get("missing", {}).items() if x.get("count", 0) >= 2}


# ---------------- 실행 ----------------
def due(src: dict, scope: str) -> bool:
    every = src.get("every", "1d")
    return scope == "all" or (scope == "daily" and every == "1d") or (scope == "weekly" and every == "7d")


def run(places: dict, scope: str = "all", only: str | None = None, refresh=None) -> dict:
    """소스를 돌려 변경 건을 만든다. 돌려주는 값: 소스별 결과와 처리 수."""
    with _lock:
        st, rows, rl = state(), changes(), rules()
        run_start = now()
        made = {"auto": 0, "review": 0, "drop": 0, "unchanged": 0, "errors": 0}
        report, seen = [], {}   # seen: (place, field) → [(source, value)] — 소스끼리 다른지 보기
        todo = [s for s in sources() if (only and s["id"] == only) or (not only and due(s, scope))]
        for src in todo:
            sid, grade = src["id"], int(src.get("grade", 1))
            ss = st["sources"].setdefault(sid, {})
            ss["last_run"] = now()
            try:
                recs = fetch(src)
            except Exception as e:  # noqa: BLE001 — 한 소스가 실패해도 나머지는 계속
                ss["last_err"] = f"{now()} {type(e).__name__}: {str(e)[:200]}"
                made["errors"] += 1
                report.append({"source": sid, "ok": False, "error": ss["last_err"]})
                continue
            h = hashlib.sha256(json.dumps(recs, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
            ss["last_ok"] = now(); ss["n"] = len(recs)
            if h == ss.get("hash") and not only:
                made["unchanged"] += 1
                report.append({"source": sid, "ok": True, "unchanged": True})
                for r in recs:   # 같아도 '마지막 확인'은 오늘로
                    if r.get("place_id"):
                        st["checked"].setdefault(r["place_id"], {})[r["field"]] = {"at": today(), "source": src.get("name") or sid}
                continue
            ss["hash"] = h
            new = []
            for r in recs:
                if r["field"] == "licence":
                    new += _licence(src, r["value"], st)
                    continue
                c = _compare(src, grade, r, places, rl, st, seen)
                if c:
                    new.append(c)
            rows += new
            for c in new:
                made[c["result"] if c["result"] in made else "review"] += 1
            report.append({"source": sid, "ok": True, "changes": len(new)})
        # 소스끼리 같은 항목 값이 다르면 → 불일치 검수 하나로 (두 값 나란히). 이번 실행에서 만든 그 항목의 자동 반영·검수 건은 대신한다.
        for (pid, f), vals in seen.items():
            if len({json.dumps(_norm(f, v), ensure_ascii=False, default=str) for _, v, _ in vals}) < 2:
                continue
            for c in reversed(rows):   # 최근 것부터 되돌려야 처음 값으로 돌아간다
                if c.get("place_id") == pid and c["field"] == f and c.get("at", "") >= run_start and c["result"] in ("auto", "review"):
                    if c["result"] == "auto" and c.get("history_id"):
                        t = cms.ACTOR.set(ACTOR)   # 되돌린 것도 '자동 갱신'이 한 일로 이력에
                        try:
                            cms.revert(c["history_id"])
                        except ValueError:
                            pass
                        finally:
                            cms.ACTOR.reset(t)
                        made["auto"] -= 1
                    else:
                        made["review"] -= 1
                    c["result"] = "superseded"; c["reason"] = "다른 출처와 값이 달라 불일치 검수로 넘김"
            rows.append({"id": secrets.token_hex(5), "at": now(), "place_id": pid, "field": f, "kind": "mismatch", "result": "review",
                         "old": current(places[pid], f) if pid in places else None, "new": None,
                         "options": [{"source": s_, "value": v, "url": u} for s_, v, u in vals],
                         "reason": "출처끼리 값이 달라요 — 하나를 골라 승인", "confidence": 0, "source_id": ", ".join(s_ for s_, _, _ in vals)})
            made["review"] += 1
        save_changes(rows); save_state(st)
        if refresh and made["auto"]:
            refresh()
        return {"ran": len(todo), **made, "sources": report}


def _compare(src: dict, grade: int, r: dict, places: dict, rl: dict, st: dict, seen: dict) -> dict | None:
    pid, f, v = r.get("place_id"), r["field"], r.get("value")
    sid = src["id"]
    base = {"id": secrets.token_hex(5), "at": now(), "place_id": pid, "field": f, "new": v, "source_id": sid, "source_name": src.get("name") or sid,
            "grade": grade, "url": r.get("url") or src.get("url") or "", "evidence": (r.get("evidence") or "")[:300],
            "valid_from": r.get("valid_from") or "", "valid_to": r.get("valid_to") or ""}
    if f == "event":
        known = {(e.get("name"), e.get("start")) for e in cms.events()}
        from . import public_data
        known |= {(e.get("name"), e.get("start")) for e in public_data.events("0000-00-00")["upcoming"]}
        if not v or (v.get("name"), v.get("start")) in known or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v.get("start") or "") or (v.get("end") or v["start"]) < today():
            return None
        rule = rl["event"] if grade == 1 else "review"
        return _decide(base, None, rule, grade, places, "새 행사")
    p = places.get(pid)
    if not p:
        return {**base, "result": "drop", "reason": "모르는 장소", "old": None, "confidence": 0}
    old = current(p, f)
    st["checked"].setdefault(pid, {})[f] = {"at": today(), "source": src.get("name") or sid}
    if _norm(f, old) == _norm(f, v):
        return None
    if grade < 3:
        seen.setdefault((pid, f), []).append((src.get("name") or sid, v, base["url"]))
    base["old"] = old
    g = group_of(f)
    if grade >= 3:   # 블로그·커뮤니티에서만 나온 값은 반영하지 않는다 → 다시 확인 요청
        return {**base, "kind": "recheck", "result": "review", "confidence": confidence(grade, 0, bool(base["evidence"]), 0),
                "reason": "블로그·커뮤니티에서만 나온 내용이라 반영하지 않아요. 공식 소스나 현장에서 다시 확인해 주세요." + (" (무장애 정보)" if g == "access" else "")}
    adm = admin_set(pid, f)
    if adm is not None and _norm(f, adm) != _norm(f, v):
        return {**base, "kind": "conflict", "result": "review", "admin_value": adm, "confidence": confidence(grade, 0, bool(base["evidence"]), 0),
                "reason": "관리자가 직접 고친 값과 달라요 — 자동으로 덮어쓰지 않았어요"}
    rule = rl.get(g, "review")
    if g == "access":
        return {**base, "kind": "access", "result": "review", "site_check": True, "confidence": confidence(grade, 0, bool(base["evidence"]), 0),
                "reason": "무장애 정보는 자동으로 바꾸지 않아요 — 현장 확인 필요"}
    if f == "coord" and old and v:
        d = meters(old, v)
        base["moved_m"] = round(d)
        if d > COORD_AUTO_M and rule == "auto":
            rule = "review"
            base["reason"] = f"좌표가 {round(d)}m 움직였어요 ({COORD_AUTO_M}m 넘으면 검수)"
    return _decide(base, old, rule, grade, places, base.get("reason") or "")


def _decide(base: dict, old, rule: str, grade: int, places: dict, reason: str) -> dict:
    c = {**base, "old": old, "confidence": confidence(grade, 0, bool(base.get("evidence")), 0), "kind": base.get("kind") or "update"}
    if rule == "off":
        return {**c, "result": "drop", "reason": "규칙에서 끈 항목"}
    if rule == "auto":
        hid = _apply(c, places, ACTOR)
        return {**c, "result": "auto", "history_id": hid, "reason": reason or "규칙: 자동 반영", "decided_by": ACTOR, "decided_at": now()}
    return {**c, "result": "review", "reason": reason or "규칙: 검수"}


def _licence(src: dict, names: list[str], st: dict) -> list[dict]:
    """인허가 목록 비교: 지난번엔 있었는데 이번에 없으면 사라진 횟수 +1. 2번 연속이면 '폐업 의심'(자동 표시) + 숨기기 검수."""
    lic = st.setdefault("licence", {})
    prev = set(lic.get("names") or [])
    cur = set(names)
    miss = lic.setdefault("missing", {})
    out = []
    for n in list(miss):
        if n in cur:
            miss.pop(n)   # 다시 나타나면 의심 풀기
    for n in prev - cur:
        miss[n] = {"count": miss.get(n, {}).get("count", 0) + 1, "since": miss.get(n, {}).get("since") or today()}
    for n, x in miss.items():
        if x["count"] >= 2 and not x.get("flagged"):
            x["flagged"] = True
            out.append({"id": secrets.token_hex(5), "at": now(), "place_id": None, "field": "closure", "kind": "closure", "result": "review",
                        "new": {"name": n}, "old": "영업 중", "source_id": src["id"], "source_name": src.get("name") or src["id"], "grade": 1,
                        "url": src.get("url", ""), "evidence": f"인허가 목록에서 {x['count']}번 연속 빠짐 (처음 {x['since']})",
                        "confidence": confidence(1, 1, True, 0), "reason": "'폐업 의심'으로 표시했어요. 목록에서 숨길지 정해 주세요."})
    if cur:
        lic["names"] = sorted(cur | {n for n in prev if n in miss})   # 사라진 것도 횟수를 세려고 남겨 둔다
        for n, x in list(miss.items()):
            if x["count"] >= 6:   # 한참 지난 건 정리
                miss.pop(n); lic["names"] = [k for k in lic["names"] if k != n]
    return out


# ---------------- 검수 ----------------
def decide(cid: str, action: str, places: dict, who: str, value=None, memo: str = "") -> dict:
    with _lock:
        rows = changes()
        c = next((x for x in rows if x["id"] == cid), None)
        if not c or c["result"] != "review":
            raise ValueError("처리할 수 없는 건이에요 (이미 처리됐거나 없음)")
        if action == "reject":
            c.update(result="rejected", decided_by=who, decided_at=now(), memo=memo[:300])
        elif action == "approve":
            v = value
            if c.get("kind") == "mismatch":
                if v is None:
                    raise ValueError("불일치 건은 값을 하나 골라 주세요")
            elif c.get("kind") == "recheck":
                v = None
            elif v is None:
                v = c["new"]
            if c.get("kind") == "recheck":
                c.update(result="checked", decided_by=who, decided_at=now(), memo=memo[:300] or "확인함 (바꾸지 않음)")
            else:
                if c["field"] == "coord" and isinstance(v, str):
                    v = [float(x) for x in v.split(",")]
                hid = _apply({**c, "new": v}, places, who, v)
                c.update(result="approved", history_id=hid, decided_by=who, decided_at=now(), applied=v, memo=memo[:300])
        else:
            raise ValueError("action 은 approve 또는 reject")
        save_changes(rows)
        return c


def undo(cid: str, who: str) -> dict:
    with _lock:
        rows = changes()
        c = next((x for x in rows if x["id"] == cid), None)
        if not c or c["result"] not in ("auto", "approved") or not c.get("history_id"):
            raise ValueError("되돌릴 수 없는 건이에요")
        cms.revert(c["history_id"])
        c.update(result="reverted", reverted_by=who, reverted_at=now())
        save_changes(rows)
        return c


def overview(places: dict) -> dict:
    rows = changes()
    st = state()
    name = lambda pid: places[pid].name_ko if pid in places else (pid or "")  # noqa: E731
    view = [{**c, "place_name": name(c.get("place_id")), "group": group_of(c["field"]), "group_ko": GROUP_KO.get(group_of(c["field"]))} for c in rows]
    srcs = [{**s, **st["sources"].get(s["id"], {})} for s in sources()]
    return {"pending": [c for c in reversed(view) if c["result"] == "review"],
            "log": [c for c in reversed(view) if c["result"] != "review"][:200],
            "sources": srcs, "rules": rules(), "defaults": DEFAULT_RULES, "groups": GROUP_KO, "locked": sorted(LOCKED),
            "token_set": bool(os.getenv("SYNC_TOKEN")), "allow": allow(), "suspect": sorted(suspect_eateries() - hidden_eateries()),
            "hidden": sorted(hidden_eateries())}


def last_checked(pid: str) -> dict:
    """관광지 상세 '정보 출처'의 마지막 확인 (3단계에서 화면에 씀)."""
    out = {}
    for f, x in state().get("checked", {}).get(pid, {}).items():
        days = (dt.date.fromisoformat(today()) - dt.date.fromisoformat(x["at"])).days
        out[f] = {**x, "stale": days > STALE_DAYS}
    return out
