# 동해 길동무 (Donghae Gildongmu)

가보기 전에 '갈 수 있는 길'인지 알려 주는 동해 여행 코스 웹서비스.
2026 한림 G-Lab@동해 AI 활용 지역문제해결 해커톤 · 팀 동해물과 백두AI

- 화면 디자인 기준: 프로토타입 v2 (claude.ai 아티팩트 '동해 길동무 프로토타입')
- 계획·역할·일정: '동해 길동무 본선 구현 계획' 문서
- 장소 목록·답사표: '동해 길동무 데이터·답사 시트' 문서

## 구조

```
backend/            FastAPI 서버 (추천 엔진, AI 호출, 공공 API 중계, 제보)
  app/engine.py     장소 판정(법 기준+팀 규칙)과 코스 조립
  app/llm.py        AI 작업 4가지 + AI 없을 때 규칙 기반 대체
  app/talk.py       대화형 동이 (/api/talk): LLM 도구 호출 + 키 없을 때 규칙 대화
  app/public_data.py  공공데이터 파일(관광·교통·편의) 연결
  app/prompts/      AI 프롬프트 4종 (구조화 / 조건 해석 / 대화 수정 / 추천 이유)
  app/public_apis.py  국립중앙의료원(병원·약국·응급실), 기상청 단기예보
frontend/           Next.js 웹 화면 (코스 만들기 최소 구현, 카카오맵, 한/영)
  i18n/ko.json, en.json   화면 문구 93개
  public/dongi/     마스코트 동이 포즈 7종
scripts/            데이터 수집·정리 스크립트 (팀 컴퓨터에서 실행)
data/               장소 목록, 예시 데이터, 번역표, 답사 CSV 양식
tests/ai_cases.json 추천·대화 규칙 검사 20세트
```

## 처음 실행하기 (키 없이 예시 데이터로)

```bash
# 1) 백엔드 (Python 3.10 이상)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# 브라우저에서 http://localhost:8000/docs 를 열면 API를 직접 눌러 볼 수 있다

# 2) 프론트엔드 (Node 18 이상) - 새 터미널
cd frontend
npm install
npm run dev
# http://localhost:3000
```

## 키 넣기

1. 루트의 `.env.example` 을 복사해 `.env` 로 만들고 값을 채운다. (`.env` 는 절대 GitHub에 올리지 않는다)
2. 카카오맵 키는 `frontend/.env.local` 에 `NEXT_PUBLIC_KAKAO_JS_KEY=...` 로 넣는다.
3. `http://localhost:8000/api/health` 에서 `llm`, `public_api` 가 true 인지 확인한다.

## 공공데이터 파일 넣기 (키 없이 가능)

`data/public/raw/` 에 CSV를 넣고 `python scripts/ingest_public.py` → 자세한 내용은 `data/public/README.md`.

## 실제 데이터 만들기 (키 발급 후)

```bash
python scripts/collect_tourapi.py --limit 5   # 먼저 5곳만 시험
python scripts/collect_tourapi.py             # 동해시 전체
python scripts/structure_memos.py             # AI가 무장애 메모 정리 → data/review_memos.csv 검수(approve 칸)
# 답사 후: '데이터·답사 시트'의 입력표를 CSV로 내려받아 data/survey.csv 로 저장
python scripts/build_places.py                # → data/places.json (서버가 자동으로 이 파일을 씀)
python scripts/travel_matrix.py               # 장소 사이 이동 시간표
python scripts/eval_ai.py                     # 규칙 검사 20세트, 실패 0건이어야 함
python scripts/eval_talk.py                   # 대화 검사 10세트 (키를 넣은 뒤에도 돌려 볼 것)
```

## 판정 규칙 (휠체어 기준)

| | 가능 | 주의 | 불가 |
|---|---|---|---|
| 기울기 | 4.8° 이하 (1/12) | 4.8~7.1° | 7.1° 초과 (1/8) |
| 턱 | 2cm 이하 | 2~5cm | 5cm 초과 |
| 폭 | 1.2m 이상 | 0.9~1.2m | 0.9m 미만 |
| 계단 | 없음 | 있지만 대체 경로 | 대체 없는 계단 |

법 기준(장애인등편의법 시행규칙 별표 1) + 팀 규칙. 유모차·오래 걷기 어려움은 `engine.grade_segment` 참고.

## 남은 일 (TODO)

- [ ] 관광지·추천 코스·후기 섹션을 프로토타입 v2에서 `frontend/app` 으로 옮기기
- [ ] 1박 2일을 날짜별로 나누고 숙박 넣기 (지금은 하루로 이어 붙임)
- [ ] 출발 시각 고르기 (지금 10:00 고정)
- [ ] 장소 상세 팝업(구간 신호등·출처), 제보 화면, 관리자 리포트 화면
- [ ] 국립중앙의료원 위치기반 목록에 운영시간이 없으면 기관 상세 조회 추가
- [ ] 배포: 프론트 Vercel, 백엔드 Render/Railway (대회 후 30일 유지)

## 데이터 출처

한국관광공사 TourAPI(무장애 여행 정보, 국문·영문 관광정보), 국립중앙의료원 병·의원·약국·응급의료기관 정보, 기상청 단기예보, 동해시 관광 누리집 5대 권역 안내. 공공누리 이미지는 유형(1·3유형)을 확인하고 출처를 표시한다.
