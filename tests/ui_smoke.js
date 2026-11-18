// 동해 길동무 화면 자동 점검 (브라우저에서 돌림)
// 쓰는 법: 서버(로컬 또는 실제 주소)를 연 크롬에서 F12 → Console 에 이 파일 내용을 붙여 넣고 Enter.
//          휴대폰 크기로 보려면 F12 의 기기 버튼(📱)으로 375px 를 고른 뒤 새로고침하고 붙여 넣는다.
// 결과: 표로 통과/실패를 보여 주고, 마지막 줄에 "실패 0건"이 나오면 통과.
// 화면만 읽고 누르기만 한다. 저장·제보·관리자 기능은 건드리지 않는다.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await wait(200); } return null; };
  const go = async (hash, ms = 1800) => { location.hash = hash; await wait(ms); };
  const rows = [];
  const check = (name, ok, detail = "") => rows.push({ 점검: name, 결과: ok ? "통과" : "실패", 내용: detail });
  const vw = document.documentElement.clientWidth;
  const overflow = () => document.documentElement.scrollWidth - vw;
  const setLang = async (v) => { const s = document.getElementById("lang"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })); await wait(800); };
  // 눌러지는 것 중 44px 안 되는 것 (글 속 링크·지도 그림 속 링크는 빼고)
  const smallTargets = () => [...document.querySelectorAll("main a, main button, main summary, main select, header a, header button, header select, .tabbar a")]
    .filter((el) => { const r = el.getBoundingClientRect(); if (!r.width) return false; if (getComputedStyle(el).display === "inline") return false; if (el.closest(".ph, .pcard h3, .crumb")) return false; return r.height < 43.5 || r.width < 43.5; })
    .map((el) => (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 14));
  const fakeTel = () => [...document.querySelectorAll("body *")].filter((e) => !e.children.length && /\b0{3}-0{4}\b/.test(e.textContent)).length;

  if (document.body.classList.contains("big")) document.querySelector(".bigt")?.click();
  await setLang("ko");
  await go("", 1200); window.scrollTo(0, 0);

  // 1. 첫 화면
  check("첫 화면 제목", !!document.querySelector(".hero h1")?.innerText.includes("갈 수 있는"));
  check("첫 화면 입력칸과 '코스 짜기' 버튼", !!document.querySelector("#hero-ask") && !!document.querySelector(".ask button[type=submit], .ask button:not(.ask-mic)"));
  check("가로로 밀리지 않음 (첫 화면)", overflow() <= 0, `${overflow()}px 넘침`);
  const st = smallTargets(); check("버튼 44px 이상 (첫 화면)", st.length === 0, st.slice(0, 5).join(", "));
  check("사진 속 장소 카드", !!(await until(() => document.querySelector(".hero-spot b"))));

  // 2. 예시 코스로 코스 짜기 → 시간표·브리핑·지도
  document.querySelector("button.start")?.click();
  const cards = await until(() => document.querySelectorAll(".tl-card").length || 0, 12000);
  check("예시 코스로 시간표가 나옴", !!cards, `${cards || 0}곳`);
  check("동이 브리핑", !!document.querySelector(".brief h3"));
  check("지도(또는 약도)", !!document.querySelector("#timeline .map"));
  check("예시 판정에 '· 예시' 표시", [...document.querySelectorAll(".tl-card .badge")].some((b) => b.innerText.includes("예시")) || ![...document.querySelectorAll(".tl-card")].length);
  check("가로로 밀리지 않음 (코스 결과)", overflow() <= 0, `${overflow()}px 넘침`);
  check("가짜 전화번호 없음 (코스 결과)", fakeTel() === 0, `${fakeTel()}개`);

  // 3. 긴급·도움 창: 위의 × 로 닫힘
  document.querySelector(".sos")?.click();
  const sheet = await until(() => document.querySelector(".sheet .sheet-x"), 8000);
  check("긴급·도움 창 열림 + 위에 닫기", !!sheet);
  check("가짜 전화번호 없음 (긴급·도움)", fakeTel() === 0, `${fakeTel()}개`);
  sheet?.click(); await wait(300);
  check("긴급·도움 창 닫힘", !document.querySelector(".sheet"));

  // 4. 관광지 → 휠체어 기준 → 장소 상세
  await go("#/places", 2200);
  check("관광지 카드", document.querySelectorAll(".pcard").length > 10, `${document.querySelectorAll(".pcard").length}곳`);
  check("'누구 기준' 이 검색 바로 아래", !!document.querySelector(".psearch + .filter.who"));
  [...document.querySelectorAll(".filter.who .chip")].find((b) => b.innerText.includes("휠체어"))?.click(); await wait(1500);
  check("휠체어 기준 판정 배지", document.querySelectorAll(".pcard .badge.g-G, .pcard .badge.g-Y, .pcard .badge.g-R").length > 0);
  check("가로로 밀리지 않음 (관광지)", overflow() <= 0, `${overflow()}px 넘침`);
  await go("#/place/chotdae", 2200);
  check("장소 상세: 구간 판정", document.querySelectorAll(".seglist li").length > 0);
  check("장소 상세: 예시 판정이면 전화 확인 안내", !document.querySelector(".seglist .badge") || !!document.querySelector(".seg-ex") || ![...document.querySelectorAll(".seg-src")].some((x) => x.innerText.includes("예시")));
  check("가로로 밀리지 않음 (장소 상세)", overflow() <= 0, `${overflow()}px 넘침`);

  // 5. 숙소·교통·지도·행사·준비·출처 페이지가 열림
  for (const [h, sel] of [["#/stay", ".tbl"], ["#/transport", ".panel"], ["#/map", ".fac-list, .map"], ["#/events", ".cal, .ev-list"], ["#/guide", ".faq"], ["#/sources", ".tbl"]]) {
    await go(h, 2000);
    check(`${h} 열림`, !!document.querySelector(sel));
    check(`가로로 밀리지 않음 (${h})`, overflow() <= 0, `${overflow()}px 넘침`);
  }

  // 6. 글자 크게 보기
  await go("", 1200);
  document.querySelector(".bigt")?.click(); await wait(500);
  check("글자 크게 보기 켜짐 (21px)", getComputedStyle(document.body).fontSize === "21px");
  check("글자 크게 보기에서도 가로로 밀리지 않음", overflow() <= 0, `${overflow()}px 넘침`);
  document.querySelector(".bigt")?.click(); await wait(300);

  // 7. 영어 화면: 주요 글자에 한국어가 남지 않음 (장소·가게 이름과 주소는 제외)
  await setLang("en");
  const heroEn = document.querySelector(".hero h1")?.innerText || "";
  check("영어: 첫 화면 제목", /before you go/i.test(heroEn), heroEn.slice(0, 30));
  check("영어: <html lang=en>", document.documentElement.lang === "en");
  const navKo = [...document.querySelectorAll("header, .tabbar, .steps")].map((e) => e.innerText).join(" ");
  check("영어: 메뉴·진행 단계에 한국어 없음", !/[가-힣]/.test(navKo.replace("한국어", "")), (navKo.match(/[가-힣]+/g) || []).slice(0, 5).join(", "));
  await setLang("ko");

  console.table(rows);
  const fail = rows.filter((r) => r.결과 === "실패");
  console.log(`화면 폭 ${vw}px · 점검 ${rows.length}개 · 실패 ${fail.length}건`);
  return { width: vw, total: rows.length, fail: fail.map((f) => `${f.점검} ${f.내용}`) };
})();
