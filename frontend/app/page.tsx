"use client";
// 코스 만들기 화면의 최소 구현(동이와 대화 → 코스 → 말로 수정 → 안심).
// 관광지·추천 코스·후기 섹션은 프로토타입 v2의 구조를 그대로 옮겨 붙이면 된다 (README의 '화면 옮기기' 참고).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ko from "@/i18n/ko.json";
import en from "@/i18n/en.json";
import Dongi from "@/components/Dongi";
import KakaoMap, { geocode } from "@/components/KakaoMap";
import { fuzzyHit as fz } from "@/lib/fuzzy";
import { Hero, HowToStrip, ZoneTiles, MoreLinks, Places, QuickBar, PlanAside } from "@/components/Sections";
import { PlacePage, TransportPage, MapPage, EventsPage, StayPage, GuidePage, AdminPage, BookLinks } from "@/components/Pages";
import Calendar from "@/components/Calendar";
import { MicButton } from "@/components/Voice";
import { buildQuestions, applyExtra, summarize, ExtraQ, ExtraAns } from "@/lib/followup";
import { MyPage, loadPlans, savePlans } from "@/components/MyTrips";
import { ReportForm, MyReports } from "@/components/CityReport";
import { Icon } from "@/components/Icon";
import { CommunityPage } from "@/components/Community";
import { SiteFooter } from "@/components/Footer";
import { ProfileButton, LoginPage, ProfilePage } from "@/components/Profile";
import { StopCard, Summary, RouteCosts, encodePlan, decodePlan, dateLabel, wdName } from "@/components/Timeline";
import { CourseDirections } from "@/components/CourseDirections";
import { TripSettings } from "@/components/TripSettings";
import { TripSuggestions } from "@/components/TripSuggestions";
import { PlanningWait } from "@/components/PlanningWait";
import { api, getJSON, Conditions, Course, CourseRes, Extra, WxDay, WX_ICON, DAY_GROUPS, tripDays } from "@/lib/api";
import { Brief, BRIEF_ICON, evidence, ruleBrief } from "@/lib/brief";

type Lang = "ko" | "en";
type Msg = { me?: boolean; pose?: string; text: string; cards?: { kind: string; data: any }[]; via?: "llm" | "rule"; got?: string[]; img?: string; photo?: any };
type Hint = { stay: any; move: any; events: any[]; onDay: boolean };
type Snap = { course: Course; extras: Record<string, Extra>; cond: Conditions; hint: Hint | null };
// 작업2: 큰 버튼 질문 (날짜·시각 → 누구와 → 걸음 → 식사 → 취향). '쓸 수 있는 시간' 질문은 팀장 요청으로 뺌(2026-11-21, 엔진의 budget_min은 그대로)
const Q = [
  { k: "when", q: "q.when", multi: false, o: [] as string[] },
  { k: "who", q: "q.who", multi: false, o: ["혼자", "연인·친구", "부모님과", "아이와", "단체"] },
  { k: "move", q: "q.move", multi: true, none: "일반", o: ["휠체어", "보행보조기·유모차", "거동 불편 어르신", "일반"] },
  { k: "need", q: "q.need", multi: true, none: "없어요", o: ["평탄한 길만", "장애인 화장실 우선", "중간에 쉬는 곳", "없어요"] },
  { k: "meal", q: "q.meal", multi: true, none: "상관없어요", o: ["입식", "부드러운 메뉴", "주차 편한 곳", "상관없어요"] },
  { k: "style", q: "q.style", multi: true, o: ["바다 보기", "자연·산책", "산·등산", "카페", "맛집", "역사·문화"] },
] as const;
// 화면의 보행 상태 → 엔진 이동 조건 (장애인등편의법 기준 판정 모드)
const MOVE_MAP: Record<string, string[]> = {
  "휠체어": ["휠체어"], "보행보조기·유모차": ["유모차"], "거동 불편 어르신": ["오래 걷기 어려움", "계단 어려움"], "일반": [],
};
const toMove = (xs: string[] = []) => Array.from(new Set(xs.flatMap((x) => MOVE_MAP[x] ?? [x])));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const nextWd = (wd: number) => plusDays((wd - new Date().getDay() + 7) % 7);
// 출발 시각: 알약은 앞으로 3시간만(오늘이면 지금 다음 정시부터, 다른 날은 09·10·11시), 나머지는 옆 선택 상자에서 (팀장 요청 2026-11-21)
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const OTHER_TIMES = Array.from({ length: 27 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);   // 07:00~20:00, 30분 간격
function nextTimes(date: string, today: string): string[] {
  if (date !== today) return [hh(9), hh(10), hh(11)];
  const now = new Date(); const h = Math.max(8, now.getHours() + 1);
  return [h, h + 1, h + 2].filter((x) => x <= 20).map(hh);
}
const STEPS = { ko: ["날짜", "누구와", "걸음", "필요한 것", "식사", "취향", "출발"], en: ["Date", "Who", "Walking", "Needs", "Meals", "Style", "Start"] };
const BUDGET: Record<string, number | null> = { "2시간": 120, "3시간": 180, "4시간": 240, "하루 종일": null };
// 앞 답을 받아 한 줄 반응 + 다음 질문 문장을 그 답에 맞게 (규칙: 빠르고 비용 없음, 자유 입력은 /api/talk)
const ACK: Record<string, Record<string, string>> = {
  who: { "혼자": "혼자 여행이시군요.", "연인·친구": "함께 가는 여행이군요.", "부모님과": "부모님과 함께하는 여행이군요.", "아이와": "아이와 함께하는 여행이군요.", "단체": "단체 여행이군요." },
  move: { "휠체어": "휠체어로 다닐 수 있는 길만 고를게요.", "보행보조기·유모차": "턱·계단이 없는 길을 먼저 볼게요.", "거동 불편 어르신": "계단·급경사가 있는 곳은 뺄게요.", "일반": "걷는 데 제한 없이 고를게요." },
};
function qText(k: string, a: Record<string, string[]>): string | null {
  const who = a.who?.[0] || "", move = a.move || [];
  if (k === "move") return who === "혼자" ? "이동할 때 어떤 점이 불편하세요? 고른 조건으로 갈 수 있는 길만 골라요."
    : who === "부모님과" ? "부모님 걸음은 어떠세요? 고른 조건으로 갈 수 있는 길만 골라요."
    : who === "아이와" ? "유모차를 쓰시나요? 일행 중 걸음이 불편한 분이 있으면 함께 골라 주세요."
    : "일행 중 이동이 불편한 분이 있나요? 고른 조건으로 갈 수 있는 길만 골라요.";
  if (k === "need") return move.includes("휠체어") ? "휠체어로 다닐 때 꼭 필요한 게 있나요? 여러 개 골라도 돼요."
    : move.includes("보행보조기·유모차") ? "유모차·보행보조기로 다닐 때 필요한 게 있나요? 여러 개 골라도 돼요."
    : "어르신과 다닐 때 필요한 게 있나요? 여러 개 골라도 돼요.";
  return null;
}
const NEED_OPTS: Record<string, string[]> = {   // 이동 조건마다 다른 선택지 (모두 엔진 조건으로 이어지는 것만)
  "휠체어": ["평탄한 길만", "장애인 화장실 우선", "중간에 쉬는 곳", "없어요"],
  "보행보조기·유모차": ["평탄한 길만", "중간에 쉬는 곳", "장애인 화장실 우선", "없어요"],
  "거동 불편 어르신": ["중간에 쉬는 곳", "평탄한 길만", "장애인 화장실 우선", "없어요"],
};
const needOpts = (move: string[] = []) => NEED_OPTS[move.find((m) => NEED_OPTS[m]) || ""] || Q.find((x) => x.k === "need")!.o;

export default function Page() {
  const [lang, setLang] = useState<Lang>("ko");
  const D = (lang === "ko" ? ko : en) as Record<string, string>;
  const t = (k: string, v: Record<string, string | number> = {}) =>
    (D[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ""));
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<Record<string, string[]>>({});
  const [pendingTalk, setPendingTalk] = useState<Conditions | null>(null);   // BUG-001: 날짜·출발 시각을 고른 뒤에 코스를 보여 주려고 잠시 보관
  const [cond, setCond] = useState<Conditions>({ who: "혼자", move: [], style: [], days: "당일", start: "동해역", memo: "", wish: [], lang: "ko",
    date: iso(new Date()), start_time: "10:00", meal: [] });
  const [log, setLog] = useState<Msg[]>([]);
  const [qcMore, setQcMore] = useState(false);
  // 코스 뒤: 장소 더 넣기 / 내 숙소 넣기 (숙소는 코스의 마지막 도착지로 지도·길찾기에 붙는다)
  const [addOpen, setAddOpen] = useState<"" | "place" | "stay">("");
  const [addQ, setAddQ] = useState("");
  const [stays, setStays] = useState<any[]>([]);
  const [stay, setStay] = useState<{ name: string; addr: string; lat: number; lon: number } | null>(null);
  const [stayMsg, setStayMsg] = useState("");
  // 코스 지도: map = 우리 지도(점 누르면 정보), kakao = 카카오맵 길찾기(거리·시간·통행료)를 페이지 안에
  // 코스 결과 지도 (gangRG님): edit = 일정 편집 지도(경로선·구간), official = 카카오 공식 길찾기
  const [mapMode, setMapMode] = useState<"edit" | "official">("edit");
  const [mapStop, setMapStop] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [smallPane, setSmallPane] = useState<"map" | "schedule">("map");
  const [planning, setPlanning] = useState(false);          // 코스 준비 화면 (PlanningWait)
  const [suggestOpen, setSuggestOpen] = useState(false);    // 고르는 중 후보 미리 보기 (규칙, AI 안 부름)
  const openRoute = () => { setChatOpen(false); setMapMode("official"); setSmallPane("map"); setTimeout(() => document.querySelector(".res-map")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
  // 입구 두 갈래: easy = 편하게 다니는 코스(걸음 질문 함), free = 일반 여행 코스(걸음 질문 건너뜀)
  const [kind, setKind] = useState<"easy" | "free" | null>(null);   // 빠른 수정: 자주 쓰는 것만 먼저, 나머지는 [더 고치기]
  const [course, setCourse] = useState<Course | null>(null);
  // 여러 날 여행: 날마다 코스를 따로 짜서 모아 둔다 (n일차 → 그날 결과와 조건)
  const [dayNo, setDayNo] = useState(1);
  const dayRef = useRef(1);
  const [trip, setTrip] = useState<Record<number, { res: any; cond: Conditions }>>({});
  const [places, setPlaces] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [safety, setSafety] = useState<any>(null);
  const [quickOpen, setQuickOpen] = useState(false);   // 빠른 메뉴 펼침
  const quickT = useRef<any>(null);
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  // 한국관광공사 관광지 집중률 예측(앞으로 30일). 못 불러오면 배지를 숨긴다.
  const [crowdMap, setCrowdMap] = useState<Record<string, { date: string; rate: number }[]>>({});
  useEffect(() => { getJSON("/api/crowd").then((j) => setCrowdMap(j.places || {})).catch(() => {}); }, []);
  const [talkState, setTalkState] = useState<Record<string, boolean>>({});
  const [big, setBig] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hist, setHist] = useState<Snap[]>([]);          // 되돌리기
  const [fresh, setFresh] = useState<string[]>([]);      // 방금 새로 들어간 곳
  // 가까운 주차·충전기: 휠체어·'주차 편한 곳'이면 처음부터 보이고, 버튼으로 끄고 켤 수 있다 (gangRG님)
  const [nearOverride, setNearOverride] = useState<boolean | null>(null);
  const showNear = nearOverride ?? (cond.move.includes("휠체어") || !!cond.meal?.includes("주차 편한 곳"));
  const [whenOpen, setWhenOpen] = useState(false);
  const [sumOpen, setSumOpen] = useState(false);
  const [route, setRoute] = useState<string[]>([""]);
  const [saved, setSaved] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  // '다른 시각' 목록: 넓은 화면은 5개씩 보이는 목록(스크롤), 휴대폰은 기기 기본 선택기(iOS 휠·안드로이드 창)
  const [timeOpen, setTimeOpen] = useState(false);
  const timeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!timeOpen) return;
    const off = (e: MouseEvent) => { if (!timeRef.current?.contains(e.target as Node)) setTimeOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setTimeOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    requestAnimationFrame(() => timeRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" }));
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [timeOpen]);
  // 더 자세히 묻기: offer = "조금만 더 여쭤봐도 될까요?" 대기, xq = 이번 사람에게 고른 추가 질문, xi = 지금 몇 번째
  const [offer, setOffer] = useState(false);
  const [xq, setXq] = useState<ExtraQ[] | null>(null);
  const [xi, setXi] = useState(0);
  const [xa, setXa] = useState<ExtraAns>({});
  // 코스가 나오면 대화 칸은 오른쪽 아래 작은 버튼으로 접히고, 코스(왼쪽)와 지도(오른쪽)가 넓게 보인다
  const [chatOpen, setChatOpen] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);
  const scheduleRef = useRef<HTMLElement>(null);
  function selectMapStop(id: string) {
    setMapStop(id);
    setMapMode("edit");
    setSettingsOpen(id === "@start");
    // 오른쪽 목록에 모든 장소가 보이므로, 고른 장소가 보이게만 살짝 스크롤
    requestAnimationFrame(() => scheduleRef.current?.querySelector(`[data-course-stop="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
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
  useEffect(() => { setLog([{ pose: "wave", text: t("plan.greet") }, { pose: "ask", text: t("q.kind") }]); setStep(0); setKind(null); }, [lang]);
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
        setLang("ko"); setCond(c); setStep(Q.length + 1); setBusy(true);
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
  // 마스코트 얼굴은 가장 최근 동이 말풍선에만 보여 준다
  const lastDongi = log.reduce((k, m, i) => (m.me ? k : i), -1);
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
    const cur = Q[step]?.k;
    let n = step + 1;
    if (kind === "free" && Q[n]?.k === "move") { next = { ...next, move: ["일반"] }; n += 1; }   // 일반 여행: 걸음 질문 건너뜀
    if (Q[n]?.k === "need" && !(next.move || []).some((m) => NEED_OPTS[m])) { next = { ...next, need: [] }; n += 1; }   // 이동 제약이 없으면 '필요한 것'도 건너뜀
    setAns(next);
    say({ me: true, text: chosen.map((o) => t(`opt.${o}`)).join(", ") });   // 날짜는 finishWhen 이 이 줄을 바꿔 씀
    setStep(n);
    const ack = lang === "ko" && cur ? (cur === "move" ? chosen.filter((o) => o !== "일반").map((o) => ACK.move[o]).filter(Boolean)[0] || ACK.move[chosen[0]] : ACK[cur]?.[chosen[0]]) : "";
    if (n === Q.length && !xq) {
      setOffer(true);
      say({ pose: "ask", text: [ack, lang === "ko" ? "조금만 더 여쭤봐도 될까요? 속도·하고 싶은 것까지 알면 더 맞는 코스를 짤 수 있어요." : "Can I ask a few more questions? With your pace and interests I can make a better-fitting route."].filter(Boolean).join(" ") });
      return;
    }
    const qx = n < Q.length ? (lang === "ko" && qText(Q[n].k, next)) || t(Q[n].q) : t("q.last");
    say({ pose: "ask", text: [ack, qx].filter(Boolean).join(" ") });
  }
  function finishWhen() {
    const d = cond.date || iso(new Date());
    const wd = new Date(d + "T00:00:00").getDay();
    const wp = cond.weather_pref ? ` · ${cond.weather_pref === "실내" ? (lang === "ko" ? "실내 위주" : "indoor") : (lang === "ko" ? "바깥 위주" : "outdoor")}` : "";   // IMP-006: 고른 실내외도 말풍선에
    if (pendingTalk) {   // BUG-001: 대화로 받은 조건 + 고른 날짜·시각으로 코스
      const c = { ...pendingTalk, date: d, start_time: cond.start_time || "10:00", weather_pref: cond.weather_pref || pendingTalk.weather_pref || "", lang } as Conditions;
      setPendingTalk(null); setAns((a) => ({ ...a, when: [d, c.start_time || "10:00"] }));
      makeWith(c, `${dateLabel(d, lang)}(${wdName(wd, lang)}) ${c.start_time}${wp}`);
      return;
    }
    finishQ({ ...ans, when: [d, cond.start_time || "10:00"] }, []);
    setLog((l) => { const c = [...l]; c[c.length - 2] = { me: true, text: `${dateLabel(d, lang)}(${wdName(wd, lang)}) ${cond.start_time}${wp}` }; return c; });
  }
  function chooseKind(k: "easy" | "free") {
    setKind(k);
    if (k === "free") setAns((a) => ({ ...a, move: ["일반"] }));
    say({ me: true, text: t(k === "easy" ? "kind.easy" : "kind.free") });
    say({ pose: "ask", text: t("q.when") });
  }
  const forkOpen = kind === null && step === 0 && !course && !log.some((m) => m.me);
  const busyOn = (d?: string | null) => Object.entries(crowdMap).filter(([, rows]) => (rows.find((r) => r.date === (d || "").replaceAll("-", ""))?.rate ?? 0) >= 70).map(([id]) => id);
  const baseCond = (): Conditions => {
    const need = ans.need || [];
    const c: Conditions = { ...cond, lang, who: ans.who?.[0] || cond.who,
      move: ans.move ? toMove(ans.move) : cond.move, meal: ans.meal ? ans.meal.filter((x) => x !== "상관없어요") : cond.meal || [],
      style: ans.style || cond.style,
      ...(ans.time ? { budget_min: BUDGET[ans.time[0]] ?? null } : {}),
      ...(need.includes("평탄한 길만") ? { flat_only: true } : {}),
      ...(need.includes("중간에 쉬는 곳") ? { rest: true } : {}),
      ...(need.includes("장애인 화장실 우선") ? { toilet_first: true } : {}) };
    return applyExtra(c, xa, busyOn(cond.date));
  };
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
  // 처음부터 새로 짜기: 지금 코스는 되돌리기로 남기고, 질문을 처음부터 (IMP-003)
  function startOver() {
    snapshot(); setCourse(null); setTrip({}); dayRef.current = 1; setDayNo(1); setPendingTalk(null);
    setAns({}); setStep(0); setKind(null); setXq(null); setOffer(false); setTalkState({}); setFresh([]);
    setCond((c) => ({ ...c, must: [], exclude: [], lunch: null, cap: null, rest: null, flat_only: false, toilet_first: false, budget_min: null, weather_pref: "", rain: null }));
    setLog([]); toPlan();
  }
  async function make() {
    const c = baseCond();
    await makeWith(c, `${t(`opt.${c.days}`)} · ${t(`opt.${c.start}`)}${c.memo ? " · " + c.memo : ""}`);
  }
  const toPlan = () => { if (location.hash.startsWith("#/")) location.hash = "#plan"; else { const el = document.querySelector("#plan .grid"); el?.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => el?.scrollIntoView({ block: "start" }), 600); } };
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
  // 화면 아래 '담은 곳 n곳 · 코스 짜기': 코스가 있으면 아직 안 들어간 담은 곳을 지금 코스에 넣는다 (BUG-006)
  function goCart() {
    toPlan();
    if (!course || busy) return;
    const inC = new Set(course.stops.map((s) => s.id));
    const missing = (cond.wish || []).filter((id) => !inC.has(id));
    if (missing.length === 1) edit("add", missing[0], lang === "ko" ? `${name(missing[0])} 넣어줘` : `add ${name(missing[0])}`);
    else if (missing.length > 1) { snapshot(); makeWith({ ...cond, lang, must: Array.from(new Set([...(cond.must || []), ...missing])) }, lang === "ko" ? `담은 곳 ${missing.length}곳을 넣어서 다시 짜 줘` : `Re-plan with my ${missing.length} saved places`); }
    else showToast(lang === "ko" ? "담은 곳이 모두 지금 코스에 들어 있어요." : "All saved places are already in your course.");
  }
  function applyRes(r: CourseRes | any, before: string[] = []) {
    setSaved(false); setSettingsOpen(false); setMapStop(null);
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
  // [여행 설정]에서 바꾼 조건으로 그날 코스를 다시 짠다 (gangRG님)
  async function applySettings(draft: Conditions, fromMapStart = false) {
    if (busy || !course) return;
    setBusy(true);
    try {
      const r = await api.course({ ...draft, lang, day_no: dayNo });
      snapshot();
      setTrip((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) <= dayNo)));
      applyRes(r, course.stops.map((s) => s.id));
      if (fromMapStart) { setSettingsOpen(true); setMapStop("@start"); }
      showToast(lang === "ko" ? "새 조건으로 지도와 일정을 갱신했어요." : "Map and schedule updated.");
    } catch { showToast(t("error.server")); }
    finally { setBusy(false); }
  }
  async function makeWith(c: Conditions, label: string) {
    setCond(c); setBusy(true); setPlanning(true);
    say({ me: true, text: label });
    say({ pose: "think", text: t("plan.thinking") });
    try {
      const r = await api.course({ ...c, day_no: 1 });
      dayRef.current = 1; setDayNo(1); setTrip({ 1: { res: r, cond: { ...c, day_no: 1 } } });
      setHist([]); applyRes(r);
      if (!r.course.stops.length) say({ pose: "worry", text: lang === "ko" ? `${r.course.start_time} 출발이면 문을 연 곳이 거의 없어서 코스를 만들지 못했어요. 관광지는 대부분 오후 5~6시에 닫아요. 아래 [날짜·출발 바꾸기]에서 오전이나 이른 오후로 바꿔 보세요.`
        : `Almost nothing is open after ${r.course.start_time}. Most places close around 5-6 pm; try a morning or early-afternoon start.` });
      else {
        say({ pose: "happy", text: t("plan.done", { n: r.course.stops.length, t: r.course.back_at }) });
        // ① AI 코스 설계 에이전트가 짰으면 어떻게 짰는지 한 줄 (규칙 코스면 말하지 않음)
        if (r.planner?.by === "ai" && r.planner.summary) say({ pose: "neutral", via: "llm", text: (lang === "ko" ? "AI가 장소를 직접 찾아보고 시간을 맞춰 본 코스예요. " : "The AI searched places and checked the timing itself. ") + r.planner.summary });
      }
      setStep(Q.length + 1);
    } catch { say({ pose: "worry", text: t("error.server") }); }
    finally { setBusy(false); setPlanning(false); }
  }
  // 여러 날 여행: k일차로 넘어가기. 아직 안 짠 날은 1일차부터 차례로, 앞선 날에 간 곳을 빼고 짠다.
  async function goDay(k: number) {
    if (k === dayNo || busy || !trip[1]) return;
    setMapStop(null);
    const cache = { ...trip };
    if (course) cache[dayNo] = { res: { ...cache[dayNo]?.res, course, extras }, cond };
    setBusy(true);
    try {
      const base = cache[1].cond, d0 = cache[1].res.course.date;
      for (let j = 2; j <= k; j++) {
        if (cache[j]) continue;
        const used = Object.keys(cache).map(Number).filter((x) => x < j).flatMap((x) => cache[x].res.course.stops.map((s: any) => s.id));
        const dt = new Date(d0 + "T00:00:00"); dt.setDate(dt.getDate() + j - 1);
        const c: Conditions = { ...base, day_no: j, date: iso(dt), start_time: "10:00", exclude: Array.from(new Set([...(base.exclude || []), ...used])), wish: [], must: [], lunch: null };   // BUG-003: 둘째 날부터는 오전 10시 출발 (그날 [날짜·출발 바꾸기]로 바꿀 수 있음)
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
    if (!course || busy) return;
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
  async function chat(msg: string, fresh = false) {
    if (busy) return;
    say({ me: true, text: msg }); setBusy(true);
    const initialHash = location.hash;
    const before = fresh ? [] : course?.stops.map((s) => s.id) || [];
    const before0 = baseCond();
    const c0 = fresh ? { ...before0, must: [], exclude: [], lunch: null, cap: null, rest: null, flat_only: false } : before0;
    try {
      const r = await api.talk({ message: msg, history: fresh ? [] : log.slice(-10), conditions: c0,
        state: { who_known: !!ans.who || talkState.who_known, move_known: !!ans.move || talkState.move_known },
        course_ids: before });
      setTalkState(r.state);
      const got = r.conditions ? understood(before0, r.conditions) : [];
      // BUG-001: 아직 날짜·출발 시각을 고르지 않았고 말에도 날짜가 없으면, 코스는 잠시 두고 날짜부터 묻는다
      if (r.course && !course && !fresh && !ans.when && (r.conditions?.date || null) === (before0.date || null) && (r.conditions?.start_time || "") === (before0.start_time || "")) {
        setPendingTalk(r.conditions); setCond(r.conditions); setStep(0);
        say({ pose: "ask", text: lang === "ko" ? "말씀하신 대로 짤 준비가 됐어요. 그 전에 언제 가시는지 날짜와 출발 시각을 골라 주세요. 고르면 바로 코스를 보여 드릴게요."
          : "Got it. First pick the date and start time, and I'll show your route right away.", got });
        setBusy(false); return;
      }
      if (r.course) { if (course) snapshot(); applyRes(r, before); setStep(Q.length + 1); }
      else { setCond(r.conditions); if (!course) { const iOf = (k: string) => Q.findIndex((x) => x.k === k);   // 대화로 알게 된 것 다음 질문으로
          const mv: string[] = r.conditions.move || [];   // 엔진 이동 조건 → 화면 선택지 ('필요한 것' 선택지가 맞게)
          const ui = mv.includes("휠체어") ? ["휠체어"] : mv.includes("유모차") ? ["보행보조기·유모차"] : mv.length ? ["거동 불편 어르신"] : ["일반"];
          if (r.state.move_known) setAns((a) => ({ ...a, move: a.move || ui, ...(r.state.who_known && r.conditions.who ? { who: a.who || [r.conditions.who] } : {}) }));
          setStep((n) => Math.max(n, r.state.move_known ? iOf(mv.length ? "need" : "meal") : r.state.who_known ? iOf("move") : n)); } }
      if (/충전|주차|charger|parking/i.test(msg) && course) setNearOverride(true);
      // 코스 없이 화장실·충전기·주차·안내소만 물으면 편의시설 지도의 그 층으로 (gangRG님)
      const facilityRoutes: Record<string, string> = { toilets: "toilets", charger: "chargers", parking: "parking", info_center: "info_centers" };
      const layer = !course && r.cards?.length === 1 && facilityRoutes[r.cards[0].kind];
      if (!r.course && layer && location.hash === initialHash) location.hash = "#/map/" + layer;
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
  const KAKAO_START: Record<string, [number, number]> = { "동해역": [37.498198, 129.123794], "묵호역": [37.546824, 129.107692], "동해종합버스터미널": [37.5213, 129.1137] };   // engine.py 와 같게
  const kakaoRoute = useMemo(() => {
    const pts: [string, number, number][] = (course?.stops || []).filter((s) => places[s.id]?.lat).map((s) => [name(s.id), places[s.id].lat, places[s.id].lon]);
    if (!pts.length) return "";
    const st = KAKAO_START[cond.start];
    if (st) { const nm = lang === "ko" ? cond.start : t(`opt.${cond.start}`); pts.unshift([nm, st[0], st[1]]); if (pts.length < 7 && !stay) pts.push([nm, st[0], st[1]]); }
    if (stay) { if (pts.length >= 7) pts.length = 6; pts.push([stay.name, stay.lat, stay.lon]); }   // 숙소가 있으면 역으로 돌아가는 대신 숙소로
    if (pts.length < 2) return "";
    const seg = pts.slice(0, 7).map(([n, la, lo]) => `${encodeURIComponent(n.replace(/[,/]/g, " "))},${la},${lo}`).join("/");
    return `https://map.kakao.com/link/by/car/${seg}`;
  }, [course, places, cond.start, lang, stay]);
  const pins0 = useMemo(() => (course?.stops || []).filter((s) => places[s.id]?.lat)
    .map((s, i) => ({ lat: places[s.id].lat, lon: places[s.id].lon, label: name(s.id), grade: s.grade,
      sub: `${i + 1}. ${s.arrive}~${s.depart}${s.grade ? ` · ${t(`grade.${s.grade}`)}` : ""}`, addr: (places[s.id].address || "").replace("강원특별자치도 ", "") })), [course, places, lang]);
  // 마지막 장소 → 숙소 차로 걸리는 시간 (엔진과 같은 어림식: 직선거리 × 1.4, 시속 35km, +5분)
  const stayMin = useMemo(() => {
    const last = pins0[pins0.length - 1];
    if (!stay || !last) return null;
    const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
    const d = 2 * R * Math.asin(Math.sqrt(Math.sin(rad(stay.lat - last.lat) / 2) ** 2 + Math.cos(rad(last.lat)) * Math.cos(rad(stay.lat)) * Math.sin(rad(stay.lon - last.lon) / 2) ** 2));
    return Math.round((d * 1.4) / 35 * 60) + 5;
  }, [stay, pins0]);
  const pins = useMemo(() => (stay ? [...pins0, { lat: stay.lat, lon: stay.lon, label: stay.name, grade: null, color: "#6B4FA0", icon: lang === "ko" ? "숙" : "H", picto: "lodging",
    sub: lang === "ko" ? `내 숙소 · 마지막 장소에서 차로 약 ${stayMin}분` : `My stay · ~${stayMin} min by car from the last stop`, addr: stay.addr.replace("강원특별자치도 ", "") }] : pins0), [pins0, stay, stayMin, lang]);
  const openStay = () => {
    setAddOpen(addOpen === "stay" ? "" : "stay"); setAddQ(""); setStayMsg("");
    if (!stays.length) api.get("/api/lodging?limit=0").then((d: any) => setStays((d.items || []).map((x: any) => ({ ...x, road: x.road || x.address || "" })))).catch(() => {});
  };
  const pickStay = async (r: any) => {
    setStayMsg(lang === "ko" ? "위치를 찾는 중…" : "Finding the location…");
    const pt = r.lat ? { lat: r.lat, lon: r.lon } : await geocode(r.road || "");
    if (!pt) { setStayMsg(lang === "ko" ? "주소로 위치를 찾지 못했어요. 다른 숙소를 골라 주세요." : "Couldn't find that address. Try another place."); return; }
    setStay({ name: r.name, addr: r.road || "", ...pt }); setAddOpen(""); setStayMsg(""); setMapMode("edit");
  };
  // 대중교통 구간 한 줄: '대중교통 24분 · 버스 12-4 · 걷기 350m(9분) · 환승 1번' (ODsay, 걷는 시간은 이동 조건 속도)
  const legText = (leg: any, m: number) => !leg ? t("result.transit", { m }) : leg.mode === "walk"
    ? (lang === "ko" ? `걸어서 ${leg.walk_min}분 (${leg.walk_m}m)` : `Walk ${leg.walk_min} min (${leg.walk_m} m)`)
    : [t("result.transit", { m }), ...(leg.lines || []), leg.walk_m ? (lang === "ko" ? `걷기 ${leg.walk_m}m(${leg.walk_min}분)` : `walk ${leg.walk_m} m`) : "", leg.transfers ? (lang === "ko" ? `환승 ${leg.transfers}번` : `${leg.transfers} transfer(s)`) : ""].filter(Boolean).join(" · ");
  const q = Q[step];
  const shareUrl = typeof window !== "undefined" && course ? `${location.origin}${location.pathname}#plan=${encodePlan({ ...cond, lang }, course)}` : "";
  const startName = cond.start === "자가용" ? (lang === "ko" ? "동해역 (자가용 기준점)" : "Donghae Station (car)") : t(`opt.${cond.start}`);
  // 경로 지도의 점: 출발역 → 장소들 → 출발역 (gangRG님)
  const routePoints = useMemo(() => {
    if (!course?.stops.length || course.stops.some((s) => !places[s.id]?.lat || !places[s.id]?.lon)) return [];
    const sp = KAKAO_START[cond.start] || KAKAO_START["동해역"];
    const station = { id: "@start", label: cond.start === "자가용" ? t("opt.동해역") : t(`opt.${cond.start}`),
      lat: course.start_point?.[0] ?? sp[0], lon: course.start_point?.[1] ?? sp[1], grade: null };
    return [station, ...course.stops.map((s) => ({ id: s.id, lat: places[s.id].lat, lon: places[s.id].lon, label: name(s.id), grade: null })), station];
  }, [course, places, cond.start, lang]);
  const stopIndex = Math.max(0, course?.stops.findIndex((s) => s.id === mapStop) ?? 0);
  // 고르는 중 후보 미리 보기: 무엇이든 조건을 하나라도 고르면 (규칙 엔진 /api/course-preview 만 부른다)
  const previewConditions = baseCond();
  const personalize = !course && !!(previewConditions.move.length || previewConditions.style.length || previewConditions.meal?.length ||
    previewConditions.wish?.length || previewConditions.weather_pref || previewConditions.rain);
  // 코스 머리 막대 높이를 재서 지도·일정 칸 높이를 맞춘다 (gangRG님)
  useEffect(() => {
    const bar = barRef.current;
    const shell = bar?.parentElement;
    if (!bar || !shell || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      shell.style.setProperty("--planner-bar-height", bar.offsetHeight + "px");
      const layout = shell.querySelector(".course-layout");
      if (layout) shell.style.setProperty("--editor-offset", Math.ceil(layout.getBoundingClientRect().top - shell.getBoundingClientRect().top) + "px");
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    shell.querySelectorAll(".day-tabs, .day-free").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [!!course, dayNo, cond.days, route[0]]);   // eslint-disable-line
  useLayoutEffect(() => { if (planning) document.getElementById("plan")?.scrollIntoView({ block: "start" }); }, [planning]);

  // 함수로 부른다(컴포넌트로 만들면 렌더마다 새로 만들어져 달력의 '보는 달'이 초기화된다)
  // 날짜는 앞으로 2주를 한 줄로 보여 주고, 더 먼 날은 '달력'을 펼쳐 고른다. 한 화면에 날짜·시각·다음 버튼이 다 보이게.
  const wdOf = (d: string) => new Date(d + "T00:00:00").getDay();
  const whenPicker = (onDone: () => void, label: string) => {
    const d0 = cond.date || plusDays(0);
    const strip = Array.from({ length: 7 }, (_, i) => plusDays(i));   // 일주일만 보이고, 그 뒤는 달력에서
    const far = !strip.includes(d0);
    const times3 = nextTimes(d0, plusDays(0));
    const otherOn = !!cond.start_time && !times3.includes(cond.start_time);
    const otherList = Array.from(new Set([...OTHER_TIMES, ...(otherOn && cond.start_time ? [cond.start_time] : [])])).sort();
    return (
      <div className="when when2">
        <p className="when-k">{lang === "ko" ? "날짜 및 시간" : "Date & time"}</p>
        <div className="dstrip2" role="group" aria-label={lang === "ko" ? "날짜" : "Date"}>
          {strip.map((d, i) => { const wd = wdOf(d), w = wxOf(d); return (
            <button key={d} type="button" className={`dcard${wd === 0 ? " sun" : wd === 6 ? " sat" : ""}${w?.rain ? " wet" : ""}`} aria-pressed={d0 === d}
              aria-label={`${dateLabel(d, lang)} ${wdName(wd, lang)}${w ? ` ${lang === "ko" ? w.ko : w.en} ${Math.round(w.tmax)}~${Math.round(w.tmin)}도` : ""}`} onClick={() => setCond({ ...cond, date: d })}>
              {i === 0 ? <span className="dc-today">{lang === "ko" ? "오늘" : "Today"}</span>
                : <span className="dc-wd">{i === 1 ? (lang === "ko" ? "내일" : "Tmrw") : wdName(wd, lang)}</span>}
              <b className="dc-day">{Number(d.slice(8))}</b>
              {w ? <><span className="dc-ic" aria-hidden="true"><Icon name={w.icon} /></span>
                <span className="dc-t">{Math.round(w.tmax)}° <small>/ {Math.round(w.tmin)}°</small></span></> : <span className="dc-none" aria-hidden="true">–</span>}</button>); })}
          <button type="button" className={`dcard more${far ? " picked" : ""}`} aria-expanded={calOpen} aria-pressed={far} onClick={() => setCalOpen(!calOpen)}
            aria-label={far ? (lang === "ko" ? `달력에서 고른 날 ${dateLabel(d0, lang)}. 다른 날 고르기` : `Picked ${dateLabel(d0, lang)}. Pick another day`) : (lang === "ko" ? "다음 주 이후 날짜는 달력에서 고르기" : "Pick a later date from the calendar")}>
            <span className="dc-ic"><Icon name="cal" /></span><span className="dc-wd">{far ? `${+d0.slice(5, 7)}/${+d0.slice(8)}` : (lang === "ko" ? "달력" : "Later")}</span></button>
        </div>
        {calOpen && <Calendar value={d0} lang={lang} onChange={(d) => { setCond({ ...cond, date: d }); setCalOpen(false); }} />}
        <div className="trow2" role="group" aria-label={t("when.time")}>
          <span className="when-sub">{t("when.time")}</span>
          {times3.map((h) => <button key={h} type="button" className="tpill" aria-pressed={cond.start_time === h} onClick={() => setCond({ ...cond, start_time: h })}>{h}</button>)}
          <span className="tsel-wrap" ref={timeRef}>
            <select className={`tpill tsel tsel-native${otherOn ? " on" : ""}`} aria-label={t("when.other")} value={otherOn ? cond.start_time : ""}
              onChange={(e) => e.target.value && setCond({ ...cond, start_time: e.target.value })}>
              <option value="">{t("when.other")}</option>
              {otherList.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <button type="button" className={`tpill tsel tsel-btn${otherOn ? " on" : ""}`} aria-haspopup="listbox" aria-expanded={timeOpen} onClick={() => setTimeOpen(!timeOpen)}>
              {otherOn ? cond.start_time : t("when.other")}</button>
            {timeOpen && <ul className="tsel-list" role="listbox" aria-label={t("when.other")}>
              {otherList.map((h) => <li key={h} role="option" aria-selected={cond.start_time === h}>
                <button type="button" onClick={() => { setCond({ ...cond, start_time: h }); setTimeOpen(false); }}>{h}</button></li>)}
            </ul>}
          </span>
        </div>
        <div className="wrow2" role="group" aria-label={lang === "ko" ? "날씨에 맞추기" : "Weather"}>
          {!wxOf(d0) && <span className="wline">{!wx.length ? (lang === "ko" ? "예보를 불러오지 못함" : "Forecast unavailable") : (lang === "ko" ? "16일 이후 날짜 — 예보 전" : "More than 16 days ahead")}</span>}
          <span className="wseg">
            {([["", lang === "ko" ? "날씨 보고 알아서" : "Auto", lang === "ko" ? "날씨대로" : "Auto"], ["실내", lang === "ko" ? "실내 위주" : "Indoor", lang === "ko" ? "실내" : "Indoor"], ["실외", lang === "ko" ? "실외 위주" : "Outdoor", lang === "ko" ? "실외" : "Outdoor"]] as const).map(([v, l, sh]) =>
              <button key={v} type="button" aria-pressed={(cond.weather_pref || "") === v} aria-label={l} onClick={() => setCond({ ...cond, weather_pref: v })}>{v === "" && <Icon name="sun" />}<span className="w-long">{l}</span><span className="w-short" aria-hidden="true">{sh}</span></button>)}
          </span>
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
  // 코스 전: 고른 조건만 한 줄로 (고른 것이 없으면 안 보임)
  const tripLine = () => {
    const o = (x: string) => t(`opt.${x}`);
    const wd = wdOf(cond.date || plusDays(0));
    const items = [step > 0 ? `${dateLabel(cond.date || "", lang)}(${wdName(wd, lang)}) ${cond.start_time}` : null,
      ans.who ? ans.who.map(o).join(", ") : null,
      kind === "free" ? (lang === "ko" ? "일반 여행" : "Regular trip") : ans.move ? ans.move.map(o).join(", ") : null,
      ans.meal ? ans.meal.map(o).join(", ") : null, ans.style ? ans.style.map(o).join(", ") : null].filter(Boolean) as string[];
    const wish = cond.wish || [];
    if (!items.length && !wish.length) return null;
    return (
      <div className="trip-line" aria-label={lang === "ko" ? "지금까지 고른 조건" : "Your choices so far"}>
        {items.map((x) => <span key={x} className="tl-chip">{x}</span>)}
        {wish.map((id) => <button key={id} className="chip sm" onClick={() => removeWish(id)} aria-label={lang === "ko" ? `${name(id)} 빼기` : `Remove ${name(id)}`}>{name(id)} ×</button>)}
      </div>);
  };

  return (
    <>
      <a className="skip" href="#plan">{t("nav.skip")}</a>
      <header className="top">
        <div className="wrap bar">
          <a className="brand" href="#"><img src="/dongi/neutral.webp" alt="" />{t("brand")}</a>
          <nav className="nav" aria-label={t("nav.main")}>
            {([["#plan", "nav.plan", ""], ["#/places", "nav.places", "places"], ["#/map", "nav.map", "map"], ["#/community", "nav.community", "community"], ["#/my", "nav.my", "my"]] as const).map(([h, k, r]) =>
              <a key={h} href={h} aria-current={route[0] === r || (r === "places" && route[0] === "place") ? "page" : undefined}>{t(k)}</a>)}
          </nav>
          <div className="tools">
            <a className="box cr-btn" href="#/report" aria-label={t("cr.open")} title={t("cr.open")}><Icon name="flag" /><span aria-hidden="true">{t("cr.open")}</span></a>
            <button className="box bigt" aria-pressed={big} onClick={toggleBig}><span className="long">{big ? t("tool.bigOn") : t("tool.big")}</span><span className="short" aria-hidden="true">{big ? t("tool.bigOnShort") : t("tool.bigShort")}</span></button>
            <ProfileButton lang={lang} />
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
      {route[0] === "map" && <MapPage key={route[1] || "-"} lang={lang} initialLayer={route[1]} />}
      {route[0] === "my" && <MyPage lang={lang} />}
      {route[0] === "report" && (
        <section className="sec wrap cr-page">
          <div className="page-head"><nav className="crumb"><a href="#/">{lang === "ko" ? "처음" : "Home"}</a> › {t("cr.open")}</nav>
            <h1>{t("cr.title")}</h1><p className="muted">{t("cr.sub")}</p></div>
          <div className="cr-cols">
            <div className="panel"><ReportForm key={`${route[1] || "-"}:${Object.keys(places).length > 0}`} t={t} lang={lang} placeId={route[1] && places[route[1]] ? route[1] : ""}
              places={Object.values(places).filter((p: any) => p.lat && p.type !== "숙박").map((p: any) => ({ id: p.id, name: lang === "ko" ? p.name_ko : p.name_en || p.name_ko }))
                .sort((a: any, b: any) => a.name.localeCompare(b.name, "ko"))} /></div>
            <MyReports t={t} />
          </div>
        </section>)}
      {route[0] === "events" && <EventsPage lang={lang} onPlanDate={planDate} />}
      {route[0] === "stay" && <StayPage lang={lang} />}
      {route[0] === "guide" && <CommunityPage lang={lang} sub="ask" onUse={(ids) => { setCond((c) => ({ ...c, wish: ids })); location.hash = "#plan"; }} />}
      {route[0] === "admin" && <AdminPage lang={lang} />}
      {route[0] === "login" && <LoginPage lang={lang} />}
      {route[0] === "me" && <ProfilePage lang={lang} wish={cond.wish || []} places={places} onRemoveWish={removeWish} />}
      {route[0] === "community" && <CommunityPage lang={lang} sub={route[1]} onUse={(ids) => { setCond((c) => ({ ...c, wish: ids })); location.hash = "#plan"; }} />}
      {route[0] === "" && <>
      <Hero lang={lang} busy={busy} onAsk={(m) => { toPlan(); if (course) snapshot(); chat(m, !!course); }} />
      <QuickBar lang={lang} />
      {/* 선택과 집중: 첫 화면은 '코스 짜기'가 바로 이어지고, 예시 코스 다음에 나머지 정보가 온다 (기능은 그대로) */}
      <section id="plan" className="sec wrap" aria-labelledby="plan-h">
      <div className="sec-head">
        <h2 id="plan-h">{t("plan.h")}</h2>
        <p>{t("plan.sub")}{(cond.wish || []).length > 0 && !course ? " " + t("plan.wished", { n: (cond.wish || []).length }) : ""}
</p>
      </div>
      <div className={course ? "planner-shell" : undefined}>
      {course && <div ref={barRef} className="planner-bar"><h2 tabIndex={-1}>{lang === "ko" ? "내 여행 코스" : "My itinerary"}</h2>
        <span>{dateLabel(course.date, lang)} · {course.start_time}–{course.back_at} · {course.stops.length}{lang === "ko" ? "곳" : " stops"}</span>
        <button type="button" className="chip planner-tools-toggle" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>{lang === "ko" ? "코스 도구" : "Course tools"}</button>
        <div className="planner-actions" data-open={toolsOpen}>
          <button className="chip" onClick={() => setChatOpen(!chatOpen)} aria-controls="chat-panel" aria-expanded={chatOpen}>{lang === "ko" ? "동이와 대화" : "Chat"}</button>
          <button className="chip sum-btn" onClick={() => setSumOpen(true)}>{t("sum.open")}</button>
          <button className="chip go" onClick={saveMine} aria-live="polite">{saved ? t("my.saved") : t("my.save")}</button>
        </div>
        <div className="pane-switch" role="group" aria-label={lang === "ko" ? "보기" : "View"}>
          <button className="chip" aria-pressed={smallPane === "map"} onClick={() => setSmallPane("map")}>{lang === "ko" ? "경로 지도" : "Map"}</button>
          <button className="chip" aria-pressed={smallPane === "schedule"} onClick={() => setSmallPane("schedule")}>{lang === "ko" ? "일정·설정" : "Itinerary"}</button>
        </div></div>}
      {planning && !course && <PlanningWait lang={lang} />}
      <div hidden={planning && !course} className={`grid${course ? " has-course" : ""}`}>
        {!course && <PlanAside lang={lang} />}
        <section id="chat-panel" className={`panel chat${course ? (chatOpen ? " widget open" : " widget") : ""}`} aria-label={t("nav.plan")}
          onKeyDown={(e) => { if (e.key === "Escape" && course) setChatOpen(false); }}>
          {course && <div className="widget-bar"><b>{lang === "ko" ? "동이와 대화" : "Chat with Dongi"}</b>
            <button className="widget-x" onClick={() => setChatOpen(false)} aria-controls="chat-panel" aria-expanded={true} aria-label={lang === "ko" ? "대화 접기" : "Hide chat"}>×</button></div>}
          {forkOpen ? (
            <div className="fork-stage">
              <p className="fork-hi"><img src="/dongi/wave.webp" alt="" /><span><b>{t("dongi")}</b>{t("plan.greet")}</span></p>
              <h3 className="fork-q">{t("q.kind")}</h3>
              <div className="fork" role="group" aria-label={t("q.kind")}>
                <button className="fork-btn main" onClick={() => chooseKind("easy")}><span className="fork-k"><Icon name="wheel" />{t("kind.easy")}</span><b>{t("kind.easyTitle")}</b><small>{t("kind.easyDesc")}</small></button>
                <button className="fork-btn" onClick={() => chooseKind("free")}><span className="fork-k"><Icon name="route" />{t("kind.free")}</span><b>{t("kind.freeTitle")}</b><small>{t("kind.freeDesc")}</small></button>
              </div>
            </div>) : <>
          <ol className="steps" aria-label={lang === "ko" ? "진행 단계" : "Progress"}>
            {STEPS[lang].map((x, i) => <li key={x} className={i < step ? "done" : i === step ? "cur" : ""} aria-current={i === step ? "step" : undefined}>{x}</li>)}
          </ol>
          {!course && tripLine()}
          {personalize && <details className="cr-suggest" open={suggestOpen} onToggle={(e) => setSuggestOpen((e.target as HTMLDetailsElement).open)}>
            <summary>{lang === "ko" ? "지금 조건에 맞는 후보 미리 보기" : "Preview places for your choices"}</summary>
            {suggestOpen && <TripSuggestions conditions={{ ...previewConditions, day_no: 1 }} places={places} lang={lang} t={t} />}</details>}
          <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label={lang === "ko" ? "동이와 나눈 대화" : "Chat with Dongi"}>
            {log.map((m, i) => m.me
              ? <div key={i} className="me"><span>{m.img && <img className="me-img" src={m.img} alt={lang === "ko" ? "보낸 사진" : "Sent photo"} />}{m.text}</span></div>
              : <div key={i}><Dongi pose={m.pose} name={t("dongi")} face={i === lastDongi}>{m.text}
                  {m.got && m.got.length > 0 && <span className="got"><small>{lang === "ko" ? "이렇게 이해했어요" : "I understood"}</small>{m.got.map((g) => <span key={g} className="chip sm">{g}</span>)}</span>}
                  {m.photo && <PhotoCard p={m.photo} t={t} lang={lang} />}
                  {m.via === "llm" && <span className="via via-llm via-msg">{m.photo ? (lang === "ko" ? "AI가 사진을 봤어요" : "AI read the photo") : (lang === "ko" ? "AI 답변" : "AI reply")}</span>}</Dongi>
                {m.cards?.map((c, k) => <HelpCard key={k} c={c} t={t} onSafety={openSafety} lang={lang} />)}</div>)}
            {busy && <p className="typing" aria-live="polite"><img src="/dongi/think.webp" alt="" />{lang === "ko" ? "동이가 생각하는 중…" : "Dongi is thinking…"}</p>}
          </div>
          <div className="chat-dock">
            <div className="dock-opts">
            {step === 0 && !forkOpen && whenPicker(finishWhen, t("plan.next"))}
            {step > 0 && step < Q.length && (
              <div className="chips big-chips">
                {(q.k === "need" ? needOpts(ans.move) : q.o).map((o) => <button key={o} className="chip" aria-pressed={q.multi ? (ans[q.k] || []).includes(o) : undefined} onClick={() => pick(o)}>{t(`opt.${o}`)}</button>)}
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
                <div className="go-how" role="group" aria-label={lang === "ko" ? "이동 방법" : "How you travel"}>
                  <span className="go-k">{lang === "ko" ? "이동 방법" : "Travel by"}</span>
                  <button className="chip" aria-pressed={cond.start === "자가용"} onClick={() => setCond({ ...cond, start: "자가용" })}>{t("opt.자가용")}</button>
                  <button className="chip" aria-pressed={cond.start !== "자가용"} onClick={() => cond.start === "자가용" && setCond({ ...cond, start: "동해역" })}>{lang === "ko" ? "대중교통·택시" : "Transit / taxi"}</button>
                </div>
                {cond.start !== "자가용" && <div className="go-how" role="group" aria-label={lang === "ko" ? "출발하는 곳" : "Starting point"}>
                  <span className="go-k">{lang === "ko" ? "출발하는 곳" : "Start at"}</span>
                  {(["동해역", "묵호역", "동해종합버스터미널"] as const).map((s) => <button key={s} className="chip" aria-pressed={cond.start === s} onClick={() => setCond({ ...cond, start: s })}>{t(`opt.${s}`)}</button>)}
                </div>}
                <input aria-label={t("plan.memo")} placeholder={t("plan.memoPh")} value={cond.memo} onChange={(e) => setCond({ ...cond, memo: e.target.value })} />
                <button className="chip go" disabled={busy} onClick={make}>{t("plan.make")}</button>
              </div>
            )}
            {step > Q.length && course && !whenOpen && (
              <div className="qc" role="group" aria-label={lang === "ko" ? "빠른 수정" : "Quick edits"}>
                <button className="chip go see" onClick={() => { setChatOpen(false); document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{lang === "ko" ? "만든 코스 보기" : "See course"}</button>
                {kakaoRoute && <button className="chip go see" onClick={openRoute}>{lang === "ko" ? "지도로 경로 보기" : "Route on map"}</button>}
                <button className="chip alt" disabled={busy} onClick={() => remake("other")}>{lang === "ko" ? "다른 곳으로 새로 짜기" : "Try different places"}</button>
                <button className="chip alt" disabled={busy} onClick={() => remake("slow")}>{lang === "ko" ? "더 느긋하게" : "More relaxed"}</button>
                <button className="chip alt" disabled={busy} onClick={() => remake("full")}>{lang === "ko" ? "더 알차게" : "Fit in more"}</button>
                {Object.keys(crowdMap).length > 0 && <button className="chip alt" disabled={busy} onClick={() => remake("quiet")}>{lang === "ko" ? "사람 적은 곳으로" : "Quieter places"}</button>}
                <button className="chip plain more-qc" aria-expanded={qcMore} onClick={() => setQcMore(!qcMore)}>{qcMore ? (lang === "ko" ? "접기 ▴" : "Less ▴") : (lang === "ko" ? "더 고치기 ▾" : "More edits ▾")}</button>
                {qcMore && <>
                <button className="chip" disabled={busy} onClick={() => edit("remove_uphill", null, t("qc.uphill"))}>{t("qc.uphill")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("indoor", null, t("qc.indoor"))}>{t("qc.indoor")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("replace_lunch", null, t("qc.lunch"))}>{t("qc.lunch")}</button>
                <button className="chip" aria-pressed={showNear} onClick={() => { setNearOverride(!showNear); if (!showNear) document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth" }); }}>{showNear ? t("qc.nearOff") : t("qc.near")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("relax", null, t("qc.relax"))}>{t("qc.relax")}</button>
                <button className="chip" disabled={busy} onClick={() => edit("add_cafe", null, t("qc.cafe"))}>{t("qc.cafe")}</button>
                <button className="chip" aria-expanded={whenOpen} onClick={() => setWhenOpen(true)}>{t("qc.when")}</button>
                </>}
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
          </>}
        </section>

        <section className={`panel${course ? " res" : ""}`} aria-live="polite" id="timeline">
          {!course ? null : (
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
              <div className="course-layout" data-pane={smallPane}>
                <div className="res-map">
                  <h3 className="sr-only">{lang === "ko" ? "경로 지도" : "Route map"}</h3>
                  {routePoints.length ? <CourseDirections key={[course.date, course.start_time, cond.start, lang, ...course.stops.map((s) => s.id)].join("|")}
                    points={routePoints} course={course} lang={lang} mode={mapMode} onMode={setMapMode}
                    selectedId={mapStop} onOverview={() => setMapStop(null)} onSelect={selectMapStop} busy={busy} start={cond.start}
                    onStart={(start) => applySettings({ ...cond, start }, true)}
                    onEdit={(action, id) => edit(action, id, t(action === "remove" ? "edit.removeSay" : "edit.replaceSay",
                      { n: course.stops.findIndex((s) => s.id === id) + 1, p: name(id) }))} />
                    : <KakaoMap pins={pins} />}
                </div>
                <section ref={scheduleRef} className="course-schedule" aria-label={lang === "ko" ? "일정 편집" : "Itinerary editor"}>
                  <div className="workspace-tabs">
                    <button className="chip" aria-pressed={!settingsOpen} onClick={() => setSettingsOpen(false)}>{lang === "ko" ? "장소별 일정" : "Stops"}</button>
                    <button className="chip" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(true)}>{lang === "ko" ? "여행 설정" : "Trip settings"}</button>
                  </div>
                  {settingsOpen ? <TripSettings key={JSON.stringify(cond) + dayNo} conditions={{ ...cond, lang }} busy={busy} t={t}
                    onApply={applySettings} onCancel={() => setSettingsOpen(false)} /> : <>
                  <h3 className="sr-only">{lang === "ko" ? "장소별 일정" : "Visit schedule"}</h3>
                  {/* 코스 전체를 한 번에: 장소마다 이동 한 줄 + 짧은 카드 (팀장 요청 2026-11-21, 예전 '이전/다음 장소' 넘김 대신) */}
                  <ol className="tl tl-all">
                    {course.stops.map((s, i) => (
                      <li key={s.id} data-course-stop={s.id} data-selected={s.id === mapStop}>
                        <p className="muted tl-drive">{course.drive_source === "transit" ? legText(course.transit_legs?.[i], s.drive_min) : t(course.drive_source === "kakao" ? "result.kakaoDrive" : "result.estDrive", { m: s.drive_min })}</p>
                        <StopCard s={brief?.why[s.id] ? { ...s, why: brief.why[s.id] } : s} i={i} x={extras[s.id]} at={places[s.id]?.lat ? { lat: places[s.id].lat, lon: places[s.id].lon } : undefined} name={name(s.id)} t={t} lang={lang} wheel={cond.move.includes("휠체어")}
                          onMap={routePoints.length ? () => { selectMapStop(s.id); setSmallPane("map"); } : undefined} showNear={showNear} isNew={fresh.includes(s.id)} busy={busy}
                          onRemove={() => edit("remove", s.id, t("edit.removeSay", { n: i + 1, p: name(s.id) }))}
                          onReplace={() => edit("replace", s.id, t("edit.replaceSay", { n: i + 1, p: name(s.id) }))}
                          crowd={crowdMap[s.id]?.find((c) => c.date === course.date.replaceAll("-", ""))?.rate ?? null}>
                          <details className="tl-more"><summary>{lang === "ko" ? "이야기·걷기길·택시 더 보기" : "Stories, trails, taxis"}</summary>
                            <StopExtra x={extras[s.id]} wheel={cond.move.includes("휠체어")} t={t} /></details></StopCard>
                      </li>
                    ))}
                  </ol>
                  {(() => {
                    const hm = (x: string) => { const [h, m] = x.split(":").map(Number); return h * 60 + m; };
                    const used = hm(course.back_at) - hm(course.start_time || "10:00");
                    const f = (m: number) => lang === "ko" ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${Math.floor(m / 60)}h ${m % 60}m`;
                    return <>
                      {course.back_drive_min != null && <p className="muted tl-drive">{course.drive_source === "transit" ? legText(course.transit_legs?.[course.stops.length], course.back_drive_min) : t("result.kakaoDrive", { m: course.back_drive_min })}</p>}
                      <p className="tl-back"><b>{t("result.back", { s: startName, t: course.back_at })}</b><span className="muted"> · {lang === "ko" ? "총" : "Total"} {f(used)}</span></p>
                    </>;
                  })()}
                  <RouteCosts course={course} lang={lang} />
                  </>}
                </section>
              </div>
              <div className="tl-head">
                <div>
                  <p className="tl-date">{t("tl.head", { d: dateLabel(course.date, lang), w: wdName(course.weekday, lang), s: course.start_time })} · {startName}</p>
                  <p className="muted">{!course.overall ? t("result.noMode") : course.overall === "G" ? t("result.allOk")
                    : t("result.caution", { n: course.stops.filter((s) => s.grade && s.grade !== "G").length })}</p>
                </div>
                <div className="chips">
                  <button className="chip" onClick={startOver} disabled={busy}>{lang === "ko" ? "처음부터 새로 짜기" : "Start over"}</button>
                </div>
              </div>
              {brief && (
                <section className={`brief${briefBusy && brief.by === "rule" ? " pending" : ""}`} aria-label={lang === "ko" ? "동이 브리핑" : "Dongi's briefing"}>
                  <div className="brief-top">
                    <p className="brief-k"><img src="/dongi/happy.webp" alt="" />{lang === "ko" ? "동이 브리핑" : "Dongi's briefing"}
                      {brief.by === "ai" ? <span className="via via-llm">{lang === "ko" ? "AI가 정리했어요" : "Summarized by AI"}</span>
                        : briefBusy ? <span className="via via-rule">{lang === "ko" ? "AI가 정리하는 중…" : "AI is summarizing…"}</span> : null}</p>
                    {/* 실내/바깥 바꾸기: 지금 코스 상태(cond)를 보고 반대쪽 버튼 하나만 (BUG-004) */}
                    {(cond.weather_pref === "실내" || (cond.rain ?? wxOf(course.date)?.rain)) && cond.weather_pref !== "실외"
                      ? <button className="brief-act" disabled={busy} onClick={() => { snapshot(); makeWith({ ...cond, lang, weather_pref: "실외", rain: false }, lang === "ko" ? "바깥 위주로 짜 줘" : "Outdoor please"); }}><Icon name="sun" />{lang === "ko" ? "바깥 위주로 바꾸기" : "Make it outdoor"}</button>
                      : <button className="brief-act" disabled={busy} onClick={() => edit("indoor", null, t("qc.indoor"))}><Icon name="rain" />{lang === "ko" ? "실내로 바꾸기" : "Make it indoor"}</button>}
                  </div>
                  <h3>{brief.headline}</h3>
                  {brief.fits.length > 0 && <ul className="fits">{brief.fits.map((f, i) => <li key={i}><span className="fit-ic"><Icon name={f.icon} /></span>{f.text}</li>)}</ul>}
                  {brief.bring.length > 0 && <p className="bring"><b>{lang === "ko" ? "챙기세요" : "Bring"}</b>{brief.bring.map((b) => <span key={b} className="chip sm">{b}</span>)}</p>}
                </section>)}
              <div className="itinerary-additions">
                <div className="add-row" role="group" aria-label={lang === "ko" ? "코스에 더하기" : "Add to the route"}>
                  <button className="chip" aria-expanded={addOpen === "place"} onClick={() => { setAddOpen(addOpen === "place" ? "" : "place"); setAddQ(""); }}><Icon name="pin" />&nbsp;{lang === "ko" ? "장소 더 넣기" : "Add a place"}</button>
                  {stay ? <span className="chip stay-on"><Icon name="bed" />&nbsp;{stay.name}<button className="stay-x" onClick={() => setStay(null)} aria-label={lang === "ko" ? "숙소 빼기" : "Remove stay"}>×</button></span>
                    : <button className="chip" aria-expanded={addOpen === "stay"} onClick={openStay}><Icon name="bed" />&nbsp;{lang === "ko" ? "내 숙소 넣기" : "Add my stay"}</button>}
                </div>
                {addOpen && (() => {
                  const key = addQ.trim().replace(/\s+/g, "");
                  const inCourse = new Set(course.stops.map((s) => s.id));
                  const cands = addOpen === "place"
                    ? Object.values(places).filter((p: any) => p.lat && p.type !== "숙박" && !inCourse.has(p.id))
                        .filter((p: any) => !key || p.name_ko.replace(/\s+/g, "").includes(key) || fz(p.name_ko, key) >= 0).slice(0, 8)
                    : [...Object.values(places).filter((p: any) => p.type === "숙박" && p.lat).map((p: any) => ({ name: p.name_ko, road: p.address || "", lat: p.lat, lon: p.lon })), ...stays]
                        .filter((r: any, i: number, all: any[]) => all.findIndex((x: any) => x.name.replace(/\s+/g, "") === r.name.replace(/\s+/g, "")) === i)
                        .filter((r: any) => !key || `${r.name}${r.road}`.replace(/\s+/g, "").includes(key) || fz(r.name, key) >= 0).slice(0, 8);
                  return (
                    <div className="add-pane panel">
                      <label><span className="sr-only">{addOpen === "place" ? (lang === "ko" ? "넣을 장소 찾기" : "Find a place") : (lang === "ko" ? "숙소 찾기" : "Find your stay")}</span>
                        <input type="search" autoFocus value={addQ} onChange={(e) => setAddQ(e.target.value)}
                          placeholder={addOpen === "place" ? (lang === "ko" ? "넣을 장소 이름 (예: 논골담길, 카페)" : "Place name") : (lang === "ko" ? "숙소 이름이나 주소 (예: 망상, 호텔)" : "Stay name or address")} /></label>
                      <ul className="add-list">
                        {cands.map((p: any) => addOpen === "place"
                          ? <li key={p.id}><button disabled={busy} onClick={() => { setAddOpen(""); edit("add", p.id, lang === "ko" ? `${p.name_ko} 넣어 줘` : `Add ${p.name_en || p.name_ko}`); }}>
                              <b>{lang === "ko" ? p.name_ko : p.name_en || p.name_ko}</b><small>{t(`opt.${p.type}`) !== `opt.${p.type}` ? t(`opt.${p.type}`) : p.type}</small></button></li>
                          : <li key={p.name + p.road}><button onClick={() => pickStay(p)}><b>{p.name}</b><small>{(p.road || "").replace("강원특별자치도 ", "")}</small></button></li>)}
                        {cands.length === 0 && <li className="muted">{lang === "ko" ? "찾는 곳이 없어요. 이름을 조금 다르게 적어 보세요." : "Nothing found. Try another name."}</li>}
                      </ul>
                      {addOpen === "place" && <p className="muted small">{lang === "ko" ? "고르면 영업시간과 순서를 다시 맞춰서 넣어 드려요." : "We'll fit it in with opening hours and order."}</p>}
                      {addOpen === "stay" && <p className="muted small" role="status">{stayMsg || (lang === "ko" ? "숙소는 코스의 마지막 도착지로 지도와 길찾기에 붙어요. 동해시 숙박 공공데이터예요." : "Your stay becomes the last stop on the map and directions.")}</p>}
                    </div>);
                })()}
                {stay && stayMin != null && <p className="muted">{lang === "ko" ? `마지막 장소에서 숙소까지 차로 약 ${stayMin}분 (추정)` : `Last stop to lodging: about ${stayMin} min by car (estimate)`}</p>}
                {stay && kakaoRoute && <a className="chip" href={kakaoRoute} target="_blank" rel="noreferrer">{lang === "ko" ? "숙소까지 카카오 길찾기" : "Directions to lodging"}</a>}
              </div>
              {course.skipped.length > 0 && (
                <div className="tl-skip"><b>{t("tl.skipped")}</b>
                  <ul>{course.skipped.map((x) => <li key={x.id}>{lang === "ko" ? `${x.name} — ${x.reason}` : `${name(x.id)} — closed or not open at that time`}</li>)}</ul></div>)}
              {course.notes.filter((n) => !course.skipped.some((x) => n.startsWith(x.name))).map((n) => noteText(n, lang)).filter(Boolean).map((n) => <p key={n} className="muted">{n}</p>)}
              {hint?.events?.length ? (
                <div className={`tl-events${hint.onDay ? " on" : ""}`}>
                  <b><Icon name="event" /> {t(hint.onDay ? "tl.eventsDay" : "tl.eventsSoon")}</b>
                  <ul>{hint.events.map((e) => <li key={e.name}>{e.name} · {e.start}{e.end && e.end !== e.start ? `~${e.end}` : ""}{e.venue ? ` · ${e.venue}` : ""}</li>)}</ul>
                </div>) : null}
              {hint?.stay && <p className="muted"><Icon name="bed" /> {t("x.stay", { z: hint.stay.zone_name, n: hint.stay.count })}</p>}
              <ReportBox stops={course.stops.map((s) => ({ id: s.id, name: name(s.id) }))} t={t} />
            </>
          )}
        </section>
      </div>
      </div>

      </section>
      {/* 코스를 만들면 아래 둘러보기 섹션은 접고 결과에 집중 (1번 사진: 추천 코스·동이 안내 띠는 코스 짜기와 겹쳐 뺌) */}
      {!course && <>
        <ZoneTiles lang={lang} />
        <MoreLinks lang={lang} />
      </>}
      </>}
      </main>
      <nav className="tabbar" aria-label={t("nav.main")}>
        {([["#plan", "nav.plan", "", "route"], ["#/places", "nav.places", "places", "pin"], ["#/map", "nav.map", "map", "map"], ["#/community", "nav.community", "community", "story"], ["#/my", "nav.my", "my", "cal"]] as const).map(([h, k, r, ic]) =>
          <a key={h} href={h} aria-current={route[0] === r || (r === "places" && route[0] === "place") ? "page" : undefined}><Icon name={ic} className="tab-ic" />{t(k)}</a>)}
      </nav>
      {/* 동이 메뉴: 서 있는 동이 하나. 마우스를 대거나(포커스) 누르면 메뉴가 펼쳐지고, 밖으로 나가거나 Esc면 접힌다.
          위쪽 메뉴에서 뺀 '교통'은 여기로 옮겼다 (팀장 요청 2026-11-20) */}
      {/* 떠 있는 동이는 이것 하나: 코스가 있으면 맨 위 항목이 '대화로 코스 고치기' (예전 동그란 대화 단추를 합침, 5번 사진) */}
      <nav hidden={!!course && chatOpen} className={`dongi-menu${quickOpen ? " open" : ""}`} aria-label={lang === "ko" ? "동이 메뉴" : "Dongi menu"}
        onMouseEnter={() => { if (quickT.current) clearTimeout(quickT.current); setQuickOpen(true); }}
        onMouseLeave={() => { quickT.current = setTimeout(() => setQuickOpen(false), 400); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setQuickOpen(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setQuickOpen(false); (e.currentTarget.querySelector(".dm-dongi") as HTMLElement)?.focus(); } }}>
        <button className="dm-dongi" aria-expanded={quickOpen} aria-controls="dongi-menu-list" onClick={() => setQuickOpen(true)}>
          <img src="/dongi/full-basic.webp" alt="" /><span className="sr-only">{lang === "ko" ? "동이 메뉴" : "Dongi menu"}</span></button>
        <ul id="dongi-menu-list" className="dm-list" hidden={!quickOpen}>
          <li><button className="dm-sos" onClick={() => { setQuickOpen(false); openSafety(); }}><Icon name="shield" />{t("tool.safety")}</button></li>
          {course ? <li><button className="dm-ai" aria-controls="chat-panel" onClick={() => { setQuickOpen(false); location.hash = "#plan"; setChatOpen(true); }}><Icon name="story" />{lang === "ko" ? "AI 동이와 대화로 코스 고치기" : "Edit the route with AI Dongi"}</button></li>
            : <li><a href="#plan" onClick={() => setQuickOpen(false)}><Icon name="route" />{lang === "ko" ? "AI 동이와 코스 짜기" : "Plan with AI Dongi"}</a></li>}
          <li><a href="#/transport" onClick={() => setQuickOpen(false)}><Icon name="bus" />{lang === "ko" ? "교통" : "Getting around"}</a></li>
          <li><a href="#/map" onClick={() => setQuickOpen(false)}><Icon name="toilet" />{lang === "ko" ? "화장실·편의" : "Toilets"}</a></li>
          <li><a href="#/events" onClick={() => setQuickOpen(false)}><Icon name="event" />{lang === "ko" ? "행사" : "Events"}</a></li>
          <li><button onClick={() => { setQuickOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Icon name="top" />{lang === "ko" ? "맨 위로" : "Top"}</button></li>
        </ul>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.act && <button className="chip go" onClick={() => { toast.act!.fn(); setToast(null); }}>{toast.act.label}</button>}
          <button className="x" aria-label={t("common.close")} onClick={() => setToast(null)}>×</button>
        </div>)}
      {(cond.wish || []).length > 0 && route[0] !== "" && !toast && (
        <a className="cart" href="#plan" onClick={(e) => { e.preventDefault(); goCart(); }}>{lang === "ko" ? `담은 곳 ${(cond.wish || []).length}곳 · 코스 짜기` : `${(cond.wish || []).length} saved · Plan`}</a>)}
      <SiteFooter lang={lang} t={t} />
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
          <p className="sheet-cr"><a className="chip" href="#/report" onClick={() => setSafety(null)}><Icon name="flag" />&nbsp;{t("cr.open")}</a> <small className="muted">{t("cr.sub")}</small></p>
          {safety.help?.length > 0 && <h3>{t("safety.help")}</h3>}
          {safety.help?.map((c: any) => <SheetRow key={c.name} title={[c.name, c.languages?.length ? t("safety.langs", { l: c.languages.join(", ") }) : ""]}
            info={[c.status === "check" ? "" : c.hours || "", km(c.dist_m)]} tel={c.tel} state={c.status === "check" ? "check" : c.status === "open" ? "open" : "closed"} lang={lang} />)}
          {safety.chargers?.length > 0 && <h3>{t("safety.chargers")}</h3>}
          {safety.chargers?.map((c: any) => <SheetRow key={c.name} title={[c.name, c.spot]}
            info={[t("x.chargerWk", { h: c.weekday_hours }), km(c.dist_m)]} tel={c.tel} state={c.open_now ? "open" : "closed"} lang={lang} />)}
          {safety.mobility_center && <>
            <h3>{t("safety.mobility")}</h3>
            <SheetRow title={[safety.mobility_center.name, safety.mobility_center.hours]} info={[safety.mobility_center.app]} tel={safety.mobility_center.tel} />
            <p className="muted">{t("x.mobilityWho")}</p>
          </>}
          {safety.places?.length > 0 && <h3>{lang === "ko" ? "병원·약국" : "Clinics & pharmacies"}</h3>}
          {safety.places.map((p: any) => { const chk = !p.until || /확인|check/i.test(p.until); return <SheetRow key={p.name} title={[p.name, p.kind]} info={[chk ? "" : p.until === "24시간" ? p.until : (lang === "ko" ? `${p.until}까지` : `until ${p.until}`), km(p.dist_m)]} tel={p.tel} state={chk ? "check" : "open"} lang={lang} />; })}
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
    [/ 이 조건으로 관람이 어려워 뺐어요/, () => "Some places you saved can't be reached with these needs, so they were left out."],
    [/^방문 시각에 문을 연 식당을 찾지 못했어요/, () => "No restaurant is open at that time. Try a different start time."],
    [/^점심때까지 시간이 남아 .* 넣었어요/, () => "Added a stop to fill the time before lunch."],
    [/^점심 전까지 .* (\d+)분 더 여유 있게 쉬어요/, (m) => `${m[1]} extra minutes to rest before lunch.`],
  ];
  for (const [re, f] of rules) { const m = n.match(re); if (m) return f(m); }
  return /[가-힣]/.test(n) ? "" : n;
}

// 긴급·도움 창의 한 줄: 이름 · 정보 · 전화(누르면 걸림). 빈 값은 빼고 잇는다
const km = (m?: number) => (m == null ? "" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
// 긴급·도움 목록 한 줄. state가 있으면 '지금 열림/닫힘/확인 필요'를 색 있는 알약으로 먼저 보여 준다 (PASS-018 의견)
function SheetRow({ title, info, tel, state, lang = "ko" }: { title: (string | undefined)[]; info: (string | undefined)[]; tel?: string; state?: "open" | "closed" | "check"; lang?: Lang }) {
  const lbl = state && { open: lang === "ko" ? "지금 열림" : "Open now", closed: lang === "ko" ? "지금 닫힘" : "Closed now", check: lang === "ko" ? "운영시간 확인" : "Check hours" }[state];
  return (
    <div className={`stop sheet-row${state === "closed" ? " is-closed" : ""}`}>
      <span>{lbl && <b className={`st-pill st-${state}`}>{lbl}</b>}{title.filter(Boolean).join(" · ")}</span>
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
  else if (c.kind === "toilets") body = d.map((x: any) => row(x.name, [x.hours, x.road, x.dist_m != null ? `${x.dist_m}m` : ""].filter(Boolean).join(" · ")));
  else if (c.kind === "info_center") body = d.map((x: any) => row(`${x.name}${x.languages.length ? " · " + x.languages.join(", ") : ""}`, `${x.hours || t("safety.check")} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "charger") body = d.map((x: any) => row(`${x.name} · ${x.spot}`, `${t("x.chargerWk", { h: x.weekday_hours })} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "mobility_van") body = <>{row(d.name, `${d.tel} · ${d.hours}`)}<p className="muted">{t("x.mobilityWho")}</p></>;
  else if (c.kind === "city_tour") body = row(`${d.name} · ${d.days}`, `${d.board} ${d.first}~${d.last} · ${d.fare}`);
  else if (c.kind === "events") body = d.map((x: any) => row(x.name, `${x.start}~${x.end} · ${x.venue}`));
  else if (c.kind === "restaurants" && d.items?.[0]?.dist_m != null) body = <>{d.items.map((x: any) => row(`${x.name} · ${x.kind}${x.checked ? (lang === "ko" ? " · 이동약자 정보 있음" : " · access info") : ""}`, `${x.dist_m}m${x.tel ? " · " + x.tel : ""}`))}<p className="muted">{t("card.eats", { n: d.total, r: d.radius / 1000 })}</p></>;
  else if (c.kind === "lodging") body = <>{d.items.map((x: any) => <div key={x.name + x.address}>{row(`${x.name} · ${x.kind}`, x.tel || x.address)}<BookLinks name={x.name} lang={lang} /></div>)}<p className="muted">{t("card.unverified", { n: d.count })}</p></>;
  else if (c.kind === "lodging" || c.kind === "restaurants") body = <>{d.items.map((x: any) => row(`${x.name} · ${x.kind}`, x.tel || x.address))}<p className="muted">{t("card.unverified", { n: d.count })}</p></>;
  else if (c.kind === "parking") body = d.map((x: any) => row(`${x.name} (${x.spaces})`, `${x.fee}${x.disabled_free ? " · " + t("x.parkingFree") : ""} · ${x.dist_m}m`));
  else if (c.kind === "taxi") body = (Array.isArray(d) ? d : [d]).map((x: any) => row(x.name, x.address || ""));
  else if (c.kind === "hospital_pharmacy") body = <button className="sos" onClick={onSafety}>{t("tool.safety")}</button>;
  else if (c.kind === "transit") {
    const ko = lang === "ko";
    body = <>
      <ol className="tz-hops">{d.hops.map((h: any, i: number) => (
        <li key={i} className={`tz-hop ${h.how}`}>
          <span className="tz-path"><b>{h.from}</b> → <b>{h.to}</b> <small className="muted">{h.km}km</small></span>
          <span className="tz-how">{h.how === "walk" ? (ko ? `걸어서 약 ${h.walk_min}분` : `~${h.walk_min} min walk`) : (ko ? `버스·택시 (차로 약 ${h.car_min}분)` : `Bus or taxi (~${h.car_min} min by car)`)}
            {h.bus_2019?.length > 0 && <small className="tz-bus">{ko ? ` · 시내버스 ${h.bus_2019.join("·")}번 (2019년 자료)` : ` · City bus ${h.bus_2019.join(", ")} (2019 data)`}</small>}</span>
          <a className="chip tz-link" href={h.link} target="_blank" rel="noreferrer">{h.how === "walk" ? (ko ? "걷는 길 보기" : "Walking route") : (ko ? "대중교통 길찾기" : "Transit route")}</a>
        </li>))}</ol>
      {d.city_tour && d.city_tour.covers?.length > 0 && <p className="muted small">{ko ? `동해 시티투어 버스가 코스 중 ${d.city_tour.covers.length}곳을 지나요 (${d.city_tour.board} ${d.city_tour.first}~${d.city_tour.last}).` : `The Donghae city tour bus stops at ${d.city_tour.covers.length} of these places.`}</p>}
      {d.taxi && <p className="muted small">{ko ? `택시: ${d.taxi.name} 택시 승차대 (${d.taxi.address})` : `Taxi stand: ${d.taxi.name} (${d.taxi.address})`}</p>}
      {d.van && <p className="muted small">{ko ? `휠체어 차량: ${d.van.name} ${d.van.tel} (이용 대상이 정해져 있어요)` : `Wheelchair van: ${d.van.name} ${d.van.tel} (eligibility applies)`}</p>}
      <p className="muted small">{d.note}</p>
      {d.hops.some((h: any) => h.bus_2019?.length) && <p className="muted small">{ko ? "버스 노선이 바뀌었을 수 있으니 길찾기 링크로 확인해 주세요." : "Bus numbers: Korea Tourism Organization (2019). Routes may have changed; check the route link."}</p>}
    </>;
  }
  return <div className="card-help" style={{ margin: "4px 0 12px 56px" }}>{body}</div>;
}

// 현장 제보: 사진을 올리면 서버가 AI 비전으로 장애물을 찾아 '검수용 제안'을 돌려준다
function ReportBox({ stops, t }: { stops: { id: string; name: string }[]; t: (k: string, v?: Record<string, string | number>) => string }) {
  // 코스 결과 아래 '현장 제보': 불편 알리기 폼과 같은 것 (코스에 든 장소 중에서 고르기, docs/19_CITY_REPORTS.md)
  const [open, setOpen] = useState(false);
  const lang = (typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ko") as "ko" | "en";
  if (!open) return <button className="chip" onClick={() => setOpen(true)}><Icon name="camera" />&nbsp;{t("rep.open")}</button>;
  return (
    <div className="stop cr-inline" style={{ display: "block" }}>
      <b>{t("rep.title")}</b>
      <ReportForm t={t} lang={lang} places={stops} placeId={stops[0]?.id || ""} source="코스 결과" compact />
    </div>
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
