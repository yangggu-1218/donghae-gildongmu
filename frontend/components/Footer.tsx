"use client";
// 사이트 아래 (한국관광공사 누리집 아래쪽 구성을 참고): 관리자 작은 상자 · 동해시·한림대 로고 · 안내 링크 · 동해시 공식 SNS
// 기관 로고는 누르면 각 공식 누리집으로. SNS 주소는 동해시 누리집(dh.go.kr) 아래쪽에 실린 공식 계정 (2026-11-19 확인)

type Lang = "ko" | "en";
const SNS: { k: string; ko: string; en: string; href: string; svg: JSX.Element }[] = [
  { k: "fb", ko: "동해시 페이스북", en: "Donghae City on Facebook", href: "https://www.facebook.com/sunrisectdh",
    svg: <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z" fill="currentColor" /> },
  { k: "kakao", ko: "동해시 카카오톡 채널", en: "Donghae City KakaoTalk channel", href: "http://pf.kakao.com/_tukxds",
    svg: <><path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 6l-1 3.6c-.1.3.3.6.6.4l4.2-2.8c.3 0 .7.1 1 .1 5 0 9-3.1 9-7s-4-7.3-9-7.3z" fill="currentColor" />
      <text x="12" y="13.3" textAnchor="middle" fontSize="4.6" fontWeight="800" fill="var(--foot-bg)" fontFamily="Arial, sans-serif">TALK</text></> },
  { k: "insta", ko: "동해시 인스타그램", en: "Donghae City on Instagram", href: "https://www.instagram.com/donghae.city",
    svg: <><rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3.7" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="16.9" cy="7.1" r="1.2" fill="currentColor" /></> },
  { k: "yt", ko: "동해시 유튜브", en: "Donghae City on YouTube", href: "https://www.youtube.com/@donghae_city",
    svg: <><rect x="3" y="6" width="18" height="12" rx="3.5" fill="currentColor" /><path d="M10.2 9.3v5.4l4.7-2.7z" fill="var(--foot-bg)" /></> },
  { k: "blog", ko: "동해시 블로그", en: "Donghae City blog", href: "https://blog.naver.com/sunrisectdh",
    svg: <><rect x="3.5" y="5" width="17" height="14" rx="3" fill="currentColor" /><text x="12" y="15.6" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="var(--foot-bg)" fontFamily="Arial, sans-serif">b</text></> },
];

export function SiteFooter({ lang, t }: { lang: Lang; t: (k: string) => string }) {
  const L = (ko: string, en: string) => (lang === "ko" ? ko : en);
  return (
    <footer className="foot site-foot">
      <div className="wrap">
        <div className="sf-top">
          <a className="sf-admin" href="#/admin">{L("관리자", "Admin")}</a>
          <a className="sf-src" href="#/sources">{L("사진·자료 출처", "Photo & data credits")}</a>
        </div>
        <div className="sf-main">
          <div className="sf-left">
            <div className="sf-logos">
              <a href="https://www.dh.go.kr" target="_blank" rel="noreferrer" aria-label={L("동해시청 누리집 (새 창)", "Donghae City website (new tab)")}><img src="/photos/brand-donghae.png" alt={L("동해시", "Donghae City")} /></a>
              <a href="https://www.hallym.ac.kr" target="_blank" rel="noreferrer" aria-label={L("한림대학교 누리집 (새 창)", "Hallym University website (new tab)")}><img src="/photos/brand-hallym.png" alt={L("한림대학교", "Hallym University")} /></a>
            </div>
            <p className="sf-brand"><b>{t("brand")}</b> {t("foot.team")}</p>
          </div>
          <div className="sf-right">
            <p className="sf-sns-h">{L("동해시 공식 SNS", "Donghae City on social media")}</p>
            <ul className="sf-sns">
              {SNS.map((x) => <li key={x.k}><a href={x.href} target="_blank" rel="noreferrer" aria-label={`${L(x.ko, x.en)} (${L("새 창", "new tab")})`} title={L(x.ko, x.en)}>
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">{x.svg}</svg></a></li>)}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
