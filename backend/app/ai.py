"""Claude API 공통 모듈 (공식 Python SDK `anthropic` 2.x).

- 작업마다 모델을 고른다: 빠른 작업은 Haiku, 판단이 중요한 작업은 Sonnet (docs/17_AI_FEATURES.md).
  우선순위: 관리자 화면 [AI 설정] > 환경 변수 AI_TIER_<작업> > 기본값.
- Sonnet 5.5 는 서버 측 대체(fallbacks: "default")를 켠다. 안전 분류기가 드물게 거절하면 같은 요청을 다른 모델이 이어 받는다.
- 구조화 출력(output_config.format = json_schema)으로 JSON 모양을 강제하고, 받은 뒤 서버가 한 번 더 검증한다.
- 키가 없거나 실패·거절이면 None 을 돌려주고, 부르는 쪽은 규칙 결과로 이어 간다 (시연이 멈추지 않게).
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any, Callable

try:
    import anthropic
except ImportError:          # SDK 가 없으면 AI 없이 동작 (규칙 경로)
    anthropic = None          # type: ignore

API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
WORKSPACE = os.getenv("ANTHROPIC_WORKSPACE_ID", "")
MODELS = {"fast": os.getenv("AI_MODEL_FAST") or "claude-haiku-5-5", "smart": os.getenv("AI_MODEL_SMART") or "claude-sonnet-5-5"}
# 작업 → 기본 등급. 화면 [AI 설정]에 보이는 이름도 여기서.
TASKS: dict[str, dict] = {
    "course": {"tier": "smart", "ko": "AI 코스 설계", "effort": "medium"},
    "judge": {"tier": "smart", "ko": "AI 접근성 판정", "effort": "medium"},
    "status": {"tier": "fast", "ko": "최근 길 상태 요약", "effort": "low"},
    "talk": {"tier": "fast", "ko": "대화형 동이", "effort": "low"},
    "etc": {"tier": "fast", "ko": "브리핑·사진 분석·조건 해석", "effort": "low"},
}
FALLBACK_BETA = "server-side-fallback-2026-07-01"
PRICE = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5-5": (2.0, 10.0), "claude-opus-5-5": (4.0, 20.0)}   # $ / 1M 토큰 (입력, 출력)

_override: dict[str, str] = {}      # 관리자 화면에서 고른 등급 {작업: "fast"|"smart"}
_client = None
USAGE: dict[str, dict] = {}         # 작업별 호출·성공·대체·토큰·추정 비용 (서버를 켠 뒤부터)
LAST: dict[str, dict] = {}          # 작업별 마지막 실패 이유 (점검용, 키·개인정보 없음)


def available() -> bool:
    return bool(API_KEY) and anthropic is not None or _client is not None


def client():
    global _client
    if _client is None and API_KEY and anthropic is not None:
        kw: dict[str, Any] = {"api_key": API_KEY, "max_retries": 1}
        if WORKSPACE:
            kw["default_headers"] = {"anthropic-workspace-id": WORKSPACE}
        _client = anthropic.Anthropic(**kw)
    return _client


def set_client(c):
    """시험용: 가짜 클라이언트를 끼운다 (None 이면 원래대로)."""
    global _client
    _client = c


def set_overrides(d: dict | None):
    _override.clear()
    for k, v in (d or {}).items():
        if k in TASKS and v in MODELS:
            _override[k] = v


def tier_for(task: str) -> str:
    t = TASKS.get(task, TASKS["etc"])
    return _override.get(task) or os.getenv(f"AI_TIER_{task.upper()}") or t["tier"]


def model_for(task: str) -> str:
    return MODELS.get(tier_for(task), MODELS["fast"])


def settings() -> dict:
    return {"models": MODELS, "price_per_mtok": PRICE,
            "tasks": [{"key": k, "ko": v["ko"], "tier": tier_for(k), "default": v["tier"], "model": model_for(k)} for k, v in TASKS.items()]}


def _count(task: str, model: str, ok: bool, usage=None, note: str = ""):
    u = USAGE.setdefault(task, {"calls": 0, "ok": 0, "fallback": 0, "input_tokens": 0, "output_tokens": 0, "usd": 0.0, "model": model})
    u["calls"] += 1
    u["ok" if ok else "fallback"] += 1
    u["model"] = model
    if usage is not None:
        i = (getattr(usage, "input_tokens", 0) or 0) + (getattr(usage, "cache_creation_input_tokens", 0) or 0) + (getattr(usage, "cache_read_input_tokens", 0) or 0)
        o = getattr(usage, "output_tokens", 0) or 0
        u["input_tokens"] += i; u["output_tokens"] += o
        pi, po = PRICE.get(model, (0, 0))
        u["usd"] = round(u["usd"] + i / 1e6 * pi + o / 1e6 * po, 4)
    if not ok and note:
        LAST[task] = {"model": model, "why": note[:300], "at": time.strftime("%Y-%m-%d %H:%M:%S")}


def create(task: str, **kw):
    """messages.create 한 번. Sonnet 5.5 면 서버 측 대체를 켠다. 실패하면 예외를 그대로 올린다."""
    c = client()
    if c is None:
        raise RuntimeError("AI 키 없음")
    model = kw.pop("model", None) or model_for(task)
    effort = TASKS.get(task, TASKS["etc"])["effort"]
    oc = dict(kw.pop("output_config", None) or {})
    oc.setdefault("effort", effort)
    kw.setdefault("cache_control", {"type": "ephemeral"})   # 시스템 프롬프트·도구 설명을 캐시해 두 번째부터 싸게
    if model.startswith("claude-sonnet-5-5"):
        return c.beta.messages.create(model=model, betas=[FALLBACK_BETA], fallbacks="default", output_config=oc, **kw)
    return c.messages.create(model=model, output_config=oc, **kw)


def _text(msg) -> str:
    return "".join(getattr(b, "text", "") for b in (msg.content or []) if getattr(b, "type", "") == "text").strip()


def _why_bad(msg) -> str | None:
    sr = getattr(msg, "stop_reason", None)
    if sr == "refusal":
        cat = getattr(getattr(msg, "stop_details", None), "category", None)
        return f"거절(refusal, {cat})"
    if sr == "max_tokens":
        return "답이 너무 길어 잘림(max_tokens)"
    return None


_json_cache: dict[str, tuple[float, dict]] = {}


def ask_json(task: str, system: str, user: Any, schema: dict, max_tokens: int = 4000, ttl: int = 3600,
             cache_key: str | None = None) -> dict | None:
    """구조화 출력으로 JSON 하나를 받는다. 같은 입력은 ttl 초 동안 저장해 둔 답을 쓴다."""
    model = model_for(task)
    if not available():
        _count(task, model, False, note="키 없음")
        return None
    key = cache_key or hashlib.sha256(json.dumps([task, model, system, user, schema], ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
    hit = _json_cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        msg = create(task, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}],
                     output_config={"format": {"type": "json_schema", "schema": schema}})
        bad = _why_bad(msg)
        if bad:
            _count(task, model, False, msg.usage, bad)
            return None
        data = json.loads(_text(msg))
        if not isinstance(data, dict):
            raise ValueError("JSON 객체가 아님")
        _count(task, model, True, msg.usage)
        _json_cache[key] = (time.time(), data)
        return data
    except Exception as e:   # noqa: BLE001 — 어떤 실패든 규칙 결과로 이어 간다
        _count(task, model, False, note=f"{type(e).__name__}: {e}")
        print(f"[ai] {task} 실패:", type(e).__name__, str(e)[:300])
        return None


def run_tools(task: str, system: str, messages: list, tools: list, call: Callable[[str, dict], Any],
              schema: dict | None = None, max_rounds: int = 8, max_tokens: int = 8000) -> tuple[str, Any] | None:
    """도구를 쓰는 반복 (직접 만든 루프 — 도구 결과마다 서버 상태를 바꾸므로).
    끝나면 (마지막 글, 마지막 메시지). 실패·거절·한도 초과면 None.
    schema 가 있으면 마지막 답을 그 JSON 모양으로 강제한다."""
    model = model_for(task)
    if not available():
        _count(task, model, False, note="키 없음")
        return None
    msgs = list(messages)
    usage_total = None
    try:
        for _ in range(max_rounds):
            kw: dict[str, Any] = {"max_tokens": max_tokens, "system": system, "tools": tools, "messages": msgs}
            if schema:
                kw["output_config"] = {"format": {"type": "json_schema", "schema": schema}}
            msg = create(task, **kw)
            usage_total = msg.usage
            bad = _why_bad(msg)
            if bad:
                _count(task, model, False, msg.usage, bad)
                return None
            if msg.stop_reason == "pause_turn":
                msgs.append({"role": "assistant", "content": msg.content})
                continue
            uses = [b for b in msg.content if getattr(b, "type", "") == "tool_use"]
            if not uses:
                _count(task, model, True, msg.usage)
                return _text(msg), msg
            msgs.append({"role": "assistant", "content": msg.content})   # 생각 블록 포함 그대로 돌려준다
            results = []
            for u in uses:
                try:
                    out = call(u.name, dict(u.input or {}))
                    results.append({"type": "tool_result", "tool_use_id": u.id, "content": json.dumps(out, ensure_ascii=False, default=str)})
                except Exception as e:   # noqa: BLE001 — 도구 오류는 AI에게 알려 다시 시도하게
                    results.append({"type": "tool_result", "tool_use_id": u.id, "content": f"오류: {e}", "is_error": True})
            msgs.append({"role": "user", "content": results})   # 여러 도구 결과는 한 메시지에
        _count(task, model, False, usage_total, "도구 반복 한도 초과")
        return None
    except Exception as e:   # noqa: BLE001
        _count(task, model, False, note=f"{type(e).__name__}: {e}")
        print(f"[ai] {task} 실패:", type(e).__name__, str(e)[:300])
        return None
