// 동이 브리핑: 완성된 코스를 '한 줄 요약 · 이렇게 맞췄어요 · 챙기세요 · 장소별 한 구절'로 정리한다.
// 1) 규칙으로 바로 만든다(데모·AI 실패 때도 항상 보임) → 2) 서버 AI(/api/brief)가 같은 근거로 다듬으면 바꿔 끼운다.
import type { Course, Conditions, Extra, WxDay } from "./api";

export type BriefIcon = "rain" | "sun" | "walk" | "wheel" | "crowd" | "food" | "closed" | "time" | "sea";
export type Brief = { by: "ai" | "rule"; headline: string; fits: { icon: BriefIcon; text: string }[]; bring: string[]; why: Record<string, string> };
export const BRIEF_ICON: Record<BriefIcon, string> = { rain: "🌧️", sun: "☀️", walk: "🚶", wheel: "♿", crowd: "👥", food: "🍽️", closed: "🚫", time: "🕒", sea: "🌊" };

type Ev = { course: Course; cond: Conditions; extras: Record<string, Extra>; wx: WxDay | null; crowd: Record<string, number | null>; name: (id: string) => string; lang: string };

const WHO_EN: Record<string, string> = { "혼자": "Solo", "친구와": "With friends", "연인과": "Couple", "연인·친구": "Partner/friends", "가족과": "Family", "아이와": "With kids", "부모님과": "With parents", "단체": "Group" };
const MOVE_EN: Record<string, string> = { "휠체어": "Wheelchair", "유모차": "Stroller", "오래 걷기 어려움": "Limited walking", "계단 어려움": "No stairs" };

// 서버 AI에 보낼 근거 (화면에 이미 있는 사실만)
export function evidence({ course, cond, extras, wx, crowd, name, lang }: Ev) {
  return {
    lang, who: cond.who, move: cond.move, meal: cond.meal || [], style: cond.style, weather_pref: cond.weather_pref || "",
    date: course.date, back_at: course.back_at,
    weather: wx ? { kind: lang === "ko" ? wx.ko : wx.en, pop: wx.pop, mm: wx.mm, tmin: wx.tmin, tmax: wx.tmax, rain: wx.rain } : null,
    stops: course.stops.map((s) => ({ id: s.id, name: name(s.id), kind: s.kind, arrive: s.arrive, grade: s.grade, indoor: !!extras[s.id]?.indoor,
      crowd: crowd[s.id] ?? null, open: s.open_state, hours: s.hours_text, table: extras[s.id]?.table || null, reason: s.why })),
    skipped: course.skipped.map((x) => ({ name: x.name, reason: x.reason })),
  };
}

export function ruleBrief({ course, cond, extras, wx, crowd, name, lang }: Ev): Brief {
  const ko = lang === "ko";
  const st = course.stops, sights = st.filter((s) => s.kind === "sight");
  const fits: Brief["fits"] = [];
  const indoor = st.filter((s) => extras[s.id]?.indoor && s.kind === "sight");
  const pref = cond.weather_pref || "";
  if (wx && (pref === "실내" || (!pref && wx.rain))) fits.push({ icon: "rain", text: indoor.length ? (ko ? `${wx.ko} 예보 → 실내 ${indoor.length}곳 먼저` : `${wx.en} → ${indoor.length} indoor stops first`)
    : (ko ? `${wx.ko} 예보 → 실내 장소가 없어 우산을 챙기세요` : `${wx.en} → no indoor stops, bring an umbrella`) });
  else if (pref === "실외" || (wx && !wx.rain)) fits.push({ icon: "sun", text: wx ? (ko ? `${wx.ko} ${wx.tmin}~${wx.tmax}° → 바깥 위주` : `${wx.en} ${wx.tmin}~${wx.tmax}° → outdoors`) : (ko ? "바깥 위주로 짰어요" : "Outdoors first") });
  const move = cond.move || [];
  if (move.length) {
    const g = st.filter((s) => s.grade === "G").length, y = st.filter((s) => s.grade === "Y").length;
    const icon: BriefIcon = move.includes("휠체어") ? "wheel" : "walk";
    fits.push({ icon, text: ko ? `${move[0]} 기준 → 편함 ${g}곳${y ? ` · 주의 ${y}곳` : ""}` : `${MOVE_EN[move[0]] || move[0]}: ${g} easy${y ? `, ${y} caution` : ""}` });
  }
  const busy = sights.filter((s) => (crowd[s.id] ?? 0) >= 60), quiet = sights.filter((s) => crowd[s.id] != null && (crowd[s.id] as number) < 40);
  if (busy.length) fits.push({ icon: "crowd", text: ko ? `${name(busy[0].id)} 붐빔 예상 → 여유 있게` : `${name(busy[0].id)} busy → allow time` });
  else if (quiet.length) fits.push({ icon: "crowd", text: ko ? `한산한 날 → ${name(quiet[0].id)}` : `Quiet day at ${name(quiet[0].id)}` });
  const lunch = st.find((s) => s.kind === "lunch");
  if (lunch && fits.length < 4) fits.push({ icon: "food", text: ko ? `점심 ${name(lunch.id)}${extras[lunch.id]?.table === "입식" ? " · 의자 테이블" : ""}` : `Lunch: ${name(lunch.id)}` });
  if (course.skipped.length && fits.length < 4) fits.push({ icon: "closed", text: ko ? `${course.skipped[0].name} ${course.skipped[0].reason} → 뺐어요` : `${name(course.skipped[0].id)} skipped (closed then)` });

  const bring: string[] = [];
  if (wx?.rain) bring.push(ko ? "우산" : "Umbrella");
  if (wx && wx.tmin <= 5) bring.push(ko ? "따뜻한 겉옷" : "Warm jacket");
  if (st.some((s) => s.id === "betel" || s.id === "macheonru")) bring.push(ko ? "등산화" : "Hiking shoes");
  if (move.includes("휠체어") && bring.length < 3) bring.push(ko ? "충전기" : "Charger");

  const who = ko ? cond.who : (WHO_EN[cond.who] || cond.who);
  const headline = ko ? `${who} ${st.length}곳, ${course.back_at} 도착` : `${who}: ${st.length} stops, back ${course.back_at}`;
  const why: Record<string, string> = {};
  for (const s of st) if (s.why) why[s.id] = s.why.length > 30 ? s.why.slice(0, 29) + "…" : s.why;
  return { by: "rule", headline, fits: fits.slice(0, 4), bring: bring.slice(0, 3), why };
}
