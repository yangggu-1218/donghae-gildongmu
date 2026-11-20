"use client";
// 코스 결과 화면 전용 경로 지도 (gangRG님 변경 반영 — 카카오 경로선·구간 표시·길안내 위치). 다른 화면은 KakaoMap.tsx 를 쓴다.
// 카카오맵 JavaScript API. .env.local 에 NEXT_PUBLIC_KAKAO_JS_KEY 가 없으면 안내 문구만 보여 준다.
// 카카오 개발자 콘솔 > 내 애플리케이션 > 플랫폼 > Web 에 http://localhost:3000 과 배포 주소를 등록해야 지도가 뜬다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PICTO, pictoSvg } from "@/lib/mapPicto";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

declare global { interface Window { kakao: any; gildongmuKakaoJsKey?: string } }
type Pin = { endpoint?: "from" | "to"; id?: string; lat: number; lon: number; label: string; grade: "G" | "Y" | "R" | null; color?: string; icon?: string; detail?: string; address?: string };
const COLOR = { G: "#1E8A3C", Y: "#F2B416", R: "#C9302C" } as const;

type Guide = { lat: number; lon: number; text: string };
type XY = { x: number; y: number };
function numberPositions(points: XY[], width: number, height: number, gap = 34, topPadding = 30) {
  const placed: XY[] = [];
  return points.map(p => {
    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) return p;
    const near = placed.filter(q => Math.abs(q.x - p.x) < gap && Math.abs(q.y - p.y) < 34);
    const away = Math.atan2(near.reduce((dy, q) => dy + p.y - q.y, 0), near.reduce((dx, q) => dx + p.x - q.x, 0));
    let best = p;
    search: for (let radius = 0; radius < Math.max(width, height); radius += 12) {
      const steps = radius ? Math.ceil(2 * Math.PI * radius / 12) : 1;
      for (let i = 0; i < steps; i++) {
        const angle = away + 2 * Math.PI * i / steps;
        const x = Math.max(gap / 2, Math.min(width - gap / 2, p.x + radius * Math.cos(angle)));
        const y = Math.max(topPadding, Math.min(height - 16, p.y + radius * Math.sin(angle)));
        if (placed.every(q => Math.abs(q.x - x) >= gap || Math.abs(q.y - y) >= 34)) {
          best = { x, y };
          break search;
        }
      }
    }
    placed.push(best);
    return best;
  });
}

// Group facility markers at the current scale. Zoomed-in markers keep their own popup and list selection.
function groupFacilities(map: any, maps: any, points: any[], markers: any[], name: string) {
  const clusters: any[] = [];
  let lastLevel: number | undefined;
  function draw() {
    const level = map.getLevel();
    if (level === lastLevel) return;
    lastLevel = level;
    for (const cluster of clusters.splice(0)) cluster.setMap(null);
    const groups: { point: XY; ids: number[] }[] = [];
    const projection = map.getProjection();
    points.forEach((pos, i) => {
      const point = projection.containerPointFromCoords(pos);
      const group = level > 3 && groups.find(g => Math.abs(point.x - g.point.x) < 85 && Math.abs(point.y - g.point.y) < 48);
      if (group) group.ids.push(i);
      else groups.push({ point, ids: [i] });
    });
    for (const { ids } of groups) {
      for (const i of ids) markers[i].setMap(ids.length === 1 ? map : null);
      if (ids.length === 1) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "facility-cluster";
      const en = document.documentElement.lang === "en";
      button.textContent = en ? String(ids.length) : ids.length + "곳";
      button.setAttribute("aria-label", en ? "Zoom to " + ids.length + " " + name : name + " " + button.textContent + " 확대");
      const position = points[ids[0]];
      button.onclick = () => {
        map.setLevel(Math.max(3, level - 2));
        map.setCenter(position);
      };
      clusters.push(new maps.CustomOverlay({ map, position, content: button, clickable: true }));
    }
  }
  draw();
  maps.event.addListener(map, "zoom_changed", draw);
  return () => {
    maps.event.removeListener(map, "zoom_changed", draw);
    clusters.forEach(cluster => cluster.setMap(null));
  };
}

// dots: 편의시설 지도용. 색 점 + 글자 하나, 누르면 onPick(i)
export default function KakaoMap({ pins, overview = false, dots = false, facilityType = "", nearestFirst = false, myPosition, onPick, request, listPreview, label, drivingPath, guides, guidePoint, onGuideSelect, courseFocus, me }: {
  pins: Pin[]; overview?: boolean; dots?: boolean; onPick?: (pin: Pin | null) => void;
  facilityType?: string; nearestFirst?: boolean; myPosition?: [number, number] | null;
  request?: { pin: Pin } | null; listPreview?: Pin | null; label?: string;
  drivingPath?: [number, number][] | null;
  courseFocus?: Pin; guides?: Guide[]; guidePoint?: Guide | null; onGuideSelect?: (guide: Guide) => void;
  me?: { lat: number; lon: number; t: number } | null;   // 코스 지도 [현위치]: 내 위치 점을 찍고 가운데로
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || (typeof window !== "undefined" && window.gildongmuKakaoJsKey);
  const [selected, setSelected] = useState<Pin | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const activeButton = useRef<HTMLButtonElement | null>(null);
  const [sdk, setSdk] = useState<{ map: any; overlays: any[] } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [hover, setHover] = useState<Pin | null>(null);
  function preview(pin: Pin | null) {
    clearTimeout(leaveTimer.current);
    if (pin) setHover(pin);
    else leaveTimer.current = setTimeout(() => setHover(null), 220);
  }
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const detail = [hover, listPreview, selected].find(p => p && pins.includes(p));
  const camera = useRef<((pin: Pin) => void) | null>(null);
  const focusRef = useRef(courseFocus);
  focusRef.current = courseFocus;
  const fitRoute = useRef<(() => void) | null>(null);
  const [routeMap, setRouteMap] = useState<any>(null);
  useEffect(() => {
    if (!routeMap || !guidePoint) return;
    const { maps } = window.kakao;
    const position = new maps.LatLng(guidePoint.lat, guidePoint.lon);
    routeMap.setLevel(3);
    routeMap.setCenter(position);
    const label = document.createElement("span");
    label.className = "guide-callout";
    label.textContent = guidePoint.text;
    const marker = new maps.CustomOverlay({ map: routeMap, position, content: label, yAnchor: 1.45, zIndex: 6 });
    return () => marker.setMap(null);
  }, [guidePoint, routeMap]);
  useEffect(() => {
    if (!routeMap || !me) return;
    const { maps } = window.kakao;
    const position = new maps.LatLng(me.lat, me.lon);
    const dot = document.createElement("div");
    dot.className = "me-dot";
    dot.title = document.documentElement.lang === "en" ? "My location" : "현위치";
    const marker = new maps.CustomOverlay({ map: routeMap, position, content: dot, zIndex: 7 });
    routeMap.setCenter(position);
    return () => marker.setMap(null);
  }, [me, routeMap]);
  useEffect(() => {
    if (!routeMap) return;
    if (!courseFocus) { fitRoute.current?.(); return; }
    const point = new window.kakao.maps.LatLng(courseFocus.lat, courseFocus.lon);
    routeMap.setLevel(Math.min(4, routeMap.getLevel()));
    routeMap.setCenter(point);
    const button = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button.course-pin") ?? [])
      .find(b => b.dataset.stop === courseFocus.id);
    button?.setAttribute("aria-pressed", "true");
    return () => button?.setAttribute("aria-pressed", "false");
  }, [courseFocus, routeMap]);
  const pending = useRef<Pin | null>(null);
  const callback = useRef(onPick);
  callback.current = onPick;
  function select(pin: Pin) {
    pending.current = pin;
    camera.current?.(pin);
    setHover(null);
    setSelected(pin);
    callback.current?.(pin);
  }
  function close() {
    clearTimeout(leaveTimer.current);
    pending.current = null;
    activeButton.current?.removeAttribute("aria-pressed");
    setHover(null);
    setSelected(null);
    callback.current?.(null);
  }
  useEffect(() => {
    if (request && pins.includes(request.pin)) {
      select(request.pin);
      frame.current?.focus({ preventScroll: true });
      frame.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [request, pins]);
  const [failed, setFailed] = useState(false);   // 키가 틀렸거나 도메인이 등록되지 않으면 약도로 대신한다

  useEffect(() => {
    if (!key || failed || !ref.current || !pins.length) return;
    const host = ref.current;
    let disposed = false;
    const overlays: any[] = [];
    let removeLayout: (() => void) | undefined;
    const draw = () => {
      const { maps } = window.kakao;
      const map = new maps.Map(host, { center: new maps.LatLng(pins[0].lat, pins[0].lon), level: 8 });
      const bounds = new maps.LatLngBounds();
      const path = pins.map((p) => new maps.LatLng(p.lat, p.lon));
      const courseMap = !dots && !overview;
      pins.forEach((p, i) => {
        const pos = path[i]; bounds.extend(pos);
        const bg = p.color || (p.grade ? COLOR[p.grade] : "#2462B4");
        if (dots) {
          const el = document.createElement("button");
          el.type = "button"; el.className = "facility-pin"; el.setAttribute("aria-label", p.label);
          el.style.background = bg;
          if ((p as any).picto && PICTO[(p as any).picto]) el.innerHTML = pictoSvg((p as any).picto, 16); else el.textContent = p.icon || "";
          const anchor = document.createElement("div");
          anchor.className = "facility-anchor";
          anchor.appendChild(el);
          anchor.onmouseenter = el.onfocus = () => preview(p);
          anchor.onmouseleave = el.onblur = () => preview(null);
          el.onclick = () => select(p);
          overlays.push(new maps.CustomOverlay({ map, position: pos, content: anchor, clickable: true }));
          return;
        }
        if (overview) {   // 갈 수 있는 관광지 전체 보기: 번호·경로 없이 이름만
          new maps.CustomOverlay({ map, position: pos, yAnchor: 1.1, content:
            `<div style="background:#fff;border:2px solid #2462B4;border-radius:999px;padding:2px 8px;font:600 12px sans-serif;color:#12355E;white-space:nowrap">${p.label.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)}</div>` });
          return;
        }
        const anchor = document.createElement("div");
        anchor.className = "route-anchor";
        const badge = document.createElement("button");
        badge.type = "button";
        badge.dataset.stop = p.id || "";
        badge.setAttribute("aria-label", p.endpoint ? p.icon + " · " + p.label : p.label);
        badge.setAttribute("aria-pressed", "false");
        badge.onclick = () => callback.current?.(p);
        badge.className = p.endpoint ? "course-pin leg-" + p.endpoint : i === 0 ? "course-pin station" : "course-pin";
        badge.title = [p.icon, i || "", p.label].filter(Boolean).join(" ");
        const face = document.createElement("span");
        face.className = "course-pin-face";
        face.textContent = p.icon || p.label;
        badge.append(face);
        if (i > 0 && !p.endpoint) {
          const order = document.createElement("sup");
          order.textContent = String(i);
          badge.append(order);
        }
        anchor.append(badge);
        overlays.push(new maps.CustomOverlay({ map, position: pos, content: anchor, clickable: true, zIndex: 4 }));
      });
      const road = !!drivingPath && drivingPath.length > 1 && courseMap;
      if (courseMap) {
        const line = road ? drivingPath.map(([lat, lon]) => new maps.LatLng(lat, lon)) : pins[0].endpoint ? path : [...path, path[0]];
        if (road) line.forEach(pos => bounds.extend(pos));
        if (road) overlays.push(new maps.Polyline({ map, path: line, strokeWeight: 10, strokeColor: "#155ca9", strokeOpacity: 1 }));
        overlays.push(new maps.Polyline({ map, path: line, strokeWeight: road ? 7 : 3, strokeOpacity: 1,
          strokeColor: road ? "#358ff4" : "#566275", strokeStyle: road ? "solid" : "shortdash" }));
        if (road) overlays.push(new maps.Polyline({ map, path: line, strokeWeight: 2,
          strokeColor: "#eaf7ff", strokeOpacity: 0.96, strokeStyle: "dash" }));
      }
      if (courseMap) {
        // 코스 전체: 축척막대 2km(카카오 레벨 8), 출발지를 가운데에 (팀장 요청 2026-11-21). 구간 하나를 고르면 그 구간에 맞춤
        fitRoute.current = pins[0].endpoint ? () => map.setBounds(bounds, 60, 28, 24, 28) : () => { map.setLevel(8); map.setCenter(path[0]); };
        fitRoute.current();
      }
      else if (dots) {
        const downtown = new maps.LatLng(37.5247, 129.1143);
        map.setLevel(nearestFirst ? 4 : 6);
        map.setCenter(myPosition ? new maps.LatLng(...myPosition) : nearestFirst ? path[0] : downtown);
        if (!myPosition && !path.some(point => map.getBounds().contain(point))) map.setCenter(path[0]);
      }
      else if (pins.length > 1) map.setBounds(bounds);
      else map.setLevel(4);
      if (courseMap) {
        const turns = (road ? guides ?? [] : []).map((guide, i) => {
          const position = new maps.LatLng(guide.lat, guide.lon);
          const button = document.createElement("button");
          button.className = "route-guide-number";
          button.type = "button";
          button.textContent = String(i + 1);
          button.title = guide.text;
          button.setAttribute("aria-label", (i + 1) + ". " + guide.text);
          button.onclick = () => onGuideSelect?.(guide);
          overlays.push(new maps.CustomOverlay({ map, position, content: button, clickable: true,
            xAnchor: 0.5, yAnchor: 0.5, zIndex: 2 }));
          return { position, button };
        });
        setRouteMap(map);
        const layout = () => {
          const projection = map.getProjection();
          const points: XY[] = path.map(pos => projection.containerPointFromCoords(pos));
          const visible: XY[] = [];
          for (const { position, button } of turns) {
            const point = projection.containerPointFromCoords(position);
            const underPin = points.some(p => Math.abs(point.x - p.x) < 16 &&
              point.y > p.y - 45 && point.y < p.y - 5);
            const crowded = visible.some(p => Math.hypot(point.x - p.x, point.y - p.y) < 21);
            button.hidden = underPin || crowded;
            if (!button.hidden) visible.push(point);
          }
        };
        layout();
        maps.event.addListener(map, "idle", layout);
        const resize = new ResizeObserver(() => {
          if (!host.clientWidth || !host.clientHeight) return;
          map.relayout();
          const focus = focusRef.current;
          if (focus) map.setCenter(new maps.LatLng(focus.lat, focus.lon));
          else fitRoute.current?.();
          layout();
        });
        resize.observe(host);
        removeLayout = () => { resize.disconnect(); maps.event.removeListener(map, "idle", layout); };
      }
      if (dots) {
        removeLayout = groupFacilities(map, maps, path, overlays, facilityType);
        setSdk({ map, overlays });
        if (myPosition) {
          const dot = document.createElement("div");
          dot.className = "me-dot";
          dot.title = document.documentElement.lang === "en" ? "My location" : "내 위치";
          overlays.push(new maps.CustomOverlay({ map, position: new maps.LatLng(...myPosition), content: dot, zIndex: 3 }));
        }
        camera.current = pin => {
          const i = pins.indexOf(pin);
          if (i < 0) return;
          activeButton.current?.removeAttribute("aria-pressed");
          activeButton.current = overlays[i].getContent().querySelector("button");
          activeButton.current?.setAttribute("aria-pressed", "true");
          map.setLevel(Math.min(map.getLevel(), 3));
          map.setCenter(path[i]);
        };
        if (pending.current) camera.current(pending.current);
      }
    };
    const safeDraw = () => { if (!disposed) { try { draw(); } catch (e) { console.error(e); setFailed(true); } } };
    function fail() { if (!disposed) setFailed(true); }
    loadKakao().then(safeDraw).catch(fail);
    return () => {
      disposed = true;
      camera.current = null;
      if (!dots && !overview) { setRouteMap(null); fitRoute.current = null; }
      activeButton.current = null;
      if (dots) setSdk(null);
      removeLayout?.();
      overlays.forEach(overlay => overlay.setMap(null));
      host.replaceChildren();
    };
  }, [key, pins, failed, overview, dots, facilityType, nearestFirst, myPosition, drivingPath, guides, onGuideSelect]);

  const mapView = !key || failed || !pins.length
    ? <Sketch pins={pins} overview={overview} dots={dots} onPick={i => select(pins[i])} onHover={preview} selected={courseFocus || selected} />
    : <div className="map" ref={ref} style={{ display: "block" }} role={dots || guides ? "group" : "img"} aria-label={label || (overview ? "동해 관광지 지도" : "코스 지도. 아래 목록과 같은 내용입니다.")} />;
  if (!dots) {
    if (overview || !pins.length) return mapView;
    const en = typeof document !== "undefined" && document.documentElement.lang === "en";
    return <>{mapView}<small className="route-caption">{key && !failed && drivingPath && drivingPath.length > 1
      ? (en ? "Kakao driving route" : "카카오 자동차 경로")
      : null}</small></>;
  }
  const index = detail ? pins.indexOf(detail) : -1;
  const overlay = sdk?.overlays[index];
  const anchor = overlay?.getContent() || frame.current?.querySelector(`g[data-pin-index="${index}"]`);
  return <div className="facility-map" ref={frame} tabIndex={-1} onKeyDown={e => { if (e.key === "Escape") close(); }}>
    {mapView}
    {detail && anchor && frame.current && <FacilityBubble pin={detail} anchor={anchor} frame={frame.current}
      map={sdk?.map} overlay={overlay} onClose={close} onPreview={preview} />}
  </div>;
}

function FacilityBubble({ pin, anchor, frame, map, overlay, onClose, onPreview }: {
  pin: Pin; anchor: Element; frame: HTMLElement; map?: any; overlay?: any;
  onClose: () => void; onPreview: (pin: Pin | null) => void;
}) {
  const bubble = useRef<HTMLElement>(null);
  const en = document.documentElement.lang === "en";
  const destination = `${encodeURIComponent(pin.label)},${pin.lat},${pin.lon}`;
  // 실제 지도에서는 마커의 CustomOverlay 안에 넣어 드래그·확대 중에도 같은 좌표를 따라간다.
  const parent = overlay ? anchor : frame;
  useLayoutEffect(() => {
    const node = bubble.current;
    if (!node) return;
    function place() {
      if (!node) return;
      const bounds = frame.getBoundingClientRect();
      const marker = anchor.getBoundingClientRect();
      const origin = parent.getBoundingClientRect();
      const x = marker.left + marker.width / 2;
      const roomAbove = marker.top - bounds.top;
      const roomBelow = bounds.bottom - marker.bottom;
      const width = Math.min(340, bounds.width - 16);
      node.style.width = `${width}px`;
      const left = Math.max(bounds.left + 8, Math.min(x - width / 2, bounds.right - 8 - width));
      const above = roomAbove >= node.offsetHeight + 20 || roomAbove >= roomBelow;
      const top = above ? marker.top - node.offsetHeight - 10 : marker.bottom + 10;
      node.style.left = `${left - origin.left}px`;
      node.style.top = `${top - origin.top}px`;
      node.style.setProperty("--tip", `${Math.max(6, Math.min(width - 6, x - left))}px`);
      node.dataset.side = above ? "above" : "below";
    }
    overlay?.setZIndex(10);
    place();
    const resize = new ResizeObserver(place);
    resize.observe(frame);
    resize.observe(node);
    if (map) window.kakao.maps.event.addListener(map, "idle", place);
    return () => {
      resize.disconnect();
      overlay?.setZIndex(0);
      if (map) window.kakao.maps.event.removeListener(map, "idle", place);
    };
  }, [anchor, parent, frame, map, overlay, pin]);
  return createPortal(<section className="facility-info" ref={bubble} role="region" aria-label={pin.label}
    onMouseEnter={() => onPreview(pin)} onMouseLeave={() => onPreview(null)}
    onFocus={() => onPreview(pin)} onBlur={() => onPreview(null)}>
    <strong>{pin.label}</strong>
    <button className="facility-close" type="button" onClick={onClose} aria-label={en ? "Close facility details" : "시설 정보 닫기"}>×</button>
    {pin.detail && <p className="facility-meta">{pin.detail}</p>}
    {pin.address && <p>{pin.address}</p>}
    <div className="facility-actions">
      <a href={`https://map.kakao.com/link/map/${destination}`} target="_blank" rel="noreferrer">{en ? "Kakao Map" : "카카오맵에서 보기"}</a>
      <a href={`https://map.kakao.com/link/to/${destination}`} target="_blank" rel="noreferrer"><Icon name="route" />{en ? "Directions" : "길찾기"}</a>
    </div>
  </section>, parent);
}

// 카카오 지도 SDK를 한 번만 불러온다 (주소 검색용 services 포함)
let kakaoP: Promise<void> | null = null;
export function loadKakao(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || (typeof window !== "undefined" && window.gildongmuKakaoJsKey);
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
function Sketch({ pins, overview = false, dots = false, onPick, onHover, selected }: { pins: Pin[]; overview?: boolean; dots?: boolean; onPick?: (i: number) => void; onHover: (pin: Pin | null) => void; selected: Pin | null }) {
  const en = typeof document !== "undefined" && document.documentElement.lang === "en";   // 언어는 page.tsx가 <html lang>에 적어 둔다
  if (!pins.length) return <div className="map muted">{dots ? (en ? "No facilities to display." : "표시할 시설이 없어요.") : en ? "Your route will be drawn here once you plan a course." : "코스를 만들면 여기에 경로가 그려져요."}</div>;
  const W = 520, H = 300, P = 40;
  const lats = pins.map((p) => p.lat), lons = pins.map((p) => p.lon);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const span = Math.max(la1 - la0, (lo1 - lo0) * 0.79, 0.01);
  const x = (lo: number) => W / 2 + ((lo - (lo0 + lo1) / 2) * 0.79 / span) * (H - 2 * P);
  const y = (la: number) => H / 2 - ((la - (la0 + la1) / 2) / span) * (H - 2 * P);
  const pts = pins.map((p) => [x(p.lon), y(p.lat)]);
  const numbers = !dots && !overview ? numberPositions(pts.map(([x, y]) => ({ x, y })), W, H, 78) : [];
  const center = dots && selected ? pts[pins.indexOf(selected)] : null;
  // 이름표가 겹치면 뒤의 것은 생략 (약도에서만)
  const boxes: [number, number, number][] = [];
  const showLabel = pts.map(([px, py], i) => {
    const w = pins[i].label.length * 13, left = px > W * 0.6 ? px - 20 - w : px + 20;
    if (boxes.some(([bx, by, bw]) => left < bx + bw && bx < left + w && Math.abs(by - py) < 18) ||
        pts.some(([qx, qy], j) => j !== i && qx > left && qx < left + w && Math.abs(qy - py) < 10)) return false;
    boxes.push([left, py, w]); return true;
  });
  return (
    <div className="map" role={overview ? "img" : "group"} aria-label={dots ? (en ? "Facilities sketch" : "편의시설 약도") : en ? "Route sketch, in the same order as the list below." : "코스 약도. 아래 목록과 같은 순서입니다."} style={{ display: "block", position: "relative" }}>
      <svg viewBox={center ? `${center[0]-W/2} ${center[1]-H/2} ${W} ${H}` : `0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <text x={W - 14} y={22} textAnchor="end" fontSize="12" fill="var(--muted)">N ↑ {en ? (dots ? "Facilities sketch" : overview ? "Places sketch" : "Route sketch") : dots ? "편의시설 약도" : overview ? "관광지 약도" : "코스 약도"}</text>
        {!overview && !dots && <polyline points={[...pts, pts[0]].map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="6 6" />}
        {dots && pts.map(([px, py], i) => (
          <g key={i} data-pin-index={i} onClick={() => onPick?.(i)} onMouseEnter={() => onHover(pins[i])} onFocus={() => onHover(pins[i])}
            onMouseLeave={() => onHover(null)} onBlur={() => onHover(null)} tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(i); } }}
            style={{ cursor: "pointer" }} role="button" aria-label={pins[i].label}>
            <circle cx={px} cy={py} r="9" fill={pins[i].color || "var(--sea)"} stroke="var(--surface)" strokeWidth="2" />
            <text x={px} y={py + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{pins[i].icon || ""}</text>
          </g>))}
        {!dots && pts.map(([px, py], i) => {
          const g = pins[i].grade; const bg = g ? `var(--${g === "G" ? "go" : g === "Y" ? "warn-dot" : "stop"})` : "var(--sea)";
          return (
            <g key={i} role={overview ? undefined : "button"} aria-label={overview ? undefined : pins[i].label}
              aria-pressed={overview ? undefined : selected === pins[i]} tabIndex={overview ? undefined : 0}
              onClick={overview ? undefined : () => onPick?.(i)}
              onKeyDown={e => { if (!overview && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick?.(i); } }}>
              {!overview && <line x1={px} y1={py} x2={numbers[i].x} y2={numbers[i].y} stroke="var(--muted)" strokeWidth="2" />}
              {overview ? <circle cx={px} cy={py} r="7" fill={bg} stroke="var(--surface)" strokeWidth="3" /> :
                <g><title>{pins[i].label}</title><rect x={numbers[i].x - 36} y={numbers[i].y - 22} width="72" height="23" rx="5" fill={pins[i].endpoint === "from" ? "#197342" : pins[i].endpoint === "to" || i === 0 ? "#ad3427" : "#1169bd"} />
                  <text x={numbers[i].x} y={numbers[i].y - 6} textAnchor="middle" fontSize="12" fill="white">{pins[i].icon}{i > 0 && !pins[i].endpoint && ` ${i}`}</text></g>}
              {overview && showLabel[i] && <text x={px > W * 0.6 ? px - 20 : px + 20} y={py + 5} textAnchor={px > W * 0.6 ? "end" : "start"} fontSize="13" fill="var(--ink)">{pins[i].label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
