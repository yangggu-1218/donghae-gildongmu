# 12. 변경 기록

## 2026-11-15 — 1단계: 메인 페이지 개편
- 히어로: 마스코트 그림 → 추암 촛대바위 실제 사진 배경 + 입력창 + '사진 속 장소' 판정 카드(서버 데이터)
- 숫자 띠 추가: 길을 확인한 관광지 / 장애인 화장실 / 급속충전기 / 공영주차장 수 (서버 데이터에서 셈)
- '권역으로 둘러보기' 사진 타일 5개 추가, `#/places/<권역>` 주소로 해당 권역이 바로 열림
- 예시 코스 카드에 사진 추가
- '떠나기 전에 확인하세요' 링크 카드 5개 추가 (교통·편의시설 지도·행사 달력·숙소·여행 준비)
- 사진을 못 불러오면 깨진 아이콘 대신 그림·바탕색이 보이게 함, 큰 화면용 960px 사진 추가
- 대화창의 'AI 답변' 표시 제거
- 수정 파일: frontend/components/Sections.tsx, frontend/app/page.tsx, frontend/app/globals.css, frontend/lib/photos.ts, data/photos.csv, web/index.html

## 2026-11-15 — 2단계: 관광지 목록·장소 상세, 팀 제공 사진
- 팀 제공 사진 9장을 `frontend/public/photos/`에 WebP(500px·960px)로 저장하고 적용: 도째비골 스카이밸리, 해랑전망대, 무릉별유천지, 묵호등대 대표 사진과 추가 사진 5장
- 관광지 목록: 이름·시설 검색창 추가(모든 권역에서 찾음), 기준을 고르면 갈 수 있는 곳이 먼저 나오게 정렬, 카드 사진 비율 3:2로 확대
- 장소 상세: 대표 사진 아래 추가 사진 모음(설명 포함), 사진 틀이 화면을 덮던 문제 수정
- 행사 달력: 라벤더축제 카드에 사진 추가
- 출처 표: 출처가 없는 사진은 '확인 중'으로 표시
- 수정 파일: frontend/components/Sections.tsx, frontend/components/Pages.tsx, frontend/app/globals.css, frontend/lib/photos.ts, data/photos.csv, build/build.mjs, build/make_pages.py, web/, docs/
