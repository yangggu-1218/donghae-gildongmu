"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Course, Conditions } from "@/lib/api";
import KakaoMap from "./RouteMap";   // 경로선·구간 표시가 있는 코스 전용 지도

type StopPoint = { id: string; lat: number; lon: number; label: string; grade: null };
type Guide = NonNullable<Course["driving_guides"]>[number][number];

type MapMode = "edit" | "official";
type Props = {
  points: StopPoint[]; course: Course; lang: string; mode: MapMode; onMode: (mode: MapMode) => void;
  selectedId: string | null; onOverview: () => void; onSelect: (id: string) => void; busy: boolean; start: Conditions["start"];
  onStart: (start: Conditions["start"]) => void; onEdit: (action: "replace" | "remove", id: string) => void;
};

export function CourseDirections({ points, course, lang, mode, onMode, selectedId, onOverview, onSelect, busy, start, onStart, onEdit }: Props) {
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
    icon: i === 0 ? (ko ? "출발·도착" : "Start/End") : (ko ? "경유" : "Via"),   // 첫 점은 출발역이자 돌아오는 곳
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
    <div className="map-toolbar">{device === "desktop" && <div className="chips" role="group" aria-label={ko ? "지도 모드" : "Map mode"}>
      <button type="button" className="chip" aria-pressed={editMap} onClick={() => onMode("edit")}>{ko ? "일정 편집 지도" : "Edit on map"}</button>
      <button type="button" className="chip" aria-pressed={!editMap} onClick={() => onMode("official")}>{ko ? "카카오 공식 길찾기" : "Official directions"}</button>
    </div>}
    <button type="button" className="chip map-size" aria-pressed={large} onClick={toggleSize}>{large ? (ko ? "원래 크기" : "Restore size") : (ko ? "지도 크게 보기" : "Expand map")}</button></div>
    {editMap && <div className="map-stop-editor">
      <label><span>{ko ? "이동 구간 선택" : "Select route leg"}</span><select value={selected?.id || ""} onChange={e => { setStep(null); if (e.target.value) onSelect(e.target.value); else onOverview(); }}>
        <option value="">{ko ? "전체 경로" : "Entire route"}</option>
        {points.slice(1).map((p,i) => <option key={p.id} value={p.id}>{i + 1}. {points[i].label} → {p.label}{i === points.length - 2 && (ko ? " (복귀)" : " (return)")}</option>)}
      </select></label>
      {selected?.id === "@start" ? <label>{ko ? "출발지 변경" : "Change starting point"}<select disabled={busy} value={start} onChange={e => onStart(e.target.value as Conditions["start"])}>
        {["동해역","묵호역","자가용"].map((s,i) => <option key={s} value={s}>{ko ? s : ["Donghae Station","Mukho Station","Car"][i]}</option>)}</select></label> :
        selected && <div className="chips"><button type="button" className="chip" disabled={busy} onClick={() => onEdit("replace",selected.id)}>{ko ? "다른 곳으로 바꾸기" : "Replace stop"}</button>
          <button type="button" className="chip" disabled={busy} onClick={() => onEdit("remove",selected.id)}>{ko ? "이곳 빼기" : "Remove stop"}</button></div>}
      {selected && <button type="button" className="chip" onClick={() => { setStep(null); onOverview(); }}>{ko ? "전체 경로" : "Entire route"}</button>}
    </div>}
    {!editMap && links.length > 1 && <div className="chips">{links.map((link, i) =>
      <button type="button" className="chip" key={link.url} aria-pressed={active === link}
        onClick={() => setPart(i)}>{i + 1}. {link.label}</button>)}</div>}
    {!editMap && <iframe className="course-route-frame" src={active.url}
      title={ko ? "카카오맵 공식 자동차 길찾기" : "Official Kakao Map driving directions"} allowFullScreen />}
    {editMap && <>
    {selected && <div className="leg-summary" aria-live="polite">
      <span><small>{ko ? "출발" : "From"}</small> {points[leg].label}</span><b aria-hidden="true">→</b>
      <span><small>{returning ? (ko ? "복귀" : "Return") : (ko ? "도착" : "To")}</small> {selected.label}</span>
      {minutes != null && <strong>{ko ? `차로 약 ${minutes}분` : `About ${minutes} min by car`}</strong>}
    </div>}
    <KakaoMap pins={segmentPins} drivingPath={path} guides={visibleGuides} guidePoint={step && visibleGuides?.includes(step) ? step : null} onGuideSelect={setStep} onPick={pin => { if (pin?.id) { setStep(null); onSelect(pin.id); } }} />
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
