"""AI 작업 4가지. 모두 JSON만 받고, 서버가 검증한다. AI가 실패하거나 키가 없으면 규칙 기반으로 대신한다."""
import json, os, re
from pathlib import Path
import httpx

PROMPTS = Path(__file__).parent / "prompts"
API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = os.getenv("LLM_MODEL", "claude-sonnet-5-5")
TIMEOUT = float(os.getenv("LLM_TIMEOUT") or 6)
WORKSPACE = os.getenv("ANTHROPIC_WORKSPACE_ID", "")   # 키를 워크스페이스에 묶지 않았다면 필요


def headers() -> dict:
    h = {"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    if WORKSPACE:
        h["anthropic-workspace-id"] = WORKSPACE
    return h
_cache: dict[str, dict] = {}   # 데모 안정성: 같은 입력은 같은 답


def _prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


def _ask_json(system: str, user: str) -> dict | None:
    if not API_KEY:
        return None
    key = system[:40] + user
    if key in _cache:
        return _cache[key]
    try:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers(),
            json={"model": MODEL, "max_tokens": 800, "temperature": 0, "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        text = "".join(b.get("text", "") for b in r.json().get("content", []))
        m = re.search(r"\{.*\}", text, re.S)
        data = json.loads(m.group(0)) if m else None
        if data is not None:
            _cache[key] = data
        return data
    except Exception as e:   # 시간 초과, 형식 오류 등 → 규칙 기반으로
        print("[llm] fallback:", e, getattr(getattr(e, "response", None), "text", "")[:300])
        return None


# ① 서술형 무장애 메모 → 구조화 (사전 배치 작업, 사람이 검수)
def structure_memo(place_name: str, memo: str) -> dict:
    data = _ask_json(_prompt("structure_memo"), json.dumps({"place": place_name, "memo": memo}, ensure_ascii=False))
    if not data or not isinstance(data.get("items"), list):
        return {"items": [], "needs_review": True}
    for it in data["items"]:   # 근거 문장이 원문에 없으면 신뢰하지 않음
        if it.get("evidence") and it["evidence"] not in memo:
            it["grade"] = None; it["value"] = "확인 필요"
    data["needs_review"] = True
    return data


RAIN = re.compile(r"비\s*(가|와|오|온|올|옵|예보|소식|내)|우천|우산|소나기|rain", re.I)   # '도째비골'의 '비'는 제외


# ② 자연어 조건 해석
KW = {"휠체어": "휠체어", "유모차": "유모차", "계단": "계단 어려움", "걷기": "오래 걷기 어려움", "wheelchair": "휠체어", "stroller": "유모차"}

def parse_conditions(text: str) -> dict:
    data = _ask_json(_prompt("parse_conditions"), text)
    if isinstance(data, dict):
        return data
    move = sorted({v for k, v in KW.items() if k in text.lower()})
    return {"move": move, "rain": bool(RAIN.search(text)), "notes": text}


# ③ 대화 수정: 요청 → 수정 명령. 장소 id는 후보 목록 안에서만.
def chat_edit(message: str, course_ids: list[str], candidates: dict[str, str], lang: str = "ko") -> dict:
    payload = {"message": message, "course": course_ids, "candidates": candidates, "lang": lang}
    data = _ask_json(_prompt("chat_edit"), json.dumps(payload, ensure_ascii=False))
    if isinstance(data, dict) and data.get("action") in ("rain", "less_walk", "add", "remove", "none"):
        pid = data.get("place_id")
        if pid is not None and pid not in candidates:
            data["place_id"] = None; data["action"] = "none"
        return data
    s = message.replace(" ", "")
    named = [pid for pid, name in candidates.items() if name.replace(" ", "")[:4] in s]
    if named and re.search(r"빼|제외|remove", s, re.I): return {"action": "remove", "place_id": named[0], "reply": ""}
    if RAIN.search(message): return {"action": "rain", "reply": ""}
    if re.search(r"덜걷|걷기|힘들|walk", s, re.I): return {"action": "less_walk", "reply": ""}
    if named: return {"action": "add", "place_id": named[0], "reply": ""}
    return {"action": "none", "reply": ""}


# ④ 추천 이유 + 영어 안내 (제공한 정보만 사용)
def explain(stops: list[dict], conditions: dict, lang: str = "ko") -> dict:
    data = _ask_json(_prompt("explain"), json.dumps({"stops": stops, "conditions": conditions, "lang": lang}, ensure_ascii=False))
    if isinstance(data, dict) and isinstance(data.get("why"), dict):
        return data
    return {"why": {s["id"]: s.get("tip", "") for s in stops}, "summary": ""}
