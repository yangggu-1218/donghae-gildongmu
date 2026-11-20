"""② AI 접근성 판정관 (docs/17_AI_FEATURES.md).

장소의 모든 근거(구간 정보·한국관광공사 무장애 정보·편의시설·보호자 꿀팁·최근 제보·임시 알림)를 모아
AI(기본 Sonnet)가 '이 사람 기준으로' 갈 수 있는지 판정하고, 근거·확신도·주의할 점·전화로 물어볼 것을 낸다.
AI가 없거나 실패하면 규칙 판정(engine.grade_place)으로 대신한다."""
from __future__ import annotations

import datetime as dt
import json

from . import ai, engine
from .schemas import Place

MODE_KO = {"wheel": "휠체어 사용자 (수동·전동)", "stroller": "유모차를 미는 보호자", "walk": "오래 걷기·계단이 힘든 어르신"}
MODE_EN = {"wheel": "wheelchair user", "stroller": "parent with a stroller", "walk": "older adult who can't walk far or climb steps"}

SYSTEM = """너는 '동해 길동무'의 접근성 판정관이다. 동해시 관광지 한 곳에 대해, 주어진 근거 자료만 읽고
지정된 이용자가 그곳을 무리 없이 다녀올 수 있는지 판정한다.

판정 값
- G: 주요 동선을 그 이용자가 혼자 또는 보호자와 무리 없이 다닐 수 있다.
- Y: 갈 수는 있지만 조심할 구간·조건이 있다 (일부 경사, 일부만 가능, 날씨·시간에 따라 다름 등).
- R: 핵심 동선에 계단·급경사·좁은 통로 등이 있어 그 이용자에게 어렵다.
- U: 근거가 없거나 너무 적어서 판단할 수 없다.

지킬 것
1. 근거 자료에 있는 내용만 쓴다. 경사도·턱 높이·운영시간·전화번호 등을 지어내지 않는다.
2. 이유(reasons)마다 어느 근거에서 왔는지 source 에 적는다 (예: "구간: 주차장 → 매표소 (현장 답사, 2026-11-10)", "한국관광공사 무장애 정보", "이용자 제보 2026-11-18").
3. 확신도: 측정값·현장 답사·최근 자료가 서로 맞으면 high, 근거가 일부거나 오래됐거나 '예시'면 medium, 근거가 서로 다르거나 거의 없으면 low.
4. 최근 제보·임시 알림(공사, 고장, 막힘)은 오래된 자료보다 우선해서 판정에 반영한다.
5. 안전이 걸린 일이라 애매하면 한 단계 보수적으로(G 대신 Y) 판정하고 직접 확인을 권한다.
6. ask_before 에는 가기 전에 전화로 물어보면 좋은 구체적인 질문을 적는다 (예: "엘리베이터가 지금 운행하나요?").
7. 쉬운 존댓말로 짧게 쓴다. 언어가 en 이면 영어로 쓴다.
8. 화면에는 픽토그램 옆에 한 줄씩 보인다. headline 은 30자, reasons·cautions·ask_before·tip 은 항목마다 25자 안팎으로 줄인다.
   reasons 는 3개, cautions·ask_before 는 2개까지. text 안에 출처·근거 이름을 쓰지 않는다(출처는 source 에만).
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["G", "Y", "R", "U"]},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "headline": {"type": "string"},
        "reasons": {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}, "source": {"type": "string"}},
                                               "required": ["text", "source"], "additionalProperties": False}},
        "cautions": {"type": "array", "items": {"type": "string"}},
        "ask_before": {"type": "array", "items": {"type": "string"}},
        "tip": {"type": "string"},
    },
    "required": ["verdict", "confidence", "headline", "reasons", "cautions", "ask_before", "tip"],
    "additionalProperties": False,
}


def evidence(p: Place, mode: str, reports: list[dict], today: str) -> dict:
    """AI에게 넘길 근거 묶음 (사람 이름·연락처 없음)."""
    segs = []
    for s in p.segments:
        facts = {k: getattr(s, k) for k in ("distance_m", "steps", "curb_cm", "slope_deg", "width_m", "surface", "alt_route") if getattr(s, k) is not None}
        segs.append({"name": s.name, "rule_grade": engine.grade_segment(s, mode), "measured": facts, "note": s.note,
                     "source": s.source, "checked_at": s.checked_at})
    notes = [{"date": (r.get("created_at") or "")[:10], "kind": r.get("kind"), "text": (r.get("note") or "")[:200],
              "photo_ai": ((r.get("ai") or {}).get("summary") or "")[:200], "status": r.get("status")}
             for r in reports][:12]
    notices = [{"level": n.get("level"), "title": n.get("title"), "start": n.get("start"), "end": n.get("end")}
               for n in (p.notices or []) if not n.get("end") or n["end"] >= today]
    return {
        "place": {"name": p.name_ko, "type": p.type, "indoor": p.indoor, "intro": (p.intro_ko or p.tip_ko or "")[:200]},
        "summary_fields": {"walk_load": p.walk_load, "wheelchair": p.wheelchair, "entrance_step": p.entrance_step, "benches": p.benches,
                           "access_source": p.access_source, "facilities": p.facilities, "carer_tip": p.carer_tip},
        "segments": segs,
        "kto_barrier_free": (p.access_kto or {}).get("items", {}),
        "recent_reports_90d": notes,
        "active_notices": notices,
    }


def _clip(x, n):
    return str(x or "").strip()[:n]


def judge(p: Place, mode: str, lang: str, reports: list[dict]) -> dict:
    mode = mode if mode in MODE_KO else "wheel"
    today = dt.date.today().isoformat()
    ev = evidence(p, mode, reports, today)
    rule = engine.grade_place(p, mode) if p.segments else None
    has_any = bool(ev["segments"] or ev["kto_barrier_free"] or ev["recent_reports_90d"] or ev["summary_fields"]["wheelchair"] not in ("확인 전", None))
    user = {"user": MODE_KO[mode] if lang == "ko" else MODE_EN[mode], "lang": lang, "today": today, "evidence": ev}
    data = ai.ask_json("judge", SYSTEM, json.dumps(user, ensure_ascii=False), SCHEMA, max_tokens=4000, ttl=12 * 3600) if has_any else None
    if data:
        out = {
            "by": "ai", "model": ai.model_for("judge"),
            "verdict": data["verdict"] if data.get("verdict") in ("G", "Y", "R", "U") else "U",
            "confidence": data["confidence"] if data.get("confidence") in ("high", "medium", "low") else "low",
            "headline": _clip(data.get("headline"), 140),
            "reasons": [{"text": _clip(r.get("text"), 200), "source": _clip(r.get("source"), 90)} for r in (data.get("reasons") or [])[:3] if isinstance(r, dict) and r.get("text")],
            "cautions": [_clip(c, 160) for c in (data.get("cautions") or [])[:2] if c],
            "ask_before": [_clip(c, 120) for c in (data.get("ask_before") or [])[:2] if c],
            "tip": _clip(data.get("tip"), 200),
        }
        if not out["reasons"] and out["verdict"] != "U":   # 근거 없는 판정은 믿지 않는다
            out.update(verdict="U", confidence="low")
    else:
        ko = lang == "ko"
        out = {"by": "rule", "model": None, "verdict": rule or "U", "confidence": "low" if not rule else "medium",
               "headline": ("근거가 아직 부족해 판단이 어려워요. 가기 전에 전화로 확인해 주세요." if ko else "Not enough information yet; please call ahead.") if not rule
               else ("구간 정보로 계산한 판정이에요." if ko else "Based on the path data."),
               "reasons": [], "cautions": [], "ask_before": [], "tip": ""}
    out.update(rule_grade=rule, mode=mode, evidence_count=len(ev["segments"]) + len(ev["recent_reports_90d"]) + (1 if ev["kto_barrier_free"] else 0),
               reports_used=len(ev["recent_reports_90d"]))
    return out
