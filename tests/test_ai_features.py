"""AI 기능 3가지 점검 (가짜 Claude 클라이언트 — 돈·네트워크 없음, 임시 파일에 저장).
돌리는 법: py tests/test_ai_features.py   → 마지막 줄 "AI 점검 실패 0건"
"""
import json
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ["CMS_FILE"] = str(tmp / "cms.json")
os.environ["REPORTS_DIR"] = str(tmp / "reports")
os.environ["ADMIN_ID"] = "owner"
os.environ["ADMIN_PASSWORD"] = "test-owner-pw-1"   # 점검용 임시 값
os.environ.setdefault("PYTHONUTF8", "1")
sys.path[:0] = [str(Path(__file__).resolve().parents[1] / "backend"), str(Path(__file__).resolve().parent)]

from fastapi.testclient import TestClient  # noqa: E402
from fake_claude import FakeClaude, json_msg, tool_msg, text_msg, refusal_msg  # noqa: E402
from app.main import app, PLACES  # noqa: E402
from app import ai, ai_course, ai_judge, ai_status  # noqa: E402
from app.schemas import Conditions  # noqa: E402

c = TestClient(app)
fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


# ---------- 공통 모듈 ----------
f = FakeClaude(json_msg({"a": 1})); ai.set_client(f)
schema = {"type": "object", "properties": {"a": {"type": "integer"}}, "required": ["a"], "additionalProperties": False}
r = ai.ask_json("judge", "s", "u1", schema)
call = f.calls[0]
check("Sonnet 작업은 Sonnet 5.5 + 서버 측 대체", call["model"] == "claude-sonnet-5-5" and call.get("fallbacks") == "default" and ai.FALLBACK_BETA in call.get("betas", []))
check("구조화 출력 스키마 전달", call["output_config"]["format"]["schema"] == schema and r == {"a": 1})
f = FakeClaude(json_msg({"a": 2})); ai.set_client(f)
ai.ask_json("status", "s", "u2", schema)
check("Haiku 작업은 Haiku 5.5, 대체 없음", f.calls[0]["model"] == "claude-haiku-5-5" and "fallbacks" not in f.calls[0])
f = FakeClaude(refusal_msg()); ai.set_client(f)
check("거절이면 None", ai.ask_json("judge", "s", "u3", schema) is None)
ai.set_overrides({"judge": "fast"})
check("관리자 설정으로 등급 바꾸기", ai.model_for("judge") == "claude-haiku-5-5")
ai.set_overrides({})

# ---------- ② 판정관 ----------
good = {"verdict": "Y", "confidence": "medium", "headline": "방문자센터까지는 편해요.", "reasons": [{"text": "평지", "source": "구간"}],
        "cautions": ["데크 경사"], "ask_before": ["휠체어 대여?"], "tip": ""}
f = FakeClaude(json_msg(good)); ai.set_client(f)
r = c.get("/api/ai/judge/mureung?mode=wheel").json()
check("판정 API (AI)", r["by"] == "ai" and r["verdict"] == "Y" and r["confidence"] == "medium" and r["rule_grade"] in ("G", "Y", "R"), str(r)[:200])
f = FakeClaude(RuntimeError("down")); ai.set_client(f)
r = c.get("/api/ai/judge/cave?mode=stroller").json()
check("판정 실패 → 규칙", r["by"] == "rule" and r["verdict"] == "R")
check("없는 장소 404", c.get("/api/ai/judge/nope").status_code == 404)

# ---------- ① 코스 설계 에이전트 ----------
stops = [{"id": "cave", "kind": "sight"}, {"id": "food_yeongbin", "kind": "lunch"}, {"id": "pencil_museum", "kind": "sight"}]
final = {"stops": [{**s, "why": "실내라 좋아요"} for s in stops], "summary": "실내", "notes": []}
f = FakeClaude(tool_msg(("find_places", {"indoor_only": True})), tool_msg(("check_plan", {"stops": stops})), json_msg(final)); ai.set_client(f)
r = c.post("/api/course", json={"who": "아이와", "date": "2026-11-21"}).json()
check("코스 API (AI 에이전트)", r["planner"]["by"] == "ai" and [s["id"] for s in r["course"]["stops"]] == ["cave", "food_yeongbin", "pencil_museum"], str(r.get("planner"))[:200])
check("AI가 쓴 고른 이유", all(s["why"] == "실내라 좋아요" for s in r["course"]["stops"]))
check("에이전트가 도구 결과를 받음", any(isinstance(m.get("content"), list) and m["content"] and isinstance(m["content"][0], dict) and m["content"][0].get("type") == "tool_result" for m in f.calls[1]["messages"]))
f = FakeClaude(json_msg({"stops": [{"id": "nongol", "kind": "sight", "why": "x"}, {"id": "forest", "kind": "sight", "why": "숙박"}, {"id": "mukho_park", "kind": "sight", "why": "y"}], "summary": "", "notes": []})); ai.set_client(f)
got = ai_course.plan(PLACES, Conditions(move=["휠체어"]), False)
check("휠체어에 어려움(R)·숙박은 AI가 넣어도 뺌", got and [s.id for s in got[0].stops] == ["mukho_park"], str(got and [s.id for s in got[0].stops]))
f = FakeClaude(json_msg({"stops": [{"id": "없는곳", "kind": "sight", "why": ""}], "summary": "", "notes": []})); ai.set_client(f)
r = c.post("/api/course", json={"who": "혼자"}).json()
check("쓸 장소가 없으면 규칙 코스", r["planner"]["by"] == "rule" and len(r["course"]["stops"]) > 0)
os.environ["AI_COURSE"] = "0"
f = FakeClaude(); ai.set_client(f)
r = c.post("/api/course", json={"who": "혼자"}).json()
check("AI_COURSE=0 이면 AI 안 부름", r["planner"]["by"] == "rule" and not f.calls)
del os.environ["AI_COURSE"]

# ---------- ③ 길 상태 + 관리자 승인 ----------
r = c.post("/api/place-notes", json={"place_id": "dokkaebi", "text": "엘리베이터가 고장 나서 계단으로만 올라갈 수 있었어요", "tip": True, "nick": "누구"})
check("길 메모 서버 저장", r.status_code == 200)
rid = r.json()["id"]
rows = [json.loads(x) for x in (tmp / "reports" / "reports.jsonl").read_text(encoding="utf-8").splitlines()]
check("닉네임은 저장하지 않음", "누구" not in json.dumps(rows, ensure_ascii=False))
check("너무 짧은 글은 거절", c.post("/api/place-notes", json={"place_id": "dokkaebi", "text": "a"}).status_code == 400)
st = {"state": "issue", "headline": "엘리베이터 고장 제보가 있어요.", "items": [{"kind": "고장", "text": "엘리베이터 고장", "since": "2026-11-20", "count": 1}],
      "proposals": [{"type": "notice", "title": "엘리베이터 고장", "detail": "계단만 이용 가능", "level": "warn", "end_date": "", "open": "", "close": "", "facility": "", "evidence": [rid]},
                    {"type": "hours", "title": "", "detail": "", "level": "info", "end_date": "", "open": "25:00", "close": "18:00", "facility": "", "evidence": [rid]},
                    {"type": "facility_add", "title": "", "detail": "", "level": "info", "end_date": "", "open": "", "close": "", "facility": "엘리베이터", "evidence": ["가짜id"]}]}
f = FakeClaude(json_msg(st)); ai.set_client(f)
r = c.get("/api/places/dokkaebi/status").json()
check("길 상태 요약 (공개)", r["by"] == "ai" and r["state"] == "issue" and "proposals" not in r and r["count"] == 1, str(r)[:200])
props = ai_status.proposals()
check("잘못된 제안(시각 형식·근거 없음)은 버림", len(props) == 1 and props[0]["type"] == "notice" and props[0]["end_date"] >= "2026", str(props)[:200])
r = c.get("/api/places/dokkaebi/status").json()   # 같은 제보 → 저장된 답 (AI 다시 안 부름)
check("같은 제보면 다시 부르지 않음", len(f.calls) == 1 and len(ai_status.proposals()) == 1)
tok = c.post("/api/admin/login", json={"id": "owner", "password": "test-owner-pw-1"}).json()["token"]
H = {"x-admin-token": tok}
lst = c.get("/api/admin/ai/proposals", headers=H).json()
check("관리자 제안 목록 + 근거 원문", lst and lst[0]["evidence_rows"][0]["note"].startswith("엘리베이터"))
r = c.post(f"/api/admin/ai/proposals/{lst[0]['id']}", json={"approve": True}, headers=H)
check("승인 → 알림 반영", r.status_code == 200 and any(n["title"] == "엘리베이터 고장" for n in PLACES["dokkaebi"].notices), r.text[:200])
check("두 번 승인은 막음", c.post(f"/api/admin/ai/proposals/{lst[0]['id']}", json={"approve": True}, headers=H).status_code == 400)
from app import cms  # noqa: E402
h = next((x for x in cms.load().get("history", []) if "AI 제안 승인" in str(x.get("reason") or "")), None)
check("이력에 'AI 제안 승인'", bool(h), str(cms.load().get("history", [])[:1])[:300])
if h:
    rv = c.post(f"/api/admin/history/{h['id']}/revert", headers=H)
    check("되돌리면 알림이 사라짐", rv.status_code == 200 and not any(n["title"] == "엘리베이터 고장" for n in PLACES["dokkaebi"].notices), rv.text[:200])
r = c.post("/api/admin/ai/settings", json={"tiers": {"status": "smart", "x": "y"}}, headers=H).json()
check("AI 설정 저장 (총괄)", next(t for t in r["tasks"] if t["key"] == "status")["model"] == "claude-sonnet-5-5")
check("관리자 아니면 설정 못 함", c.post("/api/admin/ai/settings", json={"tiers": {}}).status_code in (401, 403))
c.post("/api/admin/ai/settings", json={"tiers": {}}, headers=H)

# ---------- 기존 대화(동이)도 새 모듈로 ----------
f = FakeClaude(tool_msg(("set_conditions", {"who": "부모님과", "move_none": True})), text_msg("좋아요!")); ai.set_client(f)
os.environ["AI_COURSE"] = "0"
r = c.post("/api/talk", json={"message": "부모님과 가요", "history": [], "conditions": {"lang": "ko"}, "state": {}}).json()
del os.environ["AI_COURSE"]
check("대화형 동이 (SDK)", r["via"] == "llm" and r["conditions"]["who"] == "부모님과", str(r)[:150])

ai.set_client(None)
print(f"AI 점검 실패 {len(fails)}건")
