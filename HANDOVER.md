# HANDOVER — 동해 길동무 (2026-11-20 밤, 서비스 전반 개선 1~5단계 후)

> **이 맨 위 칸을 먼저 읽으세요.** 아래 '## 0. 기본 정보'부터는 예전 인수인계 내용(빌드·점검 명령, 규칙)이에요.

## ★ 지금 상태 한눈에 (2026-11-20 밤, 서비스 전반 개선)

- 마지막 배포(Render live): **7af41da** (관리자 정리·AI로 작업하기·가상 데이터 수정)
- 그 뒤 **서비스 전반 개선 1~5단계 커밋 5개, push·배포 전**: 계획·결과는 `docs/21_IMPROVEMENT_PLAN.md`(맨 아래 '이미지 번호별' 표), 자세히는 `docs/12_CHANGELOG.md` 끝 '개선 1~5단계'
  1. 추천 정확성: 어르신 모드 불가 유지, 선택 구간(`Segment.optional`)·접근 범위(`Place.access_scope`), 공식 요금(`fee_detail`·관리자용 `verify`), 관광지 상세 배치(그림 단추 → 판정 → 운영시간)
  2. 대화: 앞 답을 따라가는 질문·반응, '쓸 수 있는 시간'(`budget_min`)·'필요한 것'(`toilet_first` 등), 이동 방법 → 출발지(동해종합버스터미널 추가)
  3. 화면: 3번 사진 CSS 충돌, 청각장애 항목 제거, 떠 있는 동이 하나, 홈 추천 코스 삭제
  4. 관리자: 공지·알림 한 탭, 받은 글(문의+제보) 한 탭, 장소 정보 옆 AI 간단 작업(`/api/admin/ai/tidy`)
  5. 데이터: 문장 객관형 약 210곳, 공식 요금 30곳, 공식 휠체어 정보 반영
- 점검(마지막 실행): 7가지 모두 실패 0건(대화 평가에 시나리오 A~D 포함), 서버·데모 diffs 0(비교 사례 20개), 타입 검사 통과
- 팀장 결정: 수동·전동 휠체어는 구분하지 않음

- 2026-11-21 추가(커밋, push·배포 전): 이동 난이도 5단계(`docs/22_ACCESS_GRADING.md`), ODsay 대중교통·TAGO 정류장 연결, OSM 노면, 불편 알리기 이동 유형 고르기, 날짜 카드 — CHANGELOG 맨 끝
- **키 설정 필요**: Render 환경변수에 `ODSAY_API_KEY` 추가(ODsay 콘솔에서 서버 키 등록 방식 확인 — Render는 나가는 IP가 바뀔 수 있음). TAGO는 `DATA_GO_KR_KEY`로 부름(버스정류소정보 활용신청 확인). 브이월드 키는 아직 쓰는 곳 없음

## ★ 다음에 할 일

1. 팀장이 "올려 줘" 하면 `git push origin main` → Render Manual Deploy → Clear build cache & deploy → 실제 사이트 확인(관광지 상세·코스 대화·관리자 공지·알림/받은 글/AI 간단 작업)
2. 데이터를 받으면: ODsay 키(`ODSAY_API_KEY`, 실제 대중교통 길찾기), 구간 측정값(현장 조사원 계정), 경사-속도 연구 PDF → `docs/21_IMPROVEMENT_PLAN.md` '아직 못 한 것'
3. 팀 확인: 묵호등대·추암 출렁다리 운영시간(공식과 다름), 삼화사 요금(공식끼리 다름), 동굴 장애인 요금
- 로컬 서버: `http://localhost:8765`는 예전 세션이 띄운 것(예전 코드). 새 코드 확인은 다른 포트에 따로 띄워서 했음

---

# (예전 인수인계) 동해 길동무 (2026-11-21 기준)

다음에 이 프로젝트를 이어받는 사람(또는 Claude 세션)이 이 파일 하나로 상황을 알 수 있게 정리했어요.
자세한 변경 내용은 `docs/12_CHANGELOG.md`, AI 기능 설계는 `docs/17_AI_FEATURES.md`, 멘토링 준비는 `docs/18_MENTORING_PREP.md`, **시(市)를 위한 불편 제보 기능은 `docs/19_CITY_REPORTS.md`**.

## 0. 기본 정보

- 서비스: 이동이 불편한 사람(휠체어·유모차·어르신)을 위한 동해 여행 코스·무장애 정보 웹
- 실제 사이트: https://donghae-gildongmu.onrender.com (2026-11-20 사이트 비밀번호 잠금 해제 — 누구나 접속. 다시 잠그려면 Render 환경변수 `SITE_PASSWORD` 추가)
- 데모: GitHub Pages (`docs/` 폴더, 서버 없이 브라우저에서 같은 엔진을 JS로 실행)
- 저장소: github.com/yangggu-1218/donghae-gildongmu, 브랜치 `main`
- 지금 배포된 버전: **3d5d520** (Render, 2026-11-20 15:36 live)
- 구조: React+TS 화면(esbuild로 묶음) / Python FastAPI 서버 / Claude API(anthropic SDK) / 카카오맵 / 공공데이터 JSON 파일

### 지켜 온 규칙
- 기능은 지우지 않음(순서·모양·문구만 바꿈)
- **GitHub push·Render 배포는 팀장이 "올려 줘"라고 할 때만**
- API 키·비밀번호는 코드·커밋·채팅에 쓰지 않음 (Render 환경변수에만)
- 서버 엔진 `backend/app/engine.py`와 데모 `build/api.js`는 같은 규칙 → 둘 다 고치고 결과 비교(diffs 0)
- 변경은 `docs/12_CHANGELOG.md` 끝에 한국어로 기록

### 빌드·점검 명령 (Git Bash)
```bash
export PYTHONUTF8=1 K=<카카오 JS 키>
(cd frontend && node_modules/.bin/tsc --noEmit -p .)
(cd build && py gen_data.py && MODE=server KAKAO_JS_KEY=$K node build.mjs) && py build/make_pages.py server   # 서버 화면 web/
(cd build && KAKAO_JS_KEY=$K node build.mjs) && py build/make_pages.py                                     # 데모 docs/
export AI_COURSE=0; (cd build && HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 py py_run.py > py.json 2>/dev/null && node js_run.mjs > js.json 2>/dev/null && py cmp.py)   # → diffs: 0
py scripts/eval_talk.py            # → 실패 0건
py tests/test_admin_accounts.py    # → 관리자 점검 실패 0건
unset AI_COURSE; py tests/test_ai_features.py   # → AI 점검 실패 0건 (가짜 Claude, 비용 없음)
py tests/test_city_reports.py   # → 제보 점검 실패 0건 (가짜 Claude, 임시 폴더)
py tests/test_auto_sync.py     # → 자동 갱신 점검 실패 0건 (가짜 소스 data/sync/fixtures)
py tests/test_route_weather.py  # → 길찾기·날씨 점검 실패 0건 (가짜 카카오·기상청 응답, 네트워크 없음)
py scripts/make_sample_reports.py   # 가상 제보 18건 원본 다시 만들기 (data/sample_reports/)
```
배포: Render 대시보드 → 서비스 srv-dbs8ak142hec738upbpg → Manual Deploy → **Clear build cache & deploy** → Events에서 "Deploy live" 확인.

## 1. 지금까지 진행한 작업 (요약)

| 날짜 | 커밋 | 내용 |
|---|---|---|
| 11-18 | 64dd905 ~ 7182df2 | 첫 화면·코스 짜기 기본, 카카오맵 경로, 여행 기간, 예시 판정 표시, 숙소 예약 링크 |
| 11-19 | 159dc96 ~ 2ccf094 | 디자인·접근성 개선, 마스코트 교체, 사진 32장+, 관리자 계정·권한, 커뮤니티 '다녀온 길', 편의시설 지도 개편, 이 기기 로그인·프로필 |
| 11-20 | c70014b ~ 01340f2 | 시연용 임시 로그인, 약국·병원 실데이터, 대화로 고르는 코스·차 없이 다니기 |
| 11-20 | 67dcfdc | 열린관광 무장애 정보 28곳·아이콘, 관광지 상세 새 배치, 관광지 목록 무장애 검색·필터 |
| 11-20 | c1595d8 | 개발자 테스트 피드백(BUG 6건·IMP) 반영 |
| 11-20 | 4d02613 | **AI 기능 3가지**(코스 설계 에이전트·접근성 판정관·최근 길 상태+관리자 승인), Sonnet 선택, 지도 숫자 묶음·내 위치, 새 6곳 사진 13장·소개 |
| 11-20 | 3d5d520 | 묵호등대 운영시간 09:00~17:00, 개인 촬영자 사진 2장 사용 허락 반영 |
| 11-20 | 6406f23 (push·배포 전) | **AI 요청 수 제한**(같은 주소 10분 20번·하루 $2, 넘으면 규칙으로) + **사용량 파일**(`ai_usage.json`, 날짜별) + 관리자 [AI 설정]에 오늘 사용량·한도 표시 |
| 11-21 | 77a14a7 (push·배포 전) | **정보 밀도·픽토그램**(AI 판정 카드·관광지 상세 줄이기), 코스 전 대화 메신저형, 긴급·도움 하나로, 빠른 메뉴·챗봇 단추 접힘, 관리자 탭 7개+[더 보기], **자료로 채우기(AI: 한글·PDF·링크 → 장소 정보 초안)**, 반응형 점검 — 자세히는 CHANGELOG 11-21 |
| 11-21 | f8410bd (push·배포 전) | **시(市)를 위한 기능 — 투트랙**: 이용자 '불편 알리기'(위치·그림 단추·사진 3장·접수번호·[내 제보]) → AI 제보 정리(Haiku: 사진 분석·분류·부서·우선순위) → 규칙 묶기 → 관리자 **[제보·민원]**(묶음 목록·처리 상태·분류 고치기·몰리는 곳 지도·기간 요약 + AI 보고서(Sonnet)·CSV·백업) → 이용자 답변·관광지 임시 알림. 공개 지도 '알려진 불편'. 가상 제보 18건 — 자세히는 `docs/19_CITY_REPORTS.md`, CHANGELOG 11-21 |
| 11-21 | (f8410bd 다음 커밋, push·배포 전) | **관광지 상세 다시 정리**: 판정 한 줄·이용 정보 띠를 첫 화면에, 같은 정보 한 번만, 자세한 것은 접기·링크로(빠진 것은 어디서 보는지 CHANGELOG에), 정보 출처 맨 아래 한곳 |
| 11-21 | (같은 커밋, push·배포 전) | **자동 정보 갱신 0~1단계** (AI 없이): 공식 API·인허가 비교 → 전화·주소·좌표(50m)·행사 자동, 나머지 검수, 무장애 자동 금지, 충돌·불일치·폐업 의심, 관리자 [자동 갱신], GitHub Actions 예약 실행 — `docs/20_AUTO_SYNC.md` |
| 11-21 | (다음 커밋) | 첫 화면 '사진 속 장소'·예시 문장 단추 빼기 (1fac3f1) · **gangRG님 변경 반영**: 카카오 실제 길찾기(3번 상한·8초 상한)·장소별 시간대 날씨·AI 코스 먼저 조회한 후보·동이 화장실·역 좌표·지도 키 서버에서·코스 결과 화면(경로 지도·공식 길찾기·여행 설정)·코스 준비 화면·후보 미리 보기(규칙만) |
| 11-20 | (8abbc9b 다음 커밋, 배포) | 첫 화면 새 디자인·동이 메뉴·시각장애 내용 빼기, 관광지 상세 새 화면, 관리자 정리·**AI로 작업하기**·모의 데이터·홈 코스 짜기 칸, 버그 검토 5건(가상 데이터 공개 차단·문의 분리·내 계정/현장 기록 되살림·데모·identify) |

### AI 기능 (4d02613) 핵심
- 공통 모듈 `backend/app/ai.py`: 작업별 모델(기본 Haiku 5.5, 코스 설계·판정은 Sonnet 5.5), Sonnet은 서버 측 대체(fallbacks) 켬, 결과 캐시, 사용량·비용 집계
- 모든 AI 기능은 실패(키 없음·오류·거절) 시 규칙으로 대신. AI 답은 서버가 다시 검사(휠체어 R·숙박·없는 장소 빼기, 근거 없는 판정 낮추기, 형식 틀린 제안 버리기)
- AI 제안은 관리자 [AI 제안] 탭에서 승인해야 반영, 변경 이력·되돌리기 가능. [AI 설정]에서 작업별 모델 변경(총괄 관리자만)
- 데모에는 AI가 없어 카드가 숨겨지고 관리자 AI 탭은 '연결 안 됨'

## 2. 이번 작업에서 수정된 파일 (c1595d8 이후)

**새 파일**
- `backend/app/ai.py`, `ai_course.py`, `ai_judge.py`, `ai_status.py` — AI 공통 모듈과 기능 3가지
- `frontend/components/AiCards.tsx` — 관광지 상세 'AI 판정'·'최근 길 상태' 카드
- `tests/fake_claude.py`, `tests/test_ai_features.py` — 가짜 Claude로 하는 AI 점검(29가지)
- `docs/17_AI_FEATURES.md` — 전문가 회의·설계·비용, `docs/18_MENTORING_PREP.md` — 멘토링 준비
- 사진: `frontend/public/photos/` 및 `docs/photos/`의 bongjeong_lotus·culture_center·bukpyeong_church·mukho_market·gawon·yakcheon (500px·960px)

**고친 파일**
- `backend/app/main.py` — AI API(`/api/ai/judge/{id}`, `/api/places/{id}/status`, `/api/place-notes`, `/api/admin/ai/*`), 코스에 `planner`. `ai_status` 모듈은 `ai_stat`으로 불러옴(같은 이름의 함수와 충돌했던 것 해결)
- `backend/app/talk.py`, `llm.py` — 기존 대화·AI 호출을 공통 모듈로
- `backend/app/cms.py` — 편의시설 목록 필드, AI 모델 설정 저장
- `backend/app/kto_access.py` — 새 6곳 소개·휠체어 정보
- `backend/requirements.txt` — `anthropic>=2.11,<3`
- `build/api.js` — 데모가 새 AI 주소에 '없음'으로 답하게
- `frontend/components/Pages.tsx`(상세에 AI 카드·지도), `KakaoMap.tsx`(숫자 묶음·내 위치 빨간 점), `Admin.tsx`([AI 제안]·[AI 설정] 탭), `Community.tsx`(길 메모를 서버에도 보냄), `frontend/app/page.tsx`(AI 코스 안내 말), `globals.css`, `frontend/lib/api.ts`, `frontend/lib/photos.ts`, `frontend/i18n/ko.json`·`en.json`
- `data/place_details.json` — 묵호등대 09:00~17:00(마지막 입장 16:30)
- `docs/09_ASSET_LICENSES.md`, `docs/12_CHANGELOG.md`, 빌드 결과 `web/index.html`·`docs/index.html`

**배포 뒤 추가한 문서 (아직 커밋 안 함)**
- `docs/18_MENTORING_PREP.md` — 멘토링 준비: 2분 소개, 기술 구조, 약점 8가지, 질문 14개, 시간 배분, 예상 질문. 8장에 **소프트웨어 전공 멘토께 보여 드릴 기술 설명 순서(5~7분)**, 9장에 **구조도 이미지용 GPT 프롬프트**
- `HANDOVER.md` — 이 파일

**11-21 작업은 커밋했지만 push·배포 전** (위 표 11-21 줄). `backend/requirements.txt`에 `olefile` 추가 → 배포 때 Render가 설치.

**커밋은 했지만 아직 push·배포 안 한 것**: (위 두 문서는 0f4308f로 커밋됨) AI 요청 수 제한·사용량 파일 작업 — `backend/app/ai.py`·`llm.py`·`talk.py`·`main.py`, `frontend/components/Admin.tsx`, `tests/test_ai_features.py`, `.gitignore`, `.env.example`, `docs/12_CHANGELOG.md`, 빌드 결과 `web/index.html`·`docs/index.html`, 이 파일. 그 밖에 `build/package-lock.json`, `data/cache/`, `frontend/tsconfig.tsbuildinfo`는 일부러 커밋하지 않음.

## 3. 해결 중인 에러·확인 못 한 것

1. ~~실제 사이트 AI 확인~~ → **11-20 확인 완료**: 판정관(무릉별유천지·휠체어) Sonnet, 10초, 'Y·확신 보통'·근거 3개, 약 $0.014(20원). AI 코스(부모님·오래 걷기 어려움) Sonnet, 14초, 4곳(도째비골→망상→식당→카페)·고른 이유, 약 $0.022(30원). 남은 확인: 코스 사용량이 '1회 호출'로만 잡혀 에이전트가 도구를 실제로 몇 번 썼는지는 서버 기록으로 한 번 볼 것
2. **저장이 날아갈 위험 (중요)** — `render.yaml`은 Starter 요금제+디스크(`/var/data`)를 가정하지만 실제 서비스는 **Free 요금제**라 디스크가 없음. 관리자 수정(cms.json)·제보·AI 제안이 재배포·재시작 때 사라질 수 있음. 해결: Render 유료 디스크 또는 외부 DB(Postgres 등)로 옮기기 — 멘토링에서 물어볼 질문 A1
3. ~~AI 사용량은 메모리에만~~ → 11-20 `ai_usage.json`에 남김(`CMS_FILE` 옆). 단 Render Free는 디스크가 없어 **재배포 때는 여전히 0부터** (2번과 함께 해결)
4. ~~AI 요청 수 제한 없음~~ → 11-20 넣음 (`backend/app/ai.py`의 `gate`). 같은 접속 주소 10분에 20번, 하루 추정 $2. 값은 Render 환경변수 `AI_RATE_PER_IP`·`AI_RATE_WINDOW`·`AI_DAILY_USD`로 바꿈. 접속 주소는 `x-forwarded-for` 첫 값이라 꾸며 낼 수 있음 → 진짜 방어선은 하루 비용 상한

5. **제보 기능은 저장이 특히 중요** (11-21) — 지금(Free)은 관리자 [제보·민원] 맨 위에 '지워질 수 있어요' 경고가 뜨고 [설정·백업]에서 zip으로 내려받기·올리기를 할 수 있음. 권장: Render Starter + 디스크(월 약 $7.25)로 바꾸고 환경변수 `STORAGE_PERSISTENT=1`. 정식 운영은 시 서버·DB로 — `backend/app/reports_store.py`만 바꾸면 됨 (`docs/19_CITY_REPORTS.md` 5장)
6. **제보 기능 실제 AI 미확인** (11-21) — 로컬에 키가 없어 가짜 Claude 점검(50가지)만 함. 배포 뒤 사진 1장으로 제보해 [제보·민원]에 'AI' 정리가 뜨는지, [기간 요약 › AI 보고서 만들기]가 Sonnet으로 나오는지, [AI 설정]의 비용 확인
7. 제보 연락처 자동 삭제(`reports_store.purge_contacts`)는 함수만 있고 **자동으로 부르지는 않음** — 하루 한 번 부르는 방법(서버 시작 때·관리자 단추) 정하기
8. 부서 이름은 예시(도로·교통·관광·화장실 관리·건물 편의시설·민원 총괄) — 시 실제 부서명으로 관리자 [제보·민원 › 설정·백업]에서 바꾸기(총괄 관리자)

9. **자동 갱신 실제 API 미확인** (11-21) — 로컬에 공공데이터 키가 없어 가짜 소스로만 점검. 배포 뒤 관리자 [더 보기 › 자동 갱신 › 지금 실행]으로 TourAPI 응답과 장소 짝짓기(이름 비교)가 맞는지, 잘못 짝지어진 곳이 없는지 확인
10. 자동 갱신 예약 실행은 비밀값(`SYNC_TOKEN`·`SYNC_URL`)을 넣기 전까지 꺼져 있음 (워크플로가 건너뜀)

11. **카카오 설정 (gangRG님 변경 반영, 11-21)** — Render 환경변수에 `KAKAO_REST_API_KEY`(카카오 REST API 키)를 넣어야 실제 길찾기가 켜짐(없으면 추정 이동시간). `KAKAO_JS_KEY`는 선택(지금 빌드에 JS 키가 들어 있어 없어도 지도는 뜸). 카카오 개발자센터: ① 내 애플리케이션 › 카카오맵/카카오모빌리티 **자동차 길찾기(Directions) API 사용 설정** ② 플랫폼 › Web 사이트 도메인에 `https://donghae-gildongmu.onrender.com`·`http://localhost:8765`(로컬)·GitHub Pages 주소. 키 값은 코드·채팅에 쓰지 않기
12. **보류(팀 결정)**: 예시 데이터 장소(p.sample)를 코스에서 빼는 변경 — 지금 `sample=True` 장소는 **0곳**이라 빼도 코스는 그대로(일반·휠체어·유모차·오래 걷기 모두 후보 수·평균 장소 수 변화 없음). 따로 '길 정보가 예시'인 장소 5곳(무릉별유천지·도째비골 스카이밸리·해랑전망대·묵호항·연필뮤지엄)은 이 필터와 관계없음

## 4. 남은 할 일

- [x] 실제 사이트에서 AI 판정·코스 확인 + 비용 확인 (11-20). 길 상태 요약은 제보가 쌓이면 확인
- [ ] **모델 원칙 바꾸기 — 팀장이 "나중에" 하기로 함**: "최대한 Haiku, 어려운 처리(여러 단계로 스스로 찾고 점검하는 코스 설계)만 Sonnet". 할 일은 `backend/app/ai.py`의 TASKS에서 `judge`를 `fast`로, `build/api.js`의 데모 목록도 같이, `tests/test_ai_features.py`의 Sonnet 확인 대상을 `course`로, `docs/17_AI_FEATURES.md` 표 수정. (관리자 [AI 설정]에서 화면으로 바꿀 수도 있음)
- [ ] 저장소 문제 결정(유료 디스크 vs DB) — 멘토링 뒤
- [ ] 일반 이용자 로그인·커뮤니티 글을 서버 저장으로(지금은 브라우저 localStorage에만)
- [x] AI API 요청 수 제한, 사용량을 파일에 남기기 (11-20 커밋, 아직 push·배포 전 — 팀장이 "올려 줘" 하면 push·배포 후 실제 사이트 [AI 설정]에서 '오늘' 줄 확인)
- [ ] 테스트 자동 실행(GitHub Actions) — 이제 점검 6가지(+ 자동 갱신)(대화·관리자·AI·제보·서버/데모 비교)
- [ ] 제보 기능 2차(`docs/19_CITY_REPORTS.md`): 사진 속 얼굴·번호판 가리기(모자이크), 동이 대화에서 '여기 턱이 높아요' → 폼 채워 열기, 외부 민원 시스템 연동(지금은 CSV), 연락처 자동 삭제 일정
- [ ] 자동 갱신 2단계(공식 홈페이지 AI 추출·예약 변경·임시 휴무 알림)·3단계(커뮤니티 신호·상세 '마지막 확인')·4단계(승인률 제안) — `docs/20_AUTO_SYNC.md` 7장
- [ ] 배포 뒤: 관리자 [제보·민원 › 설정]에서 가상 제보를 넣어 시연하고, 끝나면 [가상 데이터 모두 지우기]
- [ ] 아직 '예시' 길 정보인 장소들 현장 확인
- [ ] 대회 뒤: `DEMO_LOGIN`을 "0"으로 (`SITE_PASSWORD`는 11-20에 이미 지움), '출처 확인 중' 사진들 출처 확인(`docs/09_ASSET_LICENSES.md`)
- [ ] 구조도 이미지 만들기 (팀장이 GPT로, 프롬프트는 `docs/18_MENTORING_PREP.md` 9장)
- [ ] 멘토링 전: 사이트를 미리 열어 서버 깨우기, 관리자 [AI 제안]·[AI 설정] 열어 두기, 터미널에서 `py tests/test_ai_features.py` 실행 준비
- [ ] 멘토링(`docs/18_MENTORING_PREP.md`)에서 들은 답을 할 일로 정리
- [ ] `docs/18_MENTORING_PREP.md`와 `HANDOVER.md` 커밋 (팀장이 올리라고 할 때)
