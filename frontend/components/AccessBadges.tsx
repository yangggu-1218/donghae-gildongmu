"use client";
// 무장애 편의정보 아이콘 (한국관광공사 '열린관광 모두의 여행'의 분류를 따름): 지체장애 · 시각장애 · 영유아가족 · 고령자
// 그 분류에 '없음'이 아닌 항목이 하나라도 있을 때만 아이콘을 보인다 (backend/app/kto_access.py).
type Lang = "ko" | "en";
// 아이콘 모양: 한국관광공사 열린관광의 무장애 픽토그램을 오려 모양 틀(mask)로 쓰고, 색은 사이트 색(currentColor)을 입힌다
export const ACC_IMG: Record<string, string> = { "지체장애": "mobility", "시각장애": "vision", "청각장애": "hearing", "영유아가족": "family", "고령자": "senior" };
export function AccIcon({ k, size = 20 }: { k: string; size?: number }) {
  const u = `url(/icons/acc-${ACC_IMG[k] || "mobility"}.png)`;
  return <span className="acc-ic" aria-hidden="true" style={{ width: size, height: size, WebkitMaskImage: u, maskImage: u }} />;
}
export const ACCESS_CATS: Record<string, { ko: string; en: string; d: JSX.Element }> = {
  "지체장애": { ko: "휠체어·지체장애 편의", en: "Wheelchair access",
    d: <><circle cx="10.5" cy="4" r="2" fill="currentColor" /><path d="M10.5 7v6h5l2.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 10.2A5.5 5.5 0 1 0 15.2 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
  "시각장애": { ko: "시각장애 편의", en: "Low-vision support",
    d: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2.6" fill="currentColor" /><path d="M4 20 20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
  "영유아가족": { ko: "영유아 가족 편의", en: "Family & baby facilities",
    d: <><circle cx="7.5" cy="5" r="2" fill="currentColor" /><circle cx="16.5" cy="9" r="1.7" fill="currentColor" /><path d="M7.5 8v12M4.5 11.5h6M16.5 12v8M14 14.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
  "고령자": { ko: "어르신 편의", en: "Senior support",
    d: <><circle cx="11" cy="4" r="2" fill="currentColor" /><path d="M11 7.5l-1.5 6 2 3 1 4.5M10 9.5l-3 3M11.5 9l2.5 2.5h2M17 11.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> },
};

export function AccessBadges({ a, lang, big = false }: { a?: { cats?: string[] }; lang: Lang; big?: boolean }) {
  const cats = (a?.cats || []).filter((c) => ACCESS_CATS[c]);
  if (!cats.length) return null;
  const L = (ko: string, en: string) => (lang === "ko" ? ko : en);
  return (
    <ul className={`acc-badges${big ? " big" : ""}`} aria-label={L("무장애 편의정보", "Accessibility info")}>
      {cats.map((c) => (
        <li key={c} title={L(ACCESS_CATS[c].ko, ACCESS_CATS[c].en)}>
          <AccIcon k={c} size={big ? 26 : 20} />
          <span className={big ? "" : "sr-only"}>{L(ACCESS_CATS[c].ko, ACCESS_CATS[c].en)}</span>
        </li>))}
    </ul>
  );
}

// 장소 상세: 분류별 편의정보 목록 + 원문 링크
export function AccessPanel({ a, lang }: { a?: { cats?: string[]; items?: Record<string, [string, string][]>; links?: { name: string; url: string; updated: string }[] }; lang: Lang }) {
  if (!a?.cats?.length) return null;
  const L = (ko: string, en: string) => (lang === "ko" ? ko : en);
  return (
    <section className="panel acc-panel" aria-labelledby="acc-h">
      <h2 id="acc-h" className="h3">{L("무장애 편의정보", "Accessibility facilities")}</h2>
      <AccessBadges a={a} lang={lang} big />
      {a.cats.map((c) => (
        <div key={c} className="acc-cat">
          <h3>{L(ACCESS_CATS[c]?.ko || c, ACCESS_CATS[c]?.en || c)}</h3>
          <dl>{(a.items?.[c] || []).map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>))}
      <p className="muted small">{L("출처: 한국관광공사 열린관광 모두의 여행", "Source: Korea Tourism Organization, Open Tourism")}
        {(a.links || []).map((x) => <span key={x.url}> · <a href={x.url} target="_blank" rel="noreferrer">{x.name}{x.updated ? ` (${x.updated} ${L("수정", "updated")})` : ""}</a></span>)}
        {lang === "en" && " (details in Korean)"}</p>
    </section>
  );
}
