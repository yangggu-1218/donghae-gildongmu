// 추천 코스 카드: 코스 이름(규칙 — AI 이름이 오면 바꿔 끼움), 대표 사진, 편의 키워드.
import { PHOTOS } from "@/lib/photos";

type P = { id: string; name_ko: string; type: string; styles?: string[]; facilities?: string[] };
type StopLite = { id: string; kind: string; grade?: string | null };

const has = (p: P, s: string) => (p.styles || []).includes(s);
const CAVE = /동굴/;

export function ruleTitle(stops: StopLite[], places: Record<string, P>, lang: string): string {
  const ps = stops.map((s) => places[s.id]).filter(Boolean);
  const sea = ps.filter((p) => has(p, "바다 보기")).length;
  const nature = ps.filter((p) => has(p, "자연·산책") || has(p, "산·등산")).length;
  const culture = ps.filter((p) => has(p, "역사·문화") || has(p, "체험")).length;
  const cave = ps.filter((p) => CAVE.test(p.name_ko)).length;
  const food = ps.filter((p) => p.type === "식당" || p.type === "카페").length;
  const ko = lang === "ko";
  if (cave && cave >= sea) return ko ? "동굴 속 신비로운 동해 여행" : "Mysterious caves of Donghae";
  if (sea && nature && Math.abs(sea - nature) <= 1) return ko ? "바다와 숲을 잇는 동해 힐링 코스" : "Sea and forest healing course";
  if (sea >= nature && sea >= culture && sea > 0) return food >= 2 ? (ko ? "바다 보고 맛집 가는 여유 코스" : "Sea views and local food") : (ko ? "동해 바다와 함께하는 힐링 코스" : "Healing by the Donghae sea");
  if (nature >= culture && nature > 0) return ko ? "푸른 자연 속 힐링 코스" : "Healing in green nature";
  if (culture > 0) return ko ? "동해 골목·문화 산책 코스" : "Donghae culture walk";
  return ko ? "동해 하루 여유 코스" : "A relaxed day in Donghae";
}

export function repPhoto(stops: StopLite[]): string | null {
  return (stops.find((s) => s.kind === "sight" && PHOTOS[s.id]) || stops.find((s) => PHOTOS[s.id]))?.id || null;
}

export type Keyword = { icon: string; text: string };
export function courseKeywords(stops: StopLite[], places: Record<string, P>, extras: Record<string, any>, move: string[], overall: string | null | undefined, lang: string): Keyword[] {
  const ko = lang === "ko";
  const ps = stops.map((s) => places[s.id]).filter(Boolean);
  const fac = (re: RegExp) => ps.some((p) => (p.facilities || []).some((f) => re.test(f)));
  const out: Keyword[] = [];
  const wheelOk = (move.includes("휠체어") && overall === "G") || (stops.length > 0 && stops.every((s) => extras[s.id]?.wheelchair === "가능"));
  if (wheelOk) out.push({ icon: "wheel", text: ko ? "휠체어 접근 가능" : "Wheelchair OK" });
  if (fac(/장애인 화장실/)) out.push({ icon: "toilet", text: ko ? "장애인 화장실" : "Accessible toilet" });
  if (fac(/주차/) || stops.some((s) => extras[s.id]?.nearby?.parking)) out.push({ icon: "parking", text: ko ? "주차 가능" : "Parking" });
  const flat = stops.filter((s) => extras[s.id]?.walk_load === "평지").length;
  if (out.length < 3 && stops.length && flat * 2 >= stops.length) out.push({ icon: "walk", text: ko ? "평지 위주" : "Mostly flat" });
  if (out.length < 3 && fac(/엘리베이터/)) out.push({ icon: "lift", text: ko ? "엘리베이터" : "Elevator" });
  return out.slice(0, 3);
}
