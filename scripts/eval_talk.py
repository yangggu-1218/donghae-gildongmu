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
    (KO, "친구랑 산에 가고 싶어요", lambda r: "산·등산" in r["conditions"]["style"] and "자연·산책" not in r["conditions"]["style"]),
    (KO, "혼자 왔어요", lambda r: r["reply"].startswith("혼자 여행이시군요") and "함께 가는 분" not in r["reply"]),
    (KO, "부모님 모시고 가요", lambda r: "부모님 걸음" in r["reply"]),
    (KO, "터미널에서 출발해요", lambda r: r["conditions"]["start"] == "동해종합버스터미널"),
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

# 시나리오 A~D (docs/21_IMPROVEMENT_PLAN.md 14장): 추천이 접근성 근거와 맞는지, 일정 길이 안에 드는지
from app.main import course, PLACES  # noqa: E402
from app.schemas import Conditions  # noqa: E402


def mins(hm):
    h, m = hm.split(":"); return int(h) * 60 + int(m)


def scen(name, c, ok):
    global fail
    r = course(Conditions(lang="ko", date="2026-11-21", start_time="10:00", **c))["course"]
    used = mins(r["back_at"]) - mins(r["start_time"])
    try:
        good = bool(ok(r, used))
    except Exception:
        good = False
    fail += not good
    print(f"{'ok  ' if good else 'FAIL'} {name} → {[PLACES[s['id']].name_ko for s in r['stops']]} 예상 {used}분")


HARD = {"cave", "yongchu", "nongol"}
scen("A 일반·혼자·바다·3시간", dict(who="혼자", style=["바다 보기"], budget_min=180),
     lambda r, u: r["stops"] and u <= 180)
scen("B 휠체어·동행·경사 어려움·화장실·2시간", dict(who="연인·친구", move=["휠체어"], flat_only=True, toilet_first=True, budget_min=120),
     lambda r, u: r["stops"] and u <= 120 and all(s["grade"] != "R" for s in r["stops"]) and not HARD & {s["id"] for s in r["stops"]})
scen("C 휠체어·혼자·평탄·계단 불가·편의시설", dict(who="혼자", move=["휠체어"], flat_only=True, toilet_first=True),
     lambda r, u: r["stops"] and all(s["grade"] != "R" for s in r["stops"]) and not HARD & {s["id"] for s in r["stops"]})
scen("D 거동 불편 고령·휴식·짧은 이동·대중교통", dict(who="부모님과", move=["오래 걷기 어려움", "계단 어려움"], rest=True, start="동해역"),
     lambda r, u: r["stops"] and not HARD & {s["id"] for s in r["stops"]} and any(s["kind"] == "cafe" for s in r["stops"]))
print(f"\n실패 {fail}건")
sys.exit(1 if fail else 0)
