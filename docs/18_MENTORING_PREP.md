# 기술 멘토링 준비 — 동해 길동무 (웹 기능)

멘토링 자리에서 **① 우리 서비스를 2분 안에 설명하고 ② 솔직한 약점을 먼저 꺼내고 ③ 답을 들으면 바로 고칠 수 있는 질문**을 하는 것이 목표예요.
질문은 "어떻게 생각하세요?"보다 **"A와 B 중 무엇이 나을까요? 우리 상황은 이래요"** 처럼 고를 수 있게 물으면 답이 구체적으로 나와요.

---

## 1. 2분 소개 (외워 두기)

> 동해 길동무는 휠체어·유모차·어르신처럼 **이동이 불편한 사람도 동해를 여행할 수 있게 코스를 짜 주는 웹 서비스**예요.
> "누구와, 어떻게 움직이는지"를 대화로 물어보면, 영업시간·붐빔·**길 구간별 턱·경사·계단**까지 맞춰 하루 코스를 만들어 줘요.
> 관광지마다 휠체어/유모차/오래 걷기 어려움 기준으로 '편함·도움 필요·어려움'을 보여 주고, 주변 장애인 화장실·충전기·주차장을 지도에 보여 줘요.
> 최근에는 Claude API로 **AI가 직접 장소를 찾아 코스를 짜는 에이전트**, **근거를 읽고 판정하는 AI 판정관**, **이용자 제보를 정리해 관리자 승인으로 반영하는 기능**을 넣었어요.

## 2. 숙지할 기술 구조 (질문받으면 바로 답할 것)

| 부분 | 쓰는 것 | 한 줄 설명 |
|---|---|---|
| 화면 | React + TypeScript, esbuild로 묶음 | 한 페이지 앱(주소는 `#/places` 같은 해시 방식). 휴대폰 우선 |
| 서버 | Python FastAPI | 코스 계산 엔진(`engine.py`), 관리자·제보·AI API |
| AI | Claude API (공식 anthropic SDK) | 기본 Haiku 5.5(싸고 빠름), 코스 설계·판정은 Sonnet 5.5. 실패하면 규칙 엔진으로 대신 |
| 지도 | 카카오맵 JS SDK | 숫자 묶음(클러스터), 내 위치 |
| 데이터 | 공공데이터포털·한국관광공사 TourAPI·열린관광(무장애) + 팀 현장 조사 | 서버를 켤 때 JSON 파일로 읽음 (DB 없음) |
| 저장 | JSON 파일(관리자 수정 `cms.json`, 제보 `reports.jsonl`) | 일반 이용자 로그인·커뮤니티 글은 **브라우저(localStorage)에만** 저장 |
| 배포 | Render (Docker, 서버 1대) + GitHub Pages 데모 | 데모는 서버 없이 브라우저 안에서 같은 엔진을 JS로 돌림 |
| 점검 | 파이썬 점검 스크립트(관리자·AI·대화 평가), 서버↔데모 결과 비교 | AI 점검은 '가짜 Claude'로 돈 안 들이고 함 |

**자랑할 만한 점 (물어보면 말하기)**
- AI가 실패해도 서비스가 멈추지 않음: 모든 AI 기능에 규칙 대체 경로가 있고, 그걸 시험으로 확인함
- AI가 엉뚱한 답을 내도 서버가 걸러 냄: 휠체어에 어려운 곳·없는 장소·근거 없는 판정은 서버가 빼거나 낮춤
- AI 제안은 **사람이 승인해야** 사이트에 반영되고, 변경 이력·되돌리기가 있음
- 관리자 역할별 권한(총괄·편집자·조사원), 로그인 5회 실패 잠금, 비밀번호는 코드에 없음
- 서버 엔진과 데모 엔진의 결과가 같은지 자동 비교(diffs 0)

## 3. 솔직한 약점 (먼저 꺼내면 좋은 것)

1. **저장이 불안정함 (가장 큼)**: `render.yaml`은 유료 Starter + 디스크를 가정했는데 실제 서비스는 **Free 요금제**라 디스크가 없어요. 관리자가 고친 내용·제보·AI 제안이 **재배포나 재시작 때 사라질 수 있어요.** DB도 없어요.
2. **사용자 데이터가 브라우저에만 있음**: 일반 로그인·프로필·커뮤니티 글·댓글이 그 기기에만 저장돼 다른 사람에게 안 보이고 기기를 바꾸면 사라져요.
3. **같은 엔진을 두 번 관리**: 파이썬(서버)과 JS(데모)에 같은 규칙이 있어 고칠 때마다 둘 다 고쳐야 해요.
4. **AI 비용·남용 방지 부족**: 판정·코스 API를 누구나 부를 수 있어 반복 호출 시 비용이 늘 수 있어요. 요청 수 제한(rate limit)이 없어요. 사용량은 서버 메모리에만 있어 재시작하면 0이에요.
5. **무료 서버의 느린 첫 응답**: 한동안 안 쓰면 잠들어 첫 요청이 50초 넘게 걸릴 수 있어요.
6. **점검이 자동화돼 있지 않음**: 테스트는 손으로 돌리는 스크립트예요. GitHub에 올릴 때 자동으로 도는 CI가 없어요.
7. **화면 크기·구조**: 데모 묶음 파일이 약 2MB, 큰 화면 파일(Pages.tsx·page.tsx)이 길어요. 해시 주소라 검색엔진 노출(SEO)에 약해요.
8. **데이터 정확도**: 일부 장소는 아직 '예시' 길 정보예요. 현장 조사·제보로 채우는 중이에요.

## 4. 멘토님께 할 질문 (중요한 순서)

### A. 저장·데이터 (꼭 묻기)
1. "지금 JSON 파일 저장인데 Free 서버라 날아갈 수 있어요. **Render 유료 디스크 / Supabase·Neon 같은 무료 Postgres / Firebase** 중 우리 규모(관리자 몇 명, 제보 하루 수십 건)에 무엇이 맞을까요?"
2. "일반 이용자 로그인·커뮤니티를 서버로 옮기려면 **직접 회원가입을 만드는 것과 카카오 로그인(OAuth)** 중 무엇이 안전하고 빠를까요? 개인정보 처리방침은 어디까지 필요할까요?"
3. "공공데이터를 서버 켤 때 파일로 읽는데, **주기적으로 새로 받는 방법**(크론·GitHub Actions)은 무엇이 좋을까요?"

### B. AI 기능
4. "AI가 실패하면 규칙으로 대신하고, AI 답은 서버가 한 번 더 검사해요. 이 구조에서 **더 검사해야 할 부분**이 있을까요?"
5. "AI 비용을 막으려면 **요청 수 제한, 결과 저장(캐시), 로그인한 사람만 허용** 중 무엇부터 할까요?"
6. "AI 판정관의 답이 맞는지 **평가하는 방법**이 궁금해요. 정답 세트를 몇 개쯤 만들어야 의미가 있을까요?"
7. "Haiku와 Sonnet을 작업별로 나눴는데, 처음엔 Haiku로 하고 **어려울 때만 Sonnet으로 올리는 방식**이 실무에서 쓸 만한가요?"

### C. 구조·품질
8. "파이썬 엔진과 JS 데모 엔진을 둘 다 관리해요. **데모를 없애고 서버 하나로 갈지**, 엔진을 한쪽 언어로 합칠지 의견이 궁금해요."
9. "테스트를 자동으로 돌리려면 **GitHub Actions에 무엇부터** 넣으면 좋을까요? (타입 검사·파이썬 점검·서버/데모 비교)"
10. "화면 파일이 길어졌는데, **나누는 기준**(화면별/기능별)이 있을까요?"

### D. 접근성·사용성
11. "휠체어·시각장애 이용자를 위해 **스크린리더 점검을 어떤 도구로, 어디까지** 하면 될까요?"
12. "느린 첫 응답(서버가 잠듦)을 줄이는 **값싼 방법**이 있을까요?"

### E. 운영·발표
13. "대회 뒤 실제 운영하려면 **최소한으로 꼭 필요한 것**(보안·개인정보·모니터링) 세 가지만 꼽아 주신다면요?"
14. "심사위원이 기술 쪽에서 **가장 많이 묻는 질문**은 무엇일까요?"

## 5. 시간 배분 (60분 기준)

| 시간 | 할 일 |
|---|---|
| 0~5분 | 2분 소개 + 실제 사이트 시연(코스 짜기 → 관광지 상세 AI 판정 → 관리자 AI 제안) |
| 5~10분 | 약점 1~4번을 먼저 말하기 |
| 10~45분 | 질문 A → B → C 순서 (A1·B5·C9는 꼭) |
| 45~55분 | D·E 중 남은 것 |
| 55~60분 | 들은 내용을 '이번 주 / 대회 전 / 대회 후'로 나눠 다시 확인 |

## 6. 멘토가 물어볼 만한 것 (미리 답 준비)

- **"왜 AI를 썼나요? 규칙만으로는 안 되나요?"** → 규칙은 정해진 조건만 처리해요. AI는 "부모님이 무릎이 안 좋아요" 같은 말을 이해하고, 제보 글처럼 정리 안 된 정보를 읽어 판단해요. 그래도 안전을 위해 최종 걸러 내기는 서버 규칙이 해요.
- **"AI가 틀리면 책임은?"** → 판정에 확신도와 근거를 함께 보여 주고, "가기 전에 전화로 확인" 안내를 넣었어요. 사이트 정보는 관리자 승인 없이 AI가 바꾸지 않아요.
- **"비용은 얼마나 드나요?"** → Haiku는 한 번에 1원 안팎, Sonnet 코스 설계는 한 번에 약 130원 예상이에요. 같은 질문은 저장해 둔 답을 써요.
- **"데이터 출처와 저작권은?"** → 공공누리·한국관광공사 자료는 출처를 표시하고, 사진은 `docs/09_ASSET_LICENSES.md`에 정리했어요.
- **"개인정보는?"** → 제보·길 메모에 닉네임·연락처를 서버에 저장하지 않아요. 비밀번호와 API 키는 코드에 없고 서버 환경변수로만 넣어요.

## 7. 멘토링 전 체크리스트

- [ ] 실제 사이트 접속 확인(잠들어 있으면 미리 한 번 열어 깨우기), 사이트 비밀번호 준비
- [ ] 관리자 시연 계정으로 [AI 제안]·[AI 설정] 화면 열어 두기
- [ ] 휴대폰으로도 한 번 열어 보기
- [ ] 이 문서의 질문 중 꼭 물을 5개에 표시
- [ ] 메모할 곳 준비(들은 답을 바로 할 일로 바꾸기)

## 8. 소프트웨어 전공 멘토께 먼저 보여 드릴 기술 설명 (5~7분)

1. **한 장 구조도 (1분)** — 화면(React+TS, esbuild) → 서버(FastAPI: 규칙 엔진 `engine.py` + AI `ai.py` + 관리자 `cms.py` + 공공데이터 JSON) → Claude API·카카오맵. 데모는 같은 엔진을 JS로. "AI가 안 되면 규칙이 대신해요."
2. **요청 하나 따라가기 (2분)** — '코스 짜기': `frontend/app/page.tsx` `makeWith` → `POST /api/course` → `main.py` `plan_course` → `ai_course.py` (도구 `find_places`·`place_detail`·`check_plan`을 Claude가 스스로 부름, `check_plan`은 서버가 영업시간·점심 시간 계산) → 서버가 휠체어 R·숙박 빼기 → 실패하면 `engine.plan`, 응답에 `planner: ai/rule`
3. **핵심 로직 (1분)** — `engine.py` `grade_segment`: 경사·턱·계단·폭 측정값을 휠체어/유모차/오래 걷기 어려움마다 다른 기준으로 G/Y/R
4. **검증 (1분)** — 터미널에서 `py tests/test_ai_features.py` 실행해 보이기(가짜 Claude, "AI 점검 실패 0건"), 서버↔데모 결과 비교 diffs 0
5. **보안·운영 (30초)** — 역할별 권한, 로그인 5회 실패 잠금, 변경 이력·되돌리기, AI 제안은 사람 승인, 키는 환경변수
6. **약점으로 넘어가기** — 3장의 1~4번

예상 질문: 왜 DB가 없나(공공데이터 읽기 위주라 JSON으로 빠르게 시작 → 지금 약점) / 왜 esbuild(서버와 GitHub Pages 둘 다 정적 파일 하나로) / 왜 엔진이 두 개(서버 없는 데모 → 결과 비교로 확인) / 규모(서버 파이썬 약 5,200줄, 화면 컴포넌트 약 4,900줄, 커밋 212개).
준비: 코드는 2·3·4번 세 군데만, 파일·터미널 미리 열기, 멘토 오기 전 사이트를 한 번 열어 서버 깨우기(무료 서버 첫 접속 약 50초).

## 9. 구조도 이미지 만들기 (GPT 이미지용 프롬프트)

상자 안 글자는 영어로 짧게, 한국어는 제목만. 글자가 틀리면 "Fix spelling exactly as written. Keep the same layout.", 한국어 제목이 깨지면 "leave the title area blank" 후 PPT에서 제목을 얹기.

```
Create a clean, professional software architecture diagram for a web service called "동해 길동무 (Donghae Gildongmu)" — an accessible travel route planner for wheelchair users, stroller users, and seniors in Donghae, Korea.

Style: flat vector, white background, 16:9 landscape, rounded rectangles, thin dark-navy outlines, soft blue (#2462B4) and light sky-blue fills, one warm orange accent (#F29A33) only for the AI parts. Sans-serif font, all text perfectly legible, no tiny text, no 3D, no people, no decorative clutter. Arrows are simple straight lines with arrowheads and short labels.

Layout, left to right in 3 columns:

COLUMN 1 — "User"
- A box with a phone and laptop icon labeled "Browser (Mobile / PC)"
- Inside it, a smaller box: "React + TypeScript (bundled with esbuild)"
- Below it, a separate dashed box: "Demo: GitHub Pages — same engine in JavaScript (no server)"

Arrow from Browser to Column 2 labeled "REST API (JSON)"

COLUMN 2 — a large container labeled "Server: Python FastAPI (Docker on Render)"
Inside, stacked boxes:
1. "engine.py — Route planner & path grading (rules)"
2. Orange-accented group titled "AI layer — ai.py (Claude Haiku / Sonnet)" containing three small orange boxes side by side:
   - "Course Agent (tool use)"
   - "Accessibility Judge"
   - "Report Summary → Admin Approval"
3. "Admin CMS — roles, change history, undo"
4. "Public data (JSON): Korea Tourism Org, barrier-free info, public data portal"

A small note under the AI group: "If AI fails → falls back to rule engine"

COLUMN 3 — External services, stacked:
- "Claude API (Anthropic)" with an arrow from the AI layer
- "Kakao Map" with an arrow coming directly from the Browser (curved line over the top)
- "Public Data APIs" with an arrow into the Public data box

Title at the top center in bold: "동해 길동무 시스템 구조"
Small subtitle under the title: "Accessible travel routes for everyone"

Keep generous spacing, aligned grid, everything balanced and easy to read on a presentation screen.
```
