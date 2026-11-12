"use client";
// 첫 화면(히어로), 권역별 관광지, 추천 코스(예시), 이용 후기(예시). 프로토타입 v3의 섹션을 옮긴 것.
import { useEffect, useState } from "react";
import { PHOTOS } from "@/lib/photos";

// 사진 출처 표시 (CC·공공누리는 저작자와 라이선스를 반드시 밝힌다)
export const licName = (l: string, lang: "ko" | "en") => (l === "KOGL Type 1" ? (lang === "ko" ? "공공누리 제1유형" : "KOGL Type 1") : l);
export function PlacePhoto({ id, lang, small = false }: { id: string; lang: "ko" | "en"; small?: boolean }) {
  const ph = PHOTOS[id];
  if (!ph) return null;
  return (
    <figure className={small ? "ph ph-s" : "ph"}>
      <img src={ph.src} alt="" loading="lazy" />
      {!small && <figcaption><a href={ph.page} target="_blank" rel="noopener">{lang === "ko" ? "사진" : "Photo"}: {ph.author} · {licName(ph.license, lang)}</a></figcaption>}
    </figure>
  );
}

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);

/* ---------------- 히어로 ---------------- */
export function Hero({ lang, onAsk, busy }: { lang: Lang; onAsk: (m: string) => void; busy: boolean }) {
  const L = pick(lang);
  const [v, setV] = useState("");
  const ex = lang === "ko"
    ? ["엄마랑 가는데 무릎이 안 좋으세요", "휠체어 타는 친구랑 묵호역에서 출발해요", "아기랑 유모차로 바다 보러 가요"]
    : ["Travelling with my mom, her knees hurt", "My friend uses a wheelchair, starting at Mukho Station", "Stroller trip to see the sea"];
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero-in">
        <div className="hero-copy">
          <h1 id="hero-h">{L("가기 전에, 갈 수 있는 길인지 먼저 알려 드려요", "Know the way is passable before you go")}</h1>
          <p className="lead">{L(
            "휠체어, 유모차, 무릎이 불편한 부모님과 함께라도 괜찮아요. 누구와 어떻게 다니는지 동이에게 말하면, 동해에서 실제로 다닐 수 있는 길로 코스를 짜 드려요.",
            "Wheelchair, stroller, or parents who can't walk far. Tell Dongi who you're with, and get a Donghae route made only of paths you can actually take.")}</p>
          <form className="ask" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAsk(v.trim()); setV(""); } }}>
            <label htmlFor="hero-ask" className="sr-only">{L("동이에게 말하기", "Talk to Dongi")}</label>
            <input id="hero-ask" value={v} onChange={(e) => setV(e.target.value)} placeholder={L("예: 엄마랑 가는데 무릎이 안 좋으세요", "e.g. Travelling with my mom, her knees hurt")} />
            <button disabled={busy}>{L("코스 짜기", "Plan my route")}</button>
          </form>
          <div className="tries" aria-label={L("이렇게 말해 보세요", "Try saying")}>
            {ex.map((x) => <button key={x} type="button" onClick={() => onAsk(x)} disabled={busy}>{x}</button>)}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun" />
          <img src="/dongi/wave.webp" alt="" />
        </div>
      </div>
      <div className="sea" aria-hidden="true">
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none"><path d="M0 40 Q 180 10 360 40 T 720 40 T 1080 40 T 1440 40 V90 H0Z" /></svg>
      </div>
    </section>
  );
}

/* ---------------- 장소 그림 (사진 대신, 권역 색) ---------------- */
const ZONES = [
  { k: "chuam", ko: "추암", en: "Chuam", c: "#E8892A", d: ["해돋이와 기암괴석으로 유명한 남쪽 바닷가", "Southern coast known for sunrise and sea rocks"] },
  { k: "mukho", ko: "묵호", en: "Mukho", c: "#2462B4", d: ["항구와 언덕 마을, 바다 전망 시설이 모인 곳", "Harbor, hillside village and sea-view spots"] },
  { k: "mangsang", ko: "망상", en: "Mangsang", c: "#1E8FAE", d: ["넓은 백사장 해변이 이어지는 북쪽", "Northern stretch of wide sandy beaches"] },
  { k: "mureung", ko: "무릉", en: "Mureung", c: "#2E8B6A", d: ["두타산 자락의 계곡과 숲, 체험 관광지", "Inland valleys, forests and activity parks"] },
  { k: "cheongok", ko: "천곡", en: "Cheongok", c: "#7062C2", d: ["도심 속 동굴과 가까운 해변이 있는 시내", "Downtown with a city cave and nearby beaches"] },
];
const ART: Record<string, string> = { chotdae: "rock", haeamjeong: "rock", chuam_sculpture: "rock", hanseom: "rock", chuam_bridge: "bridge", mureung: "lake",
  valley: "mountain", samhwasa: "mountain", yongchu: "mountain", forest: "forest", cave: "cave", dokkaebi: "sky", haerang: "sky", nongol: "hill",
  mukho_port: "port", central_market: "port", mukho_lighthouse: "hill", mangsang: "beach", mangsang_camp: "beach", mangsang_hanok: "beach",
  pencil_museum: "indoor", nature_park: "forest", gamchu: "rock", gobulgae: "beach", cheongok_port: "port", chuam_camp: "beach", mureung_camp: "forest" };
export function Art({ id, color }: { id: string; color: string }) {
  const k = ART[id] || "beach";
  const shapes: Record<string, JSX.Element> = {
    rock: <><rect y="80" width="300" height="50" fill={color} opacity=".3" /><path d="M140 82 L150 30 L162 82Z" fill={color} /><path d="M178 82 L186 52 L196 82Z" fill={color} opacity=".7" /><circle cx="240" cy="40" r="16" fill="#F29A33" opacity=".85" /></>,
    bridge: <><rect y="86" width="300" height="44" fill={color} opacity=".3" /><path d="M20 70 Q150 104 280 70" stroke={color} strokeWidth="5" fill="none" /><path d="M60 78v-30M240 78v-30" stroke={color} strokeWidth="5" /></>,
    lake: <><path d="M0 70 L60 40 L120 66 L190 30 L300 72 V130 H0Z" fill={color} opacity=".45" /><ellipse cx="150" cy="104" rx="110" ry="18" fill="#3CB4A8" opacity=".75" /></>,
    mountain: <><path d="M0 100 L80 40 L140 90 L210 30 L300 100 V130 H0Z" fill={color} opacity=".6" /><path d="M200 60 v50" stroke="#fff" strokeWidth="4" opacity=".7" /></>,
    forest: <>{[30, 80, 130, 180, 230, 270].map((x, i) => <path key={x} d={`M${x} ${110 - (i % 2) * 10} l18 -50 l18 50z`} fill={color} opacity={0.5 + (i % 3) * 0.15} />)}</>,
    cave: <><path d="M60 130 Q60 40 150 40 Q240 40 240 130Z" fill={color} opacity=".55" /><path d="M110 130 Q110 80 150 80 Q190 80 190 130Z" fill="#fff" opacity=".7" /></>,
    indoor: <><rect x="70" y="40" width="160" height="80" rx="8" fill={color} opacity=".5" /><rect x="95" y="60" width="40" height="30" fill="#fff" opacity=".8" /><rect x="165" y="60" width="40" height="30" fill="#fff" opacity=".8" /></>,
    sky: <><rect y="96" width="300" height="34" fill={color} opacity=".3" /><path d="M60 96 V40 H240 V96" stroke={color} strokeWidth="5" fill="none" /><path d="M150 40 L150 20" stroke={color} strokeWidth="5" /></>,
    hill: <><path d="M0 130 L0 80 Q150 10 300 80 V130Z" fill={color} opacity=".45" />{[70, 110, 150, 190, 230].map((x) => <rect key={x} x={x} y={62 + Math.abs(150 - x) / 5} width="22" height="18" rx="3" fill="#fff" opacity=".85" />)}</>,
    port: <><rect y="90" width="300" height="40" fill={color} opacity=".35" /><path d="M90 88 h90 l-15 18 h-60z" fill={color} /><path d="M135 88 v-34" stroke={color} strokeWidth="4" /></>,
    beach: <><rect y="70" width="300" height="30" fill={color} opacity=".45" /><rect y="100" width="300" height="30" fill="#E9C98A" opacity=".85" /><circle cx="60" cy="36" r="14" fill="#F29A33" opacity=".85" /></>,
  };
  return <svg viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="300" height="130" fill={color} opacity=".13" />{shapes[k]}</svg>;
}

/* ---------------- 권역별 관광지 ---------------- */
const MODES = [["none", "기준 없음", "No filter"], ["wheel", "휠체어", "Wheelchair"], ["stroller", "유모차", "Stroller"], ["walk", "오래 걷기 어려움", "Limited walking"]] as const;
export function Places({ lang, onAdd, wish, gradeLabel }: { lang: Lang; onAdd: (id: string) => void; wish: string[]; gradeLabel: (g: string) => string }) {
  const L = pick(lang);
  const [zone, setZone] = useState("mukho");
  const [mode, setMode] = useState("none");
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/places?mode=${mode}`).then((r) => r.json()).then(setList).catch(() => setList([])); }, [mode]);
  const Z = ZONES.find((z) => z.k === zone)!;
  const items = list.filter((p) => p.zone === zone && p.type !== "숙박" && p.type !== "식당");
  return (
    <section id="places" className="sec wrap" aria-labelledby="places-h">
      <div className="sec-head">
        <h2 id="places-h">{L("동해 다섯 권역", "Five areas of Donghae")}</h2>
        <p>{L("권역을 고르고 누구 기준으로 볼지 정하면, 장소마다 갈 수 있는지 신호등으로 보여요.", "Pick an area and whose needs to check; each place shows an access signal.")}</p>
      </div>
      <div className="tabs" role="tablist" aria-label={L("권역", "Areas")}>
        {ZONES.map((z) => (
          <button key={z.k} role="tab" aria-selected={zone === z.k} onClick={() => setZone(z.k)} style={{ ["--z" as any]: z.c }}>
            {L(z.ko, z.en)}
          </button>
        ))}
      </div>
      <div className="filter">
        <span id="mode-l">{L("누구 기준으로 볼까요?", "Check access for")}</span>
        <div className="chips" role="group" aria-labelledby="mode-l">
          {MODES.map(([k, ko, en]) => <button key={k} className="chip" aria-pressed={mode === k} onClick={() => setMode(k)}>{L(ko, en)}</button>)}
        </div>
      </div>
      <p className="zone-d"><b style={{ color: Z.c }}>{L(Z.ko, Z.en)}</b> {L(Z.d[0], Z.d[1])}</p>
      <div className="pgrid">
        {items.map((p) => {
          const g = p.grade as string | null, inW = wish.includes(p.id);
          return (
            <article key={p.id} className="pcard">
              <div className="art">{PHOTOS[p.id] ? <PlacePhoto id={p.id} lang={lang} /> : <Art id={p.id} color={Z.c} />}
                {mode !== "none" && <span className={`badge ${g ? "g-" + g : "g-N"}`}>{g ? gradeLabel(g) : L("확인 전", "Not checked")}</span>}
              </div>
              <div className="pb">
                <h3>{L(p.name_ko, p.name_en || p.name_ko)}{p.sample && <span className="ex">{L("예시", "sample")}</span>}</h3>
                <p>{(lang === "ko" ? (p.intro_ko || p.tip_ko) : (p.tip_en || p.intro_ko)) || L("소개를 준비하고 있어요.", "Description coming soon.")}</p>
                {p.facilities?.length > 0 && <ul className="fac">{p.facilities.slice(0, 4).map((f: string) => <li key={f}>{f}</li>)}</ul>}
                <button className={`add${inW ? " on" : ""}`} disabled={g === "R"} onClick={() => onAdd(p.id)}>
                  {g === "R" ? L("이 기준으로는 어려워요", "Not reachable for this need") : inW ? L("코스에 담았어요", "Added to route") : L("코스에 담기", "Add to route")}
                </button>
              </div>
            </article>
          );
        })}
        {!items.length && <p className="muted">{L("이 권역 장소는 데이터를 정리하고 있어요.", "Places for this area are being prepared.")}</p>}
      </div>
    </section>
  );
}

/* ---------------- 추천 코스 (예시) ---------------- */
export const PRESETS = [
  { t: ["부모님 모시고 무릎 편한 묵호 바다", "Easy-walking Mukho seaside with parents"], who: "부모님과", move: ["오래 걷기 어려움"], style: ["바다 보기", "맛집"], start: "묵호역",
    tags: [["오래 걷기 어려움", "Limited walking"], ["부모님", "Parents"], ["기차", "By train"]], by: ["예시 코스 · 70대 부모님과", "Sample route · with parents in their 70s"] },
  { t: ["휠체어로 무릉 반나절", "Half day in Mureung by wheelchair"], who: "연인·친구", move: ["휠체어"], style: ["자연·산책", "역사·문화"], start: "자가용",
    tags: [["휠체어", "Wheelchair"], ["자연", "Nature"], ["자가용", "By car"]], by: ["예시 코스 · 휠체어 이용 2인", "Sample route · two travelers, one wheelchair"] },
  { t: ["유모차로 비 오는 날", "Rainy day with a stroller"], who: "아이와", move: ["유모차"], style: ["역사·문화", "카페"], start: "동해역", rain: true,
    tags: [["유모차", "Stroller"], ["실내 위주", "Mostly indoors"], ["기차", "By train"]], by: ["예시 코스 · 아이 동반 가족", "Sample route · family with a toddler"] },
] as const;
export function Courses({ lang, onStart, busy }: { lang: Lang; onStart: (i: number) => void; busy: boolean }) {
  const L = pick(lang);
  return (
    <section id="courses" className="sec wrap" aria-labelledby="courses-h">
      <div className="sec-head">
        <h2 id="courses-h">{L("이렇게 다녀 보세요", "Routes to start from")}</h2>
        <p>{L("조건이 비슷하면 그대로 시작하고, 동이에게 말로 고치면 돼요. 예시 코스예요.", "Start from one that fits and adjust it by talking to Dongi. These are sample routes.")}</p>
      </div>
      <div className="cgrid">
        {PRESETS.map((c, i) => (
          <article key={i} className="ccard">
            <h3>{L(c.t[0], c.t[1])}</h3>
            <ul className="tags">{c.tags.map((x) => <li key={x[0]}>{L(x[0], x[1])}</li>)}</ul>
            <p className="by">{L(c.by[0], c.by[1])}</p>
            <button className="start" disabled={busy} onClick={() => onStart(i)}>{L("이 조건으로 코스 만들기", "Plan with these needs")}</button>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 이용 후기 (예시) ---------------- */
const REVIEWS = [
  { p: ["무릉별유천지", "Mureung Byeolyucheonji"], tag: ["휠체어", "Wheelchair"], t: ["엄마 휠체어로 다녀왔어요. 주차장에서 방문자센터까지 평지라 편했고, 전망 데크는 살짝 경사가 있었어요.", "Went with my mom in a wheelchair. Flat from parking to the visitor center; the deck had a gentle slope."], r: ["알려 주셔서 고마워요! 전망 데크 경사 정보를 확인했어요.", "Thank you! I checked the deck slope info."] },
  { p: ["논골담길", "Nongol-damgil Alley"], tag: ["유모차", "Stroller"], t: ["벽화는 예쁜데 계단이 정말 많아서 유모차는 두고 안고 다녔어요. 사진으로 제보도 남겼어요.", "Lovely murals but so many steps; we left the stroller. I sent a photo report too."], r: ["제보 사진 덕분에 골목길 구간을 다시 확인하고 있어요.", "Thanks to your photo, we're re-checking the alley."] },
  { p: ["도째비골 스카이밸리", "Dokkaebigol Sky Valley"], tag: ["English", "English"], t: ["영어 코스와 엘리베이터 안내 덕분에 시간을 아꼈어요. 안심 화면의 영어 안내소 정보도 유용했어요.", "The English route and the elevator tip saved us time. The English-speaking info center in Safety helped too."], r: ["도움이 되었다니 기뻐요! 즐거운 여행 되세요.", "Glad it helped! Enjoy Donghae."] },
];
export function Reviews({ lang }: { lang: Lang }) {
  const L = pick(lang);
  return (
    <section id="reviews" className="sec wrap" aria-labelledby="reviews-h">
      <div className="sec-head">
        <h2 id="reviews-h">{L("다녀온 사람들 이야기", "From people who went")}</h2>
        <p>{L("본선 전이라 예시 후기예요. 실제 서비스에서는 제보와 후기가 장소 정보를 고치는 데 쓰여요.", "Sample reviews for now. In the live service, reviews and reports help correct place info.")}</p>
      </div>
      <div className="rgrid">
        {REVIEWS.map((r, i) => (
          <article key={i} className="rv">
            <p className="rv-top"><b>{L(r.p[0], r.p[1])}</b><span>{L(r.tag[0], r.tag[1])}</span><span className="ex">{L("예시 후기", "sample")}</span></p>
            <p>{L(r.t[0], r.t[1])}</p>
            <div className="reply"><img src="/dongi/thanks.webp" alt="" /><p><b>{L("동이", "Dongi")}</b>{L(r.r[0], r.r[1])}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}
