"use client";
// 코스 만들기 화면의 최소 구현(동이와 대화 → 코스 → 말로 수정 → 안심).
// 관광지·추천 코스·후기 섹션은 프로토타입 v2의 구조를 그대로 옮겨 붙이면 된다 (README의 '화면 옮기기' 참고).
import { useEffect, useMemo, useState } from "react";
import ko from "@/i18n/ko.json";
import en from "@/i18n/en.json";
import Dongi from "@/components/Dongi";
import KakaoMap from "@/components/KakaoMap";
import { Hero, Places, Courses, PRESETS } from "@/components/Sections";
import { PlacePage, TransportPage, MapPage, MyPage, EventsPage, StayPage, GuidePage, SourcesPage, AdminPage, loadPlans, savePlans } from "@/components/Pages";
import Calendar from "@/components/Calendar";
import { StopCard, Summary, encodePlan, decodePlan, dateLabel, wdName } from "@/components/Timeline";
import { api, Conditions, Course, CourseRes, Extra } from "@/lib/api";

type Lang = "ko" | "en";
type Msg = { me?: boolean; pose?: string; text: string; cards?: { kind: string; data: any }[]; via?: "llm" | "rule" };
type Hint = { stay: any; move: any; events: any[]; onDay: boolean };
type Snap = { course: Course; extras: Record<string, Extra>; cond: Conditions; hint: Hint | null };
// 작업2: 큰 버튼 질문 (날짜·시각 → 누구와 → 걸음 → 식사 → 취향)
const Q = [
  { k: "when", q: "q.when", multi: false, o: [] as string[] },
  { k: "who", q: "q.who", multi: false, o: ["혼자", "연인·친구", "부모님과", "아이와", "단체"] },
  { k: "move", q: "q.move", multi: true, none: "일반", o: ["휠체어", "보행보조기·유모차", "거동 불편 어르신", "일반"] },
  { k: "meal", q: "q.meal", multi: true, none: "상관없어요", o: ["입식", "부드러운 메뉴", "주차 편한 곳", "상관없어요"] },
  { k: "style", q: "q.style", multi: true, o: ["바다 보기", "자연·산책", "카페", "맛집", "역사·문화"] },
] as const;
// 화면의 보행 상태 → 엔진 이동 조건 (장애인등편의법 기준 판정 모드)
const MOVE_MAP: Record<string, string[]> = {
  "휠체어": ["휠체어"], "보행보조기·유모차": ["유모차"], "거동 불편 어르신": ["오래 걷기 어려움", "계단 어려움"], "일반": [],
};
const toMove = (xs: string[] = []) => Array.from(new Set(xs.flatMap((x) => MOVE_MAP[x] ?? [x])));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const nextWd = (wd: number) => plusDays((wd - new Date().getDay() + 7) % 7);
const TIMES = ["09:00", "10:00", "11:00", "13:00", "14:00"];

export default function Page() {
  const [lang, setLang] = useState<Lang>("ko");
  const D = (lang === "ko" ? ko : en) as Record<string, string>;
  const t = (k: string, v: Record<string, string | number> = {}) =>
    (D[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ""));
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<Record<string, string[]>>({});
  const [cond, setCond] = useState<Conditions>({ who: "혼자", move: [], style: [], days: "당일", start: "동해역", memo: "", wish: [], lang: "ko",
    date: iso(new Date()), start_time: "10:00", meal: [] });
  const [log, setLog] = useState<Msg[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [places, setPlaces] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [safety, setSafety] = useState<any>(null);
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [talkState, setTalkState] = useState<Record<string, boolean>>({});
  const [big, setBig] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hist, setHist] = useState<Snap[]>([]);          // 되돌리기
  const [fresh, setFresh] = useState<string[]>([]);      // 방금 새로 들어간 곳
  const [showNear, setShowNear] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [sumOpen, setSumOpen] = useState(false);
  const [route, setRoute] = useState<string[]>([""]);
  const [saved, setSaved] = useState(false);
  const [site, setSite] = useState<{ banner: any; notices: any[] } | null>(null);   // 관리자 공지 (바로 반영)
  useEffect(() => { api.get("/api/site").then(setSite).catch(() => {}); }, [route]);

  useEffect(() => { setLog([{ pose: "wave", text: t("plan.greet") }, { pose: "ask", text: t("q.when") }]); setStep(0); }, [lang]);
  useEffect(() => { api.places().then((ps) => setPlaces(Object.fromEntries(ps.map((p) => [p.id, p])))).catch(() => {}); }, []);
  // 작업4: 글자 크게 보기는 다음에 와도 그대로
  useEffect(() => {
    let on = false;
    try { on = localStorage.getItem("gd-big") === "1"; } catch { /* 저장소를 못 쓰는 브라우저 */ }
    setBig(on); document.body.classList.toggle("big", on);
  }, []);
  // 페이지 이동: '#/교통' 같은 주소. '#plan' 같은 건 처음 화면 안의 위치. '#plan=...'은 공유받은 일정표.
  useEffect(() => {
    const onHash = () => {
      const h = location.hash;
      setRoute(h.startsWith("#/") ? h.slice(2).split("/") : [""]);
      const m = h.match(/^#plan=(.+)$/);
      const c = m && decodePlan(m[1]);
      if (c) {
        setLang(c.lang || "ko"); setCond(c); setStep(Q.length + 1); setBusy(true);
        api.course(c).then((r) => { applyRes(r); setSumOpen(true); }).catch(() => say({ pose: "worry", text: t("error.server") })).finally(() => setBusy(false));
        return;
      }
      setSumOpen(false);
      if (h.startsWith("#/")) window.scrollTo(0, 0);
      else if (h.length > 1) setTimeout(() => document.getElementById(h.slice(1))?.scrollIntoView({ block: "start" }), 50);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  function saveMine() {
    if (!course) return;
    const hash = encodePlan({ ...cond, lang }, course);
    const plans = loadPlans().filter((p) => p.hash !== hash);
    const ok = savePlans([{ id: Math.random().toString(16).slice(2, 10), title: "", date: course.date, start_time: course.start_time, start: startName,
      stops: course.stops.map((s) => name(s.id)), hash, saved_at: new Date().toISOString() }, ...plans].slice(0, 20));
    setSaved(ok);
  }
  function planDate(d: string) {
    setCond((c) => ({ ...c, date: d })); location.hash = "#plan";
    if (course) { const wd = new Date(d + "T00:00:00").getDay(); edit("set_when", `${d} ${cond.start_time}`, t("edit.whenSay", { d: `${dateLabel(d, lang)}(${wdName(wd, lang)})`, t: cond.start_time || "" })); }
  }

  function toggleBig() {
    const on = !big; setBig(on); document.body.classList.toggle("big", on);
    try { localStorage.setItem("gd-big", on ? "1" : "0"); } catch { /* 무시 */ }
  }

  const say = (m: Msg) => setLog((l) => [...l, m]);
  const name = (id: string) => (lang === "ko" ? places[id]?.name_ko : places[id]?.name_en || places[id]?.name_ko) ?? id;

  function pick(o: string) {
    const q = Q[step];
    if (!q.multi) { finishQ({ ...ans, [q.k]: [o] }, [o]); return; }
    const none = "none" in q ? q.none : null;
    let cur = ans[q.k] || [];
    if (o === none) cur = cur.includes(o) ? [] : [o];
    else cur = cur.filter((x) => x !== none).includes(o) ? cur.filter((x) => x !== o) : [...cur.filter((x) => x !== none), o];
    setAns({ ...ans, [q.k]: cur });
  }
  function finishQ(next: Record<string, string[]>, chosen: string[]) {
    setAns(next);
    say({ me: true, text: chosen.map((o) => t(`opt.${o}`)).join(", ") });
    const n = step + 1; setStep(n);
    say({ pose: "ask", text: n < Q.length ? t(Q[n].q) : t("q.last") });
  }
  function finishWhen() {
    const d = cond.date || iso(new Date());
    const wd = new Date(d + "T00:00:00").getDay();
    finishQ({ ...ans, when: [d, cond.start_time || "10:00"] }, []);
    setLog((l) => { const c = [...l]; c[c.length - 2] = { me: true, text: `${dateLabel(d, lang)}(${wdName(wd, lang)}) ${cond.start_time}` }; return c; });
  }
  const baseCond = (): Conditions => ({ ...cond, lang, who: ans.who?.[0] || cond.who,
    move: ans.move ? toMove(ans.move) : cond.move, meal: ans.meal ? ans.meal.filter((x) => x !== "상관없어요") : cond.meal || [],
    style: ans.style || cond.style });
  async function make() {
    const c = baseCond();
    await makeWith(c, `${t(`opt.${c.days}`)} · ${t(`opt.${c.start}`)}${c.memo ? " · " + c.memo : ""}`);
  }
  const toPlan = () => { if (location.hash.startsWith("#/")) location.hash = "#plan"; else document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  // 추천 코스(예시)의 조건 그대로 코스 만들기
  async function startPreset(i: number) {
    const pr = PRESETS[i] as any;
    const c: Conditions = { ...cond, who: pr.who, move: [...pr.move], style: [...pr.style], start: pr.start, rain: pr.rain ?? null, days: "당일", lang } as Conditions;
    setAns({ who: [pr.who], move: [...pr.move], style: [...pr.style] }); toPlan();
    await makeWith(c, [t(`opt.${pr.who}`), ...pr.move.map((m: string) => t(`opt.${m}`)), t(`opt.${pr.start}`)].join(", "));
  }
  // 관광지 카드의 '코스에 담기': 코스가 있으면 동이에게 넣어 달라고 하고, 없으면 담아 두었다가 코스를 만들 때 넣는다
  function addWish(id: string) {
    if (course) { toPlan(); edit("add", id, lang === "ko" ? `${places[id]?.name_ko} 넣어줘` : `add ${places[id]?.name_ko}`); return; }
    setCond((c) => ({ ...c, wish: Array.from(new Set([...(c.wish || []), id])), must: Array.from(new Set([...(c.must || []), id])) }));
  }
  function applyRes(r: CourseRes | any, before: string[] = []) {
    setSaved(false);
    setCourse(r.course); setExtras((x) => ({ ...x, ...(r.extras || {}) }));
    if (r.conditions) setCond(r.conditions);
    if (r.stay !== undefined) setHint({ stay: r.stay, move: r.move, events: r.events || [], onDay: !!r.events_on_day });
    const now = r.course.stops.map((s: any) => s.id);
    setFresh(before.length ? now.filter((i: string) => !before.includes(i)) : []);
  }
  function snapshot() { if (course) setHist((h) => [...h.slice(-9), { course, extras, cond, hint }]); }
  function undo() {
    const last = hist[hist.length - 1]; if (!last) return;
    setHist((h) => h.slice(0, -1)); setCourse(last.course); setExtras(last.extras); setCond(last.cond); setHint(last.hint); setFresh([]);
    say({ me: true, text: t("chat.undo") }); say({ pose: "happy", text: lang === "ko" ? "바꾸기 전 코스로 되돌렸어요." : "Back to the previous course." });
  }
  async function makeWith(c: Conditions, label: string) {
    setCond(c); setBusy(true);
    say({ me: true, text: label });
    say({ pose: "think", text: t("plan.thinking") });
    try {
      const r = await api.course(c);
      setHist([]); applyRes(r);
      const skip = r.course.skipped.length ? " " + r.course.notes.filter((n) => r.course.skipped.some((s) => n.startsWith(s.name))).join(" ") : "";
      say({ pose: "happy", text: t("plan.done", { n: r.course.stops.length }) + skip + (r.summary ? " " + r.summary : "") });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false); setStep(Q.length + 1);
  }
  // 작업3: 버튼(빠른 수정·카드 버튼)은 AI 없이 규칙으로 바로 고친다. 대화창에도 같은 말이 남는다.
  async function edit(action: string, target: string | null, sayText: string) {
    if (!course) return;
    snapshot(); say({ me: true, text: sayText }); setBusy(true);
    try {
      const before = course.stops.map((s) => s.id);
      const r = await api.edit({ conditions: { ...cond, lang }, course_ids: before, action, target });
      applyRes(r, before);
      say({ pose: r.changed ? "happy" : "neutral", text: r.reply || "", via: "rule" });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false);
  }
  // 자유 대화: 동이(LLM 또는 규칙)가 알아듣고, 코스는 서버 엔진이 계산한다
  async function chat(msg: string) {
    say({ me: true, text: msg }); setBusy(true);
    const before = course?.stops.map((s) => s.id) || [];
    try {
      const r = await api.talk({ message: msg, history: log.slice(-10), conditions: baseCond(),
        state: { who_known: !!ans.who || talkState.who_known, move_known: !!ans.move || talkState.move_known },
        course_ids: before });
      setTalkState(r.state);
      if (r.course) { if (course) snapshot(); applyRes(r, before); setStep(Q.length + 1); }
      else { setCond(r.conditions); if (!course) setStep((n) => Math.max(n, r.state.move_known ? 3 : r.state.who_known ? 2 : n)); }
      if (/충전|주차|charger|parking/i.test(msg) && course) setShowNear(true);
      say({ pose: r.pose, text: r.reply, cards: r.cards, via: r.via });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false);
  }
  async function openSafety() {
    const go = (lat: number, lon: number) => api.safety(lat, lon, lang).then(setSafety).catch(() => setSafety({ places: [] }));
    navigator.geolocation?.getCurrentPosition((p) => go(p.coords.latitude, p.coords.longitude), () => go(37.5245, 129.1143));
  }

  const pins = useMemo(() => (course?.stops || []).filter((s) => places[s.id]?.lat)
    .map((s) => ({ lat: places[s.id].lat, lon: places[s.id].lon, label: name(s.id), grade: s.grade })), [course, places, lang]);
  const q = Q[step];
  const shareUrl = typeof window !== "undefined" && course ? `${location.origin}${location.pathname}#plan=${encodePlan({ ...cond, lang }, course)}` : "";
  const startName = t(`opt.${cond.start}`);

  // 함수로 부른다(컴포넌트로 만들면 렌더마다 새로 만들어져 달력의 '보는 달'이 초기화된다)
  const whenPicker = (onDone: () => void, label: string) => (
    <div className="when">
      <Calendar value={cond.date || plusDays(0)} lang={lang} onChange={(d) => setCond({ ...cond, date: d })} />
      <p className="when-h">{t("when.time")}</p>
      <div className="chips big-chips" role="group" aria-label={t("when.time")}>
        {TIMES.map((h) => <button key={h} className="chip" aria-pressed={cond.start_time === h} onClick={() => setCond({ ...cond, start_time: h })}>{h}</button>)}
        <label className="chip pick">{t("when.other")}
          <input type="time" value={cond.start_time || "10:00"} step={600} onChange={(e) => e.target.value && setCond({ ...cond, start_time: e.target.value })} /></label>
      </div>
      <button className="chip go" disabled={busy} onClick={onDone}>{label}</button>
    </div>
  );
  const overview = useMemo(() => Object.values(places).filter((p: any) => p.lat && !p.sample && p.type !== "숙박" && p.verified)
    .map((p: any) => ({ lat: p.lat, lon: p.lon, label: lang === "ko" ? p.name_ko : p.name_en || p.name_ko, grade: null })), [places, lang]);

  return (
    <>
      <a className="skip" href="#plan">{t("nav.skip")}</a>
      <header className="top">
        <div className="wrap bar">
          <a className="brand" href="#"><img src="/dongi/neutral.webp" alt="" />{t("brand")}</a>
          <nav className="nav" aria-label={t("nav.main")}>
            {([["#plan", "nav.plan", ""], ["#/places", "nav.places", "places"], ["#/transport", "nav.transport", "transport"], ["#/map", "nav.map", "map"], ["#/my", "nav.my", "my"]] as const).map(([h, k, r]) =>
              <a key={h} href={h} aria-current={route[0] === r || (r === "places" && route[0] === "place") ? "page" : undefined}>{t(k)}</a>)}
          </nav>
          <div className="tools">
            <button className="sos" onClick={openSafety}>{t("tool.safety")}</button>
            <button className="box bigt" aria-pressed={big} onClick={toggleBig}>{big ? t("tool.bigOn") : t("tool.big")}</button>
            <label className="sr-only" htmlFor="lang">{t("tool.lang")}</label>
            <select id="lang" className="box" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="ko">한국어</option><option value="en">English</option>
            </select>
          </div>
        </div>
      </header>
      {(site?.banner || site?.notices?.length) ? (
        <div className="site-notes" role="region" aria-label={lang === "ko" ? "공지" : "Notices"}>
          {site?.banner && <p className={`site-note ${site.banner.level}`}><b>{lang === "ko" ? "공지" : "Notice"}</b> {site.banner.text}</p>}
          {site?.notices?.map((n: any) => <p key={n.id} className={`site-note ${n.level}`}><b>{n.title}</b> {n.body}</p>)}
        </div>) : null}
      <main>
      {route[0] === "place" && route[1] && <PlacePage id={route[1]} lang={lang} onAdd={addWish} />}
      {route[0] === "places" && <Places lang={lang} wish={cond.wish || []} onAdd={addWish} gradeLabel={(g) => t(`grade.${g}`)} />}
      {route[0] === "transport" && <TransportPage lang={lang} />}
      {route[0] === "map" && <MapPage lang={lang} />}
      {route[0] === "my" && <MyPage lang={lang} />}
      {route[0] === "events" && <EventsPage lang={lang} onPlanDate={planDate} />}
      {route[0] === "stay" && <StayPage lang={lang} />}
      {route[0] === "guide" && <GuidePage lang={lang} />}
      {route[0] === "sources" && <SourcesPage lang={lang} />}
      {route[0] === "admin" && <AdminPage lang={lang} />}
      {route[0] === "" && <>
      <Hero lang={lang} busy={busy} onAsk={(m) => { toPlan(); chat(m); }} />
      <section id="plan" className="sec wrap" aria-labelledby="plan-h">
      <div className="sec-head">
        <h2 id="plan-h">{t("plan.h")}</h2>
        <p>{t("plan.sub")}{(cond.wish || []).length > 0 && !course ? " " + t("plan.wished", { n: (cond.wish || []).length }) : ""}</p>
      </div>
      <div className="grid">
        <section className="panel" aria-label={t("nav.plan")}>
          {log.map((m, i) => m.me
            ? <div key={i} className="me"><span>{m.text}</span></div>
            : <div key={i}><Dongi pose={m.pose} name={t("dongi")}>{m.text}</Dongi>{m.cards?.map((c, k) => <HelpCard key={k} c={c} t={t} onSafety={openSafety} />)}</div>)}

          {step === 0 && whenPicker(finishWhen, t("plan.next"))}
          {step > 0 && step < Q.length && (
            <div className="chips big-chips">
              {q.o.map((o) => <button key={o} className="chip" aria-pressed={q.multi ? (ans[q.k] || []).includes(o) : undefined} onClick={() => pick(o)}>{t(`opt.${o}`)}</button>)}
              {q.multi && <button className="chip go" onClick={() => (ans[q.k] || []).length && finishQ(ans, ans[q.k])}>{t("plan.next")}</button>}
            </div>
          )}
          {step === Q.length && (
            <div className="chips big-chips">
              {(["당일", "1박 2일"] as const).map((d) => <button key={d} className="chip" aria-pressed={cond.days === d} onClick={() => setCond({ ...cond, days: d })}>{t(`opt.${d}`)}</button>)}
              {(["동해역", "묵호역", "자가용"] as const).map((s) => <button key={s} className="chip" aria-pressed={cond.start === s} onClick={() => setCond({ ...cond, start: s })}>{t(`opt.${s}`)}</button>)}
              <input aria-label={t("plan.memo")} placeholder={t("plan.memoPh")} value={cond.memo} onChange={(e) => setCond({ ...cond, memo: e.target.value })} />
              <button className="chip go" disabled={busy} onClick={make}>{t("plan.make")}</button>
            </div>
          )}
          {step > Q.length && course && (
            <div className="qc" role="group" aria-label={lang === "ko" ? "빠른 수정" : "Quick edits"}>
              <button className="chip" disabled={busy} onClick={() => edit("remove_uphill", null, t("qc.uphill"))}>{t("qc.uphill")}</button>
              <button className="chip" disabled={busy} onClick={() => edit("indoor", null, t("qc.indoor"))}>{t("qc.indoor")}</button>
              <button className="chip" disabled={busy} onClick={() => edit("replace_lunch", null, t("qc.lunch"))}>{t("qc.lunch")}</button>
              <button className="chip" aria-pressed={showNear} onClick={() => { setShowNear(!showNear); if (!showNear) document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth" }); }}>{showNear ? t("qc.nearOff") : t("qc.near")}</button>
              <button className="chip" disabled={busy} onClick={() => edit("relax", null, t("qc.relax"))}>{t("qc.relax")}</button>
              <button className="chip" disabled={busy} onClick={() => edit("add_cafe", null, t("qc.cafe"))}>{t("qc.cafe")}</button>
              <button className="chip" aria-expanded={whenOpen} onClick={() => setWhenOpen(!whenOpen)}>{t("qc.when")}</button>
              {hist.length > 0 && <button className="chip undo" disabled={busy} onClick={undo}>↶ {t("chat.undo")}</button>}
            </div>
          )}
          {whenOpen && course && whenPicker(() => { setWhenOpen(false);
            const wd = new Date((cond.date || "") + "T00:00:00").getDay();
            edit("set_when", `${cond.date} ${cond.start_time}`, t("edit.whenSay", { d: `${dateLabel(cond.date || "", lang)}(${wdName(wd, lang)})`, t: cond.start_time || "" })); }, t("qc.when"))}
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { chat(input.trim()); setInput(""); } }} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input style={{ flex: 1, minHeight: 46 }} aria-label={t("chat.ph")} placeholder={step > Q.length ? t("chat.ph") : t("talk.ph")} value={input} onChange={(e) => setInput(e.target.value)} />
                <button className="chip go" disabled={busy}>{t("chat.send")}</button>
          </form>
        </section>

        <section className="panel" aria-live="polite" id="timeline">
          {!course ? (<>
              <Dongi pose="neutral" name={t("dongi")}>{t("plan.empty")}</Dongi>
              <KakaoMap pins={overview} overview />
              <p className="muted" style={{ fontSize: ".85em" }}>{t("map.overview", { n: overview.length })}</p>
            </>) : (
            <>
              <div className="tl-head">
                <div>
                  <p className="tl-date">{t("tl.head", { d: dateLabel(course.date, lang), w: wdName(course.weekday, lang), s: course.start_time })} · {startName}</p>
                  <p className="muted">{!course.overall ? t("result.noMode") : course.overall === "G" ? t("result.allOk")
                    : t("result.caution", { n: course.stops.filter((s) => s.grade && s.grade !== "G").length })}</p>
                </div>
                <div className="chips">
                  <button className="chip go sum-btn" onClick={() => setSumOpen(true)}>{t("sum.open")}</button>
                  <button className="chip" onClick={saveMine} aria-live="polite">{saved ? t("my.saved") : t("my.save")}</button>
                </div>
              </div>
              <KakaoMap pins={pins} />
              <div className="tl">
                {course.stops.map((s, i) => (
                  <div key={s.id}>
                    <p className="muted tl-drive">{t("result.drive", { m: s.drive_min })}</p>
                    <StopCard s={s} i={i} x={extras[s.id]} name={name(s.id)} t={t} lang={lang} wheel={cond.move.includes("휠체어")}
                      showNear={showNear} isNew={fresh.includes(s.id)} busy={busy}
                      onRemove={() => edit("remove", s.id, t("edit.removeSay", { n: i + 1, p: name(s.id) }))}
                      onReplace={() => edit("replace", s.id, t("edit.replaceSay", { n: i + 1, p: name(s.id) }))} />
                    <details className="tl-more"><summary>{lang === "ko" ? "이야기·걷기길·택시 더 보기" : "Stories, trails, taxis"}</summary>
                      <StopExtra x={extras[s.id]} wheel={cond.move.includes("휠체어")} t={t} /></details>
                  </div>
                ))}
              </div>
              <p className="muted">{t("result.back", { s: startName, t: course.back_at })}</p>
              {course.skipped.length > 0 && (
                <div className="tl-skip"><b>{t("tl.skipped")}</b>
                  <ul>{course.skipped.map((x) => <li key={x.id}>{x.name} — {x.reason}</li>)}</ul></div>)}
              {course.notes.filter((n) => !course.skipped.some((x) => n.startsWith(x.name))).map((n) => <p key={n} className="muted">{n}</p>)}
              {hint?.events?.length ? (
                <div className={`tl-events${hint.onDay ? " on" : ""}`}>
                  <b>🎉 {t(hint.onDay ? "tl.eventsDay" : "tl.eventsSoon")}</b>
                  <ul>{hint.events.map((e) => <li key={e.name}>{e.name} · {e.start}{e.end && e.end !== e.start ? `~${e.end}` : ""}{e.venue ? ` · ${e.venue}` : ""}</li>)}</ul>
                </div>) : null}
              {hint?.move && (
                <div className="stop" style={{ display: "block" }}>
                  <b>{t("x.tourTitle")}</b>
                  {hint.move.taxi && <p className="muted">{t("x.taxiStart", { s: startName, n: hint.move.taxi.spaces })}</p>}
                  {hint.move.mobility_center && (<>
                    <p className="muted">♿ {t("x.mobility", { n: hint.move.mobility_center.wheelchair_vehicles, t: hint.move.mobility_center.tel, f: hint.move.mobility_center.fare })}</p>
                    <p className="muted">{t("x.mobilityWho")}</p>
                  </>)}
                  {hint.move.rentals?.[0] && <p className="muted">🚗 {t("x.rental", { n: hint.move.rentals[0].name, h: hint.move.rentals[0].weekday })} · {hint.move.rentals[0].tel}</p>}
                  {hint.move.city_tour?.covers.length > 0 && (<>
                    <p className="muted">{t("x.tour", { ...hint.move.city_tour, m: hint.move.city_tour.interval_min, n: hint.move.city_tour.covers.length })}</p>
                    {cond.move.length > 0 && <p className="muted">{t("x.tourWheel", { c: hint.move.city_tour.contact })}</p>}
                  </>)}
                </div>
              )}
              {hint?.stay && <p className="muted">🛏 {t("x.stay", { z: hint.stay.zone_name, n: hint.stay.count })}</p>}
              <ReportBox stops={course.stops.map((s) => ({ id: s.id, name: name(s.id) }))} t={t} />
              <p className="muted" style={{ fontSize: ".8em" }}>{t("x.src")}</p>
            </>
          )}
        </section>
      </div>

      </section>
      <Courses lang={lang} busy={busy} onStart={startPreset} />
      </>}
      </main>
      <nav className="tabbar" aria-label={t("nav.main")}>
        {([["#plan", "nav.plan", "", "🧭"], ["#/places", "nav.places", "places", "📍"], ["#/transport", "nav.transport", "transport", "🚌"], ["#/map", "nav.map", "map", "🗺"], ["#/my", "nav.my", "my", "📅"]] as const).map(([h, k, r, ic]) =>
          <a key={h} href={h} aria-current={route[0] === r || (r === "places" && route[0] === "place") ? "page" : undefined}><span aria-hidden="true">{ic}</span>{t(k)}</a>)}
      </nav>
      <footer className="foot">
        <div className="wrap">
          <nav className="foot-nav" aria-label={t("nav.more")}>
            <a href="#/events">{t("nav.events")}</a><a href="#/stay">{t("nav.stay")}</a><a href="#/guide">{t("nav.guide")}</a>
            <a href="#/sources">{t("nav.sources")}</a><a href="#/admin">{t("nav.admin")}</a>
          </nav>
          <p><b>{t("brand")}</b> {t("foot.team")}</p>
          <p>{t("foot.data")}</p>
          <p>{t("foot.ai")}</p>
        </div>
      </footer>
      {sumOpen && course && <Summary course={course} extras={extras} name={name} t={t} lang={lang} start={startName} url={shareUrl} onClose={() => setSumOpen(false)} />}
      {safety && (
        <section className="sheet" role="dialog" aria-modal="false" aria-label={t("tool.safety")}>
          <Dongi pose="neutral" name={t("dongi")}>{t("safety.say")}</Dongi>
          <p><b>119</b> {t("safety.119")} · <b>1330</b> {t("safety.1330")}</p>
          {safety.help?.length > 0 && <h3>{t("safety.help")}</h3>}
          {safety.help?.map((c: any) => <div key={c.name} className="stop"><span>{c.name} · {c.languages.length ? t("safety.langs", { l: c.languages.join(", ") }) : ""}</span><span className="muted">{c.status === "check" ? t("safety.check") : `${t(c.status === "open" ? "safety.open" : "safety.closed")} ${c.hours}`} · {c.dist_m}m · {c.tel}</span></div>)}
          {safety.chargers?.length > 0 && <h3>{t("safety.chargers")}</h3>}
          {safety.chargers?.map((c: any) => <div key={c.name} className="stop"><span>{c.name} · {c.spot}</span><span className="muted">{c.open_now ? t("safety.open") : t("safety.closed")} ({t("x.chargerWk", { h: c.weekday_hours })}) · {c.dist_m}m · {c.tel}</span></div>)}
          {safety.mobility_center && <>
            <h3>{t("safety.mobility")}</h3>
            <div className="stop"><span>{safety.mobility_center.name} · {safety.mobility_center.hours}</span><span className="muted">{safety.mobility_center.tel} · {safety.mobility_center.app}</span></div>
            <p className="muted">{t("x.mobilityWho")}</p>
          </>}
          {safety.places.map((p: any) => <div key={p.name} className="stop"><span>{p.name} · {p.kind}</span><span className="muted">{p.until} · {p.dist_m}m · {p.tel}</span></div>)}
          <button className="box" onClick={() => setSafety(null)}>{t("common.close")}</button>
        </section>
      )}
    </>
  );
}

// 코스 카드 아래: 공공데이터로 붙인 이야기·택시·주차·충전기·신호등
function StopExtra({ x, wheel, t }: { x?: Extra; wheel: boolean; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!x) return null;
  const rows: string[] = [];
  if (x.stories?.[0]) rows.push(`📜 ${t("x.story")}: ${x.stories.slice(0, 2).map((s) => s.name).join(", ")} — ${x.stories[0].intro}`);
  if (x.trail_info?.[0]) rows.push(`🚶 ${t("x.trail")}: ${x.trail_info[0].name} ${t("x.km", { k: x.trail_info[0].length_km, d: x.trail_info[0].duration })}`);
  if (x.events_here?.[0]) rows.push(`🎉 ${t("x.eventHere")}: ${x.events_here[0].name} (${x.events_here[0].start}~${x.events_here[0].end})`);
  if (x.fee) rows.push(`🎟 ${x.fee}`);
  if (x.park?.[0]) rows.push(`🌳 ${t("x.park")}: ${x.park[0].name} ${x.park[0].dist_m}m`);
  if (x.taxi?.[0]) rows.push(`🚕 ${t("x.taxi")}: ${x.taxi[0].name}`);
  if (x.signals?.total) rows.push(`🚦 ${t("x.signals", { n: x.signals.total, c: x.signals.countdown })}`);
  if (x.phone) rows.push(`☎ ${x.phone}`);
  return rows.length ? <ul className="muted" style={{ margin: "0 0 8px 14px", padding: 0, fontSize: ".85em" }}>{rows.map((r) => <li key={r}>{r}</li>)}</ul> : null;
}

// 동이가 찾아 준 정보 카드 (공공데이터)
function HelpCard({ c, t, onSafety }: { c: { kind: string; data: any }; t: (k: string, v?: Record<string, string | number>) => string; onSafety: () => void }) {
  const d = c.data;
  const row = (a: string, b = "") => <div className="stop" key={a + b}><span>{a}</span><span className="muted">{b}</span></div>;
  let body: any = null;
  if (!d || (Array.isArray(d) && !d.length) || d.error) body = <p className="muted">{t("card.none")}</p>;
  else if (c.kind === "info_center") body = d.map((x: any) => row(`${x.name}${x.languages.length ? " · " + x.languages.join(", ") : ""}`, `${x.hours || t("safety.check")} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "charger") body = d.map((x: any) => row(`${x.name} · ${x.spot}`, `${t("x.chargerWk", { h: x.weekday_hours })} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "mobility_van") body = <>{row(d.name, `${d.tel} · ${d.hours}`)}<p className="muted">{t("x.mobilityWho")}</p></>;
  else if (c.kind === "city_tour") body = row(`${d.name} · ${d.days}`, `${d.board} ${d.first}~${d.last} · ${d.fare}`);
  else if (c.kind === "events") body = d.map((x: any) => row(x.name, `${x.start}~${x.end} · ${x.venue}`));
  else if (c.kind === "lodging" || c.kind === "restaurants") body = <>{d.items.map((x: any) => row(`${x.name} · ${x.kind}`, x.tel || x.address))}<p className="muted">{t("card.unverified", { n: d.count })}</p></>;
  else if (c.kind === "parking") body = d.map((x: any) => row(`${x.name} (${x.spaces})`, `${x.fee}${x.disabled_free ? " · " + t("x.parkingFree") : ""} · ${x.dist_m}m`));
  else if (c.kind === "taxi") body = (Array.isArray(d) ? d : [d]).map((x: any) => row(x.name, x.address || ""));
  else if (c.kind === "hospital_pharmacy") body = <button className="sos" onClick={onSafety}>{t("tool.safety")}</button>;
  return <div className="card-help" style={{ margin: "4px 0 12px 56px" }}>{body}<p className="muted" style={{ fontSize: ".75em" }}>{t("x.src")}</p></div>;
}

// 현장 제보: 사진을 올리면 서버가 AI 비전으로 장애물을 찾아 '검수용 제안'을 돌려준다
function ReportBox({ stops, t }: { stops: { id: string; name: string }[]; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState(stops[0]?.id || "");
  const [kind, setKind] = useState("길 상태");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setRes(null);
    const fd = new FormData(); fd.append("place_id", pid); fd.append("kind", kind); fd.append("note", note); if (file) fd.append("photo", file);
    try { const r = await fetch("/api/reports", { method: "POST", body: fd }); setRes(await r.json()); } catch { setRes({ error: true }); }
    setBusy(false);
  }
  if (!open) return <button className="chip" onClick={() => setOpen(true)}>📷 {t("rep.open")}</button>;
  return (
    <form className="stop" style={{ display: "block" }} onSubmit={send}>
      <b>{t("rep.title")}</b>
      <p className="muted">{t("rep.help")}</p>
      <div className="chips" style={{ flexWrap: "wrap" }}>
        <label className="sr-only" htmlFor="rep-place">{t("rep.place")}</label>
        <select id="rep-place" className="box" value={pid} onChange={(e) => setPid(e.target.value)}>{stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <label className="sr-only" htmlFor="rep-kind">{t("rep.kind")}</label>
        <select id="rep-kind" className="box" value={kind} onChange={(e) => setKind(e.target.value)}>{["길 상태", "계단", "턱", "경사", "공사", "화장실"].map((k) => <option key={k}>{k}</option>)}</select>
      </div>
      <p><input id="rep-photo" type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label={t("rep.photo")} /></p>
      <p><input id="rep-note" className="box" style={{ width: "100%" }} placeholder={t("rep.note")} value={note} onChange={(e) => setNote(e.target.value)} /></p>
      <button className="chip go" disabled={busy || !file}>{busy ? t("rep.busy") : t("rep.send")}</button>
      {res?.ai && (res.ai.by === "ai" ? (
        <div className="stop" style={{ display: "block", marginTop: 10 }}>
          <p className="via via-llm">{t("rep.ai")}</p>
          <p>{res.ai.summary}</p>
          <ul className="muted">{res.ai.obstacles.map((o: any, i: number) => <li key={i}><b>{o.type}</b> {o.detail}</li>)}</ul>
          {res.ai.suggested_grade && <p className="muted">{t("rep.grade")}: <span className={`badge g-${res.ai.suggested_grade}`}>{t(`grade.${res.ai.suggested_grade}`)}</span></p>}
          <p className="muted">{t("rep.review")}</p>
        </div>) : <p className="muted">{t("rep.noai")}</p>)}
      {res?.ok && !res.ai && <p className="muted">{t("rep.thanks")}</p>}
      {res?.error && <p className="muted">{t("error.server")}</p>}
    </form>
  );
}
