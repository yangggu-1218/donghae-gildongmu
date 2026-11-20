"""③ 최근 길 상태 요약 + 관리자 승인 (docs/17_AI_FEATURES.md).

현장 제보(사진 AI 분석 포함)와 커뮤니티 길 메모(서버 저장분)를 AI(기본 Haiku)가 장소마다 정리하고,
사이트 데이터를 고칠 '제안'을 만든다. 제안은 관리자가 [승인]해야 사이트에 반영된다 (cms 이력에 남고 되돌리기 가능)."""
from __future__ import annotations

import datetime as dt
import json
import re
import secrets

from . import ai, cms
from .schemas import Place

KINDS = ["공사", "고장", "막힘", "칭찬", "정보", "기타"]
TYPES = ["notice", "hours", "facility_add", "facility_remove"]

SYSTEM = """너는 '동해 길동무' 운영 도우미다. 한 장소에 최근 들어온 이용자 제보와 길 메모를 읽고
① 방문자에게 보여 줄 '최근 길 상태'를 짧게 정리하고 ② 관리자가 승인하면 사이트에 반영할 수정 제안을 만든다.

정리 규칙
- state: 이동에 지장을 주는 문제(공사·고장·막힘)가 최근에 있으면 issue, 조심할 정도면 caution, 좋은 소식·정보뿐이면 ok.
- headline: 방문자용 한 문장 (쉬운 존댓말, 50자 안팎). 제보 날짜를 넣으면 좋다.
- items: 같은 내용은 묶어 count 에 건수, since 에 가장 이른 날짜(YYYY-MM-DD). 최대 4개.
- 제보에 없는 내용은 쓰지 않는다. 닉네임·연락처 같은 개인 정보는 옮기지 않는다.

제안 규칙 (확실한 근거가 있을 때만, 없으면 빈 목록)
- notice: 공사·고장·막힘처럼 방문자에게 알려야 할 일. level 은 warn(주의) 또는 closed(이용 불가) 또는 info. end_date 는 제보에 끝나는 날이 있으면 그 날짜, 모르면 오늘부터 14일 뒤.
- hours: 제보가 운영시간이 바뀌었다고 분명히 말할 때만. open/close 는 HH:MM.
- facility_add / facility_remove: 편의시설(예: 장애인 화장실, 엘리베이터, 휠체어 대여)이 새로 생겼거나 없어졌다고 분명할 때만. facility 에 이름.
- evidence 에는 근거가 된 제보 id 를 넣는다. 쓰지 않는 칸은 빈 문자열.
- 언어는 한국어.
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "state": {"type": "string", "enum": ["ok", "caution", "issue"]},
        "headline": {"type": "string"},
        "items": {"type": "array", "items": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": KINDS}, "text": {"type": "string"}, "since": {"type": "string"}, "count": {"type": "integer"}},
            "required": ["kind", "text", "since", "count"], "additionalProperties": False}},
        "proposals": {"type": "array", "items": {"type": "object", "properties": {
            "type": {"type": "string", "enum": TYPES}, "title": {"type": "string"}, "detail": {"type": "string"},
            "level": {"type": "string", "enum": ["info", "warn", "closed"]}, "end_date": {"type": "string"},
            "open": {"type": "string"}, "close": {"type": "string"}, "facility": {"type": "string"},
            "evidence": {"type": "array", "items": {"type": "string"}}},
            "required": ["type", "title", "detail", "level", "end_date", "open", "close", "facility", "evidence"], "additionalProperties": False}},
    },
    "required": ["state", "headline", "items", "proposals"],
    "additionalProperties": False,
}

HM = re.compile(r"^([01]\d|2[0-4]):[0-5]\d$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _rows(reports: list[dict]) -> list[dict]:
    return [{"id": r.get("id"), "date": (r.get("created_at") or "")[:10], "kind": r.get("kind"), "text": (r.get("note") or "")[:300],
             "photo_ai": ((r.get("ai") or {}).get("summary") or "")[:200], "from": r.get("source") or "제보"} for r in reports[:20]]


def summarize(p: Place, reports: list[dict]) -> dict:
    """공개용 요약 + 제안(검증 전). 제보가 없으면 AI를 부르지 않는다."""
    if not reports:
        return {"by": "none", "state": "none", "count": 0}
    rows = _rows(reports)
    today = dt.date.today().isoformat()
    user = json.dumps({"today": today, "place": {"id": p.id, "name": p.name_ko, "facilities": p.facilities,
                                                 "hours": f"{p.open}~{p.close}" if p.open else "정보 없음"}, "reports": rows}, ensure_ascii=False)
    key = "status:" + p.id + ":" + ",".join(f"{r['id']}" for r in rows)
    data = ai.ask_json("status", SYSTEM, user, SCHEMA, max_tokens=3000, ttl=24 * 3600, cache_key=key)
    if not data:
        return {"by": "rule", "state": "caution" if any(r.get("kind") in ("공사", "고장", "막힘", "경사", "계단", "턱") for r in reports) else "ok",
                "headline": f"최근 90일 제보 {len(reports)}건이 있어요. 아래 내용을 확인해 주세요.", "items": [], "count": len(reports), "proposals": []}
    ids = {r["id"] for r in rows}
    items = [{"kind": i["kind"] if i.get("kind") in KINDS else "기타", "text": str(i.get("text") or "")[:120],
              "since": i["since"] if DATE.match(str(i.get("since") or "")) else "", "count": max(1, min(int(i.get("count") or 1), 99))}
             for i in (data.get("items") or [])[:4] if i.get("text")]
    return {"by": "ai", "model": ai.model_for("status"), "state": data.get("state") if data.get("state") in ("ok", "caution", "issue") else "caution",
            "headline": str(data.get("headline") or "")[:120], "items": items, "count": len(reports),
            "proposals": [x for x in (_check(p, pr, ids, today) for pr in (data.get("proposals") or [])[:4]) if x]}


def _check(p: Place, pr: dict, ids: set, today: str) -> dict | None:
    """AI 제안 검증: 종류별 필수 값, 근거 제보 id, 날짜·시각 형식."""
    t = pr.get("type")
    ev = [e for e in (pr.get("evidence") or []) if e in ids]
    if t not in TYPES or not ev:
        return None
    out = {"type": t, "title": str(pr.get("title") or "")[:80], "detail": str(pr.get("detail") or "")[:300], "evidence": ev}
    if t == "notice":
        if not out["title"]:
            return None
        end = str(pr.get("end_date") or "")
        if not DATE.match(end) or end < today:
            end = (dt.date.today() + dt.timedelta(days=14)).isoformat()
        out.update(level=pr.get("level") if pr.get("level") in ("info", "warn", "closed") else "warn", end_date=end)
    elif t == "hours":
        o, c = str(pr.get("open") or ""), str(pr.get("close") or "")
        if not (HM.match(o) and HM.match(c)) or o >= c:
            return None
        out.update(open=o, close=c, title=out["title"] or f"운영시간 {o}~{c}")
    else:
        f = str(pr.get("facility") or "").strip()[:40]
        if not f or (t == "facility_add" and f in p.facilities) or (t == "facility_remove" and f not in p.facilities):
            return None
        out.update(facility=f, title=out["title"] or (f"편의시설 추가: {f}" if t == "facility_add" else f"편의시설 삭제: {f}"))
    return out


# ---------- 제안 저장·승인 (cms.json 의 ai_proposals) ----------
def _sig(pid: str, pr: dict) -> str:
    return f"{pid}|{pr['type']}|{pr.get('facility') or ''}|{pr.get('open') or ''}-{pr.get('close') or ''}|{pr['title'] if pr['type'] == 'notice' else ''}"


def save_proposals(pid: str, props: list[dict]) -> int:
    """대기 중인 같은 제안이 있으면 근거만 합치고, 없으면 새로 넣는다. 새로 넣은 수를 돌려준다."""
    if not props:
        return 0
    added = 0
    with cms._lock:
        db = cms.load()
        lst = db.setdefault("ai_proposals", [])
        for pr in props:
            sig = _sig(pid, pr)
            old = next((x for x in lst if x.get("sig") == sig and x.get("status") in ("pending", "rejected")), None)
            if old:
                old["evidence"] = sorted(set(old.get("evidence", [])) | set(pr["evidence"]))
                continue
            lst.insert(0, {**pr, "id": secrets.token_hex(5), "place_id": pid, "sig": sig, "status": "pending", "created_at": cms._now()})
            added += 1
        db["ai_proposals"] = lst[:300]
        cms.save(db)
    return added


def proposals() -> list[dict]:
    return cms.load().get("ai_proposals", [])


def decide(prop_id: str, approve: bool, places: dict[str, Place], who: str, memo: str = "") -> dict:
    """승인하면 사이트 데이터에 반영 (알림 추가 / 운영시간·편의시설 덮어쓰기), 반려하면 닫는다."""
    db = cms.load()
    pr = next((x for x in db.get("ai_proposals", []) if x["id"] == prop_id), None)
    if not pr:
        raise ValueError("없는 제안이에요.")
    if pr["status"] != "pending":
        raise ValueError("이미 처리한 제안이에요.")
    p = places.get(pr["place_id"])
    if not p:
        raise ValueError("장소를 찾을 수 없어요.")
    applied = None
    if approve:
        reason = f"AI 제안 승인 (근거 제보 {', '.join(pr['evidence'])}){' · ' + memo if memo else ''}"
        if pr["type"] == "notice":
            applied = cms.add_notice({"place_id": p.id, "level": pr["level"], "title": pr["title"], "body": pr["detail"],
                                      "start": dt.date.today().isoformat(), "end": pr.get("end_date")}, reason)
        elif pr["type"] == "hours":
            applied = cms.set_place(p.id, {"open": pr["open"], "close": pr["close"]}, None, reason, p.model_dump())
        else:
            fac = list(p.facilities)
            fac = fac + [pr["facility"]] if pr["type"] == "facility_add" else [f for f in fac if f != pr["facility"]]
            applied = cms.set_place(p.id, {"facilities": fac}, None, reason, p.model_dump())
    with cms._lock:
        db = cms.load()
        for x in db.get("ai_proposals", []):
            if x["id"] == prop_id:
                x.update(status="approved" if approve else "rejected", decided_at=cms._now(), decided_by=who, memo=memo[:200],
                         applied=(applied or {}).get("id"))
        cms.save(db)
    return {"ok": True, "applied": bool(applied)}
