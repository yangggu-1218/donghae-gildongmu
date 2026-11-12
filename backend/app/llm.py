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

# 서비스 실행 중 AI API를 몇 번 불렀는지 (심사·발표 때 /api/ai 로 보여 준다)
USAGE: dict[str, dict] = {}


def count(task: str, ok: bool, tokens: int = 0):
    u = USAGE.setdefault(task, {"calls": 0, "ok": 0, "fallback": 0, "tokens": 0})
    u["calls"] += 1; u["ok" if ok else "fallback"] += 1; u["tokens"] += tokens


def status() -> dict:
    return {"connected": bool(API_KEY), "model": MODEL, "provider": "Anthropic Claude API", "tasks": USAGE,
            "runtime_features": ["대화형 동이(도구 호출)", "자유 입력 조건 해석", "말로 코스 수정", "추천 이유 생성",
                                 "제보 사진 분석(비전)", "무장애 메모 구조화"]}


def _prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


def _ask_json(system: str, user, task: str = "etc", timeout: float | None = None) -> dict | None:
    """user 는 문자열 또는 content 블록 목록(이미지 포함)."""
    if not API_KEY:
        count(task, False)
        return None
    key = system[:40] + (user if isinstance(user, str) else json.dumps(user)[:2000])
    if key in _cache:
        return _cache[key]
    try:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers(),
            json={"model": MODEL, "max_tokens": 800, "temperature": 0, "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=timeout or TIMEOUT,
        )
        r.raise_for_status()
        out = r.json()
        text = "".join(b.get("text", "") for b in out.get("content", []))
        m = re.search(r"\{.*\}", text, re.S)
        data = json.loads(m.group(0)) if m else None
        count(task, data is not None, sum((out.get("usage") or {}).get(k, 0) for k in ("input_tokens", "output_tokens")))
        if data is not None:
            _cache[key] = data
        return data
    except Exception as e:   # 시간 초과, 형식 오류 등 → 규칙 기반으로
        count(task, False)
        print("[llm] fallback:", e, getattr(getattr(e, "response", None), "text", "")[:300])
        return None


# ① 서술형 무장애 메모 → 구조화 (사전 배치 작업, 사람이 검수)
def structure_memo(place_name: str, memo: str) -> dict:
    data = _ask_json(_prompt("structure_memo"), json.dumps({"place": place_name, "memo": memo}, ensure_ascii=False), "structure_memo")
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
    data = _ask_json(_prompt("parse_conditions"), text, "parse_conditions")
    if isinstance(data, dict):
        return data
    move = sorted({v for k, v in KW.items() if k in text.lower()})
    return {"move": move, "rain": bool(RAIN.search(text)), "notes": text}


# ③ 대화 수정: 요청 → 수정 명령. 장소 id는 후보 목록 안에서만.
def chat_edit(message: str, course_ids: list[str], candidates: dict[str, str], lang: str = "ko") -> dict:
    payload = {"message": message, "course": course_ids, "candidates": candidates, "lang": lang}
    data = _ask_json(_prompt("chat_edit"), json.dumps(payload, ensure_ascii=False), "chat_edit")
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
    data = _ask_json(_prompt("explain"), json.dumps({"stops": stops, "conditions": conditions, "lang": lang}, ensure_ascii=False), "explain")
    if isinstance(data, dict) and isinstance(data.get("why"), dict):
        return data
    return {"why": {s["id"]: s.get("tip", "") for s in stops}, "summary": ""}


# ⑤ 제보 사진 분석 (비전): 사진에서 계단·턱·경사·좁은 길·공사를 찾아 '관리자 검수용 제안'을 만든다.
#    판정을 바로 바꾸지 않는다. 사람이 확인한 뒤에만 구간 정보에 반영한다.
OBSTACLES = ["계단", "턱", "급경사", "좁은 통로", "울퉁불퉁한 바닥", "공사·통제", "임시 경사로", "장애물 없음"]


def analyze_photo(jpeg: bytes, place_name: str, kind: str, note: str = "") -> dict:
    import base64
    content = [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}},
               {"type": "text", "text": json.dumps({"place": place_name, "report_kind": kind, "note": note}, ensure_ascii=False)}]
    data = _ask_json(_prompt("analyze_photo"), content, "analyze_photo", timeout=20)
    if not data:
        return {"by": "none", "obstacles": [], "summary": "", "needs_review": True}
    obs = [o for o in data.get("obstacles", []) if isinstance(o, dict) and o.get("type") in OBSTACLES]
    return {"by": "ai", "model": MODEL, "obstacles": obs, "summary": str(data.get("summary", ""))[:200],
            "suggested_grade": data.get("suggested_grade") if data.get("suggested_grade") in ("G", "Y", "R") else None,
            "needs_review": True}
