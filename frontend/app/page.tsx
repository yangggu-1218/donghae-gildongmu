"use client";
// 코스 만들기 화면의 최소 구현(동이와 대화 → 코스 → 말로 수정 → 안심).
// 관광지·추천 코스·후기 섹션은 프로토타입 v2의 구조를 그대로 옮겨 붙이면 된다 (README의 '화면 옮기기' 참고).
import { useEffect, useMemo, useRef, useState } from "react";
import ko from "@/i18n/ko.json";
import en from "@/i18n/en.json";
import Dongi from "@/components/Dongi";
import KakaoMap from "@/components/KakaoMap";
import { Hero, HomeFacts, HowToStrip, NowDonghae, ZoneTiles, MoreLinks, Places, Courses, PRESETS, isGradedSight } from "@/components/Sections";
import { PlacePage, TransportPage, MapPage, EventsPage, StayPage, GuidePage, SourcesPage, AdminPage, BookLinks } from "@/components/Pages";
import Calendar from "@/components/Calendar";
import { MicButton } from "@/components/Voice";
import { buildQuestions, applyExtra, summarize, ExtraQ, ExtraAns } from "@/lib/followup";
import { MyPage, loadPlans, savePlans } from "@/components/MyTrips";
import { Icon } from "@/components/Icon";
import { StopCard, Summary, encodePlan, decodePlan, dateLabel, wdName } from "@/components/Timeline";
import { api, getJSON, Conditions, Course, CourseRes, Extra, WxDay, WX_ICON, DAY_GROUPS, tripDays } from "@/lib/api";
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
  // 여러 날 여행: 날마다 코스를 따로 짜서 모아 둔다 (n일차 → 그날 결과와 조건)
  const [dayNo, setDayNo] = useState(1);
  const dayRef = useRef(1);
  const [trip, setTrip] = useState<Record<number, { res: any; cond: Conditions }>>({});
  const [places, setPlaces] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [safety, setSafety] = useState<any>(null);
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  // 한국관광공사 관광지 집중률 예측(앞으로 30일). 못 불러오면 배지를 숨긴다.
  const [crowdMap, setCrowdMap] = useState<Record<string, { date: string; rate: number }[]>>({});
  useEffect(() => { getJSON("/api/crowd").then((j) => setCrowdMap(j.places || {})).catch(() => {}); }, []);
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
  // 더 자세히 묻기: offer = "조금만 더 여쭤봐도 될까요?" 대기, xq = 이번 사람에게 고른 추가 질문, xi = 지금 몇 번째
  const [offer, setOffer] = useState(false);
  const [xq, setXq] = useState<ExtraQ[] | null>(null);
  const [xi, setXi] = useState(0);
  const [xa, setXa] = useState<ExtraAns>({});
  // 코스가 나오면 대화 칸은 오른쪽 아래 작은 버튼으로 접히고, 코스(왼쪽)와 지도(오른쪽)가 넓게 보인다
  const [chatOpen, setChatOpen] = useState(true);
  const hadCourse = useRef(false);
  // 사용법 안내: ×로 닫으면 이 기기에서는 다시 안 띄운다 (코스를 만든 뒤에도 숨김)
  const [howto, setHowto] = useState(false);
  useEffect(() => { try { setHowto(localStorage.getItem("gd-howto") !== "hide"); } catch { setHowto(true); } }, []);
  const closeHowto = () => { setHowto(false); try { localStorage.setItem("gd-howto", "hide"); } catch { /* 무시 */ } };
  // 일별 예보 (16일 앞까지). 날짜 고르기·조건 카드·시간표에 함께 쓴다
  const [wx, setWx] = useState<WxDay[]>([]);
  useEffect(() => { getJSON("/api/weather").then((j) => setWx(j.days || [])).catch(() => {}); }, []);
  const wxOf = (d?: string | null) => wx.find((x) => x.date === d) || null;
  // 동이 브리핑: 코스가 바뀌면 규칙 카드를 바로 보여 주고, AI가 같은 근거로 정리한 카드가 오면 바꿔 끼운다
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const wxText = (w: WxDay) => `${lang === "ko" ? w.ko : w.en} · ${w.pop != null ? `${lang === "ko" ? "비" : "rain"} ${w.pop}%` : `${lang === "ko" ? "강수" : "rain"} ${w.mm}mm`} · ${w.tmin}~${w.tmax}°C`;
  const [toast, setToast] = useState<{ text: string; act?: { label: string; fn: () => void } } | null>(null);
  const toastT = useRef<number>(0);
  const showToast = (text: string, act?: { label: string; fn: () => void }) => {
    setToast({ text, act }); window.clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(null), 6000);
  };
  // 대화가 늘어나면 대화 칸 안에서만 맨 아래로 내린다 (페이지 전체는 움직이지 않는다)
  const logRef = useRef<HTMLDivElement>(null);
  const [site, setSite] = useState<{ banner: any; notices: any[] } | null>(null);   // 관리자 공지 (바로 반영)
  useEffect(() => { api.get("/api/site").then(setSite).catch(() => {}); }, [route]);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    if (course && !hadCourse.current) { setChatOpen(false); document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    hadCourse.current = !!course;
  }, [course]);   // 스크린리더가 영어 화면을 영어로 읽게
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
    if (n === Q.length && !xq) {
      setOffer(true);
      say({ pose: "ask", text: lang === "ko" ? "조금만 더 여쭤봐도 될까요? 속도·쉬는 곳·하고 싶은 것까지 알면 더 딱 맞는 코스를 짜 드릴게요." : "Can I ask a few more questions? With your pace and interests I can make a better-fitting route." });
      return;
    }
    say({ pose: "ask", text: n < Q.length ? t(Q[n].q) : t("q.last") });
  }
  function finishWhen() {
    const d = cond.date || iso(new Date());
    const wd = new Date(d + "T00:00:00").getDay();
    finishQ({ ...ans, when: [d, cond.start_time || "10:00"] }, []);
    setLog((l) => { const c = [...l]; c[c.length - 2] = { me: true, text: `${dateLabel(d, lang)}(${wdName(wd, lang)}) ${cond.start_time}` }; return c; });
  }
  const busyOn = (d?: string | null) => Object.entries(crowdMap).filter(([, rows]) => (rows.find((r) => r.date === (d || "").replaceAll("-", ""))?.rate ?? 0) >= 70).map(([id]) => id);
  const baseCond = (): Conditions => applyExtra({ ...cond, lang, who: ans.who?.[0] || cond.who,
    move: ans.move ? toMove(ans.move) : cond.move, meal: ans.meal ? ans.meal.filter((x) => x !== "상관없어요") : cond.meal || [],
    style: ans.style || cond.style }, xa, busyOn(cond.date));
  function startExtra(yes: boolean) {
    setOffer(false);
    say({ me: true, text: yes ? (lang === "ko" ? "네, 더 물어봐 주세요" : "Yes, ask me more") : (lang === "ko" ? "아니요, 바로 짜 주세요" : "No, plan now") });
    if (!yes) { setXq([]); say({ pose: "ask", text: t("q.last") }); return; }
    const qs = buildQuestions(ans, Object.keys(crowdMap).length > 0);
    setXq(qs); setXi(0); setXa({});
    say({ pose: "ask", text: lang === "ko" ? qs[0].q[0] : qs[0].q[1] });
  }
  function pickExtra(v: string) {
    if (!xq) return;
    const q = xq[xi];
    if (q.multi) {
      const cur = xa[q.k] || [];
      const next = v === "none" ? (cur.includes("none") ? [] : ["none"]) : cur.filter((x) => x !== "none").includes(v) ? cur.filter((x) => x !== v) : [...cur.filter((x) => x !== "none"), v];
      setXa({ ...xa, [q.k]: next }); return;
    }
    nextExtra({ ...xa, [q.k]: [v] }, [v]);
  }
  function nextExtra(a: ExtraAns, chosen: string[]) {
    if (!xq) return;
    const q = xq[xi];
    setXa(a);
    say({ me: true, text: chosen.map((v) => { const o = q.o.find((x) => x[0] === v); return o ? (lang === "ko" ? o[1] : o[2]) : v; }).join(", ") });
    const n = xi + 1; setXi(n);
    if (n < xq.length) { say({ pose: "ask", text: lang === "ko" ? xq[n].q[0] : xq[n].q[1] }); return; }
    const sum = summarize(a, xq, lang === "ko");
    say({ pose: "happy", text: (lang === "ko" ? `좋아요! ${sum ? `'${sum}'에 맞춰 짤게요. ` : ""}` : `Great! ${sum ? `I'll plan for: ${sum}. ` : ""}`) + t("q.last") });
  }
  const asking = !!xq && xi < xq.length;
  // 코스가 나온 뒤 "다르게 짜 보기": 다른 장소로 · 더 느긋하게 · 더 알차게 · 사람 적은 곳으로 (되돌리기 가능)
  async function remake(kind: "other" | "slow" | "full" | "quiet") {
    if (!course) return;
    const sights = course.stops.filter((s) => s.kind === "sight").map((s) => s.id).filter((id) => !(cond.must || []).includes(id) && !(cond.wish || []).includes(id));
    const c: Conditions = { ...cond, lang, lunch: null };
    if (kind === "other") c.exclude = Array.from(new Set([...(cond.exclude || []), ...sights]));
    if (kind === "slow") { c.cap = Math.max(2, course.stops.length - 1); c.rest = true; }
    if (kind === "full") c.cap = Math.min(6, course.stops.length + 1);
    if (kind === "quiet") c.exclude = Array.from(new Set([...(cond.exclude || []), ...busyOn(course.date)]));
    const ko = lang === "ko";
    const label = { other: ko ? "다른 곳으로 새로 짜 줘" : "Try different places", slow: ko ? "더 느긋하게 짜 줘" : "More relaxed", full: ko ? "더 알차게 짜 줘" : "Fit in more", quiet: ko ? "사람 적은 곳으로 짜 줘" : "Quieter places" }[kind];
    snapshot(); say({ me: true, text: label }); setBusy(true);
    try {
      const before = course.stops.map((s) => s.id);
      const r = await api.course({ ...c, day_no: dayRef.current });
      const fresh2 = r.course.stops.filter((s: any) => !before.includes(s.id)).length;
      if (kind === "other" && r.course.stops.filter((s: any) => s.kind === "sight").length < 2) {
        setHist((h) => h.slice(0, -1));   // 바뀐 게 없으니 되돌리기 기록도 빼기
        say({ pose: "worry", text: ko ? "이 조건으로 갈 수 있는 다른 곳이 거의 없어요. 지금 코스를 그대로 둘게요. 조건(걸음·취향)을 바꾸면 더 찾아볼 수 있어요." : "There aren't enough other places for these needs, so I kept your route." });
      } else {
        applyRes(r, before);
        say({ pose: "happy", text: ko ? `새로 짰어요. ${fresh2 ? `새로 들어간 곳 ${fresh2}곳, ` : ""}${r.course.stops.length}곳 · ${r.course.back_at} 도착이에요. 마음에 안 들면 [되돌리기]를 눌러 주세요.` : `Done: ${r.course.stops.length} stops, back ${r.course.back_at}. Tap Undo if you prefer the old one.`, via: "rule" });
        if (!chatOpen) showToast(ko ? "코스를 새로 짰어요." : "Route updated.");
      }
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false);
  }
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
    if (r.conditions && trip[1] && r.conditions.days !== trip[1].cond.days) { dayRef.current = 1; setDayNo(1); setTrip({}); }   // 여행 기간이 바뀌면 새 여행
    const dn = dayRef.current;   // 고친 결과를 그날 코스로 다시 담아 둔다
    setTrip((tr) => (tr[dn] ? { ...tr, [dn]: { res: { ...tr[dn].res, ...r }, cond: r.conditions || tr[dn].cond } }
      : { 1: { res: r, cond: { ...(r.conditions || cond), day_no: 1 } } }));   // 대화로 처음 만든 코스도 1일차로
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
      const r = await api.course({ ...c, day_no: 1 });
      dayRef.current = 1; setDayNo(1); setTrip({ 1: { res: r, cond: { ...c, day_no: 1 } } });
      setHist([]); applyRes(r);
      say({ pose: "happy", text: t("plan.done", { n: r.course.stops.length, t: r.course.back_at }) });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false); setStep(Q.length + 1);
  }
  // 여러 날 여행: k일차로 넘어가기. 아직 안 짠 날은 1일차부터 차례로, 앞선 날에 간 곳을 빼고 짠다.
  async function goDay(k: number) {
    if (k === dayNo || busy || !trip[1]) return;
    const cache = { ...trip };
    if (course) cache[dayNo] = { res: { ...cache[dayNo]?.res, course, extras }, cond };
    setBusy(true);
    try {
      const base = cache[1].cond, d0 = cache[1].res.course.date;
      for (let j = 2; j <= k; j++) {
        if (cache[j]) continue;
        const used = Object.keys(cache).map(Number).filter((x) => x < j).flatMap((x) => cache[x].res.course.stops.map((s: any) => s.id));
        const dt = new Date(d0 + "T00:00:00"); dt.setDate(dt.getDate() + j - 1);
        const c: Conditions = { ...base, day_no: j, date: iso(dt), exclude: Array.from(new Set([...(base.exclude || []), ...used])), wish: [], must: [], lunch: null };
        say({ pose: "think", text: t("day.making", { n: j }) });
        cache[j] = { res: await api.course(c), cond: c };
        if (j === k) say({ pose: "happy", text: t("plan.done", { n: cache[j].res.course.stops.length, t: cache[j].res.course.back_at }) });
      }
      const e = cache[k];
      dayRef.current = k; setTrip(cache); setDayNo(k); setHist([]); setFresh([]);
      setCourse(e.res.course); setExtras((x) => ({ ...x, ...(e.res.extras || {}) })); setCond(e.cond);
      if (e.res.stay !== undefined) setHint({ stay: e.res.stay, move: e.res.move, events: e.res.events || [], onDay: !!e.res.events_on_day });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false);
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
      if (!chatOpen && r.reply) showToast(r.reply, { label: lang === "ko" ? "대화 열기" : "Open chat", fn: () => setChatOpen(true) });
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

  // 카카오맵 길찾기 링크: 출발역 → 코스 순서대로 경유(최대 5곳) → 출발역으로 복귀. 자가용은 첫 장소에서 출발
  // 형식: https://map.kakao.com/link/by/car/이름,위도,경도/... (카카오맵 웹 가이드 'URL로 길찾기')
  const KAKAO_START: Record<string, [number, number]> = { "동해역": [37.4995, 129.124], "묵호역": [37.548, 129.116] };
  const kakaoRoute = useMemo(() => {
    const pts: [string, number, number][] = (course?.stops || []).filter((s) => places[s.id]?.lat).map((s) => [name(s.id), places[s.id].lat, places[s.id].lon]);
    if (!pts.length) return "";
    const st = KAKAO_START[cond.start];
    if (st) { const nm = lang === "ko" ? cond.start : cond.start === "동해역" ? "Donghae Station" : "Mukho Station"; pts.unshift([nm, st[0], st[1]]); if (pts.length < 7) pts.push([nm, st[0], st[1]]); }
    if (pts.length < 2) return "";
    const seg = pts.slice(0, 7).map(([n, la, lo]) => `${encodeURIComponent(n.replace(/[,/]/g, " "))},${la},${lo}`).join("/");
    return `https://map.kakao.com/link/by/car/${seg}`;
  }, [course, places, cond.start, lang]);
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
    const strip = Array.from({ length: 7 }, (_, i) => plusDays(i));   // 일주일만 보이고, 그 뒤는 달력에서
    const far = !strip.includes(d0);
    return (
      <div className="when">
        <div className="dstrip" role="group" aria-label={lang === "ko" ? "날짜" : "Date"}>
          {strip.map((d, i) => { const wd = wdOf(d); return (
            <button key={d} type="button" className={`dchip${wd === 0 ? " sun" : wd === 6 ? " sat" : ""}`} aria-pressed={d0 === d}
              aria-label={`${dateLabel(d, lang)} ${wdName(wd, lang)}`} onClick={() => setCond({ ...cond, date: d })}>
              <small>{i === 0 ? (lang === "ko" ? "오늘" : "Today") : i === 1 ? (lang === "ko" ? "내일" : "Tmrw") : wdName(wd, lang)}</small>
              <b>{Number(d.slice(8))}</b>
              {wxOf(d) && <i className={`wx${wxOf(d)!.rain ? " wet" : ""}`} aria-hidden="true"><Icon name={wxOf(d)!.icon} /></i>}</button>); })}
          <button type="button" className={`dchip more${far ? " picked" : ""}`} aria-expanded={calOpen} aria-pressed={far} onClick={() => setCalOpen(!calOpen)}
            aria-label={far ? (lang === "ko" ? `달력에서 고른 날 ${dateLabel(d0, lang)}. 다른 날 고르기` : `Picked ${dateLabel(d0, lang)}. Pick another day`) : (lang === "ko" ? "다음 주 이후 날짜는 달력에서 고르기" : "Pick a later date from the calendar")}>
            <Icon name="cal" /><small>{far ? `${+d0.slice(5, 7)}/${+d0.slice(8)}` : (lang === "ko" ? "달력" : "Later")}</small></button>
        </div>
        {calOpen && <Calendar value={d0} lang={lang} onChange={(d) => { setCond({ ...cond, date: d }); setCalOpen(false); }} />}
        <div className="wrow" role="group" aria-label={lang === "ko" ? "날씨에 맞추기" : "Weather"}>
          <span className={`wline${wxOf(d0)?.rain ? " wet" : ""}`}>{wxOf(d0) && <Icon name={wxOf(d0)!.icon} />}{wxOf(d0) ? " " + wxText(wxOf(d0)!) : (lang === "ko" ? "예보는 16일 앞까지만 나와요" : "Forecast covers 16 days")}</span>
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
  const overview = useMemo(() => Object.values(places).filter((p: any) => p.lat && isGradedSight(p))
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
            <button className="box bigt" aria-pressed={big} onClick={toggleBig}><span className="long">{big ? t("tool.bigOn") : t("tool.big")}</span><span className="short" aria-hidden="true">{big ? t("tool.bigOnShort") : t("tool.bigShort")}</span></button>
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
      {/* 선택과 집중: 첫 화면은 '코스 짜기'가 바로 이어지고, 예시 코스 다음에 나머지 정보가 온다 (기능은 그대로) */}
      <section id="plan" className="sec wrap" aria-labelledby="plan-h">
      <div className="sec-head">
        <h2 id="plan-h">{t("plan.h")}</h2>
        <p>{t("plan.sub")}{(cond.wish || []).length > 0 && !course ? " " + t("plan.wished", { n: (cond.wish || []).length }) : ""}
          {!howto && !course && <button className="link-btn" onClick={() => setHowto(true)}>{lang === "ko" ? "사용법 보기" : "How it works"}</button>}</p>
      </div>
      {howto && !course && <HowToStrip lang={lang} onClose={closeHowto} />}
      <div className={`grid${course ? " has-course" : ""}`}>
        {course && !chatOpen && (
          <button className="chat-fab" onClick={() => setChatOpen(true)} aria-expanded={false} aria-controls="chat-panel">
            <img src="/dongi/wave.webp" alt="" /><span><b>{lang === "ko" ? "동이에게 고쳐 달라고 하기" : "Ask Dongi to change it"}</b><small>{lang === "ko" ? "대화·빠른 수정 열기" : "Open chat & quick edits"}</small></span></button>)}
        <section id="chat-panel" className={`panel chat${course ? (chatOpen ? " widget open" : " widget") : ""}`} aria-label={t("nav.plan")}
          onKeyDown={(e) => { if (e.key === "Escape" && course) setChatOpen(false); }}>
          {course && <div className="widget-bar"><b>{lang === "ko" ? "동이와 대화" : "Chat with Dongi"}</b>
            <button className="chip sm" onClick={() => setChatOpen(false)} aria-controls="chat-panel" aria-expanded={true}>{lang === "ko" ? "접기" : "Hide"}</button></div>}
          <ol className="steps" aria-label={lang === "ko" ? "진행 단계" : "Progress"}>
            {STEPS[lang].map((x, i) => <li key={x} className={i < step ? "done" : i === step ? "cur" : ""} aria-current={i === step ? "step" : undefined}>{x}</li>)}
          </ol>
          <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label={lang === "ko" ? "동이와 나눈 대화" : "Chat with Dongi"}>
            {log.map((m, i) => m.me
              ? <div key={i} className="me"><span>{m.img && <img className="me-img" src={m.img} alt={lang === "ko" ? "보낸 사진" : "Sent photo"} />}{m.text}</span></div>
              : <div key={i}><Dongi pose={m.pose} name={t("dongi")}>{m.text}
                  {m.got && m.got.length > 0 && <span className="got"><small>{lang === "ko" ? "이렇게 이해했어요" : "I understood"}</small>{m.got.map((g) => <span key={g} className="chip sm">{g}</span>)}</span>}
                  {m.photo && <PhotoCard p={m.photo} t={t} lang={lang} />}
                  {m.via === "llm" && <span className="via via-llm via-msg">{m.photo ? (lang === "ko" ? "AI가 사진을 봤어요" : "AI read the photo") : (lang === "ko" ? "AI 답변" : "AI reply")}</span>}</Dongi>
                {m.cards?.map((c, k) => <HelpCard key={k} c={c} t={t} onSafety={openSafety} lang={lang} />)}</div>)}
            {busy && <p className="typing" aria-live="polite"><img src="/dongi/think.webp" alt="" />{lang === "ko" ? "동이가 생각하는 중…" : "Dongi is thinking…"}</p>}
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
            {step === Q.length && offer && (
              <div className="chips big-chips">
                <button className="chip go" onClick={() => startExtra(true)}>{lang === "ko" ? "네, 더 물어봐 주세요" : "Yes, ask me more"}</button>
                <button className="chip" onClick={() => startExtra(false)}>{lang === "ko" ? "아니요, 바로 짜 주세요" : "No, plan now"}</button>
              </div>
            )}
            {step === Q.length && !offer && asking && xq && (
              <div className="chips big-chips" role="group" aria-label={lang === "ko" ? xq[xi].q[0] : xq[xi].q[1]}>
                <small className="xq-step">{lang === "ko" ? `더 묻기 ${xi + 1}/${xq.length}` : `${xi + 1} of ${xq.length}`}</small>
                {xq[xi].o.map(([v, ko, en]) => <button key={v} className="chip" aria-pressed={xq[xi].multi ? (xa[xq[xi].k] || []).includes(v) : undefined} onClick={() => pickExtra(v)}>{lang === "ko" ? ko : en}</button>)}
                {xq[xi].multi && <button className="chip go" disabled={!(xa[xq[xi].k] || []).length} onClick={() => nextExtra(xa, xa[xq[xi].k] || [])}>{t("plan.next")}</button>}
                <button className="chip plain" onClick={() => { setXi(xq.length); say({ pose: "ask", text: t("q.last") }); }}>{lang === "ko" ? "그만 묻고 짜기" : "Skip the rest"}</button>
              </div>
            )}
            {step === Q.length && !offer && !asking && (
              <div className="chips big-chips">
                <label className="sel-days"><span>{t("plan.days")}</span>
                  <select value={cond.days} onChange={(e) => setCond({ ...cond, days: e.target.value })}>
                    {DAY_GROUPS.map((g) => <optgroup key={g.ko} label={lang === "ko" ? g.ko : g.en}>
                      {g.opts.map(([v]) => <option key={v} value={v}>{t(`opt.${v}`)}</option>)}</optgroup>)}
                  </select></label>
                {(["동해역", "묵호역", "자가용"] as const).map((s) => <button key={s} className="chip" aria-pressed={cond.start === s} onClick={() => setCond({ ...cond, start: s })}>{t(`opt.${s}`)}</button>)}
                <input aria-label={t("plan.memo")} placeholder={t("plan.memoPh")} value={cond.memo} onChange={(e) => setCond({ ...cond, memo: e.target.value })} />
                <button className="chip go" disabled={busy} onClick={make}>{t("plan.make")}</button>
              </div>
            )}
            {step > Q.length && course && !whenOpen && (
              <div className="qc" role="group" aria-label={lang === "ko" ? "빠른 수정" : "Quick edits"}>
                <button className="chip go see" onClick={() => { setChatOpen(false); document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{lang === "ko" ? "만든 코스 보기" : "See course"}</button>
                <button className="chip alt" disabled={busy} onClick={() => remake("other")}>{lang === "ko" ? "다른 곳으로 새로 짜기" : "Try different places"}</button>
                <button className="chip alt" disabled={busy} onClick={() => remake("slow")}>{lang === "ko" ? "더 느긋하게" : "More relaxed"}</button>
                <button className="chip alt" disabled={busy} onClick={() => remake("full")}>{lang === "ko" ? "더 알차게" : "Fit in more"}</button>
                {Object.keys(crowdMap).length > 0 && <button className="chip alt" disabled={busy} onClick={() => remake("quiet")}>{lang === "ko" ? "사람 적은 곳으로" : "Quieter places"}</button>}
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
                <Icon name="camera" /><span className="sr-only">{lang === "ko" ? "사진으로 물어보기" : "Ask with a photo"}</span>
                <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) askPhoto(f); }} />
              </label>
              <MicButton lang={lang} disabled={busy} onText={(x) => setInput(x)} onError={(m) => showToast(m)} />
              <input aria-label={t("chat.ph")} placeholder={step > Q.length ? t("chat.ph") : t("talk.ph")} value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="chip go" disabled={busy || !input.trim()}>{t("chat.send")}</button>
            </form>
          </div>
        </section>

        <section className={`panel${course ? " res" : ""}`} aria-live="polite" id="timeline">
          {!course ? (<>
              {tripCard()}
              <KakaoMap pins={overview} overview />
              <p className="muted map-note">{t("map.overview", { n: overview.length })}</p>
            </>) : (
            <>
              {tripDays(cond.days) > 1 && trip[1] && (
                <div className="day-tabs" role="group" aria-label={t("plan.days")}>
                  {Array.from({ length: tripDays(cond.days) }, (_, i) => i + 1).map((k) => {
                    const dt = new Date(trip[1].res.course.date + "T00:00:00"); dt.setDate(dt.getDate() + k - 1);
                    const w = wxOf(iso(dt));
                    return <button key={k} aria-pressed={k === dayNo} className={k === dayNo ? "on" : ""} disabled={busy} onClick={() => goDay(k)}>
                      <b>{t("day.tab", { n: k })}</b><small>{dt.getMonth() + 1}/{dt.getDate()}({wdName(dt.getDay(), lang)}){w ? <> <Icon name={w.icon} /></> : null}</small></button>;
                  })}
                </div>)}
              {tripDays(cond.days) > 1 && <p className="muted small">{t("day.note")}</p>}
              {dayNo > 1 && !course.stops.some((s) => s.kind === "sight") && <p className="day-free"><Icon name="sea" /> {t("day.free")}</p>}
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
                  {brief.fits.length > 0 && <ul className="fits">{brief.fits.map((f, i) => <li key={i}><span className="fit-ic"><Icon name={f.icon} /></span>{f.text}</li>)}</ul>}
                  {brief.bring.length > 0 && <p className="bring"><b>{lang === "ko" ? "챙기세요" : "Bring"}</b>{brief.bring.map((b) => <span key={b} className="chip sm">{b}</span>)}</p>}
                  {wxOf(course.date) && <p className="brief-act">
                    {!wxOf(course.date)!.rain && cond.weather_pref !== "실외" && cond.weather_pref !== "실내" && <button className="chip sm" onClick={() => { setCond({ ...cond, weather_pref: "실내" }); edit("indoor", null, t("qc.indoor")); }}>{lang === "ko" ? "실내로 바꾸기" : "Make it indoor"}</button>}
                    {(wxOf(course.date)!.rain || cond.weather_pref === "실내") && cond.weather_pref !== "실외" && <button className="chip sm" onClick={() => { snapshot(); makeWith({ ...cond, lang, weather_pref: "실외", rain: false }, lang === "ko" ? "바깥 위주로 짜 줘" : "Outdoor please"); }}>{lang === "ko" ? "바깥 위주로 바꾸기" : "Make it outdoor"}</button>}
                  </p>}
                </section>)}
              <div className="res-map">
                <KakaoMap pins={pins} />
                {kakaoRoute && <a className="chip" href={kakaoRoute} target="_blank" rel="noreferrer">{t("route.kakao")}</a>}
              </div>
              <div className="tl">
                {course.stops.map((s, i) => (
                  <div key={s.id}>
                    <p className="muted tl-drive">{t("result.drive", { m: s.drive_min })}</p>
                    <StopCard s={brief?.why[s.id] ? { ...s, why: brief.why[s.id] } : s} i={i} x={extras[s.id]} at={places[s.id]?.lat ? { lat: places[s.id].lat, lon: places[s.id].lon } : undefined} name={name(s.id)} t={t} lang={lang} wheel={cond.move.includes("휠체어")}
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
                  <ul>{course.skipped.map((x) => <li key={x.id}>{lang === "ko" ? `${x.name} — ${x.reason}` : `${name(x.id)} — closed or not open at that time`}</li>)}</ul></div>)}
              {course.notes.filter((n) => !course.skipped.some((x) => n.startsWith(x.name))).map((n) => noteText(n, lang)).filter(Boolean).map((n) => <p key={n} className="muted">{n}</p>)}
              {hint?.events?.length ? (
                <div className={`tl-events${hint.onDay ? " on" : ""}`}>
                  <b><Icon name="event" /> {t(hint.onDay ? "tl.eventsDay" : "tl.eventsSoon")}</b>
                  <ul>{hint.events.map((e) => <li key={e.name}>{e.name} · {e.start}{e.end && e.end !== e.start ? `~${e.end}` : ""}{e.venue ? ` · ${e.venue}` : ""}</li>)}</ul>
                </div>) : null}
              {hint?.move && (
                <div className="stop" style={{ display: "block" }}>
                  <b>{t("x.tourTitle")}</b>
                  {hint.move.taxi && <p className="muted">{t("x.taxiStart", { s: startName, n: hint.move.taxi.spaces })}</p>}
                  {hint.move.mobility_center && (<>
                    <p className="muted"><Icon name="wheel" /> {t("x.mobility", { n: hint.move.mobility_center.wheelchair_vehicles, t: hint.move.mobility_center.tel, f: hint.move.mobility_center.fare })}</p>
                    <p className="muted">{t("x.mobilityWho")}</p>
                  </>)}
                  {hint.move.rentals?.[0] && <p className="muted"><Icon name="car" /> {t("x.rental", { n: hint.move.rentals[0].name, h: hint.move.rentals[0].weekday })} · {hint.move.rentals[0].tel}</p>}
                  {hint.move.city_tour?.covers.length > 0 && (<>
                    <p className="muted">{t("x.tour", { ...hint.move.city_tour, m: hint.move.city_tour.interval_min, n: hint.move.city_tour.covers.length })}</p>
                    {cond.move.length > 0 && <p className="muted">{t("x.tourWheel", { c: hint.move.city_tour.contact })}</p>}
                  </>)}
                </div>
              )}
              {hint?.stay && <p className="muted"><Icon name="bed" /> {t("x.stay", { z: hint.stay.zone_name, n: hint.stay.count })}</p>}
              <ReportBox stops={course.stops.map((s) => ({ id: s.id, name: name(s.id) }))} t={t} />
              <p className="muted small">{t("x.src")}</p>
            </>
          )}
        </section>
      </div>

      </section>
      <Courses lang={lang} busy={busy} onStart={startPreset} />
      <NowDonghae lang={lang} />
      <HomeFacts lang={lang} />
      <ZoneTiles lang={lang} />
      <MoreLinks lang={lang} />
      </>}
      </main>
      <nav className="tabbar" aria-label={t("nav.main")}>
        {([["#plan", "nav.plan", "", "route"], ["#/places", "nav.places", "places", "pin"], ["#/transport", "nav.transport", "transport", "bus"], ["#/map", "nav.map", "map", "map"], ["#/my", "nav.my", "my", "cal"]] as const).map(([h, k, r, ic]) =>
          <a key={h} href={h} aria-current={route[0] === r || (r === "places" && route[0] === "place") ? "page" : undefined}><Icon name={ic} className="tab-ic" />{t(k)}</a>)}
      </nav>
      <nav className="quick" aria-label={lang === "ko" ? "빠른 메뉴" : "Quick menu"}>
        <a href="#plan"><Icon name="route" />{lang === "ko" ? "코스 짜기" : "Plan"}</a>
        <a href="#/map"><Icon name="toilet" />{lang === "ko" ? "화장실·편의" : "Toilets"}</a>
        <a href="#/events"><Icon name="event" />{lang === "ko" ? "행사" : "Events"}</a>
        <button onClick={openSafety}><Icon name="shield" />{lang === "ko" ? "긴급·도움" : "Help"}</button>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Icon name="top" />{lang === "ko" ? "맨 위로" : "Top"}</button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.act && <button className="chip go" onClick={() => { toast.act!.fn(); setToast(null); }}>{toast.act.label}</button>}
          <button className="x" aria-label={t("common.close")} onClick={() => setToast(null)}>×</button>
        </div>)}
      {(cond.wish || []).length > 0 && route[0] !== "" && !toast && (
        <a className="cart" href="#plan">{lang === "ko" ? `담은 곳 ${(cond.wish || []).length}곳 · 코스 짜기` : `${(cond.wish || []).length} saved · Plan`}</a>)}
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
        <section className="sheet" role="dialog" aria-modal="false" aria-labelledby="sheet-h" onKeyDown={(e) => { if (e.key === "Escape") setSafety(null); }}>
          <header className="sheet-top">
            <h2 id="sheet-h">{t("tool.safety")}</h2>
            <button className="sheet-x" onClick={() => setSafety(null)} aria-label={t("common.close")} autoFocus>×</button>
          </header>
          <div className="sheet-body">
          <div className="sheet-hello"><img src="/dongi/full-lifeguard.webp" alt="" /><p className="bubble"><b>{t("dongi")}</b>{t("safety.say")}</p></div>
          <p className="sheet-call"><a className="chip go" href="tel:119"><b>119</b>&nbsp;{t("safety.119")}</a><a className="chip" href="tel:1330"><b>1330</b>&nbsp;{t("safety.1330")}</a></p>
          {safety.help?.length > 0 && <h3>{t("safety.help")}</h3>}
          {safety.help?.map((c: any) => <SheetRow key={c.name} title={[c.name, c.languages?.length ? t("safety.langs", { l: c.languages.join(", ") }) : ""]}
            info={[c.status === "check" ? t("safety.check") : `${t(c.status === "open" ? "safety.open" : "safety.closed")} ${c.hours || ""}`, km(c.dist_m)]} tel={c.tel} />)}
          {safety.chargers?.length > 0 && <h3>{t("safety.chargers")}</h3>}
          {safety.chargers?.map((c: any) => <SheetRow key={c.name} title={[c.name, c.spot]}
            info={[`${c.open_now ? t("safety.open") : t("safety.closed")} (${t("x.chargerWk", { h: c.weekday_hours })})`, km(c.dist_m)]} tel={c.tel} />)}
          {safety.mobility_center && <>
            <h3>{t("safety.mobility")}</h3>
            <SheetRow title={[safety.mobility_center.name, safety.mobility_center.hours]} info={[safety.mobility_center.app]} tel={safety.mobility_center.tel} />
            <p className="muted">{t("x.mobilityWho")}</p>
          </>}
          {safety.places?.length > 0 && <h3>{lang === "ko" ? "병원·약국" : "Clinics & pharmacies"}</h3>}
          {safety.places.map((p: any) => <SheetRow key={p.name} title={[p.name, p.kind]} info={[p.until, km(p.dist_m)]} tel={p.tel} />)}
          <button className="box sheet-close" onClick={() => setSafety(null)}>{t("common.close")}</button>
          </div>
        </section>
      )}
    </>
  );
}

// 엔진이 한국어로 남기는 코스 메모를 영어 화면에서는 같은 뜻의 영어로 (모르는 문장은 숨김)
function noteText(n: string, lang: string): string {
  if (lang === "ko") return n;
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^접근성을 아직 확인하지 못한 (\d+)곳은 코스에서 뺐어요/, (m) => `${m[1]} places whose access hasn't been checked yet were left out.`],
    [/^담아 두신 .* 이 조건으로 갈 수 없어 뺐어요/, () => "Some places you saved can't be reached with these needs, so they were left out."],
    [/^방문 시각에 문을 연 식당을 찾지 못했어요/, () => "No restaurant is open at that time. Try a different start time."],
    [/^점심때까지 시간이 남아 .* 넣었어요/, () => "Added a stop to fill the time before lunch."],
    [/^점심 전까지 .* (\d+)분 더 여유 있게 쉬어요/, (m) => `${m[1]} extra minutes to rest before lunch.`],
  ];
  for (const [re, f] of rules) { const m = n.match(re); if (m) return f(m); }
  return /[가-힣]/.test(n) ? "" : n;
}

// 긴급·도움 창의 한 줄: 이름 · 정보 · 전화(누르면 걸림). 빈 값은 빼고 잇는다
const km = (m?: number) => (m == null ? "" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
function SheetRow({ title, info, tel }: { title: (string | undefined)[]; info: (string | undefined)[]; tel?: string }) {
  return (
    <div className="stop sheet-row">
      <span>{title.filter(Boolean).join(" · ")}</span>
      <span className="muted">{info.filter(Boolean).join(" · ")}{tel ? <> · <a href={`tel:${tel}`}>{tel}</a></> : null}</span>
    </div>
  );
}


// 코스 카드 아래: 공공데이터로 붙인 이야기·택시·주차·충전기·신호등
function StopExtra({ x, wheel, t }: { x?: Extra; wheel: boolean; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!x) return null;
  const rows: [string, string][] = [];
  if (x.stories?.[0]) rows.push(["story", `${t("x.story")}: ${x.stories.slice(0, 2).map((s) => s.name).join(", ")} — ${x.stories[0].intro}`]);
  if (x.trail_info?.[0]) rows.push(["walk", `${t("x.trail")}: ${x.trail_info[0].name} ${t("x.km", { k: x.trail_info[0].length_km, d: x.trail_info[0].duration })}`]);
  if (x.events_here?.[0]) rows.push(["event", `${t("x.eventHere")}: ${x.events_here[0].name} (${x.events_here[0].start}~${x.events_here[0].end})`]);
  if (x.fee) rows.push(["ticket", x.fee]);
  if (x.park?.[0]) rows.push(["park", `${t("x.park")}: ${x.park[0].name} ${x.park[0].dist_m}m`]);
  if (x.taxi?.[0]) rows.push(["taxi", `${t("x.taxi")}: ${x.taxi[0].name}`]);
  if (x.signals?.total) rows.push(["signal", t("x.signals", { n: x.signals.total, c: x.signals.countdown })]);
  if (x.phone) rows.push(["phone", x.phone]);
  return rows.length ? <ul className="muted small ic-list">{rows.map(([ic, r]) => <li key={r}><Icon name={ic} />{ic === "phone" ? <a href={`tel:${r}`}>{r}</a> : <span>{r}</span>}</li>)}</ul> : null;
}

// 동이가 찾아 준 정보 카드 (공공데이터)
function HelpCard({ c, t, onSafety, lang = "ko" }: { c: { kind: string; data: any }; t: (k: string, v?: Record<string, string | number>) => string; onSafety: () => void; lang?: Lang }) {
  const d = c.data;
  const row = (a: string, b = "") => <div className="stop" key={a + b}><span>{a}</span><span className="muted">{b}</span></div>;
  let body: any = null;
  if (!d || (Array.isArray(d) && !d.length) || d.error) body = <p className="muted">{t("card.none")}</p>;
  else if (c.kind === "info_center") body = d.map((x: any) => row(`${x.name}${x.languages.length ? " · " + x.languages.join(", ") : ""}`, `${x.hours || t("safety.check")} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "charger") body = d.map((x: any) => row(`${x.name} · ${x.spot}`, `${t("x.chargerWk", { h: x.weekday_hours })} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "mobility_van") body = <>{row(d.name, `${d.tel} · ${d.hours}`)}<p className="muted">{t("x.mobilityWho")}</p></>;
  else if (c.kind === "city_tour") body = row(`${d.name} · ${d.days}`, `${d.board} ${d.first}~${d.last} · ${d.fare}`);
  else if (c.kind === "events") body = d.map((x: any) => row(x.name, `${x.start}~${x.end} · ${x.venue}`));
  else if (c.kind === "restaurants" && d.items?.[0]?.dist_m != null) body = <>{d.items.map((x: any) => row(`${x.name} · ${x.kind}${x.checked ? (lang === "ko" ? " · 무장애 정보 있음" : " · access info") : ""}`, `${x.dist_m}m${x.tel ? " · " + x.tel : ""}`))}<p className="muted">{t("card.eats", { n: d.total, r: d.radius / 1000 })}</p></>;
  else if (c.kind === "lodging") body = <>{d.items.map((x: any) => <div key={x.name + x.address}>{row(`${x.name} · ${x.kind}`, x.tel || x.address)}<BookLinks name={x.name} lang={lang} /></div>)}<p className="muted">{t("card.unverified", { n: d.count })}</p></>;
  else if (c.kind === "lodging" || c.kind === "restaurants") body = <>{d.items.map((x: any) => row(`${x.name} · ${x.kind}`, x.tel || x.address))}<p className="muted">{t("card.unverified", { n: d.count })}</p></>;
  else if (c.kind === "parking") body = d.map((x: any) => row(`${x.name} (${x.spaces})`, `${x.fee}${x.disabled_free ? " · " + t("x.parkingFree") : ""} · ${x.dist_m}m`));
  else if (c.kind === "taxi") body = (Array.isArray(d) ? d : [d]).map((x: any) => row(x.name, x.address || ""));
  else if (c.kind === "hospital_pharmacy") body = <button className="sos" onClick={onSafety}>{t("tool.safety")}</button>;
  return <div className="card-help" style={{ margin: "4px 0 12px 56px" }}>{body}<p className="muted small">{t("x.src")}</p></div>;
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
  if (!open) return <button className="chip" onClick={() => setOpen(true)}><Icon name="camera" />&nbsp;{t("rep.open")}</button>;
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
