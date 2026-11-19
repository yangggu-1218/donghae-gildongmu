"""대화형 동이 검사 (키 없이 규칙 경로). 사용: python scripts/eval_talk.py
LLM 키를 넣은 뒤에도 같은 문장으로 돌려 보고, 코스·조건이 규칙 경로와 크게 다르지 않은지 본다."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.main import talk  # noqa: E402

KO = {"conditions": {"lang": "ko"}, "state": {}, "course_ids": []}
CASES = [  # (시작 상태, 말, 확인할 것)
    (KO, "안녕하세요", lambda r: r["course"] is None and "누구" in r["reply"]),
    (KO, "엄마랑 가는데 무릎이 안 좋으세요", lambda r: r["conditions"]["who"] == "부모님과" and "오래 걷기 어려움" in r["conditions"]["move"] and r["course"]),
    (KO, "휠체어 타는 친구랑 묵호역에서 출발해요", lambda r: r["conditions"]["start"] == "묵호역" and r["conditions"]["move"] == ["휠체어"]),
    (KO, "친구랑 왔어요", lambda r: r["course"] is None and "휠체어" in r["reply"]),
    (KO, "근처 휠체어 충전기 있어요?", lambda r: r["cards"][0]["kind"] == "charger"),
    (KO, "엄마가 넘어져서 다쳤어요", lambda r: "119" in r["reply"]),
    (KO, "11월에 축제 해요?", lambda r: r["cards"][0]["kind"] == "events" and any("도째비" in e["name"] for e in r["cards"][0]["data"])),
    ({"conditions": {"lang": "en"}, "state": {}, "course_ids": []}, "Is there an info center with English?",
     lambda r: "English" in r["cards"][0]["data"][0]["languages"]),
    ({"conditions": {"lang": "ko", "who": "부모님과", "move": ["오래 걷기 어려움"]}, "state": {"who_known": True, "move_known": True},
      "course_ids": ["dokkaebi", "mukho_port", "haerang", "mangsang"]}, "논골담길 넣어줘", lambda r: "논골담길" in r["reply"]),
    ({"conditions": {"lang": "ko", "who": "혼자", "move": []}, "state": {"who_known": True, "move_known": True},
      "course_ids": ["dokkaebi", "mukho_port", "haerang", "mangsang"]}, "비 온대요", lambda r: r["conditions"]["rain"] is True),
]
fail = 0
for i, (st, msg, ok) in enumerate(CASES, 1):
    r = talk({**st, "message": msg})
    try:
        good = bool(ok(r))
    except Exception:
        good = False
    fail += not good
    print(f"{'ok  ' if good else 'FAIL'} D{i:02d} {msg} → ({r['via']}) {r['reply'][:60]}")
print(f"\n실패 {fail}건")
sys.exit(1 if fail else 0)
