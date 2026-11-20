"use client";
// 카카오맵 JavaScript API. .env.local 에 NEXT_PUBLIC_KAKAO_JS_KEY 가 없으면 안내 문구만 보여 준다.
// 카카오 개발자 콘솔 > 내 애플리케이션 > 플랫폼 > Web 에 http://localhost:3000 과 배포 주소를 등록해야 지도가 뜬다.
import { useEffect, useRef, useState } from "react";
import { PICTO, pictoSvg } from "@/lib/mapPicto";

declare global { interface Window { kakao: any } }
type Pin = { lat: number; lon: number; label: string; grade: "G" | "Y" | "R" | null; color?: string; icon?: string; picto?: string; sub?: string; addr?: string };
const isEn = () => typeof document !== "undefined" && document.documentElement.lang === "en";
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const kLink = (p: Pin, kind: "map" | "to") => `https://map.kakao.com/link/${kind}/${encodeURIComponent(p.label.replace(/[,/]/g, " "))},${p.lat},${p.lon}`;
// 점을 누르거나 마우스를 올리면 뜨는 정보 카드 (이름·설명·주소·카카오맵 보기·길찾기)
function popHTML(p: Pin) {
  const en = isEn();
  return `<div class="map-pop" role="dialog" aria-label="${esc(p.label)}"><button type="button" class="map-pop-x" aria-label="${en ? "Close" : "닫기"}">×</button>
    <b>${esc(p.label)}</b>${p.sub ? `<span>${esc(p.sub)}</span>` : ""}${p.addr ? `<span>${esc(p.addr)}</span>` : ""}
    <div class="map-pop-go"><a href="${kLink(p, "map")}" target="_blank" rel="noreferrer">${en ? "Open in Kakao Map" : "카카오맵에서 보기"}</a><a class="go" href="${kLink(p, "to")}" target="_blank" rel="noreferrer">${en ? "Directions" : "길찾기"}</a></div></div>`;
}
const COLOR = { G: "#1E8A3C", Y: "#F2B416", R: "#C9302C" } as const;

// dots: 편의시설 지도용. 색 점 + 글자 하나, 누르면 onPick(i)
// zoomOnPick: 점을 누르면 그 주변 약 500m가 보이게 확대 · focus: 바깥(목록)에서 고른 점 · center: 내 위치 등 기준점
// cluster: 멀리 볼 때(레벨 6 이상, 축척 500m~) 가까이 모인 점을 'n곳' 숫자로 묶는다 · start: 처음 보여 줄 가운데·레벨 (없으면 점 전체가 보이게)
// centerLevel·centerKey: center로 옮길 때의 레벨, 같은 곳이어도 다시 옮기기 · me: 내 위치 빨간 점
// 카카오 지도 레벨과 축척 막대: 4=100m, 5=250m, 6=500m, 7=1km, 8=2km, 9=4km, 10=8km
export default function KakaoMap({ pins, overview = false, dots = false, onPick, label, zoomOnPick = false, focus = null, center = null, cluster = false, start = null, centerLevel = 4, centerKey = 0, me = null, onMapClick }: { onMapClick?: (lat: number, lon: number) => void; pins: Pin[]; overview?: boolean; dots?: boolean; onPick?: (i: number) => void; label?: string; zoomOnPick?: boolean; focus?: number | null; center?: [number, number] | null; cluster?: boolean; start?: { lat: number; lon: number; level: number } | null; centerLevel?: number; centerKey?: number; me?: [number, number] | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || (typeof window !== "undefined" ? (window as any).gildongmuKakaoJsKey : "");   // 서버 화면은 /map-config.js 가 키를 준다
  const [failed, setFailed] = useState(false);   // 키가 틀렸거나 도메인이 등록되지 않으면 약도로 대신한다
  // 점을 눌러 부모가 다시 그려져도(같은 점들이면) 지도를 새로 만들지 않는다 → 확대·이동이 풀리지 않음
  const sig = pins.map((p) => `${p.lat},${p.lon},${p.label},${p.color || ""},${p.grade || ""},${p.sub || ""}`).join("|");
  const pinsRef = useRef(pins); pinsRef.current = pins;
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const zoomRef = useRef(zoomOnPick); zoomRef.current = zoomOnPick;
  const apiRef = useRef<{ focus: (i: number) => void; center: (lat: number, lon: number, level: number) => void; me: (p: [number, number] | null) => void } | null>(null);
  const startRef = useRef(start); startRef.current = start;
  const viewRef = useRef<{ c: any; l: number } | null>(null);   // 층을 켜고 끄면 지도를 새로 그려도 보던 자리·확대를 그대로
  const centerRef = useRef<{ c: [number, number]; l: number } | null>(null);
  const meRef = useRef(me); meRef.current = me;
  const clickRef = useRef(onMapClick); clickRef.current = onMapClick;   // 지도에서 콕 찍어 위치 고르기 (불편 제보)

  useEffect(() => {
    const pins = pinsRef.current;
    if (!key || failed || !ref.current || !pins.length) return;
    const draw = () => {
      const { maps } = window.kakao;
      const box = ref.current!;
      box.innerHTML = "";
      const v = viewRef.current, st = startRef.current;
      const map = new maps.Map(box, { center: v ? v.c : st ? new maps.LatLng(st.lat, st.lon) : new maps.LatLng(pins[0].lat, pins[0].lon), level: v ? v.l : st ? st.level : 8 });
      maps.event.addListener(map, "idle", () => { viewRef.current = { c: map.getCenter(), l: map.getLevel() }; });
      if (clickRef.current) maps.event.addListener(map, "click", (e: any) => clickRef.current?.(e.latLng.getLat(), e.latLng.getLng()));
      const bounds = new maps.LatLngBounds();
      // 위로 뜨는 카드, 아래로 뜨는 카드 (카카오 오버레이는 기준점을 나중에 바꿀 수 없어 둘을 둔다)
      const popUp = new maps.CustomOverlay({ map: null, position: map.getCenter(), yAnchor: 1, zIndex: 10, clickable: true });
      const popDown = new maps.CustomOverlay({ map: null, position: map.getCenter(), yAnchor: 0, zIndex: 10, clickable: true });
      const pop = { setMap: (m: any) => { popUp.setMap(m); popDown.setMap(m); } };
      let pinned = false, timer = 0;
      // 정보 카드: 점이 지도 위쪽이면 점 아래로, 아니면 위로. 좌우로 잘리면 지도를 살짝 옮긴다
      const show = (p: Pin, pos: any, keep: boolean) => {
        window.clearTimeout(timer);
        if (pinned && !keep) return;
        const w = document.createElement("div"); w.innerHTML = popHTML(p);
        const el = w.firstElementChild as HTMLElement;
        (el.querySelector(".map-pop-x") as HTMLElement).onclick = (e) => { e.stopPropagation(); pinned = false; pop.setMap(null); };
        el.onmouseenter = () => window.clearTimeout(timer);
        el.onmouseleave = () => hideSoon();
        el.addEventListener("click", (e) => e.stopPropagation());
        const pt = map.getProjection().containerPointFromCoords(pos);
        const below = pt.y < 250;
        el.classList.toggle("below", below);
        pop.setMap(null);
        const o = below ? popDown : popUp;
        o.setContent(el); o.setPosition(pos); o.setMap(map); pinned = keep;
        // 카드가 지도 밖으로 나가면(낮은 지도·가장자리 점) 그만큼 지도를 옮겨 카드 전체가 보이게
        requestAnimationFrame(() => {
          const b = box.getBoundingClientRect(), c = el.getBoundingClientRect(), pad = 8;
          let dx = 0, dy = 0;
          if (c.left < b.left + pad) dx = c.left - b.left - pad; else if (c.right > b.right - pad) dx = c.right - b.right + pad;
          if (c.height > b.height - 2 * pad) dy = c.top - b.top - pad;
          else if (c.bottom > b.bottom - pad) dy = c.bottom - b.bottom + pad; else if (c.top < b.top + pad) dy = c.top - b.top - pad;
          if (dx || dy) map.panBy(Math.round(dx), Math.round(dy));
        });
      };
      const hideSoon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!pinned) pop.setMap(null); }, 350); };
      maps.event.addListener(map, "click", () => { pinned = false; pop.setMap(null); });
      const hook = (el: HTMLElement, p: Pin, pos: any, i: number) => {
        el.onmouseenter = () => show(p, pos, false); el.onmouseleave = hideSoon;
        el.onfocus = () => show(p, pos, false); el.onblur = hideSoon;
        el.onclick = (e) => { e.stopPropagation(); pickRef.current?.(i); zoomTo(p, pos); };
      };
      // 레벨 4 ≈ 화면에 반경 500m 안팎. 이미 더 가까이 보고 있으면 그대로 두고 가운데로만 옮긴다
      const zoomTo = (p: Pin, pos: any) => {
        if (zoomRef.current && map.getLevel() > 4) { map.setLevel(4, { anchor: pos }); map.panTo(pos); window.setTimeout(() => show(p, pos, true), 380); }
        else { if (zoomRef.current) map.panTo(pos); show(p, pos, true); }
      };
      const path = pins.map((p) => new maps.LatLng(p.lat, p.lon));
      const grouped: any[] = [];   // cluster일 때 묶음에 넣을 점들
      pins.forEach((p, i) => {
        const pos = path[i]; bounds.extend(pos);
        const bg = p.color || (p.grade ? COLOR[p.grade] : "#2462B4");
        if (dots) {
          const el = document.createElement("button");
          el.type = "button"; el.setAttribute("aria-label", p.label);
          el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;border:2px solid #fff;font:700 12px sans-serif;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.35);display:grid;place-items:center;padding:0`;
          if (p.picto && PICTO[p.picto]) el.innerHTML = pictoSvg(p.picto, 18); else el.textContent = p.icon || "";
          hook(el, p, pos, i);
          if (cluster) grouped.push(new maps.CustomOverlay({ position: pos, content: el, clickable: true }));
          else new maps.CustomOverlay({ map, position: pos, content: el, clickable: true });
          return;
        }
        if (overview) {   // 갈 수 있는 관광지 전체 보기: 번호·경로 없이 이름만
          new maps.CustomOverlay({ map, position: pos, yAnchor: 1.1, content:
            `<div style="background:#fff;border:2px solid #2462B4;border-radius:999px;padding:2px 8px;font:600 12px sans-serif;color:#12355E;white-space:nowrap">${esc(p.label)}</div>` });
          return;
        }
        const el = document.createElement("button");
        el.type = "button"; el.setAttribute("aria-label", `${p.icon || i + 1}. ${p.label}`);
        el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${bg};color:${p.grade === "Y" ? "#1A2433" : "#fff"};display:grid;place-items:center;font:700 14px sans-serif;border:3px solid #fff;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.35)`;
        el.textContent = p.icon || String(i + 1);
        hook(el, p, pos, i);
        new maps.CustomOverlay({ map, position: pos, content: el, clickable: true });
      });
      if (!overview && !dots) new maps.Polyline({ map, path, strokeWeight: 3, strokeColor: "#566275", strokeStyle: "shortdash" });
      // 멀리 볼 때는 'n곳' 숫자로 묶고, 레벨 5(250m) 이하로 들어가면 하나하나 보인다. 숫자를 누르면 그 곳으로 확대
      if (cluster && grouped.length) {
        const cs = (w: number) => ({ width: `${w}px`, height: `${w}px`, background: "#1F3F6E", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center",
          border: "3px solid #fff", font: `800 ${w > 56 ? 18 : 16}px sans-serif`, boxShadow: "0 2px 6px rgba(0,0,0,.35)", boxSizing: "border-box" });
        const cl = new maps.MarkerClusterer({ map, averageCenter: true, minLevel: 6, gridSize: 64, minClusterSize: 3, disableClickZoom: false,
          calculator: [10, 30], styles: [cs(52), cs(60), cs(68)] });
        cl.setTexts((n: number) => (isEn() ? `${n}` : `${n}곳`));
        cl.addMarkers(grouped);
      }
      if (!viewRef.current && !startRef.current) { if (pins.length > 1) map.setBounds(bounds); else map.setLevel(4); }
      // 내 위치: 빨간 점 (묶음에 넣지 않고 늘 보이게)
      let meO: any = null;
      const placeMe = (p: [number, number] | null) => {
        if (meO) { meO.setMap(null); meO = null; }
        if (!p) return;
        const d = document.createElement("div"); d.className = "me-dot"; d.setAttribute("role", "img"); d.setAttribute("aria-label", isEn() ? "You are here" : "내 위치");
        meO = new maps.CustomOverlay({ map, position: new maps.LatLng(p[0], p[1]), content: d, zIndex: 20 });
      };
      apiRef.current = {
        focus: (i: number) => { const p = pins[i]; if (p) { const z = zoomRef.current; zoomRef.current = true; zoomTo(p, path[i]); zoomRef.current = z; } },
        center: (lat: number, lon: number, level: number) => { map.setLevel(level); map.setCenter(new maps.LatLng(lat, lon)); },
        me: placeMe,
      };
      placeMe(meRef.current);
      if (centerRef.current && !viewRef.current) apiRef.current.center(centerRef.current.c[0], centerRef.current.c[1], centerRef.current.l);
      // 숨겨진 칸(교통 탭 등)에서 만들어진 지도는 크기가 0이라 회색으로 깨진다 → 보이게 되면 다시 그리기
      let wasZero = box.clientWidth === 0;
      const ro = new ResizeObserver(() => {
        if (!box.clientWidth) { wasZero = true; return; }
        map.relayout();
        if (wasZero) { wasZero = false; const s0 = startRef.current; if (s0) { map.setLevel(s0.level); map.setCenter(new maps.LatLng(s0.lat, s0.lon)); } else if (pins.length > 1) map.setBounds(bounds); else map.setCenter(path[0]); }
      });
      ro.observe(box);
      cleanup = () => ro.disconnect();
    };
    let cleanup = () => {};
    const safeDraw = () => { try { draw(); } catch (e) { console.error(e); setFailed(true); } };
    loadKakao().then(safeDraw).catch(() => setFailed(true));
    return () => cleanup();
  }, [key, sig, failed, overview, dots, cluster]);
  useEffect(() => { if (focus != null) apiRef.current?.focus(focus); }, [focus]);
  useEffect(() => {
    if (!center) return;
    centerRef.current = { c: center, l: centerLevel };
    apiRef.current?.center(center[0], center[1], centerLevel);
  }, [center?.[0], center?.[1], centerLevel, centerKey]);
  useEffect(() => { apiRef.current?.me(me); }, [me?.[0], me?.[1]]);

  if (!key || failed || !pins.length) return <Sketch pins={pins} overview={overview} dots={dots} onPick={onPick} />;
  return <div className="map" ref={ref} style={{ display: "block" }} role={dots ? undefined : "img"} aria-label={label || (overview ? "동해 관광지 지도" : "코스 지도. 아래 목록과 같은 내용입니다.")} />;
}

// 카카오 지도 SDK를 한 번만 불러온다 (주소 검색용 services 포함)
let kakaoP: Promise<void> | null = null;
export function loadKakao(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || (typeof window !== "undefined" ? (window as any).gildongmuKakaoJsKey : "");   // 서버 화면은 /map-config.js 가 키를 준다
  if (!key) return Promise.reject(new Error("no key"));
  if (kakaoP) return kakaoP;
  kakaoP = new Promise<void>((res, rej) => {
    const go = () => window.kakao.maps.load(() => res());
    if (window.kakao?.maps) { go(); return; }
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services,clusterer`;
    s.onload = () => (window.kakao?.maps ? go() : rej(new Error("sdk")));
    s.onerror = () => { kakaoP = null; rej(new Error("sdk")); };
    document.head.appendChild(s);
  });
  return kakaoP;
}
// 주소 → 좌표 (카카오 주소 검색). 못 찾으면 null
export async function geocode(addr: string): Promise<{ lat: number; lon: number } | null> {
  try {
    await loadKakao();
    const svc = window.kakao.maps.services;
    if (!svc) return null;
    return await new Promise((res) => new svc.Geocoder().addressSearch(addr.replace(/\s*\(.*\)\s*$/, ""), (r: any[], st: string) =>
      res(st === svc.Status.OK && r[0] ? { lat: +r[0].y, lon: +r[0].x } : null)));
  } catch { return null; }
}

// 지도 키가 없을 때(데모·키 발급 전): 좌표로 그린 코스 약도. 실제 지도는 아니고 순서와 방향만 보여 준다.
function Sketch({ pins, overview = false, dots = false, onPick }: { pins: Pin[]; overview?: boolean; dots?: boolean; onPick?: (i: number) => void }) {
  const en = isEn();   // 언어는 page.tsx가 <html lang>에 적어 둔다
  const [sel, setSel] = useState<number | null>(null);
  const [keep, setKeep] = useState(false);
  const enter = (i: number) => { if (!keep) setSel(i); };
  const leave = () => {};
  const tap = (i: number) => { setSel(i); setKeep(true); onPick?.(i); };
  if (!pins.length) return <div className="map muted">{en ? "Your route will be drawn here once you plan a course." : "코스를 만들면 여기에 경로가 그려져요."}</div>;
  const W = 520, H = 300, P = 40;
  const lats = pins.map((p) => p.lat), lons = pins.map((p) => p.lon);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const span = Math.max(la1 - la0, (lo1 - lo0) * 0.79, 0.01);
  const x = (lo: number) => W / 2 + ((lo - (lo0 + lo1) / 2) * 0.79 / span) * (H - 2 * P);
  const y = (la: number) => H / 2 - ((la - (la0 + la1) / 2) / span) * (H - 2 * P);
  const pts = pins.map((p) => [x(p.lon), y(p.lat)]);
  // 이름표가 겹치면 뒤의 것은 생략 (약도에서만)
  const boxes: [number, number, number][] = [];
  const showLabel = pts.map(([px, py], i) => {
    const w = pins[i].label.length * 13, left = px > W * 0.6 ? px - 20 - w : px + 20;
    if (boxes.some(([bx, by, bw]) => left < bx + bw && bx < left + w && Math.abs(by - py) < 18) ||
        pts.some(([qx, qy], j) => j !== i && qx > left && qx < left + w && Math.abs(qy - py) < 10)) return false;
    boxes.push([left, py, w]); return true;
  });
  return (
    <div className="map" role="img" aria-label={en ? "Route sketch, in the same order as the list below." : "코스 약도. 아래 목록과 같은 순서입니다."} style={{ display: "block", position: "relative" }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("g, .map-pop")) { setSel(null); setKeep(false); } }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <text x={W - 14} y={22} textAnchor="end" fontSize="12" fill="var(--muted)">N ↑ {en ? (dots ? "Facilities sketch" : overview ? "Places sketch" : "Route sketch") : dots ? "편의시설 약도" : overview ? "관광지 약도" : "코스 약도"}</text>
        {!overview && !dots && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="6 6" />}
        {dots && pts.map(([px, py], i) => (
          <g key={i} onClick={() => tap(i)} onMouseEnter={() => enter(i)} onMouseLeave={leave} style={{ cursor: "pointer" }} role="button" aria-label={pins[i].label}>
            <circle cx={px} cy={py} r="10" fill={pins[i].color || "var(--sea)"} stroke="var(--surface)" strokeWidth="2" />
            {pins[i].picto && PICTO[pins[i].picto!] ? <g transform={`translate(${px - 6.5} ${py - 6.5}) scale(${13 / 24})`} fill="#fff" dangerouslySetInnerHTML={{ __html: PICTO[pins[i].picto!] }} />
              : <text x={px} y={py + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{pins[i].icon || ""}</text>}
          </g>))}
        {!dots && pts.map(([px, py], i) => {
          const g = pins[i].grade; const bg = pins[i].color || (g ? `var(--${g === "G" ? "go" : g === "Y" ? "warn-dot" : "stop"})` : "var(--sea)");
          return (
            <g key={i} onClick={overview ? undefined : () => tap(i)} onMouseEnter={overview ? undefined : () => enter(i)} onMouseLeave={overview ? undefined : leave} style={overview ? undefined : { cursor: "pointer" }}>
              <circle cx={px} cy={py} r={overview ? 7 : 15} fill={bg} stroke="var(--surface)" strokeWidth="3" />
              {!overview && <text x={px} y={py + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={g === "Y" ? "#1A2433" : "var(--on-signal)"}>{pins[i].icon || i + 1}</text>}
              {(overview ? showLabel[i] : !pts.slice(0, i).some(([qx, qy]) => Math.hypot(qx - px, qy - py) < 60)) && <text x={px > W * 0.6 ? px - 20 : px + 20} y={py + 5} textAnchor={px > W * 0.6 ? "end" : "start"} fontSize="13" fill="var(--ink)">{pins[i].label}</text>}
            </g>
          );
        })}
      </svg>
      {sel != null && pins[sel] && (
        <div className="map-pop sketch" role="dialog" aria-label={pins[sel].label}>
          <button type="button" className="map-pop-x" aria-label={en ? "Close" : "닫기"} onClick={() => { setSel(null); setKeep(false); }}>×</button>
          <b>{pins[sel].label}</b>{pins[sel].sub && <span>{pins[sel].sub}</span>}{pins[sel].addr && <span>{pins[sel].addr}</span>}
          <div className="map-pop-go"><a href={kLink(pins[sel], "map")} target="_blank" rel="noreferrer">{en ? "Open in Kakao Map" : "카카오맵에서 보기"}</a>
            <a className="go" href={kLink(pins[sel], "to")} target="_blank" rel="noreferrer">{en ? "Directions" : "길찾기"}</a></div>
        </div>)}
    </div>
  );
}

