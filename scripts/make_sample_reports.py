"""가상 불편 제보 18건 만들기 → data/sample_reports/reports.jsonl (docs/19_CITY_REPORTS.md 6장).

모두 "가상"이다: 실제 사람·실제 민원이 아니다. 관리자 [제보·민원 › 설정]의 [가상 제보 넣기]로 작업용 파일에 복사되고,
[가상 데이터 모두 지우기] 한 번으로 사라진다. 실제 제보 파일(reports.jsonl)과 섞이지 않는다.
일부러 세 곳에 몰리게 했다: 묵호항 앞 보도 5건, 동해역 앞 횡단보도 3건, 추암 공영주차장 3건. 나머지 7건은 흩어져 있다.
돌리는 법: py scripts/make_sample_reports.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "sample_reports" / "reports.jsonl"
DEPT = {"step": "road", "sidewalk": "road", "ramp": "road", "parking": "traffic", "toilet": "toilet", "lift": "facility", "works": "road", "etc": "etc"}


def rec(n, days_ago, cat, who, note, lat=None, lon=None, place_id=None, sev="help", summary="", obstacles=(), status="접수",
        steps=(), reply="", pri="", by="ai", plates=False):
    hist = [{"status": "접수", "after_days": 0, "by": "제보"}] + [{"status": s, "after_days": d, "by": "담당자(가상)"} for s, d in steps]
    tri = {"by": by, "category": cat, "severity": sev, "dept": DEPT[cat], "priority": pri, "summary": summary or note[:60],
           "obstacles": [{"type": t, "detail": d} for t, d in obstacles], "faces": False, "plates": plates, "confidence": "medium",
           "model": "claude-haiku-5-5" if by == "ai" else None, "sample_note": "가상 데이터 — AI 결과 예시"}
    return {"id": f"5a3e{n:08x}", "code": f"DH-9{n:04d}", "source": "불편 알리기", "place_id": place_id, "lat": lat, "lon": lon,
            "loc_how": "place" if place_id and lat is None else "map", "kind": "", "category": cat, "who": list(who), "note": note,
            "status": status, "days_ago": days_ago, "photo": None, "photos": [], "triage": tri, "ai": None, "history": hist,
            "reply": reply, "has_contact": False, "sample": True}


R = [
    # A. 묵호항 앞 보도 — 깨진 보도 5건 (같은 곳, 30m 안)
    rec(1, 26, "sidewalk", ["휠체어"], "묵호항 활어회센터 앞 인도 블록이 깨져서 바퀴가 걸려요.", 37.55172, 129.11512, sev="help",
        summary="활어회센터 앞 인도 보도블록 파손, 휠체어 바퀴 걸림", obstacles=[("깨진 바닥", "블록 여러 장이 들뜸")], status="처리 중",
        steps=[("확인", 3), ("처리 중", 10)], reply="현장 확인했어요. 보도블록 교체 공사를 12월 첫 주에 해요."),
    rec(2, 19, "sidewalk", ["유모차"], "유모차 바퀴가 블록 틈에 끼었어요. 어시장 입구 쪽.", 37.55178, 129.11520, sev="help",
        summary="어시장 입구 보도블록 틈, 유모차 바퀴 끼임", obstacles=[("깨진 바닥", "블록 사이 틈이 넓음")], status="처리 중", steps=[("확인", 1), ("처리 중", 2)]),
    rec(3, 11, "sidewalk", ["걷기 힘듦"], "할머니가 걸려서 넘어질 뻔했어요. 블록이 튀어나와 있어요.", 37.55169, 129.11505, sev="help",
        summary="튀어나온 보도블록, 어르신 걸려 넘어질 위험", obstacles=[("깨진 바닥", "모서리가 솟음")], pri="high", status="처리 중", steps=[("처리 중", 1)]),
    rec(4, 5, "sidewalk", ["휠체어"], "전동휠체어로 지나가기 너무 덜컹거려요", 37.55181, 129.11509, sev="minor",
        summary="인도 요철 심함, 전동휠체어 진동", obstacles=[("깨진 바닥", "고르지 않음")], status="처리 중", steps=[("처리 중", 0)]),
    rec(5, 1, "sidewalk", ["휠체어", "유모차"], "회센터 앞 보도 아직 그대로네요. 빗물도 고여요.", 37.55175, 129.11516, sev="help",
        summary="보도 파손 여전, 빗물 고임", obstacles=[("깨진 바닥", "움푹 꺼진 곳에 물")]),
    # B. 동해역 앞 횡단보도 — 턱 3건
    rec(6, 15, "step", ["휠체어"], "동해역 앞 횡단보도 끝 턱이 높아서 혼자 못 올라가요.", 37.49935, 129.12372, sev="block",
        summary="동해역 앞 횡단보도 연석 턱 높음, 휠체어 단독 통과 불가", obstacles=[("턱", "연석이 높아 보임, 경사로 없음")], pri="high",
        status="확인", steps=[("확인", 4)], reply="현장 확인했어요. 연석 낮추기 공사를 내년 예산에 올렸어요."),
    rec(7, 8, "step", ["유모차"], "유모차 앞바퀴 들어서 올려야 해요. 역 나와서 바로 건너는 곳.", 37.49940, 129.12380, sev="help",
        summary="역 앞 횡단보도 턱, 유모차 들어 올려야 함", obstacles=[("턱", "횡단보도 끝 연석")], status="확인", steps=[("확인", 0)]),
    rec(8, 2, "step", ["휠체어"], "기차 내려서 숙소 가는 길인데 여기서 막혀요", 37.49931, 129.12376, sev="block",
        summary="역 앞 횡단보도 턱으로 휠체어 통과 불가", obstacles=[("턱", "높은 연석")]),
    # C. 추암 공영주차장 — 불법 주차 3건 (번호판은 담당자만, 요약에는 안 씀)
    rec(9, 9, "parking", ["휠체어"], "장애인 주차구역에 일반 차가 대 있어요.", 37.47851, 129.15748, sev="help",
        summary="추암 공영주차장 장애인 주차구역 일반 차량 주차", obstacles=[("불법 주차", "장애인 구역 표시 위 차량")], plates=True,
        status="완료", steps=[("확인", 0), ("완료", 1)], reply="단속반이 계도했어요. 주말 순찰을 늘릴게요."),
    rec(10, 3, "parking", ["휠체어"], "또 장애인 구역에 차가 있어요. 휠체어 내릴 자리가 없어요", 37.47858, 129.15755, sev="help",
        summary="장애인 주차구역 반복 불법 주차, 휠체어 승하차 공간 없음", obstacles=[("불법 주차", "승하차 빗금 위 주차")], plates=True),
    rec(11, 0.3, "parking", ["휠체어", "걷기 힘듦"], "주말마다 이래요. 빗금친 곳까지 막혔어요.", 37.47846, 129.15742, sev="block",
        summary="승하차 구역까지 막힘, 주말 반복", obstacles=[("불법 주차", "빗금 구역 차량 2대")], plates=True, pri="urgent"),
    # 흩어진 7건
    rec(12, 21, "step", ["걷기 힘듦"], "논골담길 올라가는 계단에 손잡이가 없어요.", place_id="nongol", sev="help",
        summary="논골담길 계단 손잡이 없음, 어르신 오르기 어려움", obstacles=[("계단", "손잡이 없는 계단")], status="확인", steps=[("확인", 6)]),
    rec(13, 14, "toilet", ["휠체어"], "천곡동굴 장애인 화장실 문이 안 열려요(고장).", place_id="cave", sev="block",
        summary="천곡동굴 장애인 화장실 출입문 고장", obstacles=[("화장실 문제", "자동문 작동 안 함")], status="완료",
        steps=[("확인", 1), ("처리 중", 2), ("완료", 4)], reply="자동문 수리를 마쳤어요. 알려 주셔서 고마워요."),
    rec(14, 12, "lift", ["휠체어", "유모차"], "도째비골 스카이밸리 엘리베이터 점검 중이라 못 올라갔어요.", place_id="dokkaebi", sev="block",
        summary="도째비골 엘리베이터 운행 중지, 휠체어·유모차 진입 불가", obstacles=[("고장", "점검 안내문")], status="완료",
        steps=[("확인", 0), ("처리 중", 1), ("완료", 3)], reply="정기 점검이 끝나 정상 운행해요."),
    rec(15, 7, "ramp", ["휠체어"], "망상해변 모래사장 들어가는 매트가 끝에서 끊겨요", 37.59205, 129.08990, sev="help",
        summary="망상해변 해변 진입 매트 끊김", obstacles=[("경사로 없음", "매트 끝 단차")], status="접수", by="rule"),
    rec(16, 6, "works", ["유모차", "걷기 힘듦"], "연필뮤지엄 가는 길 공사로 인도가 막혀서 차도로 걸었어요.", 37.54760, 129.10660, sev="block",
        summary="연필뮤지엄 진입로 공사로 인도 막힘, 차도 보행", obstacles=[("공사·통제", "인도 펜스")], pri="high"),
    rec(17, 10, "step", ["휠체어"], "묵호역 앞 보도 턱", 37.54790, 129.11640, sev="minor", summary="묵호역 앞 보도 턱", obstacles=[],
        status="반려", steps=[("반려", 2)], reply="확인해 보니 철도공사 부지라 시 소관이 아니에요. 코레일에 전달했어요.", by="rule"),
    rec(18, 4, "etc", ["시각"], "무릉계곡 가는 길 점자블록이 중간에 없어요.", 37.46790, 129.06020, sev="help",
        summary="무릉계곡 진입로 점자블록 끊김, 시각장애인 보행 어려움", obstacles=[]),
]

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in R), encoding="utf-8")
print(f"가상 제보 {len(R)}건 → {OUT}")
