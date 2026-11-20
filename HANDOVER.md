# HANDOVER — 동해 길동무 (2026-11-20 기준)

다음에 이 프로젝트를 이어받는 사람(또는 Claude 세션)이 이 파일 하나로 상황을 알 수 있게 정리했어요.
자세한 변경 내용은 `docs/12_CHANGELOG.md`, AI 기능 설계는 `docs/17_AI_FEATURES.md`, 멘토링 준비는 `docs/18_MENTORING_PREP.md`.

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

**아직 커밋 안 한 것**: 위 두 문서. 그 밖에 `build/package-lock.json`, `data/cache/`, `frontend/tsconfig.tsbuildinfo`는 일부러 커밋하지 않음.

## 3. 해결 중인 에러·확인 못 한 것

1. ~~실제 사이트 AI 확인~~ → **11-20 확인 완료**: 판정관(무릉별유천지·휠체어) Sonnet, 10초, 'Y·확신 보통'·근거 3개, 약 $0.014(20원). AI 코스(부모님·오래 걷기 어려움) Sonnet, 14초, 4곳(도째비골→망상→식당→카페)·고른 이유, 약 $0.022(30원). 남은 확인: 코스 사용량이 '1회 호출'로만 잡혀 에이전트가 도구를 실제로 몇 번 썼는지는 서버 기록으로 한 번 볼 것
2. **저장이 날아갈 위험 (중요)** — `render.yaml`은 Starter 요금제+디스크(`/var/data`)를 가정하지만 실제 서비스는 **Free 요금제**라 디스크가 없음. 관리자 수정(cms.json)·제보·AI 제안이 재배포·재시작 때 사라질 수 있음. 해결: Render 유료 디스크 또는 외부 DB(Postgres 등)로 옮기기 — 멘토링에서 물어볼 질문 A1
3. AI 사용량(USAGE)은 서버 메모리에만 있어 재시작하면 0부터 셈
4. AI API 요청 수 제한이 없음 → 반복 호출 시 비용 증가 가능(사이트 잠금을 풀었으므로 누구나 부를 수 있음 — 비용을 [AI 설정]에서 지켜볼 것)

## 4. 남은 할 일

- [x] 실제 사이트에서 AI 판정·코스 확인 + 비용 확인 (11-20). 길 상태 요약은 제보가 쌓이면 확인
- [ ] **모델 원칙 바꾸기 — 팀장이 "나중에" 하기로 함**: "최대한 Haiku, 어려운 처리(여러 단계로 스스로 찾고 점검하는 코스 설계)만 Sonnet". 할 일은 `backend/app/ai.py`의 TASKS에서 `judge`를 `fast`로, `build/api.js`의 데모 목록도 같이, `tests/test_ai_features.py`의 Sonnet 확인 대상을 `course`로, `docs/17_AI_FEATURES.md` 표 수정. (관리자 [AI 설정]에서 화면으로 바꿀 수도 있음)
- [ ] 저장소 문제 결정(유료 디스크 vs DB) — 멘토링 뒤
- [ ] 일반 이용자 로그인·커뮤니티 글을 서버 저장으로(지금은 브라우저 localStorage에만)
- [ ] AI API 요청 수 제한, 사용량을 파일에 남기기
- [ ] 테스트 자동 실행(GitHub Actions)
- [ ] 아직 '예시' 길 정보인 장소들 현장 확인
- [ ] 대회 뒤: `DEMO_LOGIN`을 "0"으로 (`SITE_PASSWORD`는 11-20에 이미 지움), '출처 확인 중' 사진들 출처 확인(`docs/09_ASSET_LICENSES.md`)
- [ ] 구조도 이미지 만들기 (팀장이 GPT로, 프롬프트는 `docs/18_MENTORING_PREP.md` 9장)
- [ ] 멘토링 전: 사이트를 미리 열어 서버 깨우기, 관리자 [AI 제안]·[AI 설정] 열어 두기, 터미널에서 `py tests/test_ai_features.py` 실행 준비
- [ ] 멘토링(`docs/18_MENTORING_PREP.md`)에서 들은 답을 할 일로 정리
- [ ] `docs/18_MENTORING_PREP.md`와 `HANDOVER.md` 커밋 (팀장이 올리라고 할 때)
