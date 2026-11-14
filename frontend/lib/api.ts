// FastAPI 서버 호출. next.config.mjs 의 rewrites 덕분에 같은 주소(/api)로 부른다.
export type Grade = "G" | "Y" | "R" | null;
export type Stop = {
  id: string; arrive: string; drive_min: number; grade: Grade; why: string;
  depart: string; kind: "sight" | "lunch" | "cafe"; open_state: "open" | "always" | "unknown";
  hours_text: string; hours_sample: boolean; wait_min: number; notice?: string;
};
export type Course = {
  mode: string; stops: Stop[]; overall: Grade; back_at: string; notes: string[];
  date: string; weekday: number; start_time: string; skipped: { id: string; name: string; reason: string }[];
};
export type Conditions = {
  who: string; move: string[]; style: string[]; days: "당일" | "1박 2일";
  start: "동해역" | "묵호역" | "자가용"; memo: string; wish: string[]; must?: string[]; rain?: boolean | null; lang: "ko" | "en";
  date?: string | null; start_time?: string; meal?: string[]; exclude?: string[]; cap?: number | null; rest?: boolean | null;
  flat_only?: boolean; lunch?: string | null; skip_lunch?: boolean;
};
type Near = { name: string; dist_m?: number; tel?: string; hours?: string; open_now?: boolean; spaces?: number; own?: boolean } | null;
export type Nearby = { parking: Near; charger: Near & { spot?: string; weekday_hours?: string }; info_center: Near; medical: Record<"약국" | "의원" | "응급실", Near> };
export type CourseRes = {
  course: Course; rain: boolean; summary: string; conditions: Conditions; extras: Record<string, Extra>; stay: any; move: any;
  events: any[]; events_on_day: boolean; reply?: string; action?: string; target?: string | null; changed?: boolean;
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
  // 작업1: 어르신·무장애 상세 + 가까운 시설
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
  return res.json();
}

export const api = {
  places: (mode = "none") => fetch(`/api/places?mode=${mode}`).then((r) => j<any[]>(r)),
  course: (c: Conditions) =>
    fetch("/api/course", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })
      .then((r) => j<CourseRes>(r)),
  // 작업3: AI 없이 규칙으로 고치기 (버튼·말 모두)
  edit: (body: { conditions: Conditions; course_ids: string[]; text?: string; action?: string; target?: string | null }) =>
    fetch("/api/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => j<CourseRes>(r)),
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
  post: (path: string, body: any, token?: string) => fetch(path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-admin-token": token } : {}) }, body: JSON.stringify(body) }).then((r) => j<any>(r)),
};
