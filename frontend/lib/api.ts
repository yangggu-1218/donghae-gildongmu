// FastAPI 서버 호출. next.config.mjs 의 rewrites 덕분에 같은 주소(/api)로 부른다.
export type Grade = "G" | "Y" | "R" | null;
export type VisitWeather = {
  source: "KMA"; issued: string; grid: [number, number];
  hours: { time: string; temp: number; pop: number; sky: number; pty: number }[];
};
export type Stop = {
  id: string; arrive: string; drive_min: number; grade: Grade; why: string;
  depart: string; kind: "sight" | "lunch" | "cafe"; open_state: "open" | "always" | "unknown" | "closed";
  hours_text: string; hours_sample: boolean; wait_min: number; visit_at?: string | null; notice?: string; weather?: VisitWeather;
};
export type Course = {
  start_point?: [number, number] | null;
  driving_guides?: { text: string; lat: number; lon: number }[][];
  driving_path?: [number, number][] | null;
  driving_sections?: [number, number][];
  route_costs?: { distance_m: number | null; toll_won: number | null; taxi_won: number | null; quote_parts: number } | null;
  drive_source?: "kakao" | "transit" | "estimate"; transit_legs?: any[] | null; back_drive_min?: number | null;
  mode: string; stops: Stop[]; overall: Grade; back_at: string; notes: string[];
  date: string; weekday: number; start_time: string; skipped: { id: string; name: string; reason: string }[];
};
// 여행 기간 콤보 상자: 묶음 → [값, 며칠]. 서버 schemas.DAY_OPTS와 같은 값
export const DAY_GROUPS: { ko: string; en: string; opts: [string, number][] }[] = [
  { ko: "짧게", en: "Short", opts: [["당일", 1], ["1박 2일", 2], ["2박 3일", 3]] },
  { ko: "여유 있게", en: "Relaxed", opts: [["3박 4일", 4], ["4박 5일", 5], ["6박 7일", 7]] },
  { ko: "길게 머물기", en: "Long stay", opts: [["13박 14일", 14], ["한 달 살기", 30]] },
];
export const tripDays = (d: string) => DAY_GROUPS.flatMap((g) => g.opts).find(([v]) => v === d)?.[1] || 1;
export type Conditions = {
  who: string; move: string[]; style: string[]; days: string; day_no?: number;
  start: "동해역" | "묵호역" | "동해종합버스터미널" | "자가용"; budget_min?: number | null; toilet_first?: boolean; memo: string; wish: string[]; must?: string[]; rain?: boolean | null; lang: "ko" | "en";
  date?: string | null; start_time?: string; meal?: string[]; exclude?: string[]; cap?: number | null; rest?: boolean | null;
  flat_only?: boolean; lunch?: string | null; skip_lunch?: boolean; weather_pref?: "" | "실내" | "실외";
  order?: string[];   // 사용자가 끌어서 정한 방문 순서 (비어 있으면 엔진이 정한 순서)
};
// 일별 예보 하루 (backend/app/public_apis.py forecast)
export type WxDay = { date: string; code: number; ko: string; en: string; icon: string; pop: number | null; mm: number; tmax: number; tmin: number; wind: number | null; rain: boolean };
export const WX_ICON: Record<string, string> = { sun: "☀️", part: "⛅", cloud: "☁️", fog: "🌫️", rain: "🌧️", snow: "❄️", storm: "⛈️" };
type Near = { name: string; dist_m?: number; tel?: string; hours?: string; open_now?: boolean; spaces?: number; own?: boolean } | null;
export type Nearby = { parking: Near; charger: Near & { spot?: string; weekday_hours?: string }; info_center: Near; medical: Record<"약국" | "의원" | "응급실", Near> };
export type CourseRes = {
  course: Course; rain: boolean; summary: string; conditions: Conditions; extras: Record<string, Extra>; stay: any; move: any;
  events: any[]; events_on_day: boolean; planner?: { by: "ai" | "rule"; model?: string; summary?: string; problems?: string[] }; reply?: string; action?: string; target?: string | null; changed?: boolean;
};

// AI 동선 최적화 결과 (backend/app/main.py /api/optimize)
export type RouteMetric = { move_min: number; distance_m: number | null; source: "kakao" | "transit" | "estimate"; back_at: string; total_min: number; closed: string[]; wait_min: number };
export type OptimizeRes = {
  changed: boolean; reason: string; order_before: string[]; order_after: string[];
  before: RouteMetric; after: RouteMetric; result: CourseRes;
  kept: string[]; locked: string[]; timed: string[]; free: string[]; unknown: string[]; access: string[]; checked: number; method: string;
};

// 공공데이터에서 붙는 장소별 정보 (backend/app/public_data.py)
export type Extra = {
  phone: string; address: string;
  stories: { name: string; kind: string; era: string; intro: string; dist_m: number }[];
  trail_info: { name: string; length_km: number; duration: string; route: string }[];
  info_center: { name: string; tel: string; hours: string; status: string; languages: string[]; dist_m: number } | null;
  parking_near: { name: string; spaces: number; fee: string; disabled_free: boolean; dist_m: number }[];
  taxi: { name: string; spaces: number }[];
  signals: { total: number; countdown: number; audio: number };
  charger: { name: string; spot: string; open_now: boolean; weekday_hours: string; dist_m: number; tel: string } | null;
  park: { name: string; kind: string; dist_m: number }[];
  events_here: { name: string; start: string; end: string; festival?: boolean }[];
  hours: string; closed_days: string; fee: string;
  // 작업1: 어르신·이동약자 상세 + 가까운 시설
  walk_load?: string; wheelchair?: string; entrance_step?: boolean | null; table?: string | null; benches?: boolean | null;
  carer_tip?: string; indoor?: boolean; soft_menu?: boolean | null; parking_easy?: boolean | null; hours_source?: string;
  access_source?: string; sample?: boolean; type?: string; nearby?: Nearby;
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `서버 오류 ${res.status}`;
    try { const b = await res.json(); if (b?.detail) msg = typeof b.detail === "string" ? b.detail : msg; } catch { /* 본문 없음 */ }
    const e: any = new Error(msg); e.status = res.status; throw e;
  }
  return dropFakeTel(await res.json());
}

// 자리만 채운 전화번호(033-000-0000, 000-0000-0000 등)는 걸 수 없으니 화면에 보이지 않게 지운다.
// 예시 데이터와 공공데이터의 빈칸이 이렇게 들어와 있다. 'tel'·'phone' 값만 본다.
export const isFakeTel = (v: unknown) => {
  if (typeof v !== "string") return false;
  const d = v.replace(/\D/g, "");
  return d.length >= 7 && (/^0+$/.test(d) || /^0+$/.test(d.replace(/^0(2|\d{2})/, "")));
};
export function dropFakeTel<T>(x: T): T {
  if (Array.isArray(x)) { x.forEach(dropFakeTel); return x; }
  if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if ((k === "tel" || k === "phone") && isFakeTel(v)) (x as any)[k] = "";
      else if (v && typeof v === "object") dropFakeTel(v);
    }
  }
  return x;
}

// 한 번 열린 화면 동안 바뀌지 않는 자료(장소 목록·붐빔 예측·날씨·편의시설·행사)는 한 번만 받아 같이 쓴다.
// 예전엔 화면 조각마다 따로 받아서 장소 목록을 5번, 붐빔 예측을 3번 내려받았다. 실패하면 다음에 다시 받는다.
const cache = new Map<string, Promise<any>>();
export function getJSON<T = any>(url: string): Promise<T> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => j<T>(r)).catch((e) => { cache.delete(url); throw e; }));
  return cache.get(url)!;
}

export const api = {
  places: (mode = "none") => getJSON<any[]>(`/api/places?mode=${mode}`),
  course: (c: Conditions) =>
    fetch("/api/course", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })
      .then((r) => j<CourseRes>(r)),
  // 작업3: AI 없이 규칙으로 고치기 (버튼·말 모두)
  edit: (body: { conditions: Conditions; course_ids: string[]; text?: string; action?: string; target?: string | null }) =>
    fetch("/api/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => j<CourseRes>(r)),
  // 일정 카드를 끌어서 바꾼 순서 그대로 이동시간·시각을 다시 계산 (장소는 그대로)
  reorder: (conditions: Conditions, order: string[]) =>
    fetch("/api/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conditions, order }) })
      .then((r) => j<CourseRes>(r)),
  // AI 동선 최적화: 지금 장소 그대로, 운영시간을 먼저 지키고 이동이 가장 짧은 순서를 찾아 변경 전후를 함께 돌려준다 (적용은 화면에서)
  optimize: (conditions: Conditions, order: string[], locked: string[]) =>
    fetch("/api/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conditions, order, locked }) })
      .then((r) => j<OptimizeRes>(r)),
  chat: (message: string, conditions: Conditions, course_ids: string[]) =>
    fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, conditions, course_ids }) })
      .then((r) => j<{ edit: { action: string; reply: string }; course: Course; conditions: Conditions }>(r)),
  safety: (lat: number, lon: number, lang = "ko") => fetch(`/api/safety?lat=${lat}&lon=${lon}&lang=${lang}`).then((r) => j<any>(r)),
  talk: (body: { message: string; history: { me?: boolean; text: string }[]; conditions: Conditions; state: Record<string, boolean>; course_ids: string[] }) =>
    fetch("/api/talk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => j<{ reply: string; pose: string; via: "llm" | "rule"; conditions: Conditions; state: Record<string, boolean>;
        course: Course | null; cards: { kind: string; data: any }[]; extras?: Record<string, Extra>;
        stay?: any; move?: any; events?: any[]; events_on_day?: boolean }>(r)),
  place: (id: string, lang = "ko", mode = "wheel") => fetch(`/api/places/${id}?lang=${lang}&mode=${mode}`).then((r) => j<any>(r)),
  get: (path: string, token?: string) => fetch(path, { headers: token ? { "x-admin-token": token } : {} }).then((r) => j<any>(r)),
  form: (path: string, fd: FormData, token?: string) => fetch(path, { method: "POST", headers: token ? { "x-admin-token": token } : {}, body: fd }).then((r) => j<any>(r)),
  post: (path: string, body: any, token?: string) => fetch(path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-admin-token": token } : {}) }, body: JSON.stringify(body) }).then((r) => j<any>(r)),
};
