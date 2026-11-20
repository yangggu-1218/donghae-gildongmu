"use client";
// v4 페이지: 장소 상세 · 교통 · 편의시설 지도 · 내 일정 · 행사 달력 · 숙소 · 여행 준비 · 출처·판정 기준 · 관리자
// 주소는 #/place/<id> 처럼 '#/' 뒤에 붙는다 (정적 데모와 Next 서버에서 똑같이 동작).
import { useEffect, useMemo, useRef, useState } from "react";
import { api, getJSON } from "@/lib/api";
import KakaoMap from "@/components/KakaoMap";
import { NearbyEats } from "@/components/Eateries";
import { PlacePhoto, ZONES } from "@/components/Sections";
import { AccessPanel, AccessBadges, AccIcon } from "@/components/AccessBadges";
import { PHOTOS, GALLERY, photoAt } from "@/lib/photos";
import { WHEEL_EN } from "@/components/Timeline";
import { tr, dot, SOURCE_NOTES_EN, nm, ad } from "@/lib/ko2en";
import { Icon, Picto, VERDICT_PICTO } from "@/components/Icon";
import { fuzzyHit } from "@/lib/fuzzy";
import { PlaceTalk } from "@/components/Community";
import { AiJudge, AiStatus, useJudge, verdictText } from "@/components/AiCards";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);
const dist = (m?: number) => (m == null ? "" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
const GRADE = { G: ["갈 수 있어요", "Accessible"], Y: ["주의", "Caution"], R: ["어려워요", "Not accessible"] } as const;
const WALK_EN: Record<string, string> = { "평지": "Flat", "완만한경사": "Gentle slope", "급경사": "Steep", "확인 전": "Not checked" };

export function Head({ title, sub, crumb, lang, photo, mascot }: { title: string; sub?: string; crumb?: [string, string][]; lang: Lang; photo?: string; mascot?: string }) {
  const L = pick(lang);
  const [bad, setBad] = useState(false);
  const has = !!(photo && PHOTOS[photo]) && !bad;
  return (
    <div className={`page-head${photo ? " has-photo" : ""}`}>
      {has && <img className="page-head-bg" src={photoAt(photo!, 960)} alt="" decoding="async" onError={() => setBad(true)} />}
      {mascot && <img className="page-head-mascot" src={`/dongi/${mascot}.webp`} alt="" decoding="async" />}
      <nav className="crumb" aria-label={L("현재 위치", "Breadcrumb")}>
        <a href="#/">{L("처음", "Home")}</a>
        {(crumb || []).map(([href, t]) => <span key={href}> › <a href={href}>{t}</a></span>)}
        <span aria-current="page"> › {title}</span>
      </nav>
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}
// 긴 목록은 앞부분만 보여 주고 버튼으로 펼친다
function More({ n, total, open, onToggle, lang }: { n: number; total: number; open: boolean; onToggle: () => void; lang: Lang }) {
  if (total <= n) return null;
  return <button className="chip more-btn" aria-expanded={open} onClick={onToggle}>{open ? (lang === "ko" ? "접기" : "Show less") : (lang === "ko" ? `${total}곳 모두 보기` : `Show all ${total}`)}</button>;
}

function useLoad<T>(fn: () => Promise<T>, deps: any[]): [T | null, boolean] {
  const [v, setV] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let on = true; setErr(false); fn().then((x) => on && setV(x)).catch(() => on && setErr(true)); return () => { on = false; }; }, deps);
  return [v, err];
}
const Loading = ({ err, lang }: { err: boolean; lang: Lang }) =>
  <p className="muted">{err ? pick(lang)("정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.", "Couldn't load. Please try again.") : pick(lang)("불러오는 중이에요.", "Loading…")}</p>;

/* ---------------- 한국관광공사 빅데이터 (장소 상세) ---------------- */
export const crowdLevel = (r?: number | null) => (r == null ? null : r >= 70 ? "high" : r >= 40 ? "mid" : "low");
const CROWD_TXT = { high: ["붐빔 예상", "Busy"], mid: ["보통", "Moderate"], low: ["여유", "Quiet"] } as const;
export function CrowdBadge({ rate, lang }: { rate?: number | null; lang: Lang }) {
  const lv = crowdLevel(rate);
  if (!lv) return null;
  return <span className={`badge crowd-${lv}`} title={pick(lang)("한국관광공사 관광지 집중률 예측", "KTO crowd forecast")}>{pick(lang)(CROWD_TXT[lv][0], CROWD_TXT[lv][1])} {Math.round(rate!)}%</span>;
}
const ymd = (s: string) => `${+s.slice(4, 6)}/${+s.slice(6, 8)}`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];

// 붐빔 정도를 글자로 (색만으로 전하지 않게)
const crowdWord = (r: number, lang: string) => (r >= 70 ? (lang === "ko" ? "붐빔 예상" : "busy") : r >= 40 ? (lang === "ko" ? "보통" : "moderate") : (lang === "ko" ? "여유" : "quiet"));

function PlaceData({ id, lang }: { id: string; lang: Lang }) {
  const L = pick(lang);
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); api.get(`/api/place/${id}/bigdata?lang=${lang}`).then(setD).catch(() => setD({})); }, [id, lang]);
  if (!d) return null;
  const crowd: { date: string; rate: number }[] = (d.crowd || []).slice(0, 14);
  const quiet = [...(d.crowd || [])].sort((a: any, b: any) => a.rate - b.rate).slice(0, 3).sort((a: any, b: any) => a.date.localeCompare(b.date));
  const max = Math.max(100, ...crowd.map((c) => c.rate || 0));
  const has = crowd.length || d.related?.length || d.food?.length || d.stay?.length || d.audio?.length;
  if (!has) return null;
  const facts = (f: Record<string, string>) => Object.entries(f).filter(([k]) => ["wheelchair", "exit", "route", "restroom", "parking", "elevator", "stroller"].includes(k)).slice(0, 4);
  // 관광지 상세: '한산한 날' 한 줄만 보이고, 그래프·표·해설·함께 간 곳·근처 무장애 정보는 접어 둔다 (출처는 맨 아래 '정보 출처')
  return (
    <div className="panel bigdata pp2-days">
      <h2 className="h3 pp2-h"><Icon name="crowd" />{L("방문하기 좋은 날", "Best days to visit")}</h2>
      {quiet.length > 0 ? <p className="pp2-line"><b>{L("한산한 날", "Quiet days")}:</b> {quiet.map((q: any) => ymd(q.date)).join(", ")} <small className="muted">{L("(예측)", "(forecast)")}</small></p>
        : <p className="muted small">{L("붐빔 예측이 없는 곳이에요.", "No crowd forecast for this place.")}</p>}
      <details className="pp2-more"><summary>{L("붐빔 그래프·해설 듣기·함께 간 곳", "Crowd chart, audio guide, nearby picks")}</summary>
      {crowd.length > 0 && (
        <section>
          <h3>{L("앞으로 2주 붐빔 예상", "Crowd forecast, next 2 weeks")}</h3>
          <div className="crowd-chart" aria-hidden="true">
            {crowd.map((c) => {
              const dt = new Date(+c.date.slice(0, 4), +c.date.slice(4, 6) - 1, +c.date.slice(6, 8));
              const q = quiet.some((x: any) => x.date === c.date);
              return (
                <div key={c.date} className="cc-col" title={`${ymd(c.date)} ${Math.round(c.rate)}% (${crowdWord(c.rate, lang)})`}>
                  {q && <span className="cc-tag">{L("한산", "quiet")}</span>}
                  <span className={`cc-bar${q ? " quiet" : ""}`} style={{ height: `${Math.max(6, (c.rate / max) * 100)}%` }} />
                  <span className="cc-d">{ymd(c.date)}<br />{lang === "ko" ? WD[dt.getDay()] : dt.toLocaleDateString("en", { weekday: "short" })}</span>
                </div>
              );
            })}
          </div>
          <details className="cc-table"><summary>{L("표로 보기", "Show as a table")}</summary>
            <table className="tbl"><thead><tr><th>{L("날짜", "Date")}</th><th>{L("붐빔 예상", "Crowd")}</th></tr></thead>
              <tbody>{crowd.map((c) => <tr key={c.date}><td>{ymd(c.date)}</td><td>{Math.round(c.rate)}% · {crowdWord(c.rate, lang)}</td></tr>)}</tbody></table></details>
        </section>
      )}
      {d.audio?.length > 0 && (
        <section>
          <h3>{L("해설 듣기", "Listen to the story")}</h3>
          {d.audio.slice(0, 3).map((a: any) => (
            <div key={a.audio} className="audio-row">
              <b>{a.title}</b>
              <audio controls preload="none" src={a.audio.replace(/^http:/, "https:")} />
              {a.script && <details><summary>{L("글로 읽기", "Read transcript")}</summary><p className="small">{a.script}</p></details>}
            </div>
          ))}
        </section>
      )}
      {d.related?.length > 0 && (
        <section>
          <h3>{L("여기 온 사람들이 함께 간 곳", "People also visited")}</h3>
          <div className="chips">
            {d.related.map((r: any) => r.id
              ? <a key={r.name} className="chip" href={`#/place/${r.id}`}>{L(r.name, r.name_en || r.name)}</a>
              : <span key={r.name} className="chip plain">{r.name}{r.region && r.region !== "동해시" ? ` · ${r.region}` : ""}</span>)}
          </div>
          <p className="small"><a href="#plan">{L("이곳을 넣어 코스 짜기", "Plan a route with this place")}</a></p>
        </section>
      )}
      {(d.food?.length > 0 || d.stay?.length > 0) && (
        <section>
          <h3>{L("근처 무장애 정보가 있는 곳", "Nearby places with access info")}</h3>
          <ul className="plain bf-list">
            {[...(d.food || []), ...(d.stay || [])].map((b: any) => (
              <li key={b.id}>
                <b>{b.name}</b> <span className="badge b-plain">{b.type === "food" ? L("음식점", "Restaurant") : L("숙소", "Lodging")}</span> <span className="muted">{dist(b.dist_m)}</span>
                <ul className="small">{facts(b.facts).map(([k, v]) => <li key={k}><b>{d.labels?.[k] || k}</b> {v}</li>)}</ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      </details>
    </div>
  );
}

// 자주 묻는 질문 답의 [교통]·[편의시설 지도]·[내 일정]을 그 페이지 바로가기로 (IMP-010)
const FAQ_LINK: Record<string, string> = { "교통": "#/transport", "편의시설 지도": "#/map", "내 일정": "#/my", "Transport": "#/transport" };
function faqLinks(a: string) {
  return a.split(/(\[[^\]]+\])/).map((part, i) => {
    const m = part.match(/^\[(.+)\]$/);
    return m && FAQ_LINK[m[1]] ? <a key={i} href={FAQ_LINK[m[1]]}>[{m[1]}] 바로가기</a> : part;
  });
}

/* ---------------- 장소 상세 ---------------- */
// 동해시 CIP 디자인표준편람의 마스코트 응용형 중 장소와 맞는 그림
const SCENE: Record<string, string> = { chotdae: "scene-chotdae", cave: "scene-cave", valley: "scene-valley", eodal: "scene-eodal", mangsang: "scene-mangsang" };
// 관광지 상세 — 답할 질문은 하나: "나(휠체어·유모차·오래 걷기 어려움)는 여기 갈 수 있나, 가기 전에 뭘 알아야 하나" (2026-11-21 정리)
// 순서: 중요한 소식 → 첫 화면(판정 한 줄 · 이용 정보 띠 · 소개 2줄 · 사진) → 이동·접근성 → 주변 → 방문하기 좋은 날 → 다녀온 사람들 → 알고 가면 → 정보 출처
// 같은 정보는 한 번만. 자세한 것은 지우지 않고 접기·링크로 (어디로 옮겼는지는 docs/12_CHANGELOG.md 2026-11-21)
const NEWS_RE = /공사|임시 ?휴|휴관|폐쇄|통제|운영 ?중단/;          // '알고 가면' 중 맨 위 알림으로 올릴 것
const CLOSED_RE = /쉬어요|휴무|휴관일|문을 닫/;                       // 이용 정보 띠(휴무)와 겹치는 것
const FEE_RE = /입장료/;   // 체험시설 '요금'은 입장료가 아니므로 옮기지 않음                               // 이용 정보 띠(입장료)와 겹치는 것
const DIST_RE = /\d+(?:\.\d+)?\s*(?:m|km)\b/;

export function PlacePage({ id, lang, onAdd, wished }: { id: string; lang: Lang; onAdd: (id: string) => void; wished?: boolean }) {
  const L = pick(lang);
  const [mode, setMode] = useState<"wheel" | "stroller" | "walk">("wheel");
  const [p, err] = useLoad(() => api.place(id, lang, mode), [id, lang, mode]);
  const stay = p?.type === "숙박";
  const j = useJudge(id, mode, lang, !p || stay);
  const [introOpen, setIntroOpen] = useState(false);
  const [eatMore, setEatMore] = useState(false);
  if (!p) return <section className="sec wrap"><Loading err={err} lang={lang} /></section>;
  const name = lang === "ko" ? p.name_ko : p.name_en || p.name_ko;
  const zone = ZONES.find((z) => z.k === p.zone);
  const today = { open: L("지금 운영 중", "Open now"), always: L("상시 개방", "Always open"), closed: L("오늘 쉬는 날", "Closed today"),
    closed_now: L("지금은 운영시간이 아니에요", "Closed right now"), unknown: L("운영시간 확인 필요", "Check hours") }[p.today as string];
  const n = p.nearby || {};
  const segs: any[] = p.segments || [];
  const MODES = [["wheel", "휠체어", "Wheelchair", "wheel"], ["stroller", "유모차", "Stroller", "stroller"], ["walk", "오래 걷기 어려움", "Limited walking", "walk"]] as const;
  const modeName = L(MODES.find((m) => m[0] === mode)![1], MODES.find((m) => m[0] === mode)![2]);
  const todayIso = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const live = (p.notices || []).filter((x: any) => !x.end || x.end >= todayIso);

  // '알고 가면'을 나눠서: 중요한 소식은 맨 위로, 휴무·입장료는 이용 정보 띠로, 나머지만 접힌 칸에
  const lines = (p.about || []).flatMap((a: any) => a.i.map((x: string[]) => ({ t: a.t, x })));
  const news = lines.filter((l: any) => NEWS_RE.test(l.x[0]));
  const closedMore = lines.filter((l: any) => !NEWS_RE.test(l.x[0]) && CLOSED_RE.test(l.x[0])).map((l: any) => L(l.x[0], l.x[1]));
  const feeMore = lines.filter((l: any) => !NEWS_RE.test(l.x[0]) && !CLOSED_RE.test(l.x[0]) && FEE_RE.test(l.x[0])).map((l: any) => L(l.x[0], l.x[1]));
  const moved = new Set([...news, ...lines.filter((l: any) => CLOSED_RE.test(l.x[0]) || FEE_RE.test(l.x[0]))].map((l: any) => l.x[0]));
  const about = (p.about || []).map((a: any) => ({ ...a, i: a.i.filter((x: string[]) => !moved.has(x[0])) })).filter((a: any) => a.i.length);

  // 한눈에 칩 (AI 근거와 겹치므로 접힌 '근거' 안으로)
  const chips: string[] = [];
  if (p.walk_load && p.walk_load !== "확인 전") chips.push(lang === "ko" ? `걷기: ${p.walk_load}` : `Walking: ${WALK_EN[p.walk_load] || p.walk_load}`);
  if (p.wheelchair && p.wheelchair !== "확인 전") chips.push(L(`휠체어 ${p.wheelchair}`, `Wheelchair: ${WHEEL_EN[p.wheelchair] || p.wheelchair}`));
  if (p.entrance_step === false) chips.push(L("출입구 턱 없음", "Step-free entrance"));
  if (p.entrance_step === true) chips.push(L("출입구 턱 있음", "Step at entrance"));
  if (p.table) chips.push(L(`${p.table} 테이블`, `${p.table} seating`));
  if (p.indoor) chips.push(L("실내", "Indoor"));
  if (p.benches) chips.push(L("쉬는 벤치 있음", "Benches"));

  // 판정 한 줄: AI(또는 구간 계산) 판정 + 조심할 곳 하나. 없으면 가장 어려운 구간, 그것도 없으면 '길 정보 없음'
  const worst = segs.filter((s) => s.grade !== "G").sort((a, b) => (a.grade === "R" ? -1 : 1) - (b.grade === "R" ? -1 : 1))[0];
  const jv = j.state === "ok" && j.d ? j.d.verdict : worst ? worst.grade : segs.length ? "G" : "U";
  const extra = (j.state === "ok" && j.d?.cautions?.[0]) || (worst ? `${worst.name} ${L(GRADE[worst.grade as "G" | "Y" | "R"][1] === "Caution" ? "주의" : "어려움", GRADE[worst.grade as "G" | "Y" | "R"][1])}` : "");
  const noPath = stay || (!segs.length && (j.state !== "ok" || jv === "U"));
  const surveyed = !!p.last_visit;
  const sample = p.access_source === "예시" || segs.some((s) => s.source === "예시");

  const hours = (p.hours_text || "").split(" · ").filter((x: string) => !/휴무|closed/i.test(x)).join(" · ");
  const DAY_EN: Record<string, string> = { "월": "Mon", "화": "Tue", "수": "Wed", "목": "Thu", "금": "Fri", "토": "Sat", "일": "Sun" };
  const daysEn = String(p.closed_days || "").replace(/([월화수목금토일])요일/g, (_: string, d: string) => DAY_EN[d]).replace(/·|,\s*/g, ", ");
  const closedTxt = p.closed_days ? L(`${p.closed_days} 휴무`, `Closed ${daysEn}`) : p.hours_text?.includes("휴무") ? "" : L("정기 휴무 없음", "No regular closing day");
  const fee = p.fee ? tr(lang, p.fee) : feeMore[0] || "";
  const intro = (lang === "ko" ? p.intro_ko || p.tip_ko : p.intro_en || p.tip_en || p.intro_ko) || "";
  const toilet = (p.toilets || [])[0];
  const pins = [{ lat: p.lat, lon: p.lon, label: name, grade: null, color: "#12355E", icon: "★" },
    ...(toilet ? [{ lat: toilet.lat, lon: toilet.lon, label: toilet.name, grade: null, color: "#2462B4", icon: dot(lang, "화"), sub: L("장애인 화장실", "Accessible toilet") }] : []),
    ...(n.parking?.lat ? [{ lat: n.parking.lat, lon: n.parking.lon, label: n.parking.name, grade: null, color: "#566275", icon: "P", sub: L("주차장", "Parking") }] : [])].filter((x) => x.lat);
  const segSources = Array.from(new Set(segs.map((s) => s.source).filter((x: string) => x && x !== "예시")));
  const gallery = (GALLERY[p.id] || []).slice(0, 3);

  return (
    <section className="sec wrap place-page pp2 pp3">
      {/* 0. 중요한 소식: 임시 알림 + '알고 가면'의 공사·휴관 소식 */}
      {(live.length > 0 || news.length > 0) && <div className="pp3-news" role="region" aria-label={L("중요한 소식", "Important notices")}>
        {live.map((x: any) => (
          <div key={x.id} className={`pp-notice ${x.level}`} role="note">
            <Picto name={x.level === "closed" ? "stop" : x.level === "warn" ? "warn" : "tip"} size={20} />
            <b>{x.level === "closed" ? L("임시 휴무", "Temporarily closed") : x.level === "warn" ? L("주의", "Caution") : L("안내", "Notice")}</b> {x.title}
            <small>{x.start || ""}{x.end ? ` ~ ${x.end}` : ""}</small>{x.body && <p>{x.body}</p>}
          </div>))}
        {news.map((l: any) => <div key={l.x[0]} className="pp-notice info" role="note"><Picto name="warn" size={20} /><b>{L("알아 두세요", "Good to know")}</b> {L(l.x[0], l.x[1])}</div>)}
      </div>}

      {/* 1. 첫 화면: 이름 · 모드 · 판정 한 줄 · 이용 정보 띠 · 소개 2줄 · 사진 */}
      <header className="pp2-hero">
        <div className="pp2-hero-txt">
          <p className="crumb"><a href="#/">{L("처음", "Home")}</a> › <a href="#/places">{L("관광지", "Places")}</a> › {name}</p>
          <h1>{name}</h1>
          <p className="pp2-where">{[zone ? L(zone.ko, zone.en) : "", p.address].filter(Boolean).join(" · ")}</p>
          <div className="pp2-modes" role="group" aria-label={L("누구 기준으로 볼까요", "Check for")}>
            {MODES.map(([k, ko, en, ic]) => (
              <button key={k} className="pp2-mode" aria-pressed={mode === k} onClick={() => setMode(k)}>
                {ic === "stroller" ? <svg className="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h2l2.2 8.5h9.3L20 7H7.2" /><path d="M12 7V3.5a5 5 0 0 1 5 3.5" /><circle cx="9" cy="18.5" r="1.8" /><circle cx="17" cy="18.5" r="1.8" /></svg> : <Icon name={ic} />}
                {L(ko, en)}</button>))}
          </div>
          <p className={`pp3-verdict v-${noPath ? "U" : jv}`} aria-live="polite">
            <Picto name={noPath ? "ask" : VERDICT_PICTO[jv] || "ask"} size={24} />
            <span><b>{modeName}:</b> {noPath ? L("길 정보가 아직 없어요 · 가기 전에 전화로 확인해 주세요", "No path info yet · please call ahead")
              : j.state === "load" && !worst ? L("확인하는 중…", "Checking…") : verdictText(jv, lang)}{!noPath && extra ? ` · ${extra}` : ""}</span>
          </p>
          <ul className="pp3-strip" aria-label={L("이용 정보", "Visiting info")}>
            <li><span className={`badge ${p.today === "open" || p.today === "always" ? "b-open" : "b-unknown"}`}>{today}</span></li>
            {hours && <li><Icon name="time" />{hours}</li>}
            {closedTxt && <li title={closedMore.join(" ") || undefined}><Icon name="closed" />{closedTxt}{closedMore.length > 0 && <small className="muted"> *</small>}</li>}
            {fee && <li><Icon name="ticket" />{fee}</li>}
            {p.phone && <li><Icon name="phone" /><a href={`tel:${p.phone}`}>{p.phone}</a></li>}
          </ul>
          {closedMore.length > 0 && <p className="muted small pp3-note">* {closedMore[0]}</p>}
          <AccessBadges a={p.access_kto} lang={lang} />
          {intro && <p className={`pp2-intro${introOpen ? "" : " clamp2"}`}>{intro}</p>}
          {intro.length > 90 && <button className="link-btn small" aria-expanded={introOpen} onClick={() => setIntroOpen(!introOpen)}>{introOpen ? L("소개 접기", "Less") : L("소개 더 보기", "More")}</button>}
          {p.sample && <p className="muted small">{L("예시 데이터예요. 실제 정보는 확인 전이에요.", "Sample data, not yet verified.")}</p>}
          <div className="chips">
            <button className={`chip ${wished ? "" : "go"}`} aria-pressed={!!wished} onClick={() => onAdd(p.id)}>{wished ? L("담았어요 (다시 누르면 빼기)", "Added (tap to remove)") : L("코스에 담기", "Add to route")}</button>
            <a className="chip" href={`#/report/${p.id}`}><Icon name="flag" />&nbsp;{L("이곳 불편 알리기", "Report a barrier here")}</a>
          </div>
        </div>
        <div className="pp2-hero-img">
          <div className="pp3-main">{PHOTOS[p.id] ? <PlacePhoto id={p.id} lang={lang} alt={name} />
            : SCENE[p.id] ? <img src={`/dongi/${SCENE[p.id]}.webp`} alt={L("이 장소를 안내하는 동해시 마스코트 그림", "Donghae mascot at this place")} />
            : <div className="pp2-noimg"><img src="/dongi/full-basic.webp" alt="" /></div>}</div>
          {gallery.length > 0 && <ul className="pp3-thumbs" aria-label={L("사진 더 보기", "More photos")}>
            {gallery.map(([g, ko, en]) => <li key={g} title={L(ko, en)}><PlacePhoto id={g} lang={lang} alt={L(ko, en)} /></li>)}</ul>}
        </div>
      </header>
      {!stay && <AiStatus id={id} lang={lang} />}

      {/* 2. 이동·접근성 */}
      <div className="panel pp2-access">
        <div className="pp3-h-row">
          <h2 className="h3 pp2-h"><Icon name="walk" />{L("이동 및 접근성", "Getting around & access")}</h2>
          {surveyed ? <span className="badge b-open">{L(`현장 확인 ${p.last_visit.date}`, `Surveyed ${p.last_visit.date}`)}</span>
            : (sample || segs.length > 0 || !stay) && <span className="badge b-unknown" title={L("가기 전에 전화로 한 번 더 확인해 주세요", "Please call ahead")}>{L("현장 확인 전", "Not surveyed yet")}</span>}
        </div>
        {!stay && !noPath && <AiJudge j={j} lang={lang} chips={chips} carerTip={lang === "ko" ? p.carer_tip || "" : ""} />}
        {(stay || noPath || j.state === "fail") && (chips.length > 0 || (p.carer_tip && lang === "ko")) && <>
          {chips.length > 0 && <div className="tl-badges">{chips.map((c) => <span key={c} className="badge b-plain">{c}</span>)}</div>}
          {p.carer_tip && lang === "ko" && <p className="pp2-line"><Picto name="tip" size={18} label="보호자 꿀팁" />{p.carer_tip}</p>}</>}
        {segs.length > 0 ? <ul className="pp3-segs" aria-label={L("도착부터 구간별", "Path, step by step")}>
          {segs.map((s: any) => {
            const d = s.facts.find((f: string) => DIST_RE.test(f))?.match(DIST_RE)?.[0] || s.facts[0] || "";
            return <li key={s.name} title={[...s.facts, s.note].filter(Boolean).join(" · ") || undefined}>
              <span className="pp3-seg-n">{s.name}</span>{d && <span className="muted"> · {d}</span>}
              <span className={`badge g-${s.grade}`}><Picto name={VERDICT_PICTO[s.grade] || "ask"} size={14} />{L(GRADE[s.grade as "G" | "Y" | "R"][0], GRADE[s.grade as "G" | "Y" | "R"][1])}</span></li>;
          })}</ul>
          : <p className="muted small">{L("아직 길 정보가 없어요. 가기 전에 전화로 확인해 주세요.", "No path info yet. Please call ahead.")}</p>}
        {p.access_kto?.cats?.length > 0 && <details className="pp2-more"><summary>{L("무장애 편의정보 자세히 (한국관광공사)", "Accessibility details (KTO)")}</summary><AccessPanel a={p.access_kto} lang={lang} /></details>}
      </div>

      {/* 3. 주변 | 4. 방문하기 좋은 날 */}
      <div className="pp2-row two">
        <div className="panel">
          <h2 className="h3 pp2-h"><Icon name="pin" />{L("주변", "Nearby")}</h2>
          <div className="pp2-near pp3-near">
            {pins.length > 1 && <KakaoMap pins={pins} dots label={L(`${name} 주변 지도`, "Nearby map")} />}
            <ul className="near-list">
              {toilet ? <li><span className="dot" style={{ background: "#2462B4" }}>{dot(lang, "화")}</span><b>{L("장애인 화장실", "Accessible toilet")}</b> {toilet.name} · {dist(toilet.dist_m)}{toilet.hours ? ` · ${toilet.hours}` : ""}</li>
                : <li className="muted">{L("1.5km 안에 위치가 확인된 장애인 화장실이 없어요.", "No mapped accessible toilet within 1.5 km.")}</li>}
              {n.parking && <li><span className="dot" style={{ background: "#566275" }}>P</span><b>{L("주차", "Parking")}</b> {n.parking.name}{n.parking.spaces ? ` (${n.parking.spaces}${L("면", "")})` : ""} {n.parking.dist_m ? dist(n.parking.dist_m) : ""}</li>}
              {n.medical?.["응급실"] && <li><span className="dot" style={{ background: "#C9302C" }}>+</span><b>{L("응급실", "ER")}</b> {n.medical["응급실"].name}{n.medical["응급실"].dist_m ? ` · ${dist(n.medical["응급실"].dist_m)}` : ""}</li>}
            </ul>
          </div>
          <p className="small"><a href="#/map">{L("편의시설 지도에서 더 보기 (약국·병원·전동휠체어 충전·관광안내소)", "More on the facilities map (pharmacies, clinics, chargers, info centers)")}</a></p>
          {stay ? <>
            <h3 className="pp2-sub">{L("예약", "Booking")}</h3>
            <p className="muted small">{L("무장애 객실 여부는 전화로 꼭 물어보세요.", "Ask about accessible rooms by phone.")}</p>
            <BookLinks name={p.name_ko} lang={lang} /></>
            : p.lat && <><h3 className="pp2-sub"><Icon name="food" />{L("가까운 식당", "Nearest places to eat")}</h3>
              <NearbyEats lat={p.lat} lon={p.lon} lang={lang} r={p.type === "관광지" ? 800 : 400} limit={3} exclude={p.id} short />
              <details className="pp2-more" onToggle={(e) => setEatMore((e.target as HTMLDetailsElement).open)}><summary>{L("식당 더 보기 (종류·정렬)", "More places to eat")}</summary>
                {eatMore && <NearbyEats lat={p.lat} lon={p.lon} lang={lang} r={p.type === "관광지" ? 800 : 400} limit={8} exclude={p.id} />}</details></>}
        </div>
        <div className="pp2-side"><PlaceData id={id} lang={lang} /></div>
      </div>

      {/* 5. 다녀온 사람들 */}
      {!stay && <PlaceTalk id={id} lang={lang} />}

      {/* 6. 알고 가면 더 좋아요 (휴무·입장료·소식은 위로 옮겼으므로 뺀 나머지, 역사는 2줄) */}
      {(about.length > 0 || p.stories?.length > 0 || p.trail_info?.length > 0) && (
        <details className="panel about pp2-know">
          <summary><h2 className="h3 pp2-h"><Icon name="story" />{L("알고 가면 더 좋아요", "Good to know")}</h2></summary>
          <div className="pp2-know-cols">
            {about.map((a: any) => (
              <div key={a.t[0]} className={/역사/.test(a.t[0]) ? "clamp2-box" : undefined}><h3>{L(a.t[0], a.t[1])}</h3><ul>{a.i.map((x: string[]) => <li key={x[0]}>{L(x[0], x[1])}</li>)}</ul></div>))}
            {(p.stories?.length > 0 || p.trail_info?.length > 0) && (
              <div><h3>{L("이야기와 걷기길", "Stories and trails")}</h3>
                {p.stories?.slice(0, 2).map((s: any) => <p key={s.name}><b>{s.name}</b> {s.intro?.slice(0, 120)}</p>)}
                {p.trail_info?.map((t: any) => <p key={t.name} className="muted ic-row"><Icon name="trail" />{t.name} · {t.length_km}km · {t.duration}</p>)}</div>)}
          </div>
        </details>)}

      {/* 7. 정보 출처 (칸마다 쓰던 출처를 한곳에) */}
      <details className="panel pp3-src">
        <summary><h2 className="h3 pp2-h"><Icon name="info" />{L("정보 출처", "Sources")}</h2></summary>
        <ul className="small">
          {p.hours_source && <li><b>{L("운영시간", "Hours")}</b> {p.hours_source}</li>}
          {segs.length > 0 && <li><b>{L("길 정보(구간)", "Path data")}</b> {segSources.length ? segSources.join(", ") : ""}{sample ? L(" · 현장 확인 전 예시 값", " · sample values, not surveyed") : ""}
            {p.last_visit ? L(` · 팀 현장 확인 ${p.last_visit.date}${p.last_visit.who ? ` (${p.last_visit.who})` : ""}`, ` · team visit ${p.last_visit.date}`) : ""}</li>}
          {!stay && j.state === "ok" && j.d && <li><b>{L("판정", "Verdict")}</b> {j.d.by === "ai"
            ? L(`AI가 근거 ${j.d.evidence_count ?? 0}가지(최근 제보 ${j.d.reports_used ?? 0}건 포함)를 읽고 낸 의견 · 현장 상황은 바뀔 수 있어요`, `AI opinion from ${j.d.evidence_count ?? 0} pieces of evidence`)
            : L("AI를 쓸 수 없어 구간 정보만으로 계산", "Calculated from path data only")}</li>}
          {p.access_kto?.cats?.length > 0 && <li><b>{L("무장애 편의정보", "Accessibility info")}</b> {L("한국관광공사 열린관광 무장애 여행정보", "Korea Tourism Organization barrier-free data")}</li>}
          <li><b>{L("주변 시설", "Nearby")}</b> {L("동해시·공공데이터포털 표준데이터(장애인 화장실·주차장), 국립중앙의료원(응급실)", "Donghae City & data.go.kr standard data; National Medical Center")}</li>
          {!stay && <li><b>{L("식당", "Restaurants")}</b> {L("동해시 일반음식점 인허가 현황(2026-03) · 휠체어 접근은 가기 전 전화로 확인해 주세요", "Donghae restaurant licences (2026-03) · call ahead about access")}</li>}
          <li><b>{L("방문하기 좋은 날", "Best days")}</b> {L("한국관광공사 관광지 집중률 예측·연관 관광지·무장애 여행 정보·오디오 가이드 (예측값)", "Korea Tourism Organization forecasts and open APIs")}</li>
        </ul>
      </details>
    </section>
  );
}

/* ---------------- 교통 ---------------- */
export function TransportPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [d, err] = useLoad(() => api.get(`/api/transport?lang=${lang}`), [lang]);
  const [allP, setAllP] = useState(false);
  const [allT, setAllT] = useState(false);
  const [allR, setAllR] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [pq, setPq] = useState("");
  // 주차장 지도·가까운 곳 추천: 기준 = 내 위치 또는 고른 관광지
  const [origin, setOrigin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [near, setNear] = useState("");
  const [locErr, setLocErr] = useState("");
  const [sights, setSights] = useState<any[]>([]);
  useEffect(() => { getJSON("/api/places?mode=none").then((l: any[]) => setSights(l.filter((p) => p.lat && !["숙박", "식당", "카페"].includes(p.type)))).catch(() => {}); }, []);
  const meters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.round(Math.hypot((a.lat - b.lat) * 111000, (a.lon - b.lon) * 88000));
  const myLoc = () => {
    setLocErr("");
    if (!navigator.geolocation) { setLocErr(L("이 기기에서는 위치를 쓸 수 없어요. 관광지를 골라 주세요.", "Location is not available. Pick a place instead.")); return; }
    navigator.geolocation.getCurrentPosition((g) => { setNear(""); setOrigin({ lat: g.coords.latitude, lon: g.coords.longitude, label: L("내 위치", "my location") }); },
      () => setLocErr(L("위치를 가져오지 못했어요. 위치 권한을 허용하거나 관광지를 골라 주세요.", "Could not get your location. Allow it or pick a place.")), { timeout: 8000 });
  };
  // 버튼을 누르면 그 안내만 열고, 같은 버튼을 한 번 더 누르면 닫는다 (아래로 내려가지 않음)
  const [open, setOpen] = useState<string | null>("tr-van");
  const go = (id: string) => setOpen((o) => (o === id ? null : id));
  // 주차장을 열면 처음 한 번 내 위치에서 가까운 순으로 자동 정렬 (위치를 못 쓰면 안내만)
  const askedLoc = useRef(false);
  useEffect(() => { if (open === "tr-parking" && !origin && !askedLoc.current) { askedLoc.current = true; myLoc(); } }, [open]);
  const won = (n?: number) => (n == null ? "" : `${Math.round(n).toLocaleString()}${L("원", "₩")}`);
  // 이 페이지를 쓰는 사람의 질문 순서: ① 휠체어로 탈 차가 있나 ② 역에서 어떻게 움직이나 ③ 시티투어 ④ 차를 가져가면 ⑤ 택시·렌터카
  const jumps: [string, string, string][] = [["tr-van", "wheel", L("휠체어 차량", "Wheelchair van")], ["tr-station", "train", L("기차역", "Stations")],
    ["tr-tour", "bus", L("시티투어", "City tour")], ["tr-parking", "parking", L("주차장", "Parking")], ["tr-taxi", "taxi", L("택시·렌터카", "Taxis & rentals")]];
  return (
    <section className="sec wrap tr-page">
      <Head lang={lang} photo="city" mascot="full-captain" title={L("교통 안내", "Getting around")} sub={L("휠체어 차량부터 기차역, 시티투어, 주차장, 택시·렌터카까지 필요한 것만 골라 보세요.", "Wheelchair vans, stations, the city tour, parking, taxis and rentals.")} />
      {!d ? <Loading err={err} lang={lang} /> : (<>
        <nav className="tr-jump" aria-label={L("바로 가기", "Jump to")}>
          {jumps.map(([id, ic, t]) => <button key={id} onClick={() => go(id)} aria-pressed={open === id} aria-controls={id}><Icon name={ic} /><span>{t}</span></button>)}
        </nav>
        {!open && <p className="muted tr-none">{L("위 버튼을 누르면 그 안내가 열려요.", "Tap a button above to open that section.")}</p>}

        {d.mobility_center && (() => { const m = d.mobility_center; return (
          <section className="panel tr-sec tr-van" id="tr-van" hidden={open !== "tr-van"} aria-labelledby="tr-van-h">
            <div className="tr-head"><Icon name="wheel" /><div><h2 id="tr-van-h">{L("휠체어 탈 수 있는 차량", "Wheelchair-accessible vehicles")}</h2><p className="muted">{nm(lang, m.name)}</p></div></div>
            <a className="tr-call" href={`tel:${m.tel}`}><Icon name="phone" /><span><b>{m.tel}</b><small>{L("눌러서 예약 전화", "Tap to call and book")}</small></span></a>
            <dl className="tr-facts">
              <div><dt>{L("차량", "Vehicles")}</dt><dd>{L(`휠체어 탑승 차량 ${m.wheelchair_vehicles}대`, `${m.wheelchair_vehicles} wheelchair vehicles`)}</dd></div>
              <div><dt>{L("운행", "Hours")}</dt><dd>{m.hours === "00:00~23:59" ? L("24시간", "24 hours") : m.hours}</dd></div>
              <div><dt>{L("예약", "Booking")}</dt><dd>{L(`시외로 갈 때는 ${String(m.advance || "").replace(/\(.*\)/, "")} 전까지`, `Book ${String(m.advance || "").replace(/일.*$/, "")} days ahead for trips out of town`)}</dd></div>
              <div><dt>{L("요금", "Fare")}</dt><dd>{L("4km까지 1,100원, 넘으면 1km마다 100원", "₩1,100 up to 4 km, then ₩100/km")}</dd></div>
            </dl>
            <p>{L("다른 지역에 사는 등록 장애인 관광객도 이용할 수 있어요(동해시 확인). 앱·누리집으로도 예약돼요.", "Registered disabled visitors from other regions can use it too (confirmed by Donghae City). You can also book in the app or online.")}
              {m.app ? <> <span className="muted">({nm(lang, m.app)}{m.web ? ` · ${m.web}` : ""})</span></> : null}</p>
            <details className="tr-more"><summary>{L("이용할 수 있는 사람·자세한 요금", "Who can use it, full fares (in Korean)")}</summary>
              {m.who && <ol className="tr-who">{String(m.who).split(/\d\.\s*/).filter(Boolean).map((w: string) => <li key={w}>{w.trim()}</li>)}</ol>}
              <p className="muted">{m.fare}</p>
              {m.area_out && <p className="muted">{L(`시외 운행: ${m.area_out}`, `Out of town: ${m.area_out}`)}</p>}
            </details>
            <p className="tr-note">{L("동해시에는 저상버스가 없어요. 휠체어로 시내를 다닐 때는 이 차량이나 택시를 이용하세요.", "Donghae has no low-floor buses. Use this service or a taxi in a wheelchair.")}</p>
          </section>); })()}

        <section className="tr-sec" id="tr-station" hidden={open !== "tr-station"} aria-labelledby="tr-st-h">
          <h2 id="tr-st-h" className="tr-h2"><Icon name="train" />{L("기차역에서", "From the stations")}</h2>
          <div className="cards2">
            {d.stations.map((s: any) => (
              <div key={s.name} className="panel">
                <h3 className="h3">{nm(lang, s.name)}{lang !== "ko" && <small className="muted ko-name"> {s.name}</small>}</h3>
                <dl className="tr-facts one">
                  <div><dt>{L("장애인 화장실", "Accessible toilet")}</dt><dd>{s.toilet ? L(`역 안 · ${s.toilet.hours}`, `In the station · ${s.toilet.hours}`) : L("확인 전", "Not checked")}</dd></div>
                  <div><dt>{L("택시 승차대", "Taxi stand")}</dt><dd>{s.taxi ? L(`역 앞 ${s.taxi.spaces}면`, `${s.taxi.spaces} spaces in front`) : "-"}</dd></div>
                  {s.rentals?.length > 0 && <div><dt>{L("가까운 렌터카", "Nearby rentals")}</dt><dd><ul className="tr-phones">{s.rentals.slice(0, 3).map((r: any) => <li key={r.name}>{nm(lang, r.name)}{r.vans ? <small className="muted"> · {L(`승합 ${r.vans}대`, `${r.vans} vans`)}</small> : null} <a href={`tel:${r.tel}`}>{r.tel}</a></li>)}</ul></dd></div>}
                </dl>
              </div>
            ))}
          </div>
        </section>

        {d.city_tour && (
          <section className="panel tr-sec" id="tr-tour" hidden={open !== "tr-tour"} aria-labelledby="tr-tour-h">
            <div className="tr-head"><Icon name="bus" /><div><h2 id="tr-tour-h">{L("동해 시티투어", "Donghae city tour")}</h2><p className="muted">{nm(lang, d.city_tour.name)} · {nm(lang, d.city_tour.mode || "")}</p></div></div>
            <dl className="tr-facts">
              <div><dt>{L("운행일", "Days")}</dt><dd>{L("토·일요일과 공휴일", "Sat, Sun & holidays")}</dd></div>
              <div><dt>{L("시간", "Times")}</dt><dd>{d.city_tour.first}~{d.city_tour.last} · {L(`${d.city_tour.interval_min}분마다`, `every ${d.city_tour.interval_min} min`)}</dd></div>
              <div><dt>{L("요금", "Fare")}</dt><dd>{L("어른 3,000원 · 어린이 1,800원", "Adults ₩3,000 · children ₩1,800")}<small className="muted">{L(" (장애인 할인 없음)", " (no disability discount)")}</small></dd></div>
              <div><dt>{L("타는 곳", "Boarding")}</dt><dd>{nm(lang, d.city_tour.board)}</dd></div>
            </dl>
            <ul className="tr-checks">
              <li><b>{L("휠체어·유모차", "Wheelchairs & strollers")}</b> {L("일반 관광버스라 접이식 휠체어·유모차는 접어서 실어요. 전동휠체어나 접히지 않는 휠체어는 타기 어려워요.", "A standard coach: folding wheelchairs and strollers are stowed; power or rigid wheelchairs are hard to board.")}</li>
              <li><b>{L("도움", "Help")}</b> {L("안내하시는 분이 함께 타서 오르내릴 때 도와줘요. 전문 도우미는 아니에요.", "A guide rides along and helps with boarding; not a trained care assistant.")}</li>
            </ul>
            <details className="tr-more"><summary>{L(`도는 곳 ${d.city_tour_stops.length}곳 보기`, `See all ${d.city_tour_stops.length} stops`)}</summary>
              <ol className="tr-route">{d.city_tour_stops.map((s: string) => <li key={s}>{nm(lang, s)}</li>)}</ol>
            </details>
            <p className="muted small">{L(`요금·휠체어 안내는 동해문화관광재단에 확인했어요(2026년 11월). 공공데이터에는 어른 5,000원으로 나와 있어 타기 전 한 번 더 확인해 주세요. 문의 ${d.city_tour.contact}`,
              `Fare and access confirmed with Donghae Culture & Tourism Foundation (Nov 2026). Public data lists ₩5,000 for adults, so please check before boarding. ${nm(lang, d.city_tour.contact)}`)}</p>
          </section>
        )}

        {(() => {
          const key = pq.trim().replace(/\s+/g, "");
          const pHay = (r: any) => `${r.name}${r.road}`.replace(/\s+/g, "");
          const pExact = !key || d.parking.some((r: any) => pHay(r).includes(key));
          const rows = d.parking.filter((r: any) => (!freeOnly || r.disabled) && (!key || (pExact ? pHay(r).includes(key) : fuzzyHit(r.name, key) >= 0 || fuzzyHit(r.road || "", key) >= 0)))
            .map((r: any) => ({ ...r, dist: origin && r.lat ? meters(origin, r) : null }))
            .sort((a: any, b: any) => (origin ? (a.dist ?? 1e9) - (b.dist ?? 1e9) : 0));
          const shownP = allP || key || freeOnly || origin ? rows : rows.slice(0, 6);
          const top: string[] = origin ? rows.filter((r: any) => r.dist != null).slice(0, 3).map((r: any) => r.name) : [];
          const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);
          const pinsP = (origin ? rows.slice(0, 8) : rows).filter((r: any) => r.lat).map((r: any) => ({ lat: r.lat, lon: r.lon, label: nm(lang, r.name), grade: null, color: top.includes(r.name) ? "#A45400" : "#566275", icon: "P",
            sub: [r.dist != null ? km(r.dist) : "", r.spaces ? `${r.spaces}${L("면", " spaces")}` : "", r.disabled ? L("장애인 차량 요금 면제", "Free with disabled permit") : ""].filter(Boolean).join(" · "), addr: ad(lang, r.road || "") }));
          return (
            <section className="panel tr-sec" id="tr-parking" hidden={open !== "tr-parking"} aria-labelledby="tr-p-h">
              <div className="tr-head"><Icon name="parking" /><div><h2 id="tr-p-h">{L("공영주차장", "Public parking")}</h2>
                <p className="muted">{L(`${d.parking.length}곳 중 ${d.parking.filter((r: any) => r.disabled).length}곳은 장애인 차량 요금 면제 (2시간 넘으면 반값)`, `${d.parking.filter((r: any) => r.disabled).length} of ${d.parking.length} waive fees for disabled permits`)}</p></div></div>
              <div className="tr-near" role="group" aria-label={L("가까운 주차장 찾기", "Find nearby parking")}>
                <button className="chip go" onClick={myLoc}><Icon name="pin" />&nbsp;{L("내 위치에서 가까운 순", "Nearest to me")}</button>
                <label className="tr-near-sel"><span>{L("또는 가려는 곳", "or near")}</span>
                  <select value={near} onChange={(e) => { const p = sights.find((x) => x.id === e.target.value); setNear(e.target.value); setOrigin(p ? { lat: p.lat, lon: p.lon, label: L(p.name_ko, p.name_en || p.name_ko) } : null); }}>
                    <option value="">{L("관광지 고르기", "Pick a place")}</option>
                    {sights.map((p) => <option key={p.id} value={p.id}>{L(p.name_ko, p.name_en || p.name_ko)}</option>)}</select></label>
                {origin && <button className="chip plain" onClick={() => { setOrigin(null); setNear(""); }}>{L("기준 지우기", "Clear")}</button>}
              </div>
              {locErr && <p className="err" role="alert">{locErr}</p>}
              {origin && <p className="tr-rec" role="status"><b>{L(`${origin.label} 근처 추천`, `Near ${origin.label}`)}</b> {top.map((x) => nm(lang, x)).join(" · ")}</p>}
              <KakaoMap pins={pinsP} dots label={L("공영주차장 지도", "Public parking map")} />
              <div className="tr-filter">
                <button className="chip" aria-pressed={freeOnly} onClick={() => setFreeOnly(!freeOnly)}>{L("장애인 차량 면제만", "Disabled permit free only")}</button>
                <label><span className="sr-only">{L("주차장 찾기", "Find a car park")}</span><input type="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder={L("이름·주소로 찾기 (예: 추암)", "Search (e.g. Chuam)")} /></label>
              </div>
              <ul className="tr-list">
                {shownP.map((r: any) => (
                  <li key={r.name} className={top.includes(r.name) ? "rec" : ""}>
                    <div><b>{top.includes(r.name) && <span className="badge rec-b">{L("추천", "Pick")}</span>} {nm(lang, r.name)}</b>{r.road && <small className="muted">{ad(lang, r.road)}</small>}</div>
                    <div className="tr-tags">
                      {r.dist != null && <span className="badge b-dist">{km(r.dist)}</span>}
                      <span className="badge b-plain">{L(`${r.spaces}면`, `${r.spaces} spaces`)}</span>
                      <span className="badge b-plain">{r.fee_type === "무료" ? L("무료", "Free") : r.base_fee ? L(`${r.base_min >= 60 ? `${r.base_min / 60}시간` : `${r.base_min}분`} ${won(r.base_fee)}`, `${won(r.base_fee)} / ${r.base_min} min`) : tr(lang, r.fee_type)}</span>
                      {r.disabled && <span className="badge g-G">{L("장애인 차량 면제", "Free with permit")}</span>}
                      {r.wk_open && <span className="badge b-plain">{L("평일", "Wkdy")} {r.wk_open}~{r.wk_close}</span>}
                    </div>
                    {r.lat && <div className="tr-go">
                      <a className="chip sm" href={`https://map.kakao.com/link/map/${encodeURIComponent(r.name)},${r.lat},${r.lon}`} target="_blank" rel="noreferrer">{L("지도", "Map")}</a>
                      <a className="chip sm" href={`https://map.kakao.com/link/to/${encodeURIComponent(r.name)},${r.lat},${r.lon}`} target="_blank" rel="noreferrer">{L("길찾기", "Directions")}</a></div>}
                  </li>))}
                {!rows.length && <li className="muted">{L("조건에 맞는 주차장이 없어요.", "No car parks match.")}</li>}
              </ul>
              {!key && !freeOnly && !origin && <More n={6} total={d.parking.length} open={allP} onToggle={() => setAllP(!allP)} lang={lang} />}
            </section>);
        })()}

        <section className="tr-sec" id="tr-taxi" hidden={open !== "tr-taxi"} aria-labelledby="tr-t-h">
          <h2 id="tr-t-h" className="tr-h2"><Icon name="taxi" />{L("택시·렌터카", "Taxis & car rentals")}</h2>
          <div className="cards2">
            <div className="panel">
              <h3 className="h3">{L(`택시 승차대 ${d.taxi_stands.length}곳`, `${d.taxi_stands.length} taxi stands`)}</h3>
              <ul className="tr-list compact">{(allT ? d.taxi_stands : d.taxi_stands.slice(0, 6)).map((t: any) => <li key={t.name}><div><b>{nm(lang, t.name)}</b>{t.road && <small className="muted">{(lang === "ko" ? t.road : ad(lang, t.road)).replace("강원특별자치도 ", "")}</small>}</div><span className="badge b-plain">{L(`${t.spaces}면`, `${t.spaces}`)}</span></li>)}</ul>
              <More n={6} total={d.taxi_stands.length} open={allT} onToggle={() => setAllT(!allT)} lang={lang} />
            </div>
            <div className="panel">
              <h3 className="h3">{L(`렌터카 ${d.rentals.length}곳`, `${d.rentals.length} car rentals`)}</h3>
              <ul className="tr-list compact">{(allR ? d.rentals : d.rentals.slice(0, 6)).map((r: any) => <li key={r.name}><div><b>{nm(lang, r.name)}</b><small className="muted">{L(`승용 ${r.cars} · 승합 ${r.vans}`, `${r.cars} cars · ${r.vans} vans`)}</small></div>
                {r.tel && <a className="chip sm" href={`tel:${r.tel}`}><Icon name="phone" />&nbsp;{L("전화", "Call")}</a>}</li>)}</ul>
              <More n={6} total={d.rentals.length} open={allR} onToggle={() => setAllR(!allR)} lang={lang} />
              <p className="muted small">{L("휠체어 리프트 차량이 있는지는 업체에 꼭 물어보세요.", "Ask the company about lift-equipped vans.")}</p>
            </div>
          </div>
        </section>
      </>)}
    </section>
  );
}

/* ---------------- 편의시설 지도 ---------------- */
// 순서(사용자 요청): 숙소 → 약국·병원 → 공영주차장 → 관광안내소 → 장애인 화장실 → 전동휠체어 충전기
const LAYERS = [
  { k: "lodging", ko: "숙소", en: "Places to stay", color: "#6B4FA0", icon: "숙" },
  { k: "medical", ko: "약국·병원", en: "Pharmacy/clinic", color: "#C9302C", icon: "약" },
  { k: "parking", ko: "공영주차장", en: "Public parking", color: "#566275", icon: "P" },
  { k: "info_centers", ko: "관광안내소", en: "Tourist info", color: "#C46A12", icon: "i" },
  { k: "toilets", ko: "장애인 화장실", en: "Accessible toilets", color: "#2462B4", icon: "화" },
  { k: "chargers", ko: "전동휠체어 충전기", en: "Wheelchair chargers", color: "#1E8A3C", icon: "충" },
] as const;

export function MapPage({ lang, initialLayer }: { lang: Lang; initialLayer?: string }) {   // initialLayer: #/map/toilets 처럼 한 층만 켜고 열기 (동이 대화에서)
  const L = pick(lang);
  const [d0, err] = useLoad(() => api.get("/api/facilities"), []);
  // 약국·병원은 긴급·도움과 같은 국립중앙의료원 실데이터 (서버에 키가 없으면 예시)
  const [med, setMed] = useState<{ sample: boolean; items: any[] } | null>(null);
  useEffect(() => { api.get("/api/medical").then(setMed).catch(() => {}); }, []);
  const d = d0 ? { ...d0, medical: med?.items || d0.medical } : null;
  const [on, setOn] = useState<Record<string, boolean>>(() => initialLayer && ["lodging", "medical", "parking", "info_centers", "toilets", "chargers"].includes(initialLayer)
    ? { lodging: false, medical: false, parking: false, info_centers: false, toilets: false, chargers: false, [initialLayer]: true }
    : { lodging: false, medical: false, parking: false, info_centers: false, toilets: true, chargers: true });
  const [focus, setFocus] = useState<number | null>(null);   // 목록을 누르면 지도에서 그 점을 500m 정도로 확대
  // 처음: 동해역 가운데·축척 4km. 지도를 열면 바로 내 위치를 찾아 250m로 확대하고 빨간 점, 목록은 가까운 순.
  // 동해에서 25km 넘게 떨어져 있으면(예: 서울) 동해역 기준으로 두고 그렇게 알려 준다. 위치를 못 쓰면 동해역에서 가까운 순
  const STN: [number, number] = [37.4995, 129.124];
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locMsg, setLocMsg] = useState("");
  const [go, setGo] = useState<{ c: [number, number]; l: number; k: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  // 알려진 불편 (2명 이상 알린 곳, 사진 없음 — docs/19_CITY_REPORTS.md)
  const [bar, setBar] = useState<any[]>([]);
  const [barOn, setBarOn] = useState(false);
  useEffect(() => { if (barOn && !bar.length) api.get("/api/reports/public-map").then(setBar).catch(() => {}); }, [barOn]);
  const SEVC: Record<string, string> = { block: "#C9302C", help: "#E07A00", minor: "#B08A00" };
  const ST_EN: Record<string, string> = { "접수": "Received", "확인": "Checked", "처리 중": "In progress", "완료": "Fixed" };
  const items = useMemo(() => {
    if (!d) return [];
    const out: any[] = [];
    if (barOn) for (const b of bar) {
      const o = me || STN;
      out.push({ id: `bar:${b.id}`, layer: { k: "barriers", color: SEVC[b.severity] || "#C9302C", icon: "!" }, name: `${b.sample ? L("[가상] ", "[Sample] ") : ""}${L(b.label, b.label_en)}${b.near ? ` · ${b.near}` : ""}`,
        lat: b.lat, lon: b.lon, desc: `${L(`${b.count}명이 알림`, `${b.count} reports`)} · ${L(b.status, ST_EN[b.status] || b.status)}`, road: "",
        dm: Math.round(Math.hypot((b.lat - o[0]) * 111000, (b.lon - o[1]) * 88000)) });
    }
    for (const l of LAYERS) {
      if (!on[l.k]) continue;
      const seen = new Set<string>();
      for (const r of d[l.k] || []) {
        if (!r.lat) continue;
        const key = `${r.lat},${r.lon}`;
        if (l.k === "toilets" && seen.has(key)) continue;   // 같은 건물 화장실 여러 개는 점 하나로
        seen.add(key);
        const desc = l.k === "toilets" ? `${tr(lang, r.kind)} · ${tr(lang, r.hours)}` : l.k === "chargers" ? `${nm(lang, r.spot || "")} · ${L("평일", "Wkdy")} ${r.wk_open}~${r.wk_close}`
          : l.k === "parking" ? `${r.spaces}${L("면", "")}${r.disabled ? L(" · 장애인 차량 요금 면제", " · free for disabled permit") : ""} · ${r.fee_type}`
          : l.k === "info_centers" ? `${r.tel || ""} ${r.hours || ""}`
          : l.k === "lodging" ? [tr(lang, r.kind), r.tel].filter(Boolean).join(" · ")
          : l.k === "medical" && r.open_now != null ? [tr(lang, r.kind), r.open_now ? L(`지금 진료·영업 중 (~${r.until})`, `Open now (until ${r.until})`) : L("지금은 문 닫음", "Closed now"), r.tel].filter(Boolean).join(" · ")
          : [tr(lang, r.kind), r.open ? `${r.open}~${r.close}` : "", r.tel].filter(Boolean).join(" · ");
        const o = me || STN;
        const dm = Math.round(Math.hypot((r.lat - o[0]) * 111000, (r.lon - o[1]) * 88000));
        out.push({ id: `${l.k}:${r.name}`, layer: l, name: nm(lang, r.name), lat: r.lat, lon: r.lon, desc, road: r.road ? ad(lang, r.road) : nm(lang, r.spot || ""), dm });
      }
    }
    return out.sort((a, b) => a.dm - b.dm);   // 늘 가까운 순 (내 위치, 없으면 동해역에서)
  }, [d0, med, on, me, lang, bar, barOn]);
  const pins = items.map((x) => ({ lat: x.lat, lon: x.lon, label: x.name, grade: null, color: x.layer.color, icon: dot(lang, x.layer.icon), sub: x.desc, addr: x.road }));
  const unmapped = (d?.toilets || []).filter((t: any) => !t.lat);
  function locate() {
    if (!navigator.geolocation) { setLocMsg(L("이 기기에서는 위치를 쓸 수 없어 동해역에서 가까운 순으로 보여 드려요.", "Location isn't available; sorted from Donghae Station.")); return; }
    setLocMsg(L("내 위치를 찾는 중이에요…", "Finding your location…"));
    navigator.geolocation.getCurrentPosition((p) => {
      const here: [number, number] = [p.coords.latitude, p.coords.longitude];
      const far = Math.hypot((here[0] - STN[0]) * 111, (here[1] - STN[1]) * 88) > 25;
      if (far) { setMe(null); setGo({ c: STN, l: 9, k: Date.now() }); setLocMsg(L("지금 동해 밖에 계셔서 동해역을 가운데로, 동해역에서 가까운 순으로 보여 드려요.", "You're outside Donghae, so the map and list use Donghae Station.")); return; }
      setMe(here); setGo({ c: here, l: 5, k: Date.now() }); setLocMsg("");
    }, () => setLocMsg(L("위치를 가져오지 못했어요. 위치 권한을 허용하면 내 주변부터 보여 드려요. 지금은 동해역에서 가까운 순이에요.", "Couldn't get your location; sorted from Donghae Station.")), { timeout: 8000, enableHighAccuracy: true });
  }
  // 편의시설 지도를 열면 바로 내 위치를 찾는다
  useEffect(() => { locate(); }, []);
  return (
    <section className="sec wrap">
      <Head mascot="full-basic" lang={lang} photo="dokkaebi" title={L("편의시설 지도", "Facilities map")} sub={L("보고 싶은 것만 켜세요. 점을 누르면 아래 목록에서 자세히 보여요.", "Turn layers on and tap a dot for details.")} />
      <div className="layers chips" role="group" aria-label={L("지도에 보일 것", "Layers")}>
        {LAYERS.map((l) => (
          <button key={l.k} className="chip" aria-pressed={!!on[l.k]} onClick={() => setOn({ ...on, [l.k]: !on[l.k] })}>
            <span className="dot" style={{ background: l.color }}>{dot(lang, l.icon)}</span>{L(l.ko, l.en)}
          </button>))}
        <button className="chip" aria-pressed={barOn} onClick={() => setBarOn(!barOn)}><span className="dot" style={{ background: "#C9302C" }}>!</span>{L("알려진 불편", "Reported barriers")}</button>
        <button className="chip go" onClick={locate}>{me ? L("내 위치 다시 찾기", "Update my location") : L("내 주변부터 보기", "Nearest first")}</button>
      </div>
      {barOn && <p className="muted small"><Icon name="info" /> {L("2명 이상 알린 곳만 보여요. 사진은 공개하지 않아요.", "Only spots reported by 2+ people. Photos are never shown.")}
        {bar.some((b) => b.sample) && L(" [가상] 표시는 점검용 가상 데이터예요.", " [Sample] items are test data.")} <a href="#/report">{L("불편 알리기", "Report a barrier")}</a></p>}
      {locMsg && <p className="muted small map-loc" role="status">{locMsg}</p>}
      {!d ? <Loading err={err} lang={lang} /> : (<>
        <KakaoMap pins={pins} dots cluster zoomOnPick focus={focus} start={{ lat: STN[0], lon: STN[1], level: 9 }} center={go?.c || null} centerLevel={go?.l ?? 5} centerKey={go?.k || 0} me={me}
          onPick={(i) => { setSel(items[i].id); setFocus(null); }}
          label={L("편의시설 지도. 아래 목록과 같은 내용입니다.", "Facilities map; same as the list below.")} />
        <ul className="fac-list">
          {items.map((x, i) => (
            <li key={x.id} id={`f-${i}`} className={sel === x.id ? "sel" : ""}>
              <button className="fac-item" onClick={() => { setSel(x.id); setFocus(i); document.querySelector(".sec .map")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                aria-label={L(`${x.name} 지도에서 보기`, `Show ${x.name} on the map`)}>
                <span className="dot" style={{ background: x.layer.color }}>{dot(lang, x.layer.icon)}</span>
                <div><b>{x.name}</b>{x.dm != null && <span className="muted"> · {dist(x.dm)}</span>}<br /><small className="muted">{x.desc}{x.road ? ` · ${x.road}` : ""}</small></div>
              </button>
            </li>))}
        </ul>
        {on.toilets && unmapped.length > 0 && (
          <details className="panel">
            <summary>{L(`지도 위치를 아직 못 정한 장애인 화장실 ${unmapped.length}곳 (주소로 보기)`, `${unmapped.length} accessible toilets without map position`)}</summary>
            <ul className="plain">{unmapped.map((t: any) => <li key={t.name + t.road}>{nm(lang, t.name)} · {tr(lang, t.kind)} · {tr(lang, t.hours)} <small className="muted">{ad(lang, t.road)}</small></li>)}</ul>
          </details>
        )}
        {on.lodging && <p className="muted small">{L("숙소 위치는 공공데이터 주소로 찾은 건물 위치예요. 장애인 객실은 확인 전이에요. ", "Stay locations come from public address data; accessible rooms not yet checked. ")}<a href="#/stay">{L("숙소 목록으로 보기", "See the list")}</a></p>}
      </>)}
    </section>
  );
}

/* 내 일정은 components/MyTrips.tsx 로 옮김 */

/* ---------------- 행사 달력 ---------------- */
export function EventsPage({ lang, onPlanDate }: { lang: Lang; onPlanDate: (d: string) => void }) {
  const L = pick(lang);
  const [d, err] = useLoad(() => api.get("/api/events/all"), []);
  const today = new Date();
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState<string | null>(null);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const evs: any[] = d?.events || [];
  const on = (k: string) => evs.filter((e) => e.start <= k && k <= (e.end || e.start));
  const y = view.getFullYear(), m = view.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(y, m, i + 1))];
  const monthEvs = evs.filter((e) => (e.end || e.start) >= iso(new Date(y, m, 1)) && e.start <= iso(new Date(y, m, days)));
  const list = day ? on(day) : monthEvs;
  const WD = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayK = iso(today);
  const upcoming = evs.filter((e) => (e.end || e.start) >= todayK).sort((a, b) => a.start.localeCompare(b.start));
  // 해마다 열리는 축제: 올해 공공데이터의 축제를 달 순서로 + 매년 1월 1일 해맞이 (내년 날짜는 아직 확인 전)
  const yearly = [...evs.filter((e) => e.festival && (e.end || e.start) < todayK).map((e) => ({ m: +e.start.slice(5, 7), name: e.name, venue: e.venue || "", last: `${e.start.slice(5).replace("-", "/")}${e.end && e.end !== e.start ? `~${e.end.slice(5).replace("-", "/")}` : ""}` })),
    { m: 1, name: L("동해 해맞이 행사", "Donghae New Year sunrise"), venue: L("망상·추암 해변, 논골담길 일대", "Mangsang & Chuam beaches, Nongol alley"), last: L("매년 1월 1일", "every Jan 1") }]
    .sort((a, b) => ((a.m - today.getMonth() - 1 + 12) % 12) - ((b.m - today.getMonth() - 1 + 12) % 12));
  return (
    <section className="sec wrap">
      <Head mascot="full-nongak" lang={lang} photo="mureung_lavender" title={L("행사·축제 달력", "Events calendar")} sub={L(`동해시 문화행사·축제 공공데이터 (기준일 ${d?.as_of || "-"})`, "Donghae events from public data")} />
      <div className="ev-grid">
        <div className="cal">
          <div className="cal-head">
            <button className="cal-nav" onClick={() => { setView(new Date(y, m - 1, 1)); setDay(null); }} aria-label={L("이전 달", "Previous month")}>‹</button>
            <b>{lang === "ko" ? `${y}년 ${m + 1}월` : view.toLocaleDateString("en", { year: "numeric", month: "long" })}</b>
            <button className="cal-nav" onClick={() => { setView(new Date(y, m + 1, 1)); setDay(null); }} aria-label={L("다음 달", "Next month")}>›</button>
          </div>
          <div className="cal-grid">
            {WD.map((w, i) => <span key={w} className={`cal-wd${i === 0 ? " cal-sun" : i === 6 ? " cal-sat" : ""}`}>{w}</span>)}
            {cells.map((c, i) => {
              if (!c) return <span key={i} />;
              const k = iso(c), n = on(k).length;
              return <button key={k} className={`cal-day${n ? " has-ev" : ""}${k === iso(today) ? " today" : ""}`} aria-pressed={day === k}
                aria-label={`${c.getDate()}${L("일", "")}${n ? L(` 행사 ${n}개`, ` ${n} events`) : ""}`} onClick={() => setDay(day === k ? null : k)}>{c.getDate()}{n > 0 && <i aria-hidden="true" />}</button>;
            })}
          </div>
        </div>
        <div>
          {upcoming.length > 0 && !day && <div className="ev-next panel"><b>{L("곧 열리는 행사", "Coming up")}</b>
            <ul className="plain">{upcoming.slice(0, 3).map((e) => <li key={e.name + e.start}><span className="badge g-G">{e.start.slice(5).replace("-", "/")}{e.end && e.end !== e.start ? `~${e.end.slice(5).replace("-", "/")}` : ""}</span> {e.name}{e.venue ? <small className="muted"> · {e.venue}</small> : null}</li>)}</ul></div>}
          <h2 className="h3">{day ? L(`${day} 행사`, `Events on ${day}`) : L(`${m + 1}월 행사`, "This month")}</h2>
          {!d ? <Loading err={err} lang={lang} /> : !list.length ? <p className="muted">{L("이때 열리는 행사가 없어요.", "No events.")}</p> : (
            <ul className="ev-list">
              {list.map((e) => (
                <li key={e.name + e.start} className="panel">
                  {/라벤더/.test(e.name) && <div className="ev-ph"><PlacePhoto id="mureung_lavender" lang={lang} alt={L("라벤더 정원", "Lavender garden")} /></div>}
                  <b>{e.name}</b> <span className="badge b-plain">{e.kind}</span>
                  <p>{e.start}{e.end && e.end !== e.start ? ` ~ ${e.end}` : ""}{e.start_time ? ` · ${e.start_time}~${e.end_time || ""}` : ""} · {e.venue}</p>
                  <p className="muted">{[e.fee_type, e.fee, e.age, e.tel].filter(Boolean).join(" · ")}</p>
                  {e.access && <p className="ic-row"><Icon name="wheel" />{e.access}</p>}
                  <div className="chips">
                    <button className="chip go" onClick={() => onPlanDate(day && day >= iso(today) ? day : (e.start >= iso(today) ? e.start : iso(today)))}>{L("이 날로 코스 짜기", "Plan for this day")}</button>
                    {e.url && <a className="chip" href={e.url} target="_blank" rel="noopener">{L("행사 안내", "Details")}</a>}
                  </div>
                </li>))}
            </ul>
          )}
        </div>
      </div>
      <section className="panel ev-yearly" aria-labelledby="ev-y-h">
        <h2 id="ev-y-h" className="h3">{L("해마다 열리는 축제", "Festivals held every year")}</h2>
        <p className="muted small">{L("올해 열린 때를 기준으로 보여 줘요. 내년 날짜는 아직 발표 전이라 확인이 필요해요. 날짜가 정해지면 관리자가 [공지·행사]에서 올리면 달력에 바로 보여요.", "Based on this year's dates. Next year's dates aren't announced yet.")}</p>
        <ol className="ev-y-list">{yearly.map((e) => <li key={e.name}><span className="ev-m">{L(`${e.m}월`, new Date(2026, e.m - 1, 1).toLocaleDateString("en", { month: "short" }))}</span>
          <div><b>{e.name}</b><small className="muted">{L(`올해 ${e.last}`, `this year ${e.last}`)}{e.venue ? ` · ${e.venue}` : ""}</small></div><span className="badge b-unknown">{L("날짜 확인 전", "Date TBC")}</span></li>)}</ol>
        <p className="muted small">{L("해맞이 행사 출처: 강원관광(gangwon.to) 축제·행사. 2023년처럼 안전 문제로 행사를 열지 않은 해도 있어요.", "Sunrise event source: Gangwon tourism. Some years it was cancelled for safety.")}</p>
      </section>
    </section>
  );
}

/* ---------------- 숙소 ---------------- */
// 숙소 예약으로 바로 가기: 네이버 지도(예약 가능한 곳은 '예약' 버튼이 뜸)·카카오맵 검색. 예약을 대신하지 않고 이동만 시킨다
export function BookLinks({ name, lang }: { name: string; lang: Lang }) {
  const L = pick(lang), q = encodeURIComponent(`동해 ${name}`);
  return (
    <span className="book">
      <a className="chip go" href={`https://map.naver.com/p/search/${q}`} target="_blank" rel="noreferrer">{L("예약하기", "Book")}</a>
      <a className="chip" href={`https://map.kakao.com/?q=${q}`} target="_blank" rel="noreferrer">{L("카카오맵", "Kakao Map")}</a>
    </span>
  );
}

// 한국관광공사 무장애 여행 정보에 올라 있는 동해시 숙소 (객실·출입 정보가 실제로 있는 곳)
// 목록에서는 편의시설을 픽토그램으로만, 자세한 내용은 펼쳐서 (IMP-013). 같은 자료의 음식점은 아래에 따로 접어 둠
const BF_PICTO: [string, string, string, string][] = [["parking", "P", "장애인 주차", "Accessible parking"], ["route", "wheel", "출입 접근로", "Step-free approach"], ["elevator", "elev", "엘리베이터", "Elevator"],
  ["restroom", "toilet", "장애인 화장실", "Accessible toilet"], ["room", "bed", "장애인 객실", "Accessible room"], ["lactationroom", "family", "수유실", "Nursing room"], ["braileblock", "vision", "점자블록", "Tactile paving"]];
function BfPicto({ facts, lang }: { facts: Record<string, string>; lang: Lang }) {
  const L = pick(lang);
  const has = BF_PICTO.filter(([k]) => facts[k] && !/없음/.test(facts[k]));
  if (!has.length) return null;
  return <ul className="pl2-ic bf-picto" aria-label={L("편의시설", "Facilities")}>{has.map(([k, ic, ko, en]) => <li key={k} title={L(ko, en)}>
    {ic === "P" ? <b className="pl2-P" aria-hidden="true">P</b> : ic === "wheel" ? <AccIcon k="지체장애" size={18} /> : ic === "family" ? <AccIcon k="영유아가족" size={18} /> : ic === "vision" ? <AccIcon k="시각장애" size={18} />
      : ic === "elev" ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9 9l3-3 3 3M9 15l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <Icon name={ic} />}
    <span className="sr-only">{L(ko, en)}</span></li>)}</ul>;
}
function BfStays({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [stays, setStays] = useState<any[]>([]);
  const [foods, setFoods] = useState<any[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    Promise.all(["stay", "food"].map((k) => api.get(`/api/bf?kind=${k}`).catch(() => ({ items: [] }))))
      .then(([s, f]: any[]) => { setStays(s.items || []); setFoods(f.items || []); setLabels(s.labels || f.labels || {}); }).catch(() => {});
  }, []);
  if (!stays.length && !foods.length) return null;
  const row = (b: any) => (
    <li key={b.id}>
      <div className="bf-row"><b>{b.name}</b><BfPicto facts={b.facts || {}} lang={lang} /></div>
      <span className="muted small">{b.addr}{b.tel ? ` · ${b.tel}` : ""}</span>
      <details className="bf-more"><summary>{L("편의시설 자세히", "Facility details")}</summary>
        <ul className="small">{Object.entries(b.facts as Record<string, string>).slice(0, 10).map(([k, v]) => <li key={k}><b>{labels[k] || k}</b> {v}</li>)}</ul></details>
      {b.type !== "food" && <BookLinks name={b.name} lang={lang} />}
    </li>);
  return (
    <div className="panel bigdata">
      <h2 className="h3">{L(`무장애 정보가 확인된 숙소 ${stays.length}곳`, `${stays.length} stays with verified access info`)}</h2>
      <p className="muted small">{L("한국관광공사 무장애 여행 정보에 객실·출입 정보가 등록된 숙소예요. 아래 '동해시 숙소 전체'와 달리 편의시설이 확인돼 있어요.", "Listed in KTO barrier-free data with room and entrance info, unlike the full list below.")}</p>
      {stays.length > 0 && <ul className="plain bf-list">{stays.map(row)}</ul>}
      {foods.length > 0 && <details className="bf-food"><summary>{L(`같은 자료의 무장애 음식점 ${foods.length}곳 보기`, `${foods.length} accessible restaurants in the same data`)}</summary>
        <ul className="plain bf-list">{foods.map(row)}</ul></details>}
    </div>
  );
}

export function StayPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [zone, setZone] = useState("mangsang");
  const [d, err] = useLoad(() => api.get(`/api/lodging?zone=${zone}&limit=0`), [zone]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const key = q.trim().replace(/\s+/g, "");
  // 숙소 종류 묶음 (공공데이터 업종 이름이 어려워서 쉬운 말로)
  const KINDS: [string, string, string, string[]][] = [["hotel", "호텔·리조트", "Hotels & resorts", ["관광호텔업", "가족호텔업", "휴양콘도미니엄업"]],
    ["inn", "모텔·여관", "Motels & inns", ["숙박업(일반)"]], ["stay", "생활숙박·레지던스", "Serviced stays", ["숙박업(생활)"]], ["hostel", "호스텔·게스트하우스", "Hostels", ["호스텔업"]]];
  const kindOk = (r: any) => !kind || (KINDS.find((k) => k[0] === kind)?.[3] || []).includes(r.kind);
  const all = d?.items || [];
  const exactS = !key || all.some((r: any) => `${r.name}${r.kind}${r.address}`.replace(/\s+/g, "").includes(key));
  const rows = all.filter((r: any) => kindOk(r) && (!key || (exactS ? `${r.name}${r.kind}${r.address}`.replace(/\s+/g, "").includes(key) : fuzzyHit(r.name, key) >= 0)));
  const Q = [L("출입구에 턱이나 계단이 있나요? 경사로가 있나요?", "Steps or a ramp at the entrance?"), L("방문 폭이 휠체어(80cm 이상) 들어갈 만큼 넓은가요?", "Room door at least 80 cm wide?"),
    L("욕실 문턱이 없나요? 손잡이가 있나요?", "Step-free bathroom with grab bars?"), L("엘리베이터가 있나요? (2층 이상 객실이면)", "Is there a lift?"),
    L("장애인 주차 구역이 건물 입구 가까이 있나요?", "Accessible parking near the entrance?"), L("침대 높이가 휠체어 좌석과 비슷한가요?", "Bed height similar to wheelchair seat?")];
  return (
    <section className="sec wrap">
      <Head lang={lang} photo="mangsang" mascot="full-bow" title={L("숙소", "Where to stay")} sub={L("공공데이터에는 객실 접근성 정보가 없어요. 예약 전에 아래 질문을 전화로 꼭 물어보세요. '예약하기'는 네이버 지도로 이어져요.", "Public data has no room accessibility info. Call and ask before booking. 'Book' opens Naver Map.")} />
      <BfStays lang={lang} />
      <div className="panel">
        <h2 className="h3">{L("예약 전에 물어볼 것", "Ask before booking")}</h2>
        <ul className="checks">{Q.map((q) => <li key={q}>{q}</li>)}</ul>
      </div>
      <h2 className="h3 stay-all-h">{L("동해시 숙소 전체 (공공데이터)", "All lodging in Donghae (open data)")}</h2>
      <p className="muted small">{L("동해시에 등록된 모든 숙소예요. 무장애 객실 여부는 아직 확인 전이라 예약 전에 위 질문을 물어보세요.", "Every registered stay. Accessible rooms are not verified yet; ask the questions above.")}</p>
      <div className="tabs" role="group" aria-label={L("권역", "Areas")}>
        {ZONES.map((z) => <button key={z.k} aria-pressed={zone === z.k} onClick={() => setZone(z.k)} style={{ ["--z" as any]: z.c }}>{L(z.ko, z.en)}</button>)}
      </div>
      <form className="psearch" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="stay-q">{L("숙소 찾기", "Find lodging")}</label>
        <input id="stay-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("이름·종류·주소로 찾기 (예: 호텔, 펜션)", "Search by name, type or address")} />
      </form>
      <div className="chips stay-kinds" role="group" aria-label={L("숙소 종류", "Type")}>
        <button className="chip" aria-pressed={!kind} onClick={() => setKind("")}>{L("모두", "All")} <small>{all.length}</small></button>
        {KINDS.map(([k, ko, en, ks]) => { const n = all.filter((r: any) => ks.includes(r.kind)).length; return <button key={k} className="chip" aria-pressed={kind === k} disabled={!n && kind !== k} onClick={() => setKind(kind === k ? "" : k)}>{L(ko, en)} <small>{n}</small></button>; })}
      </div>
      {!d ? <Loading err={err} lang={lang} /> : (
        <div className="tbl-wrap"><table className="tbl tbl-stack">
          <thead><tr><th>{L("이름", "Name")}</th><th>{L("종류", "Type")}</th><th>{L("주소", "Address")}</th><th>{L("전화", "Phone")}</th><th>{L("예약·지도", "Book · map")}</th></tr></thead>
          <tbody>{!rows.length && <tr><td colSpan={5} className="muted">{L(`이 권역에는 ${kind ? `'${KINDS.find((x) => x[0] === kind)?.[1]}'` : ""} 숙소가 없어요 (0곳). 다른 권역을 눌러 보세요.`, "No stays of this type in this area (0). Try another area.")}</td></tr>}
            {rows.map((r: any) => <tr key={r.name + r.address}><td className="tbl-name">{r.name}{r.tourist && <span className="badge b-plain">{L("관광숙박업", "Registered")}</span>}</td><td data-label={L("종류", "Type")}>{tr(lang, r.kind)}</td><td data-label={L("주소", "Address")}><small>{r.address}</small></td><td data-label={L("전화", "Phone")}>{r.tel ? <a href={`tel:${r.tel}`}>{r.tel}</a> : "-"}</td><td data-label={L("예약", "Book")}><BookLinks name={r.name} lang={lang} /></td></tr>)}</tbody>
        </table></div>
      )}
      <p className="muted small">{L(`${rows.length}곳 · 무장애 객실 여부는 모두 '확인 전'이에요. 자료: 동해시 숙박업소(2026-09-28)·관광숙박업(2025-11-04) 공공데이터 — 지금 공개된 것 중 가장 최신이에요.`, `${rows.length} places. Accessible rooms: not verified. Source: Donghae lodging open data (Sep 2026).`)}</p>
    </section>
  );
}

/* ---------------- 여행 준비·자주 묻는 질문 ---------------- */
export function GuidePage({ lang, embedded = false }: { lang: Lang; embedded?: boolean }) {
  const L = pick(lang);
  const lists = [
    { t: L("휠체어", "Wheelchair"), i: [L("전동휠체어 충전기 위치 확인 (편의시설 지도)", "Check charger locations"), L("휠체어 차량은 이동지원센터에 미리 문의", "Call the mobility center ahead"), L("장애인 화장실 위치를 코스마다 확인", "Find accessible toilets on each stop"), L("주차할 땐 장애인 주차 구역이 있는 공영주차장으로", "Use lots with accessible bays")] },
    { t: L("유모차·아이", "Stroller & kids"), i: [L("모래 해변은 유모차가 빠져요 — 데크길 위주로", "Beaches are sandy; use boardwalks"), L("기저귀 교환대는 공중화장실 정보에서 확인", "Check baby-changing tables"), L("실내 코스(연필뮤지엄·천곡동굴)를 비 올 때 대비로", "Keep indoor backups for rain")] },
    { t: L("어르신", "Older adults"), i: [L("[덜 걷는 평지로] 버튼으로 경사 있는 곳 빼기", "Use [flatter route]"), L("중간에 쉬어 갈 카페를 넣기", "Add a café break"), L("[큰 글씨 일정표]를 가족과 공유", "Share the large-print plan with family"), L("상비약과 복용 시간표 챙기기", "Bring regular medicines")] },
    { t: L("외국인", "Visitors from abroad"), i: [L("언어를 English로 바꾸면 영어 안내가 되는 안내소를 먼저 보여 줘요", "Switch to English to see English-speaking info centers first"), L("관광통역안내 1330 (24시간)", "Call 1330 for interpretation (24h)")] },
    { t: L("누구나 챙길 것", "For everyone"), i: [L("장애인 등록증·복지카드 (주차 요금 면제, 입장료 할인)", "Disability card (parking & ticket discounts)"), L("휴대폰 보조배터리 — 지도·전화를 계속 쓰니까요", "A power bank for maps and calls"), L("늘 먹는 약과 복용 시간표", "Regular medicines"), L("가족 연락처를 적은 쪽지", "A note with family phone numbers")] },
    { t: L("겨울 바닷가 (11~2월)", "Winter by the sea (Nov–Feb)"), i: [L("바닷바람이 차요 — 모자·장갑·무릎 담요", "Sea wind is cold: hat, gloves, lap blanket"), L("해 지는 시각이 5시 반 무렵이라 실외는 오후 4시 전에", "Sunset ~5:30pm; finish outdoors by 4pm"), L("해맞이는 새벽이라 춥고 붐벼요. 출렁다리는 보통 오전 9시부터", "Sunrise is cold and crowded; the bridge usually opens at 9am"), L("눈·비 오는 날은 데크가 미끄러워요 — 실내 위주로", "Wet decks are slippery; go indoors")] },
  ];
  const faq = [
    [L("초록·노랑·빨강은 무슨 뜻이에요?", "What do the colors mean?"), L("초록은 그 기준으로 갈 수 있어요, 노랑은 도움이 있거나 조심하면 갈 수 있어요, 빨강은 어려워요. 경사로 기울기·출입구 턱·통로 폭을 장애인등편의법 기준과 비교해 정해요.", "Green = accessible, yellow = with care, red = not accessible, based on ramp slope, steps and path width under Korean accessibility law.")],
    [L("영업시간이 맞나요?", "Are opening hours accurate?"), L("공공데이터와 한국관광공사 정보를 바탕으로 보여 드려요. 운영시간은 바뀔 수 있으니 출발 전에 전화로 한 번 더 확인해 주세요.", "Public data where available; others are marked as samples. Call ahead.")],
    [L("제가 입력한 정보가 저장되나요?", "Is my information stored?"), L("이동 조건은 서버에 저장하지 않아요. [내 일정]도 이 기기에만 남아요.", "No. Saved trips stay on this device.")],
    [L("현장과 다른 정보를 봤어요.", "I found wrong information."), L("코스 결과 아래 [현장 제보]로 사진과 함께 알려 주세요. 팀이 확인한 뒤 반영해요.", "Use the report form below a route; the team reviews it.")],
    [L("'현장 확인 전'은 무슨 뜻이에요?", "What does 'not yet surveyed' mean?"), L("팀이 아직 현장에서 직접 재 보지 못한 곳이에요. 비슷한 자료로 미리 판정해 둔 값이라 가기 전에 전화로 한 번 더 확인해 주세요.", "Not yet measured on site by the team. Please call ahead.")],
    [L("휠체어가 탈 수 있는 차는 어떻게 불러요?", "How do I book a wheelchair vehicle?"), L("동해시 교통약자이동지원센터 1577-2014로 전화하거나 강원 교통약자 광역이동지원센터 앱으로 예약해요. 다른 지역에 사는 등록 장애인도 이용할 수 있고, 시외로 갈 때는 7일 전까지 예약해요. [교통] 페이지에 자세히 있어요.", "Call 1577-2014 or use the Gangwon mobility app. Visitors from other regions can use it; book 7 days ahead for out-of-town trips.")],
    [L("장애인 차량은 주차비가 얼마예요?", "Is parking free with a disability permit?"), L("공영주차장 24곳 중 18곳은 장애인 차량이 무료예요(2시간이 넘으면 반값). [교통 → 주차장]에서 '장애인 차량 면제만'을 누르면 그곳만 보여요.", "18 of 24 public car parks are free with a permit (half price after 2 hours).")],
    [L("비가 오면 코스가 바뀌나요?", "What if it rains?"), L("그날 비 예보가 있으면 실내 장소를 먼저 넣어요. 직접 [실내 위주로 바꾸기]를 눌러도 돼요. 다만 휠체어·유모차로 갈 수 있는 실내 장소는 아직 많지 않아요.", "Indoor places go first on rainy days. Few indoor places are wheelchair-accessible yet.")],
    [L("동해에 저상버스가 있나요?", "Are there low-floor buses?"), L("아직 없어요. 휠체어로 시내를 다닐 때는 휠체어 차량(1577-2014)이나 택시를 이용하세요. 시티투어 버스도 접이식 휠체어만 실을 수 있어요.", "Not yet. Use the wheelchair vehicle service or a taxi.")],
    [L("전동휠체어 배터리가 걱정돼요.", "Worried about wheelchair battery?"), L("동해시에 전동휠체어 급속충전기가 5곳 있어요. [편의시설 지도]에서 위치와 운영 시간을 보고, 코스 카드의 '근처 충전기'도 확인하세요.", "There are 5 fast chargers; see the facilities map.")],
    [L("코스가 마음에 안 들어요.", "I don't like my route."), L("코스 아래 [다른 곳으로 새로 짜기]·[더 느긋하게]·[더 알차게]를 눌러 보세요. 마음에 안 들면 [되돌리기]로 돌아가요. 동이에게 \"오르막 빼줘\"처럼 말해도 돼요.", "Try 'different places', 'more relaxed' or 'fit in more', or just tell Dongi.")],
    [L("타자 치기가 어려워요.", "Typing is hard for me."), L("입력칸 옆 마이크 버튼을 누르고 말하면 글자로 바꿔 줘요. 장소 이름을 조금 틀리게 써도(예: 촛데바위) 알아들어요.", "Tap the microphone and speak. Small typos in place names are understood.")],
    [L("가족에게 일정을 보내고 싶어요.", "How do I share my plan?"), L("[큰 글씨 요약 일정표]에서 [가족에게 보내기]나 [인쇄]를 누르세요. [내 일정]에 저장한 코스도 보낼 수 있어요.", "Use the large-print summary or My trips → Share.")],
    [L("내 위치를 저장하나요?", "Is my location stored?"), L("가까운 안내소·주차장을 찾을 때 한 번만 쓰고 저장하지 않아요.", "Used once to find nearby help or parking; never stored.")],
  ];
  if (embedded) return (
    <div className="guide-in">
      <h2 className="h3">{L("자주 묻는 질문", "Frequently asked")}</h2>
      <div className="faq">{faq.map(([q, a]) => <details key={q} className="panel"><summary>{q}</summary><p>{faqLinks(a)}</p></details>)}</div>
      <details className="panel prep"><summary>{L("여행 준비물 체크리스트 (휠체어·유모차·어르신·외국인·겨울 바닷가)", "Trip checklists")}</summary>
        <div className="cards2">{lists.map((x) => <div key={x.t}><h3 className="h3">{x.t}</h3><ul className="checks">{x.i.map((i) => <li key={i}>{i}</li>)}</ul></div>)}</div></details>
      <div className="panel emer">
        <h2 className="h3">{L("급할 때", "Emergency")}</h2>
        <p><b>119</b> {L("응급·구조", "Emergency")} · <b>1330</b> {L("관광통역안내 (24시간)", "Tourist hotline (24h)")} · <b>112</b> {L("경찰", "Police")}</p>
      </div>
    </div>
  );
  return (
    <section className="sec wrap">
      <Head mascot="full-help" lang={lang} photo="zone_mureung" title={L("여행 준비·자주 묻는 질문", "Trip prep & FAQ")} />
      <div className="cards2">
        {lists.map((x) => <div key={x.t} className="panel"><h2 className="h3">{x.t}</h2><ul className="checks">{x.i.map((i) => <li key={i}>{i}</li>)}</ul></div>)}
      </div>
      <div className="panel emer">
        <h2 className="h3">{L("급할 때", "Emergency")}</h2>
        <p><b>119</b> {L("응급·구조", "Emergency")} · <b>1330</b> {L("관광통역안내 (24시간)", "Tourist hotline (24h)")} · <b>112</b> {L("경찰", "Police")}</p>
        <p className="muted">{L("화면 위 [긴급·도움] 버튼을 누르면 지금 위치에서 가까운 안내소·충전기·병원을 보여 주고, 119·1330은 눌러서 바로 전화할 수 있어요.", "Tap [Help now] at the top for nearby help; tap 119 or 1330 to call.")}</p>
      </div>
      <div className="faq">
        {faq.map(([q, a]) => <details key={q} className="panel"><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>
  );
}

/* ---------------- 출처·판정 기준 ---------------- */
// 한국관광공사 빅데이터: 동해시 일별 방문자 (현지인·외지인·외국인)
function Visitors({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [s, setS] = useState<any[]>([]);
  useEffect(() => { api.get("/api/visitors").then((d: any) => setS(d.series || [])).catch(() => {}); }, []);
  if (!s.length) return null;
  const tot = (r: any) => Object.entries(r).filter(([k]) => k !== "date").reduce((a, [, v]) => a + (Number(v) || 0), 0);
  const last = s.slice(-28);
  const max = Math.max(...last.map(tot));
  const sum = last.reduce((a, r) => a + tot(r), 0);
  const kinds = Object.keys(last[last.length - 1]).filter((k) => k !== "date");
  return (
    <div className="panel bigdata">
      <h2 className="h3">{L("동해시를 찾는 사람들", "Visitors to Donghae")}</h2>
      <p className="muted small">{L("한국관광공사 빅데이터(이동통신 데이터)로 집계한 최근 4주 일별 방문자 수예요.", "Daily visitors over the last 4 weeks, from KTO mobile-network big data.")}</p>
      <p>{L("4주 합계", "4-week total")} <b>{Math.round(sum).toLocaleString()}</b>{L("명", "")} · {L("하루 평균", "daily avg")} <b>{Math.round(sum / last.length).toLocaleString()}</b>{L("명", "")}</p>
      <div className="crowd-chart" aria-hidden="true">
        {last.map((r) => <div key={r.date} className="cc-col" title={`${ymd(r.date)} ${Math.round(tot(r)).toLocaleString()}`}>
          <span className="cc-bar" style={{ height: `${Math.max(4, (tot(r) / max) * 100)}%` }} />
          <span className="cc-d">{+r.date.slice(6, 8) % 7 === 1 ? ymd(r.date) : ""}</span></div>)}
      </div>
      <details className="cc-table"><summary>{L("표로 보기", "Show as a table")}</summary>
        <table className="tbl"><thead><tr><th>{L("날짜", "Date")}</th><th>{L("방문자", "Visitors")}</th></tr></thead>
          <tbody>{last.map((r) => <tr key={r.date}><td>{ymd(r.date)}</td><td>{Math.round(tot(r)).toLocaleString()}</td></tr>)}</tbody></table></details>
      <p className="small muted">{kinds.map((k) => `${k} ${Math.round(last.reduce((a, r) => a + (Number(r[k]) || 0), 0) / last.length).toLocaleString()}`).join(" · ")} ({L("하루 평균", "daily avg")})</p>
    </div>
  );
}

export function SourcesPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [d, err] = useLoad(() => api.get("/api/sources"), []);
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("출처·판정 기준", "Sources & criteria")} sub={L("어떤 데이터로, 어떤 기준으로 판정했는지 모두 밝혀요.", "Every dataset and rule we use.")} />
      <Visitors lang={lang} />
      {!d ? <Loading err={err} lang={lang} /> : (<>
        <div className="panel">
          <h2 className="h3">{L("판정 기준", "Grading rules")}</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{L("항목", "Item")}</th><th><span className="badge g-G">{L("갈 수 있어요", "OK")}</span></th><th><span className="badge g-Y">{L("주의", "Caution")}</span></th><th><span className="badge g-R">{L("어려워요", "No")}</span></th><th>{L("근거", "Basis")}</th></tr></thead>
            <tbody>{d.criteria.map((c: any) => <tr key={c.item}><td>{tr(lang, c.item)}</td><td>{tr(lang, c.ok)}</td><td>{tr(lang, c.warn)}</td><td>{tr(lang, c.no)}</td><td><small>{tr(lang, c.law)}</small></td></tr>)}</tbody>
          </table></div>
          <ul className="plain">{(lang === "ko" ? d.notes : SOURCE_NOTES_EN).map((n: string) => <li key={n} className="muted">{n}</li>)}</ul>
        </div>
        <div className="panel">
          <h2 className="h3">{L(`공공데이터 ${d.datasets.length}종`, `${d.datasets.length} public datasets`)}</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{L("데이터", "Dataset")}</th><th>{L("건수", "Rows")}</th><th>{L("기준일", "As of")}</th></tr></thead>
            <tbody>{d.datasets.map((x: any) => <tr key={x.name + x.file}><td>{x.name}</td><td>{x.count}</td><td>{x.as_of}</td></tr>)}</tbody>
          </table></div>
          <p className="muted small">{L("출처: 공공데이터포털(data.go.kr). 숙박·음식점은 위치·접근성 정보가 없어 권역 안내에만 써요.", "Source: data.go.kr")}</p>
        </div>
        <div className="panel">
          <h2 className="h3">{L("사진 출처", "Photo credits")}</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{L("장소", "Place")}</th><th>{L("저작자", "Author")}</th><th>{L("라이선스", "License")}</th><th>{L("원본", "Original")}</th></tr></thead>
            <tbody>{d.photos.map((x: any) => <tr key={x.id}><td>{x.id}</td><td>{x["저작자"]}</td><td>{x["라이선스"] === "KOGL Type 1" ? L("공공누리 제1유형", "KOGL Type 1") : x["라이선스"]}</td><td>{x["출처"] ? <a href={x["출처"]} target="_blank" rel="noopener">{L("위키미디어 공용", "Wikimedia Commons")}</a> : L("확인 중", "Being confirmed")}</td></tr>)}</tbody>
          </table></div>
          <p className="muted small">{L("사진이 없는 장소는 그림으로 보여 줘요.", "Places without a photo show an illustration.")}</p>
        </div>
        <div className="panel">
          <h2 className="h3">{L("서비스 안에서 쓰는 AI", "AI used inside the service")}</h2>
          <p>{d.ai?.connected ? L(`외부 AI API 연결됨 (${d.ai.provider || "Anthropic"} · ${d.ai.model || ""})`, "External AI API connected") : L("이 화면에서는 외부 AI API가 연결되어 있지 않아 규칙 엔진으로 동작해요.", "AI API not connected here; rule engine in use.")}</p>
          <ul className="plain">
            <li>{L("대화로 조건 알아듣기·코스 고치기 (동이 대화)", "Understanding chat and editing routes")}</li>
            <li>{L("코스 설명 문장 만들기", "Writing route explanations")}</li>
            <li>{L("현장 제보 사진에서 장애물 찾기 (관리자 검수용)", "Finding obstacles in reported photos (for review)")}</li>
          </ul>
          <p className="muted small">{L("AI가 틀려도 코스 판정은 바뀌지 않아요. 판정은 규칙 엔진이 하고, 사진 분석은 사람이 확인한 뒤에만 반영해요.", "Grades come from rules; photo analysis is applied only after human review.")}</p>
        </div>
      </>)}
    </section>
  );
}

export { AdminPage } from "@/components/Admin";
