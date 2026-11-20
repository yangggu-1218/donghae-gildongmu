"""자동 갱신 점검용 가짜 소스 만들기 → data/sync/fixtures/ (docs/20_AUTO_SYNC.md 8장, 0~1단계분)
모두 가짜 값이다. 실제 소스 목록(data/sync/sources.json)과 따로 두고, 점검(tests/test_auto_sync.py)과
관리자 화면 시연(SYNC_CONF=data/sync/fixtures 로 서버를 켤 때)에만 쓴다.
돌리는 법: py scripts/make_sync_fixtures.py
"""
import json
from pathlib import Path

D = Path(__file__).resolve().parents[1] / "data" / "sync" / "fixtures"
D.mkdir(parents=True, exist_ok=True)
URL = "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=FAKE"


def w(name, obj):
    (D / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


w("sources.json", {"note": "가짜 소스 (점검·시연용). 실제 목록은 data/sync/sources.json", "sources": [
    {"id": "fake-tour", "name": "한국관광공사 TourAPI (가짜)", "kind": "api", "provider": "fixture", "file": "tour.json", "grade": 1, "every": "1d"},
    {"id": "fake-standard", "name": "전국관광지 표준데이터 (가짜)", "kind": "api", "provider": "fixture", "file": "standard.json", "grade": 1, "every": "7d"},
    {"id": "fake-festival", "name": "한국관광공사 행사·축제 (가짜)", "kind": "api", "provider": "fixture", "file": "festival.json", "grade": 1, "every": "1d"},
    {"id": "fake-licence", "name": "동해시 일반음식점 인허가 (가짜)", "kind": "api", "provider": "fixture", "file": "licence_1.json", "grade": 1, "every": "7d"},
    {"id": "fake-blog", "name": "여행 블로그 (가짜)", "kind": "community", "provider": "fixture", "file": "blog.json", "grade": 3, "every": "7d"},
]})
w("tour.json", {"items": [
    # 전화만 바뀜 → 자동 반영 + 되돌리기
    {"place_id": "cave", "field": "phone", "value": "033-539-3700", "url": URL, "evidence": "tel: 033-539-3700"},
    # 같은 값 → 변경 없음 (마지막 확인만 오늘로)
    {"place_id": "cave", "field": "address", "value": "강원특별자치도 동해시 동굴로 50", "url": URL, "evidence": "addr1: 강원특별자치도 동해시 동굴로 50"},
    # 좌표 약 30m → 자동 / 약 120m → 검수
    {"place_id": "nongol", "field": "coord", "value": [37.55243, 129.11830], "url": URL, "evidence": "mapy,mapx: 37.55243,129.11830"},
    {"place_id": "haeamjeong", "field": "coord", "value": [37.48010, 129.15910], "url": URL, "evidence": "mapy,mapx: 37.48010,129.15910"},
    # 운영시간 (관리자가 직접 고친 값과 다르면 충돌, 아니면 검수)
    {"place_id": "mureung", "field": "hours", "value": "09:00~18:00", "url": URL, "evidence": "usetime: 09:00~18:00"},
    {"place_id": "pencil_museum", "field": "hours", "value": "10:00~17:00", "url": URL, "evidence": "usetime: 10:00~17:00"},
    # 공식 데이터라도 무장애 정보는 자동 금지
    {"place_id": "haeamjeong", "field": "access.wheelchair", "value": "가능", "url": URL, "evidence": "wheelchair: 대여 가능"},
    # 표준데이터와 값이 다름 → 불일치
    {"place_id": "pencil_museum", "field": "phone", "value": "033-532-1011", "url": URL, "evidence": "tel: 033-532-1011"},
]})
w("standard.json", {"items": [
    {"place_id": "pencil_museum", "field": "phone", "value": "033-532-1012", "url": "https://www.data.go.kr/FAKE", "evidence": "관리기관전화번호: 033-532-1012"},
]})
w("festival.json", {"items": [
    {"place_id": None, "field": "event", "value": {"name": "동해 무장애 해변 걷기 축제 (가짜)", "start": "2099-05-01", "end": "2099-05-03", "venue": "망상해변", "tel": "033-530-0000"},
     "url": "https://korean.visitkorea.or.kr/detail/fes_detail.do?cotid=FAKE", "evidence": "동해 무장애 해변 걷기 축제 20990501~20990503"},
    {"place_id": None, "field": "event", "value": {"name": "이미 끝난 행사 (가짜)", "start": "2020-01-01", "end": "2020-01-02"}, "evidence": "지난 행사"},
]})
names = ["가짜식당A", "가짜식당B", "가짜식당C", "가짜폐업식당"]
w("licence_1.json", {"licence": names})
w("licence_2.json", {"licence": names[:3]})   # 한 번 빠짐
w("licence_3.json", {"licence": names[:3]})   # 두 번 연속 빠짐 → 폐업 의심
w("blog.json", {"items": [
    {"place_id": "haeamjeong", "field": "access.wheelchair", "value": "가능", "url": "https://blog.example.com/fake", "evidence": "휠체어로 다 갈 수 있어요!"},
    {"place_id": "cave", "field": "hours", "value": "09:00~20:00", "url": "https://blog.example.com/fake2", "evidence": "저녁 8시까지 한대요"},
]})
print("가짜 소스 →", D)
