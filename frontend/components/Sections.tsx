"use client";
// 첫 화면(히어로), 권역별 관광지, 추천 코스(예시), 이용 후기(예시). 프로토타입 v3의 섹션을 옮긴 것.
import { useEffect, useState } from "react";
import { PHOTOS, photoAt } from "@/lib/photos";

// 사진 출처는 사진 위에 쓰지 않고 따로 모아 보여 준다 (lib/photos.ts 에 저작자·라이선스 보관)
export const licName = (l: string, lang: "ko" | "en") => (l === "KOGL Type 1" ? (lang === "ko" ? "공공누리 제1유형" : "KOGL Type 1") : l);
export function PlacePhoto({ id, lang, small = false, alt = "" }: { id: string; lang: "ko" | "en"; small?: boolean; alt?: string }) {
  const ph = PHOTOS[id];
  const [bad, setBad] = useState(false);
  if (!ph) return null;
  return (
    <figure className={`${small ? "ph ph-s" : "ph"}${bad ? " ph-bad" : ""}`}>
      {!bad && <img src={ph.src} srcSet={small ? undefined : `${ph.src} 500w, ${photoAt(id, 960)} 960w`} sizes={small ? undefined : "(max-width: 700px) 100vw, 420px"}
        alt={alt} loading="lazy" decoding="async" onError={() => setBad(true)} />}
    </figure>
  );
}

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);

/* ---------------- 히어로: 실제 동해 사진 위에 '갈 수 있는지' 판정을 얹는다 ---------------- */
const GRADE_TXT: Record<string, [string, string]> = { G: ["갈 수 있어요", "Accessible"], Y: ["주의해서 가요", "Go with care"], R: ["어려워요", "Hard to reach"] };
export function Hero({ lang, onAsk, busy }: { lang: Lang; onAsk: (m: string) => void; busy: boolean }) {
  const L = pick(lang);
  const [v, setV] = useState("");
  const [spot, setSpot] = useState<any>(null);     // 사진 속 장소(추암 촛대바위)의 실제 판정
  const [bad, setBad] = useState(false);
  useEffect(() => { fetch("/api/places?mode=wheel").then((r) => r.json()).then((l) => setSpot((l || []).find((p: any) => p.id === "chotdae") || null)).catch(() => {}); }, []);
  const ex = lang === "ko"
    ? ["엄마랑 가는데 무릎이 안 좋으세요", "휠체어 타는 친구랑 묵호역에서 출발해요", "아기랑 유모차로 바다 보러 가요", "친구랑 바다 보고 사진 찍고 싶어요"]
    : ["Travelling with my mom, her knees hurt", "My friend uses a wheelchair, starting at Mukho Station", "Stroller trip to see the sea", "Sea views and photo spots with a friend"];
  const g = spot?.grade as string | undefined;
  return (
    <section className={`hero${bad ? " hero-plain" : ""}`} aria-labelledby="hero-h">
      {!bad && <img className="hero-bg" src={photoAt("chotdae", 960)} srcSet={`${photoAt("chotdae", 960)} 960w, ${photoAt("chotdae", 1920)} 1920w`} sizes="100vw"
        alt={L("해 뜰 무렵의 추암 촛대바위", "Chuam Chotdae Rock at sunrise")} fetchPriority="high" decoding="async" onError={() => setBad(true)} />}
      <div className="hero-in">
        <div className="hero-copy">
          <h1 id="hero-h">{L("가기 전에, 갈 수 있는 길인지 먼저 알려 드려요", "Know the way is passable before you go")}</h1>
          <p className="lead">{L(
            "친구와도, 가족과도, 휠체어나 유모차와 함께여도 괜찮아요. 누구와 어떻게 다니는지 말하면 영업시간, 붐빔 예상, 길 상태까지 맞춘 동해 코스를 짜 드려요.",
            "With friends, family, a wheelchair or a stroller. Say who you're with, and get a Donghae route checked for opening hours, crowds and path conditions.")}</p>
          <form className="ask" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAsk(v.trim()); setV(""); } }}>
            <img className="ask-dongi" src="/dongi/wave.webp" alt="" />
            <label htmlFor="hero-ask" className="sr-only">{L("동이에게 말하기", "Talk to Dongi")}</label>
            <input id="hero-ask" value={v} onChange={(e) => setV(e.target.value)} placeholder={L("예: 엄마랑 가는데 무릎이 안 좋으세요", "e.g. Travelling with my mom, her knees hurt")} />
            <button disabled={busy}>{L("코스 짜기", "Plan my route")}</button>
          </form>
          <div className="tries" aria-label={L("이렇게 말해 보세요", "Try saying")}>
            {ex.map((x) => <button key={x} type="button" onClick={() => onAsk(x)} disabled={busy}>{x}</button>)}
          </div>
        </div>
        {spot && (
          <a className="hero-spot" href="#/place/chotdae">
            <span className="hero-spot-k">{L("사진 속 장소", "In this photo")}</span>
            <b>{L(spot.name_ko, spot.name_en || spot.name_ko)}</b>
            <span className="hero-spot-g">{L("휠체어 기준", "By wheelchair")} <span className={`badge ${g ? "g-" + g : "g-N"}`}>{g ? L(...GRADE_TXT[g]) : L("확인 전", "Not checked")}</span></span>
            <span className="hero-spot-m">{L("길·화장실·주차 보기", "Paths, toilets, parking")}</span>
          </a>
        )}
      </div>
    </section>
  );
}

/* ---------------- 지금의 동해: 오늘 날씨·붐빔·행사·공지를 한 줄에 ---------------- */
export function NowDonghae({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [w, setW] = useState<any>(null);
  const [crowd, setCrowd] = useState<Record<string, { date: string; rate: number }[]>>({});
  const [names, setNames] = useState<Record<string, [string, string]>>({});
  const [ev, setEv] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/weather").then((r) => r.json()).then(setW).catch(() => {});
    fetch("/api/crowd").then((r) => r.json()).then((j) => setCrowd(j.places || {})).catch(() => {});
    fetch("/api/places?mode=none").then((r) => r.json()).then((l) => setNames(Object.fromEntries((l || []).map((p: any) => [p.id, [p.name_ko, p.name_en || p.name_ko]])))).catch(() => {});
    fetch("/api/events").then((r) => r.json()).then((j) => setEv(j.upcoming || [])).catch(() => {});
  }, []);
  const now = new Date(Date.now() + 9 * 3600e3);
  const today = now.toISOString().slice(0, 10);
  const week = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const rates = Object.entries(crowd).map(([id, rows]) => [id, rows.find((c) => c.date === today.replaceAll("-", ""))?.rate] as const)
    .filter(([id, r]) => r != null && names[id]) as [string, number][];
  const quiet = [...rates].sort((a, b) => a[1] - b[1]).slice(0, 3);
  const busy = [...rates].sort((a, b) => b[1] - a[1]).filter(([, r]) => r >= 60).slice(0, 2);
  const soon = ev.filter((e) => e.start <= week && (e.end || e.start) >= today).slice(0, 2);
  const nm = (id: string) => L(names[id]?.[0] || id, names[id]?.[1] || id);
  const cards: JSX.Element[] = [];
  if (w && !w.sample) cards.push(
    <a key="w" className="now-c" href="#plan"><span className="now-k">{L("오늘 날씨", "Weather today")}</span>
      <b>{w.rain ? L("비 소식이 있어요", "Rain expected") : L("비 소식 없어요", "No rain expected")}</b>
      <span>{w.rain ? L("실내 위주로 코스를 짜 드릴게요", "We'll plan indoor stops") : L("바다·산책 코스 좋아요", "Good for sea and walks")}</span></a>);
  if (quiet.length) cards.push(
    <div key="q" className="now-c"><span className="now-k">{L("오늘 한산할 곳", "Quiet today")}</span>
      <b>{quiet.map(([id], i) => <span key={id}>{i > 0 && ", "}<a href={`#/place/${id}`}>{nm(id)}</a></span>)}</b>
      <span>{L("한국관광공사 집중률 예측", "KTO crowd forecast")}</span></div>);
  if (busy.length) cards.push(
    <div key="b" className="now-c"><span className="now-k">{L("오늘 붐빌 곳", "Busy today")}</span>
      <b>{busy.map(([id], i) => <span key={id}>{i > 0 && ", "}<a href={`#/place/${id}`}>{nm(id)}</a></span>)}</b>
      <span>{L("이른 시간이나 다른 날을 추천해요", "Go early or pick another day")}</span></div>);
  if (soon.length) cards.push(
    <a key="e" className="now-c" href="#/events"><span className="now-k">{L("이번 주 행사", "This week")}</span>
      <b>{soon.map((e) => e.name).join(", ")}</b>
      <span>{soon[0].start === (soon[0].end || soon[0].start) ? soon[0].start.slice(5).replace("-", "/") : `${soon[0].start.slice(5).replace("-", "/")}~${(soon[0].end || "").slice(5).replace("-", "/")}`} · {soon[0].venue || ""}</span></a>);
  if (!cards.length) return null;
  return (
    <section className="now wrap" aria-labelledby="now-h">
      <h2 id="now-h">{L("지금의 동해", "Donghae now")}</h2>
      <div className="now-row">{cards}</div>
    </section>
  );
}

/* ---------------- 숫자로 보는 확인 범위 (모두 서버 데이터에서 센 값) ---------------- */
export function HomeFacts({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [n, setN] = useState<{ places: number; toilets: number; chargers: number; parking: number } | null>(null);
  useEffect(() => {
    Promise.all([fetch("/api/places?mode=none").then((r) => r.json()), fetch("/api/facilities").then((r) => r.json())])
      .then(([pl, f]) => setN({ places: (pl || []).filter((p: any) => p.verified && !p.sample).length, toilets: f.toilets?.length || 0, chargers: f.chargers?.length || 0, parking: f.parking?.length || 0 }))
      .catch(() => {});
  }, []);
  if (!n) return null;
  const rows: [number, string, string, string][] = [
    [n.places, L("길을 확인한 관광지", "places with checked paths"), "#/places", L("곳", "")],
    [n.toilets, L("장애인 화장실", "accessible toilets"), "#/map", L("곳", "")],
    [n.chargers, L("전동휠체어 급속충전기", "wheelchair fast chargers"), "#/map", L("곳", "")],
    [n.parking, L("공영주차장", "public car parks"), "#/transport", L("곳", "")],
  ];
  return (
    <section className="facts wrap" aria-label={L("확인한 범위", "What we have checked")}>
      <ul>{rows.filter((r) => r[0] > 0).map(([v, label, href, unit]) => (
        <li key={label}><a href={href}><b>{v}<small>{unit}</small></b><span>{label}</span></a></li>))}</ul>
    </section>
  );
}

/* ---------------- 장소 그림 (사진 대신, 권역 색) ---------------- */
export const ZONES = [
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
const ZONE_PHOTO: Record<string, string> = { chuam: "chotdae", mukho: "zone_mukho", mangsang: "mangsang", mureung: "zone_mureung", cheongok: "cave" };
export function ZoneTiles({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [cnt, setCnt] = useState<Record<string, number>>({});
  useEffect(() => { fetch("/api/places?mode=none").then((r) => r.json()).then((l) => {
    const c: Record<string, number> = {}; (l || []).forEach((p: any) => { if (p.type !== "숙박" && p.type !== "식당") c[p.zone] = (c[p.zone] || 0) + 1; }); setCnt(c); }).catch(() => {}); }, []);
  return (
    <section className="sec wrap" aria-labelledby="zones-h">
      <div className="sec-head">
        <h2 id="zones-h">{L("권역으로 둘러보기", "Explore by area")}</h2>
        <p>{L("동해는 바다를 따라 다섯 권역으로 나뉘어요. 권역을 고르면 장소마다 갈 수 있는지 보여 드려요.", "Donghae runs along the coast in five areas. Pick one to see each place's access signal.")}</p>
      </div>
      <div className="ztiles">
        {ZONES.map((z) => (
          <a key={z.k} className="ztile" href={`#/places/${z.k}`} style={{ ["--z" as any]: z.c }}>
            <PlacePhoto id={ZONE_PHOTO[z.k]} lang={lang} />
            <span className="ztile-t"><b>{L(z.ko, z.en)}</b><span>{L(z.d[0], z.d[1])}</span>
              {cnt[z.k] ? <em>{L(`장소 ${cnt[z.k]}곳`, `${cnt[z.k]} places`)}</em> : null}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 더 알아보기 ---------------- */
export function MoreLinks({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const rows: [string, string, string][] = [
    ["#/transport", L("교통", "Getting around"), L("역에서 나오는 길, 휠체어 탑승 차량, 주차 요금 면제", "From the station, wheelchair vans, parking fee waivers")],
    ["#/map", L("편의시설 지도", "Facilities map"), L("장애인 화장실, 충전기, 안내소, 약국을 한 지도에서", "Accessible toilets, chargers, info centers and pharmacies")],
    ["#/events", L("행사 달력", "Events"), L("축제와 문화행사 날짜에 맞춰 코스 만들기", "Plan around festivals and cultural events")],
    ["#/stay", L("숙소", "Stay"), L("권역별 숙박업소와 확인된 정보", "Lodging by area and what has been checked")],
    ["#/guide", L("여행 준비", "Before you go"), L("준비물, 자주 묻는 질문, 긴급 연락처", "Checklist, FAQ and emergency contacts")],
  ];
  return (
    <section className="sec wrap" aria-labelledby="more-h">
      <div className="sec-head"><h2 id="more-h">{L("떠나기 전에 확인하세요", "Check before you leave")}</h2></div>
      <ul className="more-grid">{rows.map(([href, t, d]) => <li key={href}><a href={href}><b>{t}</b><span>{d}</span></a></li>)}</ul>
    </section>
  );
}

export function Places({ lang, onAdd, wish, gradeLabel, zone0 }: { lang: Lang; onAdd: (id: string) => void; wish: string[]; gradeLabel: (g: string) => string; zone0?: string }) {
  const L = pick(lang);
  const [zone, setZone] = useState(ZONES.some((z) => z.k === zone0) ? zone0! : "all");
  useEffect(() => { if (ZONES.some((z) => z.k === zone0)) setZone(zone0!); }, [zone0]);
  const [mode, setMode] = useState("none");
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/places?mode=${mode}`).then((r) => r.json()).then(setList).catch(() => setList([])); }, [mode]);
  const [q, setQ] = useState("");
  const [need, setNeed] = useState<string[]>([]);
  const [crowd, setCrowd] = useState<Record<string, { date: string; rate: number }[]>>({});
  useEffect(() => { fetch("/api/crowd").then((r) => r.json()).then((j) => setCrowd(j.places || {})).catch(() => {}); }, []);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replaceAll("-", "");
  const rateToday = (id: string) => crowd[id]?.find((c) => c.date === today)?.rate;
  const Z = ZONES.find((z) => z.k === zone);
  const zc = (k: string) => ZONES.find((z) => z.k === k)?.c || "#2462B4";
  const key = q.trim().toLowerCase().replace(/\s+/g, "");
  const ORDER: Record<string, number> = { G: 0, Y: 1, R: 3 };
  const NEED_TEST: Record<string, (p: any) => boolean> = {
    sea: (p) => (p.styles || []).includes("바다 보기"), nature: (p) => (p.styles || []).includes("자연·산책"),
    culture: (p) => (p.styles || []).includes("역사·문화"), activity: (p) => (p.styles || []).includes("체험"),
    indoor: (p) => !!p.indoor, flat: (p) => p.walk_load === "평지",
    toilet: (p) => (p.facilities || []).includes("장애인 화장실"), parking: (p) => (p.facilities || []).includes("장애인 주차"),
    quiet: (p) => { const r = rateToday(p.id); return r != null && r < 50; },
  };
  const filtering = !!key || need.length > 0;
  const items = list.filter((p) => p.type !== "숙박" && p.type !== "식당" && p.type !== "카페"
      && (key ? `${p.name_ko}${p.name_en || ""}${p.intro_ko || ""}${(p.facilities || []).join("")}${(p.styles || []).join("")}`.toLowerCase().replace(/\s+/g, "").includes(key) : true)
      && need.every((n) => NEED_TEST[n]?.(p))
      && (filtering || zone === "all" || p.zone === zone))
    .sort((a, b) => (mode === "none" ? 0 : (ORDER[a.grade] ?? 2) - (ORDER[b.grade] ?? 2)));
  const toggle = (k: string) => setNeed(need.includes(k) ? need.filter((x) => x !== k) : [...need, k]);
  const hasCrowd = Object.keys(crowd).length > 0;
  return (
    <section id="places" className="sec wrap" aria-labelledby="places-h">
      <div className="sec-head">
        <h2 id="places-h">{L("동해 다섯 권역", "Five areas of Donghae")}</h2>
        <p>{L("권역을 고르고 누구 기준으로 볼지 정하면, 장소마다 갈 수 있는지 신호등으로 보여요.", "Pick an area and whose needs to check; each place shows an access signal.")}</p>
      </div>
      <form className="psearch" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="psearch">{L("장소 찾기", "Find a place")}</label>
        <input id="psearch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("이름이나 시설로 찾기 (예: 등대, 엘리베이터)", "Search by name or facility (e.g. lighthouse, elevator)")} />
        {q && <button type="button" className="chip" onClick={() => setQ("")}>{L("지우기", "Clear")}</button>}
      </form>
      <div className="filter needs">
        <span id="need-l">{L("이런 곳을 찾아요", "I'm looking for")}</span>
        <div className="chips" role="group" aria-labelledby="need-l">
          {([["sea", "바다 보기", "Sea views"], ["nature", "자연·산책", "Nature walks"], ["culture", "역사·문화", "History & culture"], ["activity", "체험", "Activities"],
            ["indoor", "비 와도 OK(실내)", "Indoor"], ["flat", "덜 걷는 곳(평지)", "Flat, little walking"], ["toilet", "장애인 화장실", "Accessible toilet"],
            ["parking", "장애인 주차", "Accessible parking"], ...(hasCrowd ? [["quiet", "오늘 한산한 곳", "Quiet today"]] : [])] as [string, string, string][])
            .map(([k, ko, en]) => <button key={k} className="chip" aria-pressed={need.includes(k)} onClick={() => toggle(k)}>{L(ko, en)}</button>)}
          {need.length > 0 && <button className="chip plain" onClick={() => setNeed([])}>{L("모두 풀기", "Clear all")}</button>}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label={L("권역", "Areas")} hidden={filtering}>
        <button role="tab" aria-selected={zone === "all"} onClick={() => setZone("all")} style={{ ["--z" as any]: "#12355E" }}>{L("전체", "All")}</button>
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
      {filtering
        ? <p className="zone-d" role="status">{L(`${key ? `'${q.trim()}' ` : ""}조건에 맞는 곳 ${items.length}곳 (모든 권역)`, `${items.length} place(s) match${key ? ` '${q.trim()}'` : ""} in all areas`)}</p>
        : !Z ? <p className="zone-d"><b>{L("동해 전체", "All of Donghae")}</b> {L(`다섯 권역 ${items.length}곳을 한 번에 봐요. 권역 탭을 누르면 그 지역만 보여요.`, `${items.length} places across five areas.`)}</p>
        : <p className="zone-d"><b style={{ color: Z.c }}>{L(Z.ko, Z.en)}</b> {L(Z.d[0], Z.d[1])}</p>}
      <div className="pgrid">
        {items.map((p) => {
          const g = p.grade as string | null, inW = wish.includes(p.id);
          return (
            <article key={p.id} className="pcard">
              <div className="art"><Art id={p.id} color={zc(p.zone)} />{PHOTOS[p.id] && <PlacePhoto id={p.id} lang={lang} />}
                {mode !== "none" && <span className={`badge ${g ? "g-" + g : "g-N"}`}>{g ? gradeLabel(g) : L("확인 전", "Not checked")}</span>}
              </div>
              <div className="pb">
                {(zone === "all" || filtering) && <span className="ztag" style={{ color: zc(p.zone) }}>{L(ZONES.find((z) => z.k === p.zone)?.ko || "", ZONES.find((z) => z.k === p.zone)?.en || "")}</span>}
                <h3><a className="plink" href={`#/place/${p.id}`}>{L(p.name_ko, p.name_en || p.name_ko)}</a>{p.sample && <span className="ex">{L("예시", "sample")}</span>}</h3>
                <p>{(lang === "ko" ? (p.intro_ko || p.tip_ko) : (p.intro_en || p.tip_en || p.intro_ko)) || L("소개를 준비하고 있어요.", "Description coming soon.")}</p>
                {rateToday(p.id) != null && <p className="small"><span className={`badge crowd-${rateToday(p.id)! >= 70 ? "high" : rateToday(p.id)! >= 40 ? "mid" : "low"}`}>
                  {L("오늘", "Today")} {rateToday(p.id)! >= 70 ? L("붐빔 예상", "busy") : rateToday(p.id)! >= 40 ? L("보통", "moderate") : L("여유", "quiet")} {Math.round(rateToday(p.id)!)}%</span></p>}
                {p.facilities?.length > 0 && <ul className="fac">{p.facilities.slice(0, 4).map((f: string) => <li key={f}>{f}</li>)}</ul>}
                <a className="more" href={`#/place/${p.id}`}>{L("길·화장실·주차 자세히 보기", "Paths, toilets, parking")}</a>
                <button className={`add${inW ? " on" : ""}`} disabled={g === "R"} onClick={() => onAdd(p.id)}>
                  {g === "R" ? L("이 기준으로는 어려워요", "Not reachable for this need") : inW ? L("✓ 담았어요", "✓ Added") : L("코스에 담기", "Add to route")}
                </button>
              </div>
            </article>
          );
        })}
        {!items.length && <p className="muted">{filtering ? L("조건에 맞는 장소가 없어요. 조건을 하나씩 풀어 보세요.", "No places match. Try removing a filter.") : L("이 권역 장소는 데이터를 정리하고 있어요.", "Places for this area are being prepared.")}</p>}
      </div>
    </section>
  );
}

/* ---------------- 이렇게 써요: 처음 온 사람에게 순서를 보여 준다 ---------------- */
export function HowTo({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const steps: [string, string, string, string][] = [
    ["조건 고르기", "Tell us your trip", "날짜, 누구와, 걸음 상태를 버튼으로 고르거나 \"엄마랑 가는데 무릎이 안 좋아요\"처럼 말해요.", "Pick a date, who's coming and how they get around, or just type it."],
    ["갈 수 있는 코스 받기", "Get a course you can actually do", "그날 문 연 곳만, 오르막·계단·장애인 화장실을 확인한 순서로 시간표와 지도를 짜 드려요.", "Only places open that day, ordered with slopes, steps and accessible toilets checked."],
    ["고치고 저장·공유", "Adjust, save, share", "\"오르막 빼줘\", \"점심 바꿔줘\"라고 말하면 바로 고쳐요. 큰 글씨 요약표로 가족에게 보낼 수 있어요.", "Say \"no uphill\" or \"change lunch\" to edit. Send a large-print summary to family."],
  ];
  return (
    <section className="sec wrap howto" aria-labelledby="howto-h">
      <h2 id="howto-h">{L("이렇게 써요", "How it works")}</h2>
      <ol>
        {steps.map(([k, e, dk, de], i) => <li key={k}><span className="n" aria-hidden="true">{i + 1}</span><b>{L(k, e)}</b><p>{L(dk, de)}</p></li>)}
      </ol>
      <p className="howto-go"><a className="btn-go" href="#plan">{L("지금 코스 짜기", "Start planning")}</a>
        <a href="#/places">{L("먼저 관광지 둘러보기", "Browse places first")}</a></p>
    </section>
  );
}

/* ---------------- 추천 코스 (예시) ---------------- */
export const PRESETS = [
  { t: ["부모님 모시고 무릎 편한 묵호 바다", "Easy-walking Mukho seaside with parents"], who: "부모님과", move: ["오래 걷기 어려움"], style: ["바다 보기", "맛집"], start: "묵호역", photo: "zone_mukho",
    tags: [["오래 걷기 어려움", "Limited walking"], ["부모님", "Parents"], ["기차", "By train"]], by: ["예시 코스 · 70대 부모님과", "Sample route · with parents in their 70s"] },
  { t: ["휠체어로 무릉 반나절", "Half day in Mureung by wheelchair"], who: "연인·친구", move: ["휠체어"], style: ["자연·산책", "역사·문화"], start: "자가용", photo: "valley",
    tags: [["휠체어", "Wheelchair"], ["자연", "Nature"], ["자가용", "By car"]], by: ["예시 코스 · 휠체어 이용 2인", "Sample route · two travelers, one wheelchair"] },
  { t: ["유모차로 비 오는 날", "Rainy day with a stroller"], who: "아이와", move: ["유모차"], style: ["역사·문화", "카페"], start: "동해역", rain: true, photo: "cave",
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
            <div className="ccard-ph"><PlacePhoto id={c.photo} lang={lang} /></div>
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
