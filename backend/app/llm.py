"""AI 작업 4가지. 모두 JSON만 받고, 서버가 검증한다. AI가 실패하거나 키가 없으면 규칙 기반으로 대신한다."""
import json, os, re
from pathlib import Path
from . import ai

PROMPTS = Path(__file__).parent / "prompts"
API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = os.getenv("LLM_MODEL") or ai.model_for("etc")   # 화면 표시용 (실제 모델은 ai.model_for)
TIMEOUT = float(os.getenv("LLM_TIMEOUT") or 6)
WORKSPACE = os.getenv("ANTHROPIC_WORKSPACE_ID", "")   # 키를 워크스페이스에 묶지 않았다면 필요



_cache: dict[str, dict] = {}   # 데모 안정성: 같은 입력은 같은 답

# 서비스 실행 중 AI API를 몇 번 불렀는지 (심사·발표 때 /api/ai 로 보여 준다)
USAGE: dict[str, dict] = {}


LAST_FAIL: dict = {}   # 작업별 마지막으로 못 읽은 AI 답 (점검용, 키·개인정보 없음)


def count(task: str, ok: bool, tokens: int = 0):
    u = USAGE.setdefault(task, {"calls": 0, "ok": 0, "fallback": 0, "tokens": 0})
    u["calls"] += 1; u["ok" if ok else "fallback"] += 1; u["tokens"] += tokens


def status() -> dict:
    return {"connected": bool(API_KEY), "model": ai.model_for("etc"), "models": ai.settings(), "usage": ai.USAGE, "last": ai.LAST, "provider": "Anthropic Claude API", "tasks": USAGE, "last_fail": LAST_FAIL,
            "runtime_features": ["대화형 동이(도구 호출)", "자유 입력 조건 해석", "말로 코스 수정", "추천 이유 생성",
                                 "제보 사진 분석(비전)", "이동약자 메모 구조화"]}


def _prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


def _first_json(text: str) -> dict | None:
    """답 속 첫 JSON 객체를 읽는다 (앞뒤 설명·코드 울타리가 있어도)."""
    dec = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch == "{":
            try:
                obj, _ = dec.raw_decode(text[i:])
                if isinstance(obj, dict):
                    return obj
            except ValueError:
                continue
    return None


def _ask_json(system: str, user, task: str = "etc", timeout: float | None = None, max_tokens: int = 2000) -> dict | None:
    """user 는 문자열 또는 content 블록 목록(이미지 포함)."""
    if not API_KEY:
        count(task, False)
        return None
    key = system[:40] + (user if isinstance(user, str) else json.dumps(user)[:2000])
    if key in _cache:
        return _cache[key]
    try:   # 공식 SDK 로 (backend/app/ai.py). 모델은 작업 'etc' 설정(기본 Haiku)
        ai.gate("etc")   # 요청 한도에 걸리면 Limited → 아래 except 에서 규칙으로
        out = ai.create("etc", max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}], timeout=timeout or TIMEOUT)
        text = ai._text(out)
        bad = ai._why_bad(out)
        data = None if bad else _first_json(text)
        if data is None:
            print(f"[llm] {task}: JSON을 못 읽음 (stop={out.stop_reason}):", text[:300])
            LAST_FAIL[task] = {"stop": out.stop_reason, "head": text[:400], "tail": text[-200:]}
        count(task, data is not None, (out.usage.input_tokens or 0) + (out.usage.output_tokens or 0))
        ai._count("etc", ai.model_for("etc"), data is not None, out.usage, bad or "")
        if data is not None:
            _cache[key] = data
        return data
    except Exception as e:   # 시간 초과, 형식 오류 등 → 규칙 기반으로
        count(task, False)
        print("[llm] fallback:", type(e).__name__, str(e)[:300])
        return None


# ① 서술형 이동약자 메모 → 구조화 (사전 배치 작업, 사람이 검수)
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


# ⑥ 동이 브리핑: 완성된 코스를 카드 조각(한 줄 요약·맞춘 점·챙길 것·장소별 이유)으로 정리한다.
#    엔진이 정한 코스와 화면이 모은 근거(예보·붐빔·판정·뺀 곳)만 쓴다. 실패하면 화면의 규칙 카드가 그대로 남는다.
ICONS = {"rain", "sun", "walk", "wheel", "crowd", "food", "closed", "time", "sea"}


def brief(evidence: dict) -> dict | None:
    data = _ask_json(_prompt("brief"), json.dumps(evidence, ensure_ascii=False), "brief", timeout=30, max_tokens=4000)   # 이 모델은 답 전에 생각하는 데도 토큰을 써서 넉넉히
    if not isinstance(data, dict) or not data.get("headline"):
        return None
    ids = {s.get("id") for s in evidence.get("stops", [])}
    fits = [{"icon": f["icon"], "text": str(f.get("text", ""))[:40]} for f in data.get("fits", [])
            if isinstance(f, dict) and f.get("icon") in ICONS and f.get("text")][:4]
    return {"by": "ai", "model": MODEL, "headline": str(data["headline"])[:40], "fits": fits,
            "bring": [str(b)[:12] for b in data.get("bring", []) if b][:3],
            "why": {k: str(v)[:40] for k, v in (data.get("why") or {}).items() if k in ids and v}}


# ⑦ 사진으로 물어보기: 사용자가 찍은 입구·길 사진을 그 사람 조건(휠체어·유모차 등) 기준으로 판단해 카드로 돌려준다.
SEEN = {"계단", "턱", "경사로", "급경사", "좁은 통로", "울퉁불퉁한 바닥", "공사·통제", "자동문", "손잡이", "장애물 없음",
        "stairs", "step", "ramp", "steep slope", "narrow path", "uneven surface", "construction", "automatic door", "handrail", "no obstacles"}


def photo_check(jpeg: bytes, move: list[str], lang: str = "ko") -> dict:
    import base64
    content = [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}},
               {"type": "text", "text": json.dumps({"move": move, "lang": lang}, ensure_ascii=False)}]
    data = _ask_json(_prompt("photo_check"), content, "photo_check", timeout=40, max_tokens=3000)
    if not isinstance(data, dict) or not data.get("title"):
        return {"by": "none"}
    return {"by": "ai", "model": MODEL, "verdict": data.get("verdict") if data.get("verdict") in ("G", "Y", "R") else None,
            "title": str(data["title"])[:40],
            "seen": [{"type": str(x.get("type")), "detail": str(x.get("detail", ""))[:30]} for x in data.get("seen", [])
                     if isinstance(x, dict) and x.get("type") in SEEN][:4],
            "tips": [str(x)[:50] for x in data.get("tips", []) if x][:2]}
