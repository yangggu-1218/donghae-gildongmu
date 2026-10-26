// FastAPI 서버 호출. next.config.mjs 의 rewrites 덕분에 같은 주소(/api)로 부른다.
export type Grade = "G" | "Y" | "R" | null;
export type Stop = { id: string; arrive: string; drive_min: number; grade: Grade; why: string };
export type Course = { mode: string; stops: Stop[]; overall: Grade; back_at: string; notes: string[] };
export type Conditions = {
  who: string; move: string[]; style: string[]; days: "당일" | "1박 2일";
  start: "동해역" | "묵호역" | "자가용"; memo: string; wish: string[]; lang: "ko" | "en";
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
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
  return res.json();
}

export const api = {
  places: (mode = "none") => fetch(`/api/places?mode=${mode}`).then((r) => j<any[]>(r)),
  course: (c: Conditions) =>
    fetch("/api/course", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })
      .then((r) => j<{ course: Course; rain: boolean; summary: string; extras: Record<string, Extra>; stay: any; move: any; events: any[] }>(r)),
  chat: (message: string, conditions: Conditions, course_ids: string[]) =>
    fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, conditions, course_ids }) })
      .then((r) => j<{ edit: { action: string; reply: string }; course: Course; conditions: Conditions }>(r)),
  safety: (lat: number, lon: number, lang = "ko") => fetch(`/api/safety?lat=${lat}&lon=${lon}&lang=${lang}`).then((r) => j<any>(r)),
  talk: (body: { message: string; history: { me?: boolean; text: string }[]; conditions: Conditions; state: Record<string, boolean>; course_ids: string[] }) =>
    fetch("/api/talk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => j<{ reply: string; pose: string; via: "llm" | "rule"; conditions: Conditions; state: Record<string, boolean>;
        course: Course | null; cards: { kind: string; data: any }[]; extras?: Record<string, Extra> }>(r)),
  place: (id: string, lang = "ko") => fetch(`/api/places/${id}?lang=${lang}`).then((r) => j<any>(r)),
};
