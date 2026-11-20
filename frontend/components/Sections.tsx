"use client";
// 첫 화면(히어로), 권역별 관광지, 추천 코스(예시), 이용 후기(예시). 프로토타입 v3의 섹션을 옮긴 것.
import { getJSON } from "@/lib/api";
import { useEffect, useState } from "react";
import { PHOTOS, photoAt } from "@/lib/photos";
import { tr } from "@/lib/ko2en";
import { fuzzyHit } from "@/lib/fuzzy";
import { Icon } from "@/components/Icon";
import { AccessBadges, ACCESS_CATS, AccIcon } from "@/components/AccessBadges";

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

/* ---------------- 지금의 동해: 오늘 날씨·붐빔·행사·공지를 한 줄에 ---------------- */
export function NowDonghae({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [w, setW] = useState<any>(null);
  const [crowd, setCrowd] = useState<Record<string, { date: string; rate: number }[]>>({});
  const [names, setNames] = useState<Record<string, [string, string]>>({});
  const [ev, setEv] = useState<any[]>([]);
  useEffect(() => {
    getJSON("/api/weather").then(setW).catch(() => {});
    getJSON("/api/crowd").then((j) => setCrowd(j.places || {})).catch(() => {});
    getJSON("/api/places?mode=none").then((l) => setNames(Object.fromEntries((l || []).map((p: any) => [p.id, [p.name_ko, p.name_en || p.name_ko]])))).catch(() => {});
    getJSON("/api/events").then((j) => setEv(j.upcoming || [])).catch(() => {});
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
      <b>{w.today && <Icon name={w.today.icon} />}{w.today ? ` ${L(w.today.ko, w.today.en)} · ${w.today.tmin}~${w.today.tmax}°C · ${w.today.pop != null ? `${L("비", "rain")} ${w.today.pop}%` : `${L("강수", "rain")} ${w.today.mm}mm`}`
        : w.rain ? L("비 소식이 있어요", "Rain expected") : L("비 소식 없어요", "No rain expected")}</b>
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
// 첫 화면 숫자와 코스 전 약도가 같은 기준을 쓰도록 한 곳에서 정한다
export const isGradedSight = (p: any) => p.type === "관광지" && p.verified && !p.sample;

export function HomeFacts({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [n, setN] = useState<{ places: number; example: number; toilets: number; chargers: number; parking: number } | null>(null);
  useEffect(() => {
    Promise.all([getJSON("/api/places?mode=none"), getJSON("/api/facilities")])
      .then(([pl, f]) => {
        // 관광지 중 구간 판정이 있는 곳 (지도 안내 문구의 숫자와 같은 기준). 현장 실측 전 '예시' 판정은 따로 센다
        const graded = (pl || []).filter(isGradedSight);
        setN({ places: graded.length, example: graded.filter((p: any) => p.access_source === "예시").length, toilets: f.toilets?.length || 0, chargers: f.chargers?.length || 0, parking: f.parking?.length || 0 });
      })
      .catch(() => {});
  }, []);
  if (!n) return null;
  const rows: [number, string, string, string][] = [
    [n.places, n.example >= n.places ? L("구간 판정 관광지 (현장 확인 전 포함)", "places with path grades (some not yet surveyed)")
      : n.example > 0 ? L(`구간 판정 관광지 (현장 확인 전 ${n.example}곳 포함)`, `places with path grades (${n.example} not yet surveyed)`)
      : L("구간 판정 관광지", "places with path grades"), "#/places", L("곳", "")],
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
  useEffect(() => { getJSON("/api/places?mode=none").then((l) => {
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
const featuredPlaces = [
  { id: "chotdae", name: ["추암 촛대바위", "Chotdae Rock"], area: ["추암권역", "Chuam area"] },
  { id: "yongchu", name: ["용추폭포·쌍폭포", "Yongchu Falls & Ssang Falls"], area: ["무릉권역", "Mureung area"] },
  { id: "mukho_lighthouse", name: ["묵호등대", "Mukho Lighthouse"], area: ["묵호권역", "Mukho area"] },
  { id: "hanseom", name: ["한섬해변", "Hanseom Beach"], area: ["천곡권역", "Cheongok area"] },
  { id: "mureung", name: ["무릉별유천지", "Mureung Byeolyucheonji"], area: ["무릉권역", "Mureung area"] },
  { id: "bookvillage", name: ["동호지구 바닷가책방마을", "Dongho Seaside Book Village"], area: ["묵호권역", "Mukho area"] },
  { id: "chuam_bridge", name: ["추암출렁다리", "Chuam Suspension Bridge"], area: ["추암권역", "Chuam area"] },
  { id: "haerang", name: ["도째비골 해랑전망대", "Haerang Observatory"], area: ["묵호권역", "Mukho area"] },
  { id: "nature_park", name: ["자연학습체험공원", "Nature Learning Park"], area: ["천곡권역", "Cheongok area"] },
  { id: "cheongok_port", name: ["천곡항", "Cheongok Port"], area: ["천곡권역", "Cheongok area"] },
  { id: "pencil_museum", name: ["연필뮤지엄", "Pencil Museum"], area: ["묵호권역", "Mukho area"] },
  { id: "chuam_sculpture", name: ["추암조각공원", "Chuam Sculpture Park"], area: ["추암권역", "Chuam area"] },
  { id: "dokkaebi", name: ["도째비골 스카이밸리", "Dojjaebigol Sky Valley"], area: ["묵호권역", "Mukho area"] },
  { id: "gamchu", name: ["감추해변", "Gamchu Beach"], area: ["천곡권역", "Cheongok area"] },
  { id: "little_prince", name: ["어린왕자포토존·별빛마을전망대", "Little Prince Photo Zone & Byeolbit Village Observatory"], area: ["묵호권역", "Mukho area"] },
  { id: "daejin", name: ["대진해변", "Daejin Beach"], area: ["묵호권역", "Mukho area"] },
  { id: "gobulgae", name: ["고불개해변", "Gobulgae Beach"], area: ["천곡권역", "Cheongok area"] },
] as const;

function FeaturedPlace({ lang }: { lang: Lang }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPaused(motion.matches);
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (paused || reading) return;
    const next = (index + 1) % featuredPlaces.length;
    const preload = new Image();
    preload.src = photoAt(featuredPlaces[next].id, 960);
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex(next);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [index, paused, reading]);
  const place = featuredPlaces[index];
  const language = lang === "ko" ? 0 : 1;
  return <figure className="planner-place">
    <img src={photoAt(place.id, 960)} alt="" />
    <button type="button" className="place-playback" onClick={() => setPaused(!paused)}
      aria-label={paused ? (lang === "ko" ? "사진 자동 전환 재생" : "Play slideshow") : (lang === "ko" ? "사진 자동 전환 일시정지" : "Pause slideshow")}>
      <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
    </button>
    <figcaption><span><Icon name="pin" />{place.area[language]}</span>
      <a href={`#/place/${place.id}`} onFocus={() => setReading(true)} onBlur={() => setReading(false)}>{place.name[language]} <span aria-hidden="true">↗</span></a>
    </figcaption>
  </figure>;
}

export function MoreLinks({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const rows = [
    ["bus", "#/transport", L("교통·주차", "Transport and parking"), L("역에서 나오는 길과 휠체어 탑승 차량", "Station exits and wheelchair transport")],
    ["map", "#/map", L("편의시설 지도", "Facilities map"), L("장애인 화장실과 전동휠체어 충전기", "Accessible toilets and wheelchair chargers")],
    ["food", "https://www.dh.go.kr/tour/contents.do?key=1910", L("음식점 편의시설", "Restaurant accessibility"), L("동해시가 안내하는 음식점별 시설 현황", "Facility listings from Donghae City")],
    ["cal", "#/events", L("축제·행사", "Festivals and events"), L("여행 날짜에 열리는 지역 행사", "Local events on your travel dates")],
    ["bed", "#/stay", L("숙박", "Accommodation"), L("여행할 권역의 숙소 찾기", "Places to stay by area")],
    ["phone", "#/community/ask", L("여행 문의", "Travel enquiries"), L("자주 묻는 질문과 문의하기", "Common questions and enquiries")],
  ];
  return <section className="sec wrap" aria-labelledby="more-h">
    <FeaturedPlace lang={lang} />
    <div className="city-info">
    <div className="sec-head"><h2 id="more-h">{L("여행 안내", "Visitor information")}</h2></div>
    <ul className="more-grid visitor-links">{rows.map(([icon, href, title, detail]) =>
      <li key={href}><a href={href}><Icon name={icon} /><div><b>{title}</b><span>{detail}</span></div>
        <i aria-hidden="true">{href.startsWith("https:") ? "↗" : "›"}</i></a></li>)}</ul>
    </div>
  </section>;
}

// 무장애 검색: 한국관광공사 열린관광의 분류·항목 이름을 그대로 쓴다 (backend/app/kto_access.py 의 access_kto.items)
// mode = 이 분류를 고르면 카드 신호등을 어떤 기준으로 볼지 (기존 '누구 기준으로 볼까요')
const BF: { k: string; ko: string; en: string; mode: string; opts: [string, string, string, string[]][] }[] = [
  { k: "지체장애", ko: "지체장애", en: "Mobility", mode: "wheel", opts: [
    ["주차여부", "주차여부", "Accessible parking", ["장애인 주차"]], ["대중교통", "대중교통", "Public transport", []], ["주 출입 접근로", "주 출입 접근로", "Step-free approach", ["출입구 턱 없음", "경사로"]],
    ["휠체어대여", "휠체어대여", "Wheelchair rental", ["휠체어 대여"]], ["출입통로", "출입통로", "Entrance", []], ["엘리베이터", "엘리베이터", "Elevator", ["엘리베이터"]],
    ["화장실", "화장실", "Accessible toilet", ["장애인 화장실"]], ["관람석(좌석)", "관람석(좌석)", "Seating", []], ["객실", "객실", "Rooms", []], ["지체장애 기타 상세", "지체장애 기타 상세", "Other", []]] },
  { k: "시각장애", ko: "시각장애", en: "Low vision", mode: "none", opts: [
    ["음성안내", "음성안내", "Audio guide", []], ["큰활자/점자 홍보물", "큰활자/점자 홍보물", "Large print / Braille", ["점자 안내"]], ["점자표지판", "점자표지판", "Braille signs", ["점자 안내"]],
    ["시각장애 기타상세", "시각장애 기타상세", "Other", ["보조견 동반 가능"]]] },
  { k: "청각장애", ko: "청각장애", en: "Hearing", mode: "none", opts: [["청각장애 기타상세", "청각장애 기타상세", "Other", []]] },
  { k: "영유아가족", ko: "영유아 가족", en: "Families", mode: "stroller", opts: [
    ["유모차 대여", "유모차 대여", "Stroller rental", []], ["수유실", "수유실", "Nursing room", ["수유실"]], ["유아용 보조의자/침대", "유아용 보조의자/침대", "Baby chair / bed", []],
    ["영유아가족 기타상세", "영유아가족 기타상세", "Other", ["기저귀 교환대"]]] },
  { k: "고령자", ko: "고령자", en: "Seniors", mode: "walk", opts: [["휠체어 대여", "휠체어 대여", "Wheelchair rental", ["휠체어 대여"]]] },
];
const HEAR = <><path d="M7.5 10a4.5 4.5 0 1 1 9 0c0 2.6-2.2 3.3-2.8 5.4-.5 1.8-1.4 3.6-3.7 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M10.2 10.2a1.8 1.8 0 1 1 3.3 1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M4 20 20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>;
const PER = 12;
const STYLE_TAG: [string, string, string][] = [["체험", "체험", "Activity"], ["역사·문화", "역사", "History"], ["산·등산", "산", "Mountain"], ["바다 보기", "바다", "Sea"], ["자연·산책", "자연", "Nature"]];

export function Places({ lang, onAdd, wish, gradeLabel, zone0 }: { lang: Lang; onAdd: (id: string) => void; wish: string[]; gradeLabel: (g: string) => string; zone0?: string }) {
  const L = pick(lang);
  const [zone, setZone] = useState(ZONES.some((z) => z.k === zone0) ? zone0! : "all");
  useEffect(() => { if (ZONES.some((z) => z.k === zone0)) setZone(zone0!); }, [zone0]);
  const [bfCat, setBfCat] = useState("");            // 무장애 검색에서 고른 분류
  const [bfOpts, setBfOpts] = useState<string[]>([]); // 그 분류의 세부 항목 (비면 '전체')
  const [open, setOpen] = useState<"" | "bf" | "need" | "sort">("");
  const mode = BF.find((b) => b.k === bfCat)?.mode || "none";
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { getJSON(`/api/places?mode=${mode}`).then(setList).catch(() => setList([])); }, [mode]);
  const [q, setQ] = useState("");
  const [need, setNeed] = useState<string[]>([]);
  const [sort, setSort] = useState<"rec" | "name" | "quiet">("rec");
  const [page, setPage] = useState(1);
  const [crowd, setCrowd] = useState<Record<string, { date: string; rate: number }[]>>({});
  useEffect(() => { getJSON("/api/crowd").then((j) => setCrowd(j.places || {})).catch(() => {}); }, []);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replaceAll("-", "");
  const rateToday = (id: string) => crowd[id]?.find((c) => c.date === today)?.rate;
  const Z = ZONES.find((z) => z.k === zone);
  const zc = (k: string) => ZONES.find((z) => z.k === k)?.c || "#2462B4";
  const key = q.trim().toLowerCase().replace(/\s+/g, "");
  const ORDER: Record<string, number> = { G: 0, Y: 1, R: 3 };
  const hasF = (p: any, names: string[]) => names.some((n) => (p.facilities || []).some((f: string) => f.startsWith(n)));
  const NEED_TEST: Record<string, (p: any) => boolean> = {
    sea: (p) => (p.styles || []).includes("바다 보기"), nature: (p) => (p.styles || []).includes("자연·산책"),
    mountain: (p) => (p.styles || []).includes("산·등산"), culture: (p) => (p.styles || []).includes("역사·문화"), activity: (p) => (p.styles || []).includes("체험"),
    indoor: (p) => !!p.indoor, flat: (p) => p.walk_load === "평지",
    toilet: (p) => hasF(p, ["장애인 화장실"]), parking: (p) => hasF(p, ["장애인 주차"]),
    quiet: (p) => { const r = rateToday(p.id); return r != null && r < 50; },
  };
  const hasCrowd = Object.keys(crowd).length > 0;
  const NEEDS: [string, string, string, string][] = [["sea", "바다 보기", "Sea views", "style"], ["nature", "자연·산책", "Nature walks", "style"], ["mountain", "산·등산", "Mountains & hiking", "style"],
    ["culture", "역사·문화", "History & culture", "style"], ["activity", "체험", "Activities", "style"],
    ["indoor", "비 와도 OK(실내)", "Indoor", "comfort"], ["flat", "덜 걷는 곳(평지)", "Flat, little walking", "comfort"], ["toilet", "장애인 화장실", "Accessible toilet", "comfort"],
    ["parking", "장애인 주차", "Accessible parking", "comfort"], ...(hasCrowd ? [["quiet", "오늘 한산한 곳", "Quiet today", "today"] as [string, string, string, string]] : [])];
  // 무장애 검색 세부 항목: 열린관광 항목(없음 제외)이 있거나, 같은 뜻의 편의시설이 있으면 맞음
  const bf = BF.find((b) => b.k === bfCat);
  const bfOk = (p: any) => {
    if (!bf) return true;
    const items: [string, string][] = p.access_kto?.items?.[bf.k] || [];
    if (!bfOpts.length) return bf.mode !== "none" || items.length > 0;   // 시각·청각은 고르기만 해도 정보 있는 곳만
    return bfOpts.every((o) => { const opt = bf.opts.find((x) => x[0] === o)!; return items.some(([k]) => k === o) || hasF(p, opt[3]); });
  };
  const filtering = !!key || need.length > 0 || bfOpts.length > 0 || (!!bf && bf.mode === "none");
  const exact = (p: any) => `${p.name_ko}${p.name_en || ""}${p.intro_ko || ""}${(p.facilities || []).join("")}${(p.styles || []).join("")}`.toLowerCase().replace(/\s+/g, "").includes(key);
  const sightish = (p: any) => p.type !== "숙박" && p.type !== "식당" && p.type !== "카페";
  // 그대로 찾아서 하나도 없으면 오타를 고쳐 이름으로 다시 찾는다 ("촛데바위" → 촛대바위)
  const typo = !!key && !list.some((p) => sightish(p) && exact(p)) && list.some((p) => sightish(p) && fuzzyHit(p.name_ko, key) >= 0);
  const items = list.filter((p) => sightish(p)
      && (key ? (typo ? fuzzyHit(p.name_ko, key) >= 0 : exact(p)) : true)
      && need.every((n) => NEED_TEST[n]?.(p)) && bfOk(p)
      && (filtering || zone === "all" || p.zone === zone))
    .sort((a, b) => sort === "name" ? a.name_ko.localeCompare(b.name_ko, "ko")
      : sort === "quiet" ? (rateToday(a.id) ?? 999) - (rateToday(b.id) ?? 999)
      : (mode === "none" ? 0 : (ORDER[a.grade] ?? 2) - (ORDER[b.grade] ?? 2)));
  useEffect(() => setPage(1), [zone, mode, key, need.join(), bfOpts.join(), bfCat, sort]);
  const pages = Math.max(1, Math.ceil(items.length / PER));
  const cur = Math.min(page, pages);
  const shown = items.slice((cur - 1) * PER, cur * PER);
  const toggle = (k: string) => setNeed(need.includes(k) ? need.filter((x) => x !== k) : [...need, k]);
  const pickCat = (k: string) => { setBfOpts([]); setBfCat(bfCat === k ? "" : k); };
  const toggleOpt = (o: string) => setBfOpts(bfOpts.includes(o) ? bfOpts.filter((x) => x !== o) : [...bfOpts, o]);
  const clearAll = () => { setNeed([]); setBfCat(""); setBfOpts([]); setQ(""); };
  const SORTS: [typeof sort, string, string][] = [["rec", mode === "none" ? "추천순" : "갈 수 있는 곳 먼저", mode === "none" ? "Recommended" : "Accessible first"], ["name", "이름순", "By name"], ...(hasCrowd ? [["quiet", "오늘 한산한 순", "Quietest today"] as [typeof sort, string, string]] : [])];
  const catIcon = (k: string) => k === "청각장애" ? HEAR : ACCESS_CATS[k]?.d;
  const tagOf = (p: any) => STYLE_TAG.find(([s]) => (p.styles || []).includes(s));
  const chipsOn: [string, () => void][] = [
    ...(bf ? [[L(`${bf.ko} 기준`, `${bf.en}`), () => pickCat(bf.k)] as [string, () => void]] : []),
    ...bfOpts.map((o) => [L(o, bf?.opts.find((x) => x[0] === o)?.[2] || o), () => toggleOpt(o)] as [string, () => void]),
    ...need.map((n) => [L(NEEDS.find((x) => x[0] === n)?.[1] || n, NEEDS.find((x) => x[0] === n)?.[2] || n), () => toggle(n)] as [string, () => void]),
  ];
  return (
    <section id="places" className="sec wrap pl2" aria-labelledby="places-h">
      {/* 첫 띠: 제목 + 장소 찾기 + 실제 동해 사진 */}
      <header className="pl2-hero" style={{ ["--pl2-img" as any]: `url(${photoAt("chotdae", 1920) || ""})` }}>
        <div className="pl2-hero-txt">
          <h2 id="places-h">{L("가고 싶은 동해를 찾아보세요", "Find your place in Donghae")}</h2>
          <p>{L("누구와 가는지 고르면, 갈 수 있는 곳부터 신호등으로 보여 드려요.", "Tell us who's coming and we'll show where you can go first.")}</p>
          <form className="pl2-search" role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="psearch" className="sr-only">{L("장소 찾기", "Find a place")}</label>
            <Icon name="pin" />
            <input id="psearch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("장소 찾기: 이름이나 시설 (예: 등대, 엘리베이터)", "Find a place: name or facility (e.g. lighthouse, elevator)")} />
            {q && <button type="button" className="chip" onClick={() => setQ("")}>{L("지우기", "Clear")}</button>}
          </form>
        </div>
      </header>

      {/* 무장애 검색: 접힌 띠 → 분류 상자 5개 → 고른 분류의 세부 항목 */}
      <div className={`bf2${open === "bf" ? " on" : ""}`}>
        <button className="bf2-bar" aria-expanded={open === "bf"} aria-controls="bf2-body" onClick={() => setOpen(open === "bf" ? "" : "bf")}>
          <span className="bf2-bar-t"><AccIcon k="지체장애" size={24} />{L("무장애 검색", "Accessibility search")}</span>
          {bf && <span className="bf2-bar-sel">{L(bf.ko, bf.en)}{bfOpts.length ? ` · ${bfOpts.length}` : ""}</span>}
          <Icon name="down" className={`bf2-chev${open === "bf" ? " up" : ""}`} />
        </button>
        {open === "bf" && (
          <div id="bf2-body" className="bf2-body">
            <div className="bf2-cats" role="group" aria-label={L("무장애 분류", "Access categories")}>
              {BF.map((b) => (
                <button key={b.k} className="bf2-cat" aria-pressed={bfCat === b.k} onClick={() => pickCat(b.k)}>
                  <AccIcon k={b.k} size={44} />
                  <span>{L(b.ko, b.en)}</span>
                </button>))}
            </div>
            {bf ? (
              <fieldset className="bf2-opts">
                <legend>{L(`${bf.ko} 세부 항목`, `${bf.en} details`)}</legend>
                <label className="bf2-ck"><input type="checkbox" checked={!bfOpts.length} onChange={() => setBfOpts([])} /><span>{L("전체", "All")}</span></label>
                {bf.opts.map(([o, ko, en]) => (
                  <label key={o} className="bf2-ck"><input type="checkbox" checked={bfOpts.includes(o)} onChange={() => toggleOpt(o)} /><span>{L(ko, en)}</span></label>))}
                {bf.k === "청각장애" && <p className="muted small bf2-note">{L("동해 관광지에는 아직 청각장애 편의정보가 등록되지 않았어요 (한국관광공사 열린관광 기준).", "No hearing-access info is registered for Donghae places yet.")}</p>}
                {bf.mode !== "none" && <p className="muted small bf2-note">{L(`카드에 ${({ wheel: "휠체어", stroller: "유모차", walk: "오래 걷기 어려움" } as any)[bf.mode]} 기준 신호등이 보여요. 세부 항목을 고르면 그 시설이 있는 곳만 남아요.`, "Cards show an access signal for this need. Tick details to keep only places with them.")}</p>}
              </fieldset>
            ) : <p className="muted small bf2-hint">{L("누구와 가는지 상자를 하나 골라 주세요. 다시 누르면 풀려요.", "Pick a box. Tap again to clear.")}</p>}
          </div>)}
      </div>

      {/* 도구 막대: 맞춤 필터 · 정렬 (눌러서 열기) */}
      <div className="pl2-tools">
        <div className="pl2-pop">
          <button className="pl2-tool" aria-expanded={open === "need"} onClick={() => setOpen(open === "need" ? "" : "need")}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            {L("맞춤 필터", "Filters")}{need.length > 0 && <b className="pl2-n">{need.length}</b>}<Icon name="down" className={`bf2-chev${open === "need" ? " up" : ""}`} />
          </button>
          {open === "need" && (
            <div className="pl2-panel" role="group" aria-label={L("맞춤 필터", "Filters")}>
              {([["style", "이런 곳을 찾아요", "Kind of place"], ["comfort", "편하게 다니려면", "Comfort"], ["today", "오늘", "Today"]] as const).map(([g, ko, en]) => {
                const xs = NEEDS.filter((x) => x[3] === g);
                return xs.length ? <div key={g} className="pl2-grp"><p>{L(ko, en)}</p><div className="chips">
                  {xs.map(([k, nko, nen]) => <button key={k} className="chip" aria-pressed={need.includes(k)} onClick={() => toggle(k)}>{L(nko, nen)}</button>)}</div></div> : null;
              })}
              <div className="pl2-panel-foot">
                {need.length > 0 && <button className="chip plain" onClick={() => setNeed([])}>{L("필터 풀기", "Clear filters")}</button>}
                <button className="chip go" onClick={() => setOpen("")}>{L(`${items.length}곳 보기`, `Show ${items.length}`)}</button>
              </div>
            </div>)}
        </div>
        <div className="pl2-pop right">
          <button className="pl2-tool plain" aria-expanded={open === "sort"} onClick={() => setOpen(open === "sort" ? "" : "sort")}>
            {SORTS.find((s) => s[0] === sort)?.[lang === "ko" ? 1 : 2]}<Icon name="down" className={`bf2-chev${open === "sort" ? " up" : ""}`} />
          </button>
          {open === "sort" && (
            <ul className="pl2-panel pl2-sort" role="listbox" aria-label={L("정렬", "Sort")}>
              {SORTS.map(([k, ko, en]) => <li key={k}><button role="option" aria-selected={sort === k} onClick={() => { setSort(k); setOpen(""); }}>{L(ko, en)}</button></li>)}
            </ul>)}
        </div>
      </div>
      {chipsOn.length > 0 && (
        <div className="pl2-on" aria-label={L("고른 조건", "Active filters")}>
          {chipsOn.map(([t, off]) => <button key={t} className="pl2-onchip" onClick={off} aria-label={L(`${t} 풀기`, `Remove ${t}`)}>{t}<span aria-hidden="true">×</span></button>)}
          <button className="link-btn" onClick={clearAll}>{L("초기화", "Reset")}</button>
        </div>)}

      {/* 지역 탭 (전체 + 다섯 권역) */}
      <div className="tabs" role="group" aria-label={L("권역", "Areas")} hidden={filtering}>
        <button aria-pressed={zone === "all"} onClick={() => setZone("all")} style={{ ["--z" as any]: "#12355E" }}>{L("전체", "All")}</button>
        {ZONES.map((z) => (
          <button key={z.k} aria-pressed={zone === z.k} onClick={() => setZone(z.k)} style={{ ["--z" as any]: z.c }}>{L(z.ko, z.en)}</button>))}
      </div>
      {filtering
        ? <p className="zone-d" role="status">{typo && <><b className="typo-fix">{L(`'${q.trim()}'와 비슷한 이름으로 찾았어요`, `Showing names similar to '${q.trim()}'`)}</b> </>}{L(`${key ? `'${q.trim()}' ` : ""}조건에 맞는 곳 ${items.length}곳 (모든 권역)`, `${items.length} place(s) match${key ? ` '${q.trim()}'` : ""} in all areas`)}</p>
        : !Z ? <p className="zone-d"><b>{L("동해 전체", "All of Donghae")}</b> {L(`다섯 권역 ${items.length}곳을 한 번에 봐요. 권역 탭을 누르면 그 지역만 보여요.`, `${items.length} places across five areas.`)}</p>
        : <p className="zone-d"><b style={{ color: Z.c }}>{L(Z.ko, Z.en)}</b> {L(Z.d[0], Z.d[1])}</p>}

      <div className="pgrid pl2-grid">
        {shown.map((p) => {
          const g = p.grade as string | null, inW = wish.includes(p.id), tag = tagOf(p), r = rateToday(p.id);
          const ic: [string, JSX.Element, string, string][] = [];
          if ((p.access_kto?.cats || []).includes("지체장애") || ["가능", "일부"].includes(p.wheelchair)) ic.push(["w", <AccIcon key="w" k="지체장애" size={18} />, "휠체어 접근 정보 있음", "Wheelchair info"]);
          if (hasF(p, ["장애인 주차"])) ic.push(["p", <b key="p" className="pl2-P" aria-hidden="true">P</b>, "장애인 주차", "Accessible parking"]);
          if (hasF(p, ["장애인 화장실"])) ic.push(["t", <Icon key="t" name="toilet" />, "장애인 화장실", "Accessible toilet"]);
          if ((p.access_kto?.cats || []).includes("영유아가족")) ic.push(["s", <AccIcon key="s" k="영유아가족" size={18} />, "영유아 가족 편의", "Family facilities"]);
          if ((p.access_kto?.cats || []).includes("시각장애")) ic.push(["v", <AccIcon key="v" k="시각장애" size={18} />, "시각장애 편의", "Low-vision support"]);
          if ((p.access_kto?.cats || []).includes("고령자")) ic.push(["o", <AccIcon key="o" k="고령자" size={18} />, "어르신 편의", "Senior support"]);
          return (
            <article key={p.id} className="pcard pl2-card">
              <div className="art"><Art id={p.id} color={zc(p.zone)} />{PHOTOS[p.id] && <PlacePhoto id={p.id} lang={lang} />}
                {tag && <span className="pl2-tag">{L(tag[1], tag[2])}</span>}
                {mode !== "none" && <span className={`badge ${g ? "g-" + g : "g-N"}`}>{g ? gradeLabel(g) : L("확인 전", "Not checked")}</span>}
              </div>
              <div className="pb">
                {(zone === "all" || filtering) && <span className="ztag" style={{ color: zc(p.zone) }}>{L(ZONES.find((z) => z.k === p.zone)?.ko || "", ZONES.find((z) => z.k === p.zone)?.en || "")}</span>}
                <h3 className="pl2-name"><a className="plink" href={`#/place/${p.id}`}>{L(p.name_ko, p.name_en || p.name_ko)}</a>{p.sample && <span className="ex">{L("예시", "sample")}</span>}
                  {r != null && <span className={`pl2-crowd crowd-${r >= 70 ? "high" : r >= 40 ? "mid" : "low"}`} title={L(`오늘 붐빔 예상 ${Math.round(r)}%`, `Today ${Math.round(r)}%`)}>{L("오늘", "Today")} {r >= 70 ? L("붐빔", "busy") : r >= 40 ? L("보통", "moderate") : L("여유", "quiet")}</span>}</h3>
                <p className="pl2-desc">{(lang === "ko" ? (p.intro_ko || p.tip_ko) : (p.intro_en || p.tip_en || p.intro_ko)) || L("소개를 준비하고 있어요.", "Description coming soon.")}</p>
                {ic.length > 0 && <ul className="pl2-ic" aria-label={L("편의시설", "Facilities")}>{ic.map(([k, el, ko, en]) => <li key={k} title={L(ko, en)}>{el}<span className="sr-only">{L(ko, en)}</span></li>)}</ul>}
                {p.facilities?.length > 0 && <p className="sr-only">{p.facilities.map((f: string) => tr(lang, f)).join(", ")}</p>}
                <div className="pl2-foot">
                  <button className={`add${inW ? " on" : ""}`} disabled={g === "R"} onClick={() => onAdd(p.id)}>
                    {g === "R" ? L("이 기준으로는 어려워요", "Not reachable for this need") : inW ? L("✓ 담았어요", "✓ Added") : L("코스에 담기", "Add to route")}
                  </button>
                  <a className="more" href={`#/place/${p.id}`} tabIndex={-1} aria-hidden="true">{L("자세히 보기", "Details")} →</a>
                </div>
              </div>
            </article>
          );
        })}
        {!items.length && <div className="muted pl2-empty"><p>{filtering ? L("조건에 맞는 장소가 없어요. 조건을 하나씩 풀어 보세요.", "No places match. Try removing a filter.") : L("이 권역 장소는 데이터를 정리하고 있어요.", "Places for this area are being prepared.")}</p>
          {filtering && <button className="chip" onClick={clearAll}>{L("조건 초기화", "Reset filters")}</button>}</div>}
      </div>
      {pages > 1 && (
        <nav className="cm-pager" aria-label={L("쪽 넘기기", "Pages")}>
          <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label={L("이전 쪽", "Previous page")}>‹</button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => <button key={n} aria-current={n === cur ? "page" : undefined} onClick={() => { setPage(n); document.getElementById("places")?.scrollIntoView({ behavior: "smooth" }); }}>{n}</button>)}
          <button disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label={L("다음 쪽", "Next page")}>›</button>
        </nav>)}
    </section>
  );
}

/* ---------------- 이렇게 써요: 코스 짜기 바로 위에 짧게. ×로 닫으면 이 기기에서는 다시 안 뜬다 ---------------- */
export function HowToStrip({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const L = pick(lang);
  const steps: [string, string, string, string][] = [
    ["route", "조건 고르기", "Tell us your trip", L("버튼을 누르거나 \"엄마랑, 무릎이 안 좋아요\"처럼 말해요", "Tap buttons or just say it")],
    ["map", "갈 수 있는 코스 받기", "Get a doable route", L("그날 문 연 곳만, 길 상태를 확인한 순서로", "Only open places, checked paths")],
    ["share", "고치고 저장·공유", "Edit, save, share", L("\"오르막 빼줘\" 한마디로 고치고 가족에게 보내요", "Say \"no uphill\", then send it to family")],
  ];
  return (
    <aside className="howto-strip" aria-labelledby="howto-h">
      <h3 id="howto-h">{L("처음이세요? 이렇게 하면 돼요", "New here? Three steps")}</h3>
      <ol>{steps.map(([ic, ko, en, d], i) => <li key={ko}><span className="n" aria-hidden="true">{i + 1}</span><Icon name={ic} /><span><b>{L(ko, en)}</b><small>{d}</small></span></li>)}</ol>
      <a className="howto-more" href="#/places">{L("먼저 관광지 둘러보기", "Browse places first")}</a>
      <button className="howto-x" onClick={onClose} aria-label={L("사용법 닫기", "Close the guide")}>×</button>
    </aside>
  );
}

/* ---------------- 추천 코스 (예시) ---------------- */
export const PRESETS = [
  { t: ["부모님 모시고 무릎 편한 묵호 바다", "Easy-walking Mukho seaside with parents"], who: "부모님과", move: ["오래 걷기 어려움"], style: ["바다 보기", "맛집"], start: "묵호역", photo: "zone_mukho",
    tags: [["오래 걷기 어려움", "Limited walking"], ["부모님", "Parents"], ["기차", "By train"]], by: ["추천 코스 · 70대 부모님과", "Suggested route · with parents in their 70s"] },
  { t: ["휠체어로 무릉 반나절", "Half day in Mureung by wheelchair"], who: "연인·친구", move: ["휠체어"], style: ["자연·산책", "역사·문화"], start: "자가용", photo: "valley",
    tags: [["휠체어", "Wheelchair"], ["자연", "Nature"], ["자가용", "By car"]], by: ["추천 코스 · 휠체어 이용 2인", "Suggested route · two travelers, one wheelchair"] },
  { t: ["유모차로 비 오는 날", "Rainy day with a stroller"], who: "아이와", move: ["유모차"], style: ["역사·문화", "카페"], start: "동해역", rain: true, photo: "cave",
    tags: [["유모차", "Stroller"], ["실내 위주", "Mostly indoors"], ["기차", "By train"]], by: ["추천 코스 · 아이 동반 가족", "Suggested route · family with a toddler"] },
] as const;
export function Courses({ lang, onStart, busy }: { lang: Lang; onStart: (i: number) => void; busy: boolean }) {
  const L = pick(lang);
  return (
    <section id="courses" className="sec wrap" aria-labelledby="courses-h">
      <div className="sec-head">
        <h2 id="courses-h">{L("이렇게 다녀 보세요", "Routes to start from")}</h2>
        <p>{L("조건이 비슷하면 그대로 시작하고, 동이에게 말로 고치면 돼요.", "Start from one that fits and adjust it by talking to Dongi. These are sample routes.")}</p>
      </div>
      <div className="cgrid">
        {PRESETS.map((c, i) => (
          <article key={i} className="ccard">
            <div className="ccard-ph"><PlacePhoto id={c.photo} lang={lang} /></div>
            <h3>{L(c.t[0], c.t[1])}</h3>
            <ul className="tags">{c.tags.map((x) => <li key={x[0]}>{L(x[0], x[1])}</li>)}</ul>
            <p className="by">{L(c.by[0], c.by[1])}</p>
            <button className="start" disabled={busy} onClick={() => onStart(i)}>{L("이 조건으로 코스 짜기", "Plan with these needs")}</button>
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
  { p: ["도째비골 스카이밸리", "Dokkaebigol Sky Valley"], tag: ["English", "English"], t: ["영어 코스와 엘리베이터 안내 덕분에 시간을 아꼈어요. 긴급·도움 화면의 영어 안내소 정보도 유용했어요.", "The English route and the elevator tip saved us time. The English-speaking info center in Help helped too."], r: ["도움이 되었다니 기뻐요! 즐거운 여행 되세요.", "Glad it helped! Enjoy Donghae."] },
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
