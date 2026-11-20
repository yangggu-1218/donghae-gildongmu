// 사이트 공통 선 아이콘 (24×24, 2px 선, 글자색을 따라감). 기기마다 모양이 다른 이모지 대신 쓴다.
// 모두 팀이 직접 그린 단순 도형이라 라이선스 걱정이 없다. 뜻은 늘 옆 글자로 함께 전한다(아이콘은 aria-hidden).
const P: Record<string, string> = {
  // 메뉴
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a3 3 0 0 1 3-3h3M18 9v6a3 3 0 0 1-3 3h-3",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  bus: "M6 17V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v11M6 17h12M6 11h12M8 17v3M16 17v3M8.5 14h.01M15.5 14h.01",
  map: "M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4ZM9 4v13M15 6.5v13",
  cal: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7ZM4 10h16M8 3v4M16 3v4M8 14h3",
  toilet: "M7 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 21v-6H4l1.5-6h3L10 15H9v6M15 21V9h4v6h-1v6M12 3v18",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3ZM12 8v8M8 12h8",
  top: "M12 19V5M5 12l7-7 7 7",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4",
  down: "M6 9l6 6 6-6",
  // 장소·이동
  phone: "M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  parking: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 17V7h4a3 3 0 0 1 0 6H9",
  charger: "M6 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM21 10.5v3M11.5 9 9.5 12h3l-2 3",
  wheel: "M12 6a1.8 1.8 0 1 0 0-3.6A1.8 1.8 0 0 0 12 6ZM12 8v6h5l2.5 5M12 11h5M9 10.6A5.5 5.5 0 1 0 16.4 18",
  car: "M5 16v-5l2-5h10l2 5v5M5 16h14M5 16v2.5M19 16v2.5M5 11h14M8 13.5h.01M16 13.5h.01",
  taxi: "M5 16v-5l2-5h10l2 5v5M5 16h14M5 16v2.5M19 16v2.5M5 11h14M8 13.5h.01M16 13.5h.01M10 6V3.5h4V6",
  train: "M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2ZM5 10h14M8 21l2-4M16 21l-2-4M8.5 13.5h.01M15.5 13.5h.01",
  walk: "M13.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 21l2-6 3 3v3M8.5 12.5l1.5-5 4.5 1 2 3M10 7.5 6.5 10.5",
  trail: "M3 20 9 9l4 6 3-4 5 9H3Z",
  food: "M7 3v18M5 3v5a2 2 0 0 0 4 0V3M17 21V3c-2 0-3.5 2-3.5 6v4H17",
  bed: "M3 18V6M3 13h18v5M21 18v-2.5M7.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11 13V9h7a3 3 0 0 1 3 3v1",
  ticket: "M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6ZM14.5 6v12",
  event: "M5 21V4M5 4h12l-2.5 4 2.5 4H5",
  park: "M12 21v-5M12 3l5 7H7l5-7ZM8.5 10l-3.5 6h14l-3.5-6",
  story: "M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13",
  signal: "M9 3h6a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM12 21v-3M12 7h.01M12 10.5h.01M12 14h.01",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01",
  warn: "M12 3.5 2.5 20h19L12 3.5ZM12 10v4.5M12 17.5h.01",
  wait: "M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9",
  time: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  closed: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  crowd: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6",
  sea: "M2 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2",
  // 불편 제보 분류
  stairs: "M3 20h5v-4h4v-4h4V8h5M3 20h18",
  crack: "M3 20h18M4 16h16M8 16l2-3-1.5-2L11 8M15 16l-1-2.5 2-2",
  ramp: "M3 19h18L3 10v9ZM7 19v-3",
  lift: "M5 3h14v18H5V3ZM12 3v18M7.5 9.5 9 8l1.5 1.5M13.5 14.5 15 16l1.5-1.5",
  cone: "M10 3h4l5 16H5l5-16ZM7.5 11h9M6.3 15h11.4M3 21h18",
  block: "M3 9h18v6H3V9ZM7 9l-3 6M13 9l-3 6M19 9l-3 6M5 15v5M19 15v5",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  // 날씨
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  part: "M9 2.5v1.5M3.5 4.5l1 1M2 10h1.5M14.5 4.5l-1 1M6.2 11A3.5 3.5 0 0 1 12 7.3M9 20h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 9 12.3 3.9 3.9 0 0 0 9 20Z",
  cloud: "M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18Z",
  fog: "M4 9h16M3 13h18M6 17h12M8 5h8",
  home: "M4 11 12 4l8 7M6 9.5V20h4.5v-5h3v5H18V9.5",
  bookmark: "M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1Z",
  navi: "M20.5 3.5 3.5 10.6l7 2.9 2.9 7 7.1-17Z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z",
  rain: "M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14ZM8 17l-1 3M12 17l-1 3M16 17l-1 3",
  snow: "M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14ZM8 18h.01M12 18h.01M16 18h.01M10 21h.01M14 21h.01",
  storm: "M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14ZM13 15l-2.5 3.5h3L11 22",
};
export type IconName = keyof typeof P;
export const hasIcon = (n?: string | null) => !!n && n in P;

// 안전 표지 느낌의 색 픽토그램 (ISO 7010 표지 모양을 본떠 팀이 직접 그림 — 라이선스 걱정 없음).
//  ok = 초록 원+체크(가능), warn = 노란 삼각형+느낌표(주의), stop = 빨간 원+사선(어려움), ask = 회색 원+물음표(확인 필요),
//  call = 파란 원+전화(가기 전 물어보기), tip = 파란 원+i(도움말)
export type PictoName = "ok" | "warn" | "stop" | "ask" | "call" | "tip";
export function Picto({ name, label, size = 22 }: { name: PictoName; label?: string; size?: number }) {
  const a = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  const s = { width: size, height: size, viewBox: "0 0 24 24", className: `picto picto-${name}`, focusable: false as const, ...a };
  if (name === "warn") return (
    <svg {...s}><path d="M12 2.2 1.3 21h21.4L12 2.2Z" fill="#F7C600" stroke="#1A1A1A" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 8.6v6.2" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="17.9" r="1.35" fill="#1A1A1A" /></svg>);
  if (name === "stop") return (
    <svg {...s}><circle cx="12" cy="12" r="10" fill="#fff" stroke="#C8102E" strokeWidth="3" /><path d="M5.2 5.2l13.6 13.6" stroke="#C8102E" strokeWidth="3" /></svg>);
  if (name === "ok") return (
    <svg {...s}><circle cx="12" cy="12" r="11" fill="#1A7F3C" /><path d="M6.6 12.4l3.6 3.6 7.2-7.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  if (name === "ask") return (
    <svg {...s}><circle cx="12" cy="12" r="11" fill="#6B7A90" /><path d="M9.2 9.2a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.2v.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="17.8" r="1.3" fill="#fff" /></svg>);
  if (name === "call") return (
    <svg {...s}><circle cx="12" cy="12" r="11" fill="#2462B4" /><path d="M8.3 6.5h2l1.2 3-1.5 1a7 7 0 0 0 3.5 3.5l1-1.5 3 1.2v2a1.3 1.3 0 0 1-1.3 1.3A9.6 9.6 0 0 1 7 7.8a1.3 1.3 0 0 1 1.3-1.3Z" fill="#fff" /></svg>);
  return (
    <svg {...s}><circle cx="12" cy="12" r="11" fill="#2462B4" /><circle cx="12" cy="7.2" r="1.5" fill="#fff" /><path d="M12 10.8v6.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>);
}
export const VERDICT_PICTO: Record<string, PictoName> = { G: "ok", Y: "warn", R: "stop", U: "ask" };

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg className={`ic${className ? " " + className : ""}`} viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>
  );
}
