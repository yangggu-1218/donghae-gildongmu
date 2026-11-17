"use client";
// 코스 만들기 화면의 최소 구현(동이와 대화 → 코스 → 말로 수정 → 안심).
// 관광지·추천 코스·후기 섹션은 프로토타입 v2의 구조를 그대로 옮겨 붙이면 된다 (README의 '화면 옮기기' 참고).
import { useEffect, useMemo, useRef, useState } from "react";
import ko from "@/i18n/ko.json";
import en from "@/i18n/en.json";
import Dongi from "@/components/Dongi";
import KakaoMap from "@/components/KakaoMap";
import { Hero, HomeFacts, HowTo, NowDonghae, ZoneTiles, MoreLinks, Places, Courses, PRESETS } from "@/components/Sections";
import { PlacePage, TransportPage, MapPage, MyPage, EventsPage, StayPage, GuidePage, SourcesPage, AdminPage, loadPlans, savePlans } from "@/components/Pages";
import Calendar from "@/components/Calendar";
import { StopCard, Summary, encodePlan, decodePlan, dateLabel, wdName } from "@/components/Timeline";
import { api, Conditions, Course, CourseRes, Extra, WxDay, WX_ICON } from "@/lib/api";
import { Brief, BRIEF_ICON, evidence, ruleBrief } from "@/lib/brief";

type Lang = "ko" | "en";
type Msg = { me?: boolean; pose?: string; text: string; cards?: { kind: string; data: any }[]; via?: "llm" | "rule"; got?: string[]; img?: string; photo?: any };
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
const STEPS = { ko: ["날짜", "누구와", "걸음", "식사", "취향", "출발"], en: ["Date", "Who", "Walking", "Meals", "Style", "Start"] };

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
  // 한국관광공사 관광지 집중률 예측(앞으로 30일). 못 불러오면 배지를 숨긴다.
  const [crowdMap, setCrowdMap] = useState<Record<string, { date: string; rate: number }[]>>({});
  useEffect(() => { fetch("/api/crowd").then((r) => r.json()).then((j) => setCrowdMap(j.places || {})).catch(() => {}); }, []);
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
  const [calOpen, setCalOpen] = useState(false);
  // 일별 예보 (16일 앞까지). 날짜 고르기·조건 카드·시간표에 함께 쓴다
  const [wx, setWx] = useState<WxDay[]>([]);
  useEffect(() => { fetch("/api/weather").then((r) => r.json()).then((j) => setWx(j.days || [])).catch(() => {}); }, []);
  const wxOf = (d?: string | null) => wx.find((x) => x.date === d) || null;
  // 동이 브리핑: 코스가 바뀌면 규칙 카드를 바로 보여 주고, AI가 같은 근거로 정리한 카드가 오면 바꿔 끼운다
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const wxText = (w: WxDay) => `${WX_ICON[w.icon] || ""} ${lang === "ko" ? w.ko : w.en} · ${w.pop != null ? `${lang === "ko" ? "비" : "rain"} ${w.pop}%` : `${lang === "ko" ? "강수" : "rain"} ${w.mm}mm`} · ${w.tmin}~${w.tmax}°C`;
  const [toast, setToast] = useState<{ text: string; act?: { label: string; fn: () => void } } | null>(null);
  const toastT = useRef<number>(0);
  const showToast = (text: string, act?: { label: string; fn: () => void }) => {
    setToast({ text, act }); window.clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(null), 6000);
  };
  // 대화가 늘어나면 대화 칸 안에서만 맨 아래로 내린다 (페이지 전체는 움직이지 않는다)
  const logRef = useRef<HTMLDivElement>(null);
  const [site, setSite] = useState<{ banner: any; notices: any[] } | null>(null);   // 관리자 공지 (바로 반영)
  useEffect(() => { api.get("/api/site").then(setSite).catch(() => {}); }, [route]);

  useEffect(() => { setLog([{ pose: "wave", text: t("plan.greet") }, { pose: "ask", text: t("q.when") }]); setStep(0); }, [lang]);
  // 대화 칸 높이를 실제 머리말·아래 탭 높이에 맞춘다 (폰마다 머리말 높이가 달라서)
  useEffect(() => {
    const fit = () => {
      const h = document.querySelector(".top")?.getBoundingClientRect().height || 64;
      const tb = document.querySelector(".tabbar")?.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--hdr", `${Math.round(h)}px`);
      document.documentElement.style.setProperty("--tab", `${Math.round(tb)}px`);
    };
    fit(); window.addEventListener("resize", fit); const id = window.setTimeout(fit, 800);
    return () => { window.removeEventListener("resize", fit); window.clearTimeout(id); };
  }, []);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [log, busy, step]);
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
      else if (h.length > 1) {
        const go = () => (h === "#plan" ? document.querySelector("#plan .grid") : document.getElementById(h.slice(1)))?.scrollIntoView({ block: "start" });
        setTimeout(go, 50); setTimeout(go, 450);   // 사진이 늦게 뜨며 위치가 밀리는 것까지 맞춘다
      }
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
  const toPlan = () => { if (location.hash.startsWith("#/")) location.hash = "#plan"; else { const el = document.querySelector("#plan .grid"); el?.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => el?.scrollIntoView({ block: "start" }), 600); } };
  // 추천 코스(예시)의 조건 그대로 코스 만들기
  async function startPreset(i: number) {
    const pr = PRESETS[i] as any;
    const c: Conditions = { ...cond, who: pr.who, move: [...pr.move], style: [...pr.style], start: pr.start, rain: pr.rain ?? null, days: "당일", lang } as Conditions;
    setAns({ who: [pr.who], move: [...pr.move], style: [...pr.style] }); toPlan();
    await makeWith(c, [t(`opt.${pr.who}`), ...pr.move.map((m: string) => t(`opt.${m}`)), t(`opt.${pr.start}`)].join(", "));
  }
  // 관광지 카드의 '코스에 담기': 코스가 있으면 동이에게 넣어 달라고 하고, 없으면 담아 두었다가 코스를 만들 때 넣는다
  // 담기는 언제나 '담은 곳' 목록에 들어가고(다시 누르면 빠짐), 화면 아래 알림으로 바로 알려 준다.
  // 이미 만든 코스가 있으면 알림의 버튼으로 지금 코스에 넣을 수 있다.
  function removeWish(id: string) {
    setCond((c) => ({ ...c, wish: (c.wish || []).filter((x) => x !== id), must: (c.must || []).filter((x) => x !== id) }));
  }
  function addWish(id: string) {
    const nm = name(id);
    if ((cond.wish || []).includes(id)) { removeWish(id); showToast(lang === "ko" ? `'${nm}'을(를) 담은 곳에서 뺐어요.` : `Removed '${nm}'.`); return; }
    setCond((c) => ({ ...c, wish: Array.from(new Set([...(c.wish || []), id])), must: Array.from(new Set([...(c.must || []), id])) }));
    const n = (cond.wish || []).length + 1;
    if (course && !course.stops.some((s) => s.id === id))
      showToast(lang === "ko" ? `'${nm}' 담았어요 (담은 곳 ${n}곳).` : `Added '${nm}'.`,
        { label: lang === "ko" ? "지금 코스에 넣기" : "Put in my course", fn: () => { toPlan(); edit("add", id, lang === "ko" ? `${nm} 넣어줘` : `add ${nm}`); } });
    else showToast(lang === "ko" ? `'${nm}' 담았어요 (담은 곳 ${n}곳). 코스를 만들 때 꼭 넣을게요.` : `Added '${nm}'. It will be in your course.`,
      { label: lang === "ko" ? "코스 만들러 가기" : "Plan now", fn: toPlan });
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
      say({ pose: "happy", text: t("plan.done", { n: r.course.stops.length, t: r.course.back_at }) });
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
    const before0 = baseCond();
    try {
      const r = await api.talk({ message: msg, history: log.slice(-10), conditions: baseCond(),
        state: { who_known: !!ans.who || talkState.who_known, move_known: !!ans.move || talkState.move_known },
        course_ids: before });
      setTalkState(r.state);
      const got = r.conditions ? understood(before0, r.conditions) : [];
      if (r.course) { if (course) snapshot(); applyRes(r, before); setStep(Q.length + 1); }
      else { setCond(r.conditions); if (!course) setStep((n) => Math.max(n, r.state.move_known ? 3 : r.state.who_known ? 2 : n)); }
      if (/충전|주차|charger|parking/i.test(msg) && course) setShowNear(true);
      say({ pose: r.pose, text: r.reply, cards: r.cards, via: r.via, got });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false);
  }
  // 말로 한 내용에서 AI·규칙이 알아낸 조건을 칩으로 보여 준다 (무엇을 알아들었는지 바로 확인)
  function understood(a: Conditions, b: Conditions): string[] {
    const ko = lang === "ko", o = (x: string) => t(`opt.${x}`), out: string[] = [];
    const same = (x: any, y: any) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
    if (!same(a.who, b.who)) out.push(`${ko ? "누구와" : "Who"} · ${o(b.who)}`);
    if (!same(a.move, b.move)) out.push(`${ko ? "걸음" : "Walking"} · ${(b.move || []).map(o).join(", ") || (ko ? "문제 없음" : "fine")}`);
    if (!same(a.meal, b.meal) && (b.meal || []).length) out.push(`${ko ? "식사" : "Meals"} · ${(b.meal || []).map(o).join(", ")}`);
    if (!same(a.style, b.style) && (b.style || []).length) out.push(`${ko ? "취향" : "Style"} · ${b.style.map(o).join(", ")}`);
    if (!same(a.date, b.date) && b.date) out.push(`${ko ? "날짜" : "Date"} · ${dateLabel(b.date, lang)}(${wdName(new Date(b.date + "T00:00:00").getDay(), lang)})`);
    if (!same(a.start_time, b.start_time) && b.start_time) out.push(`${ko ? "출발" : "Start"} · ${b.start_time}`);
    if (!same(a.days, b.days)) out.push(o(b.days));
    if (!same(a.start, b.start)) out.push(`${ko ? "출발지" : "From"} · ${o(b.start)}`);
    if (!same(a.weather_pref, b.weather_pref) && b.weather_pref) out.push(`${ko ? "날씨" : "Weather"} · ${b.weather_pref}`);
    if (!same(a.rain, b.rain) && b.rain) out.push(ko ? "비 오는 날" : "Rainy day");
    for (const w of (b.wish || []).filter((x) => !(a.wish || []).includes(x))) out.push(`${ko ? "꼭 갈 곳" : "Must-see"} · ${name(w)}`);
    return out.slice(0, 6);
  }
  // 사진으로 물어보기: 입구·길 사진 → AI가 이 사람 조건(휠체어·유모차 등) 기준으로 지나갈 수 있는지 카드로 답한다
  async function askPhoto(f: File) {
    const url = URL.createObjectURL(f);
    say({ me: true, text: lang === "ko" ? "이 사진 속 길, 지나갈 수 있을까요?" : "Can I get through here?", img: url });
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("photo", f); fd.append("move", (cond.move || []).join(",")); fd.append("lang", lang);
      const r = await fetch("/api/photo-check", { method: "POST", body: fd }).then((x) => x.json());
      if (r?.by === "ai") say({ pose: r.verdict === "R" ? "worry" : r.verdict === "G" ? "happy" : "neutral", text: r.title, photo: r, via: "llm" });
      else say({ pose: "worry", text: lang === "ko" ? "지금은 사진을 볼 수 없어요. AI가 연결된 서버에서만 돼요. 잠시 뒤 다시 보내 주세요." : "I can't read photos right now (needs the AI server). Please try again later." });
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
  // 날짜는 앞으로 2주를 한 줄로 보여 주고, 더 먼 날은 '달력'을 펼쳐 고른다. 한 화면에 날짜·시각·다음 버튼이 다 보이게.
  const wdOf = (d: string) => new Date(d + "T00:00:00").getDay();
  const whenPicker = (onDone: () => void, label: string) => {
    const d0 = cond.date || plusDays(0);
    const strip = Array.from({ length: 14 }, (_, i) => plusDays(i));
    return (
      <div className="when">
        <div className="dstrip" role="group" aria-label={lang === "ko" ? "날짜" : "Date"}>
          {strip.map((d, i) => { const wd = wdOf(d); return (
            <button key={d} type="button" className={`dchip${wd === 0 ? " sun" : wd === 6 ? " sat" : ""}`} aria-pressed={d0 === d}
              aria-label={`${dateLabel(d, lang)} ${wdName(wd, lang)}`} onClick={() => setCond({ ...cond, date: d })}>
              <small>{i === 0 ? (lang === "ko" ? "오늘" : "Today") : i === 1 ? (lang === "ko" ? "내일" : "Tmrw") : wdName(wd, lang)}</small>
              <b>{Number(d.slice(8))}</b>
              {wxOf(d) && <i className={`wx${wxOf(d)!.rain ? " wet" : ""}`} aria-hidden="true">{WX_ICON[wxOf(d)!.icon]}</i>}</button>); })}
          <button type="button" className="dchip more" aria-expanded={calOpen} onClick={() => setCalOpen(!calOpen)}>
            <small>{lang === "ko" ? "더 먼 날" : "Later"}</small><b>{lang === "ko" ? "달력" : "Cal"}</b></button>
        </div>
        {calOpen && <Calendar value={d0} lang={lang} onChange={(d) => { setCond({ ...cond, date: d }); setCalOpen(false); }} />}
        <div className="wrow" role="group" aria-label={lang === "ko" ? "날씨에 맞추기" : "Weather"}>
          <span className={`wline${wxOf(d0)?.rain ? " wet" : ""}`}>{wxOf(d0) ? wxText(wxOf(d0)!) : (lang === "ko" ? "예보는 16일 앞까지만 나와요" : "Forecast covers 16 days")}</span>
          {([["", lang === "ko" ? "날씨 보고 알아서" : "Auto"], ["실내", lang === "ko" ? "실내 위주" : "Indoor"], ["실외", lang === "ko" ? "실외 위주" : "Outdoor"]] as const).map(([v, l]) =>
            <button key={v} type="button" className="chip sm" aria-pressed={(cond.weather_pref || "") === v} onClick={() => setCond({ ...cond, weather_pref: v })}>{l}</button>)}
        </div>
        <div className="trow" role="group" aria-label={t("when.time")}>
          <span>{t("when.time")}</span>
          {TIMES.map((h) => <button key={h} type="button" className="chip" aria-pressed={cond.start_time === h} onClick={() => setCond({ ...cond, start_time: h })}>{h}</button>)}
          <label className="chip pick">{t("when.other")}
            <input type="time" value={cond.start_time || "10:00"} step={600} onChange={(e) => e.target.value && setCond({ ...cond, start_time: e.target.value })} /></label>
        </div>
        <button className="chip go" disabled={busy} onClick={onDone}>
          {dateLabel(d0, lang)}({wdName(wdOf(d0), lang)}) {cond.start_time} · {label}</button>
      </div>
    );
  };
  useEffect(() => {
    if (!course) { setBrief(null); return; }
    const crowd: Record<string, number | null> = {};
    for (const s of course.stops) crowd[s.id] = crowdMap[s.id]?.find((c) => c.date === course.date.replaceAll("-", ""))?.rate ?? null;
    const ev = { course, cond, extras, wx: wxOf(course.date), crowd, name, lang };
    setBrief(ruleBrief(ev));
    const key = course.stops.map((x) => x.id).join(",") + course.date + lang + (cond.weather_pref || "");
    setBriefBusy(true);
    let live = true;
    const tm = window.setTimeout(() => {
      fetch("/api/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evidence(ev)) })
        .then((r) => r.json()).then((b) => { if (live && b?.by === "ai") setBrief({ ...b, by: "ai" }); })
        .catch(() => {}).finally(() => { if (live) setBriefBusy(false); });
    }, 300);
    return () => { live = false; window.clearTimeout(tm); void key; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, wx, crowdMap, lang, cond.weather_pref]);

  // 코스를 만들기 전 오른쪽: 지금까지 고른 조건이 한눈에 채워지는 카드 (예약 사이트의 '선택 요약'처럼)
  const tripCard = () => {
    const o = (x: string) => t(`opt.${x}`);
    const wd = wdOf(cond.date || plusDays(0));
    const rows: [string, string | null][] = [
      [STEPS[lang][0], step > 0 ? `${dateLabel(cond.date || "", lang)}(${wdName(wd, lang)}) ${cond.start_time}` : null],
      [lang === "ko" ? "날씨" : "Weather", (() => { const w = wxOf(cond.date || plusDays(0)); const pref = cond.weather_pref || "";
        const plan = pref === "실내" ? (lang === "ko" ? "실내 위주로 짤게요" : "indoor first") : pref === "실외" ? (lang === "ko" ? "바깥 위주로 짤게요" : "outdoor first")
          : w?.rain ? (lang === "ko" ? "비 예보라 실내를 먼저 넣을게요" : "rain expected, indoor first") : (lang === "ko" ? "날씨 보고 알아서 짤게요" : "planned by forecast");
        return w ? `${wxText(w)} → ${plan}` : pref ? plan : null; })()],
      [STEPS[lang][1], ans.who ? ans.who.map(o).join(", ") : talkState.who_known ? o(cond.who) : null],
      [STEPS[lang][2], ans.move ? ans.move.map(o).join(", ") : talkState.move_known ? (cond.move.join(", ") || o("일반")) : null],
      [STEPS[lang][3], ans.meal ? ans.meal.map(o).join(", ") : null],
      [STEPS[lang][4], ans.style ? ans.style.map(o).join(", ") : (cond.style || []).length ? cond.style.map(o).join(", ") : null],
      [STEPS[lang][5], step >= Q.length ? `${o(cond.days)} · ${o(cond.start)}` : null],
    ];
    const wish = cond.wish || [];
    return (
      <div className="trip">
        <h3>{lang === "ko" ? "내 여행 조건" : "My trip so far"}</h3>
        <dl>
          {rows.map(([k, v]) => <div key={k} className={v ? "" : "todo"}><dt>{k}</dt><dd>{v || (lang === "ko" ? "아직 안 골랐어요" : "Not yet")}</dd></div>)}
          <div className={wish.length ? "" : "todo"}><dt>{lang === "ko" ? "꼭 갈 곳" : "Must-see"}</dt>
            <dd>{wish.length ? <span className="chips">{wish.map((id) => <button key={id} className="chip sm" onClick={() => removeWish(id)} aria-label={lang === "ko" ? `${name(id)} 빼기` : `Remove ${name(id)}`}>{name(id)} ×</button>)}</span>
              : <>{lang === "ko" ? "관광지에서 " : "Add from "}<a href="#/places">{lang === "ko" ? "코스에 담기" : "Places"}</a>{lang === "ko" ? "를 누르면 여기 모여요" : ""}</>}</dd></div>
        </dl>
        <p className="muted small">{lang === "ko" ? "다 고르면 이 자리에 시간표와 지도가 나와요. 버튼 대신 아래 칸에 \"엄마랑 가는데 무릎이 안 좋아요\"처럼 말해도 조건이 채워져요."
          : "Your timetable and map appear here when you're done. You can also just type, e.g. \"going with my mom, her knees are bad\"."}</p>
      </div>
    );
  };
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
      {route[0] === "place" && route[1] && <PlacePage id={route[1]} lang={lang} onAdd={addWish} wished={(cond.wish || []).includes(route[1])} />}
      {route[0] === "places" && <Places lang={lang} zone0={route[1]} wish={cond.wish || []} onAdd={addWish} gradeLabel={(g) => t(`grade.${g}`)} />}
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
      <HomeFacts lang={lang} />
      <HowTo lang={lang} />
      <NowDonghae lang={lang} />
      <section id="plan" className="sec wrap" aria-labelledby="plan-h">
      <div className="sec-head">
        <h2 id="plan-h">{t("plan.h")}</h2>
        <p>{t("plan.sub")}{(cond.wish || []).length > 0 && !course ? " " + t("plan.wished", { n: (cond.wish || []).length }) : ""}</p>
      </div>
      <div className="grid">
        <section className="panel chat" aria-label={t("nav.plan")}>
          <ol className="steps" aria-label={lang === "ko" ? "진행 단계" : "Progress"}>
            {STEPS[lang].map((x, i) => <li key={x} className={i < step ? "done" : i === step ? "cur" : ""} aria-current={i === step ? "step" : undefined}>{x}</li>)}
          </ol>
          <div className="chat-log" ref={logRef}>
            {log.map((m, i) => m.me
              ? <div key={i} className="me"><span>{m.img && <img className="me-img" src={m.img} alt={lang === "ko" ? "보낸 사진" : "Sent photo"} />}{m.text}</span></div>
              : <div key={i}><Dongi pose={m.pose} name={t("dongi")}>{m.text}
                  {m.got && m.got.length > 0 && <span className="got"><small>{lang === "ko" ? "이렇게 이해했어요" : "I understood"}</small>{m.got.map((g) => <span key={g} className="chip sm">{g}</span>)}</span>}
                  {m.photo && <PhotoCard p={m.photo} t={t} lang={lang} />}</Dongi>
                {m.cards?.map((c, k) => <HelpCard key={k} c={c} t={t} onSafety={openSafety} />)}</div>)}
            {busy && <p className="typing" aria-live="polite">{lang === "ko" ? "동이가 생각하는 중…" : "Dongi is thinking…"}</p>}
          </div>
          <div className="chat-dock">
            <div className="dock-opts">
            {step === 0 && whenPicker(finishWhen, t("plan.next"))}
            {step > 0 && step < Q.length && (
              <div className="chips big-chips">
                {q.o.map((o) => <button key={o} className="chip" aria-pressed={q.multi ? (ans[q.k] || []).includes(o) : undefined} onClick={() => pick(o)}>{t(`opt.${o}`)}</button>)}
                {q.multi && <button className="chip go" disabled={!(ans[q.k] || []).length} onClick={() => (ans[q.k] || []).length && finishQ(ans, ans[q.k])}>{t("plan.next")}</button>}
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
            {step > Q.length && course && !whenOpen && (
              <div className="qc" role="group" aria-label={lang === "ko" ? "빠른 수정" : "Quick edits"}>
                <button className="chip go see" onClick={() => document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{lang === "ko" ? "만든 코스 보기" : "See course"}</button>
                <button className="chip" disabled={busy} onClick={() => edit("remove_uphill", null, t("qc.uphill"))}>{t("qc.uphill")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("indoor", null, t("qc.indoor"))}>{t("qc.indoor")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("replace_lunch", null, t("qc.lunch"))}>{t("qc.lunch")}</button>
                <button className="chip" aria-pressed={showNear} onClick={() => { setShowNear(!showNear); if (!showNear) document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth" }); }}>{showNear ? t("qc.nearOff") : t("qc.near")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("relax", null, t("qc.relax"))}>{t("qc.relax")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("add_cafe", null, t("qc.cafe"))}>{t("qc.cafe")}</button>
                <button className="chip" aria-expanded={whenOpen} onClick={() => setWhenOpen(true)}>{t("qc.when")}</button>
                {hist.length > 0 && <button className="chip undo" disabled={busy} onClick={undo}>↶ {t("chat.undo")}</button>}
              </div>
            )}
            {whenOpen && course && <>
              {whenPicker(() => { setWhenOpen(false);
                const wd = new Date((cond.date || "") + "T00:00:00").getDay();
                edit("set_when", `${cond.date} ${cond.start_time}`, t("edit.whenSay", { d: `${dateLabel(cond.date || "", lang)}(${wdName(wd, lang)})`, t: cond.start_time || "" })); }, t("qc.when"))}
              <button className="chip plain" onClick={() => setWhenOpen(false)}>{t("common.close")}</button></>}
            </div>
            <form className="composer" onSubmit={(e) => { e.preventDefault(); if (input.trim()) { chat(input.trim()); setInput(""); } }}>
              <label className="chip cam" title={lang === "ko" ? "사진으로 물어보기: 입구·길 사진을 보내면 지나갈 수 있는지 봐 드려요" : "Ask with a photo"}>
                <span aria-hidden="true">📷</span><span className="sr-only">{lang === "ko" ? "사진으로 물어보기" : "Ask with a photo"}</span>
                <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) askPhoto(f); }} />
              </label>
              <input aria-label={t("chat.ph")} placeholder={step > Q.length ? t("chat.ph") : t("talk.ph")} value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="chip go" disabled={busy || !input.trim()}>{t("chat.send")}</button>
            </form>
          </div>
        </section>

        <section className="panel" aria-live="polite" id="timeline">
          {!course ? (<>
              {tripCard()}
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
              {brief && (
                <section className={`brief${briefBusy && brief.by === "rule" ? " pending" : ""}`} aria-label={lang === "ko" ? "동이 브리핑" : "Dongi's briefing"}>
                  <p className="brief-k"><img src="/dongi/happy.webp" alt="" />{lang === "ko" ? "동이 브리핑" : "Dongi's briefing"}
                    {brief.by === "ai" ? <span className="via via-llm">{lang === "ko" ? "AI가 정리했어요" : "Summarized by AI"}</span>
                      : briefBusy ? <span className="via via-rule">{lang === "ko" ? "AI가 정리하는 중…" : "AI is summarizing…"}</span> : null}</p>
                  <h3>{brief.headline}</h3>
                  {brief.fits.length > 0 && <ul className="fits">{brief.fits.map((f, i) => <li key={i}><span aria-hidden="true">{BRIEF_ICON[f.icon]}</span>{f.text}</li>)}</ul>}
                  {brief.bring.length > 0 && <p className="bring"><b>{lang === "ko" ? "챙기세요" : "Bring"}</b>{brief.bring.map((b) => <span key={b} className="chip sm">{b}</span>)}</p>}
                  {wxOf(course.date) && <p className="brief-act">
                    {!wxOf(course.date)!.rain && cond.weather_pref !== "실외" && cond.weather_pref !== "실내" && <button className="chip sm" onClick={() => { setCond({ ...cond, weather_pref: "실내" }); edit("indoor", null, t("qc.indoor")); }}>{lang === "ko" ? "실내로 바꾸기" : "Make it indoor"}</button>}
                    {(wxOf(course.date)!.rain || cond.weather_pref === "실내") && cond.weather_pref !== "실외" && <button className="chip sm" onClick={() => { snapshot(); makeWith({ ...cond, lang, weather_pref: "실외", rain: false }, lang === "ko" ? "바깥 위주로 짜 줘" : "Outdoor please"); }}>{lang === "ko" ? "바깥 위주로 바꾸기" : "Make it outdoor"}</button>}
                  </p>}
                </section>)}
              <KakaoMap pins={pins} />
              <div className="tl">
                {course.stops.map((s, i) => (
                  <div key={s.id}>
                    <p className="muted tl-drive">{t("result.drive", { m: s.drive_min })}</p>
                    <StopCard s={brief?.why[s.id] ? { ...s, why: brief.why[s.id] } : s} i={i} x={extras[s.id]} name={name(s.id)} t={t} lang={lang} wheel={cond.move.includes("휠체어")}
                      showNear={showNear} isNew={fresh.includes(s.id)} busy={busy}
                      onRemove={() => edit("remove", s.id, t("edit.removeSay", { n: i + 1, p: name(s.id) }))}
                      onReplace={() => edit("replace", s.id, t("edit.replaceSay", { n: i + 1, p: name(s.id) }))}
                      crowd={crowdMap[s.id]?.find((c) => c.date === course.date.replaceAll("-", ""))?.rate ?? null} />
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
      <ZoneTiles lang={lang} />
      <Courses lang={lang} busy={busy} onStart={startPreset} />
      <MoreLinks lang={lang} />
      </>}
      </main>
      <nav className="tabbar" aria-label={t("nav.main")}>
        {([["#plan", "nav.plan", "", "🧭"], ["#/places", "nav.places", "places", "📍"], ["#/transport", "nav.transport", "transport", "🚌"], ["#/map", "nav.map", "map", "🗺"], ["#/my", "nav.my", "my", "📅"]] as const).map(([h, k, r, ic]) =>
          <a key={h} href={h} aria-current={route[0] === r || (r === "places" && route[0] === "place") ? "page" : undefined}><span aria-hidden="true">{ic}</span>{t(k)}</a>)}
      </nav>
      <nav className="quick" aria-label={lang === "ko" ? "빠른 메뉴" : "Quick menu"}>
        <a href="#plan"><img src="/photos/q-plan.webp" alt="" aria-hidden="true" />{lang === "ko" ? "코스 만들기" : "Plan"}</a>
        <a href="#/map"><img src="/photos/q-toilet.webp" alt="" aria-hidden="true" />{lang === "ko" ? "화장실·편의" : "Toilets"}</a>
        <a href="#/events"><img src="/photos/q-event.webp" alt="" aria-hidden="true" />{lang === "ko" ? "행사" : "Events"}</a>
        <button onClick={openSafety}><img src="/photos/q-safety.webp" alt="" aria-hidden="true" />{lang === "ko" ? "안심" : "Help"}</button>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><img src="/photos/q-top.webp" alt="" aria-hidden="true" />{lang === "ko" ? "맨 위로" : "Top"}</button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.act && <button className="chip go" onClick={() => { toast.act!.fn(); setToast(null); }}>{toast.act.label}</button>}
          <button className="x" aria-label={t("common.close")} onClick={() => setToast(null)}>×</button>
        </div>)}
      {(cond.wish || []).length > 0 && route[0] !== "" && !toast && (
        <a className="cart" href="#plan">{lang === "ko" ? `담은 곳 ${(cond.wish || []).length}곳 · 코스 만들기` : `${(cond.wish || []).length} saved · Plan`}</a>)}
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

// 사진으로 물어보기 결과 카드: 결론(판정) · 보이는 것 · 이렇게 해 보세요
function PhotoCard({ p, t, lang }: { p: any; t: (k: string, v?: Record<string, string | number>) => string; lang: string }) {
  const ko = lang === "ko";
  return (
    <span className="pcheck">
      {p.verdict && <span className={`badge g-${p.verdict}`}>{t(`grade.${p.verdict}`)}</span>}
      {p.seen?.length > 0 && <span className="pc-row"><small>{ko ? "보이는 것" : "I see"}</small>{p.seen.map((x: any, i: number) => <span key={i} className="chip sm"><b>{x.type}</b>{x.detail ? ` ${x.detail}` : ""}</span>)}</span>}
      {p.tips?.length > 0 && <span className="pc-tips">{p.tips.map((x: string, i: number) => <span key={i}>✓ {x}</span>)}</span>}
      <small className="muted">{ko ? "사진으로 본 짐작이에요. 현장에서 한 번 더 확인해 주세요." : "A guess from the photo. Please double-check on site."}</small>
    </span>
  );
}
