// 지형 참고 안내 문장 (국토지리정보원 DEM 90m, backend/app/terrain.py).
// 90m 격자 평균이라 짧은 경사로·계단·턱은 보이지 않는다 → 항상 '지형 자료 추정'으로 쓰고, 판정(등급)에는 쓰지 않는다.
export type Terrain = { elev_m: number; rise_m: number; slope_deg: number; kind: "flat" | "gentle" | "hill" };
export type Climb = { up_m: number; down_m: number; dist_m: number; max_deg: number };

export function terrainText(t: Terrain | undefined | null, lang: string): string {
  if (!t || t.elev_m == null) return "";
  const ko = lang === "ko";
  const h = ko ? `해발 약 ${t.elev_m}m` : `about ${t.elev_m} m above sea level`;
  if (t.kind === "hill" && t.rise_m >= 25)
    return ko ? `${h} · 주변 낮은 곳보다 약 ${t.rise_m}m 높은 언덕 위예요. 걸어서 오면 오르막이 있어요.` : `${h}, on a hill about ${t.rise_m} m above the low ground nearby. Expect an uphill walk.`;
  if (t.kind === "hill")
    return ko ? `${h} · 주변 지형이 비탈져요(지형 경사 약 ${Math.round(t.slope_deg)}°).` : `${h}; the surrounding ground slopes (about ${Math.round(t.slope_deg)}°).`;
  if (t.kind === "gentle")
    return ko ? `${h} · 완만한 경사 지형이에요${t.rise_m >= 10 ? `(주변보다 약 ${t.rise_m}m 높음)` : ""}.` : `${h}; gently sloping ground.`;
  return ko ? `${h} · 평평한 지형이에요.` : `${h}; flat ground.`;
}

export const TERRAIN_NOTE = (lang: string) => lang === "ko"
  ? "국토지리정보원 90m 지형 자료로 본 추정이에요. 짧은 경사로·계단·턱은 이 자료에 보이지 않아요."
  : "Estimate from 90 m terrain data (NGII). Short ramps, steps and curbs aren't visible in it.";

// 걷는 구간(내린 정류장 → 장소) 오르막: 5m 미만이면 말하지 않음
export function climbText(c: Climb | undefined | null, lang: string): string {
  if (!c || c.up_m < 5) return "";
  return lang === "ko" ? `걷는 길 오르막 약 ${c.up_m}m` : `uphill walk ~${c.up_m} m`;
}

// 관리자: 언덕 지형인데 현장 답사 구간이 없는 곳
export const needsVisit = (p: any) => p?.terrain?.kind === "hill" && !(p.segments || []).some((s: any) => s.source === "현장 답사" || s.measured);
