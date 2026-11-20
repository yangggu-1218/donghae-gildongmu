"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Course, Conditions } from "@/lib/api";
import KakaoMap from "./RouteMap";   // 경로선·구간 표시가 있는 코스 전용 지도
import { Icon } from "./Icon";

type StopPoint = { id: string; lat: number; lon: number; label: string; grade: null };
type Guide = NonNullable<Course["driving_guides"]>[number][number];

type MapMode = "edit" | "official";
type Props = {
  points: StopPoint[]; course: Course; lang: string; mode: MapMode; onMode: (mode: MapMode) => void;
  selectedId: string | null; onOverview: () => void; onSelect: (id: string) => void; busy: boolean; start: Conditions["start"];
  onStart: (start: Conditions["start"]) => void; onEdit?: (action: "replace" | "remove", id: string) => void;
};

export function CourseDirections({ points, course, lang, mode, onMode, selectedId, onOverview, onSelect, busy, start, onStart }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [large, setLarge] = useState(false);
  useEffect(() => {
    const sync = () => setLarge(document.fullscreenElement === panel.current);
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setLarge(false); };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("keydown", escape); };
  }, []);
  async function toggleSize() {
    if (large) {
      if (document.fullscreenElement === panel.current) await document.exitFullscreen();
      setLarge(false);
    } else {
      setLarge(true);
      try { await panel.current?.requestFullscreen?.(); } catch { /* Embedded browsers use the viewport layout. */ }
    }
  }
  const ko = lang === "ko";
  const [step, setStep] = useState<Guide | null>(null);
  // [현위치]: 브라우저 위치를 한 번 받아 지도에 점을 찍고 가운데로
  const [me, setMe] = useState<{ lat: number; lon: number; t: number } | null>(null);
  const [locMsg, setLocMsg] = useState("");
  function locate() {
    onMode("edit");
    if (!navigator.geolocation) { setLocMsg(ko ? "이 브라우저는 위치를 쓸 수 없어요." : "Location isn't available."); return; }
    setLocMsg(ko ? "현위치 찾는 중…" : "Locating…");
    navigator.geolocation.getCurrentPosition((p) => { setMe({ lat: p.coords.latitude, lon: p.coords.longitude, t: Date.now() }); setLocMsg(""); },
      () => { setLocMsg(ko ? "위치 권한을 허용해 주세요." : "Please allow location access."); window.setTimeout(() => setLocMsg(""), 4000); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  }
  const [device, setDevice] = useState<"mobile" | "desktop" | null>(null);
  const [part, setPart] = useState(0);
  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setDevice(mobile ? "mobile" : "desktop");
  }, []);
  const links = useMemo(() => {
    const routes: { url: string; label: string }[] = [];
    // 카카오맵 바로가기는 출발·도착 외에 경유지 다섯 곳까지 받는다.
    for (let i = 0; i < points.length - 1; i += 6) {
      const group = points.slice(i, i + 7);
      const segment = group.map(p => `${encodeURIComponent(p.label.replace(/[,/]/g, " "))},${p.lat},${p.lon}`).join("/");
      routes.push({ url: `https://map.kakao.com/link/by/car/${segment}`, label: `${group[0].label} → ${group[group.length - 1].label}` });
    }
    return routes;
  }, [points]);
  const pins = useMemo(() => points.slice(0, -1).map((p, i) => ({ ...p,
    icon: i === 0 ? (ko ? "출발" : "Start") : (ko ? "경유" : "Via"),   // 첫 점은 출발역이자 돌아오는 곳 (핀 폭 34px라 두 글자만)
  })), [points, ko]);
  const guides = useMemo(() => course.driving_guides?.flat() ?? [], [course.driving_guides]);
  // 각 구간의 목적지를 일정 선택과 공유한다. 마지막 목적지는 복귀역이다.
  const leg = points.slice(1).findIndex(p => p.id === selectedId);
  const selected = leg >= 0 ? points[leg + 1] : undefined;
  const returning = !!selected && leg === points.length - 2;
  const minutes = returning ? course.back_drive_min : course.stops[leg]?.drive_min;
  const segmentPins = useMemo(() => leg < 0 ? pins : [
    { ...points[leg], endpoint: "from" as const, icon: ko ? "출발" : "From" },
    { ...points[leg + 1], endpoint: "to" as const, icon: returning ? (ko ? "복귀" : "End") : (ko ? "도착" : "To") },
  ], [leg, pins, points, ko, returning]);
  const path = useMemo(() => {
    if (leg < 0) return course.driving_path;
    const range = course.driving_sections?.[leg];
    return range && course.driving_path?.slice(range[0], range[1]);
  }, [leg, course.driving_path, course.driving_sections]);
  const visibleGuides = leg < 0 ? guides : course.driving_guides?.[leg];
  const editMap = device !== "desktop" || mode === "edit";
  if (!links.length) return null;
  const active = links[part] ?? links[0];
  const legUrl = editMap && selected ? "https://map.kakao.com/link/by/car/" + segmentPins.map(p =>
    `${encodeURIComponent(p.label.replace(/[,/]/g, " "))},${p.lat},${p.lon}`).join("/") : null;
  return <div className="route-view" ref={panel} data-large={large}>
    <div className="map-ctl" role="group" aria-label={ko ? "지도" : "Map"}>
      <button type="button" aria-pressed={editMap} onClick={() => { onMode("edit"); setStep(null); onOverview(); }}><Icon name="map" />{ko ? "지도 보기" : "Map"}</button>
      {device === "desktop"
        ? <button type="button" aria-pressed={!editMap} onClick={() => onMode("official")}><Icon name="route" />{ko ? "길찾기" : "Directions"}</button>
        : <a href={active.url} target="_blank" rel="noreferrer"><Icon name="route" />{ko ? "길찾기" : "Directions"}</a>}
    </div>
    <div className="map-ctl-r">
      <button type="button" className="map-round" onClick={locate} aria-label={ko ? "현위치 확인" : "My location"} title={ko ? "현위치" : "My location"}><Icon name="navi" /></button>
      <button type="button" className="map-round" aria-pressed={large} onClick={toggleSize} aria-label={large ? (ko ? "원래 크기" : "Restore size") : (ko ? "지도 크게 보기" : "Expand map")} title={large ? (ko ? "원래 크기" : "Restore size") : (ko ? "지도 크게 보기" : "Expand map")}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {large ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg></button>
    </div>
    {locMsg && <p className="map-msg" role="status">{locMsg}</p>}
    {editMap && selected?.id === "@start" && <div className="map-stop-editor"><label>{ko ? "출발지 변경" : "Change starting point"}<select disabled={busy} value={start} onChange={e => onStart(e.target.value as Conditions["start"])}>
        {["동해역","묵호역","자가용"].map((s,i) => <option key={s} value={s}>{ko ? s : ["Donghae Station","Mukho Station","Car"][i]}</option>)}</select></label></div>}
    {!editMap && links.length > 1 && <div className="chips">{links.map((link, i) =>
      <button type="button" className="chip" key={link.url} aria-pressed={active === link}
        onClick={() => setPart(i)}>{i + 1}. {link.label}</button>)}</div>}
    {!editMap && <iframe className="course-route-frame" src={active.url}
      title={ko ? "카카오맵 공식 자동차 길찾기" : "Official Kakao Map driving directions"} allowFullScreen />}
    {editMap && <>
    {selected && <div className="leg-summary" aria-live="polite">
      <span><small>{ko ? "출발" : "From"}</small> {points[leg].label}</span><b aria-hidden="true">→</b>
      <span><small>{returning ? (ko ? "복귀" : "Return") : (ko ? "도착" : "To")}</small> {selected.label}</span>
      {minutes != null && <strong>{ko ? `차로 ${minutes}분` : `${minutes} min by car`}</strong>}
      <button type="button" className="chip sm" onClick={() => { setStep(null); onOverview(); }}>{ko ? "전체 경로" : "Entire route"}</button>
    </div>}
    <KakaoMap me={me} pins={segmentPins} drivingPath={path} guides={visibleGuides} guidePoint={step && visibleGuides?.includes(step) ? step : null} onGuideSelect={setStep} onPick={pin => { if (pin?.id) { setStep(null); onSelect(pin.id); } }} />
    </>}
    <div className="route-links">
    {editMap && !!course.driving_guides?.length && <details className="course-guidance">
      <summary>{ko ? "구간별 길안내" : "Driving directions"}</summary>
      {course.driving_guides.map((turns, i) => (leg < 0 || leg === i) && points[i + 1] && <details key={i}>
        <summary>{points[i].label} → {points[i + 1].label}</summary>
        <ol start={leg < 0 ? guides.indexOf(turns[0]) + 1 : 1}>{turns.map((g, j) => <li key={j}><button type="button" aria-pressed={step?.lat === g.lat && step.lon === g.lon && step.text === g.text}
          onClick={e => { setStep(g); e.currentTarget.closest(".res-map")?.querySelector(".map")?.scrollIntoView({ block: "center" }); }}>{g.text}</button></li>)}</ol>
      </details>)}
    </details>}
    </div>
  </div>;
}
