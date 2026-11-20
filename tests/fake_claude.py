"""시험용 가짜 Claude 클라이언트 — 정해 둔 답을 차례로 돌려주고, 받은 요청을 기록한다 (돈·네트워크 없음)."""
from types import SimpleNamespace as NS
import json


def usage(i=1000, o=200):
    return NS(input_tokens=i, output_tokens=o, cache_creation_input_tokens=0, cache_read_input_tokens=0)


def text_msg(text, stop="end_turn"):
    return NS(content=[NS(type="thinking", thinking=""), NS(type="text", text=text)], stop_reason=stop, stop_details=None, usage=usage())


def json_msg(obj):
    return text_msg(json.dumps(obj, ensure_ascii=False))


def tool_msg(*calls):
    """calls = (name, input) 들 → tool_use 블록들"""
    blocks = [NS(type="tool_use", id=f"tu_{i}", name=n, input=inp) for i, (n, inp) in enumerate(calls)]
    return NS(content=[NS(type="text", text="")] + blocks, stop_reason="tool_use", stop_details=None, usage=usage())


def refusal_msg():
    return NS(content=[], stop_reason="refusal", stop_details=NS(category="cyber", explanation=""), usage=usage(10, 0))


class _Endpoint:
    def __init__(self, owner):
        self.owner = owner

    def create(self, **kw):
        self.owner.calls.append({**kw, "messages": list(kw.get("messages", []))})   # 그때의 메시지 목록을 복사해 기록
        if not self.owner.queue:
            raise RuntimeError("가짜 답이 더 없음")
        r = self.owner.queue.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


class FakeClaude:
    def __init__(self, *answers):
        self.queue = list(answers)
        self.calls: list[dict] = []
        self.messages = _Endpoint(self)
        self.beta = NS(messages=_Endpoint(self))
