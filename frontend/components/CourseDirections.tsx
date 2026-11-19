"use client";
import { useEffect, useMemo, useState } from "react";
import type { Course } from "@/lib/api";
import KakaoMap from "./KakaoMap";

type StopPoint = { lat: number; lon: number; label: string; grade: null };
type Guide = NonNullable<Course["driving_guides"]>[number][number];

export function CourseDirections({ points, course, lang }: { points: StopPoint[]; course: Course; lang: string }) {
  const ko = lang === "ko";
  const [step, setStep] = useState<Guide | null>(null);
  const [device, setDevice] = useState<"mobile" | "desktop" | null>(null);
  const [part, setPart] = useState(0);
  const [preview, setPreview] = useState(false);
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
    icon: i === 0 ? (ko ? "도착" : "End") : (ko ? "경유" : "Via"),
  })), [points, ko]);
  const guides = useMemo(() => course.driving_guides?.flat() ?? [], [course.driving_guides]);
  if (!links.length) return null;
  const active = links[part] ?? links[0];
  return <>
    {links.length > 1 && <div className="chips">{links.map((link, i) =>
      <button type="button" className="chip" key={link.url} aria-pressed={active === link}
        onClick={() => setPart(i)}>{i + 1}. {link.label}</button>)}</div>}
    {device === "desktop" && <iframe className="course-route-frame" src={active.url}
      title={ko ? "카카오맵 공식 자동차 길찾기" : "Official Kakao Map driving directions"} allowFullScreen />}
    <a className="chip" href={active.url} target="_blank" rel="noreferrer">
      {ko ? "카카오맵으로 경로 보기" : "Open route in Kakao Map"}</a>
    {device === "mobile" && <button type="button" className="chip" aria-expanded={preview}
      onClick={() => setPreview(!preview)}>{ko ? "코스 지도 미리보기" : "Preview course map"}</button>}
    {device === "mobile" && preview && <>
    <KakaoMap pins={pins} drivingPath={course.driving_path} guides={guides} guidePoint={step} onGuideSelect={setStep} />
    {!!course.driving_guides?.length && <details className="course-guidance">
      <summary>{ko ? "구간별 길안내" : "Driving directions"}</summary>
      {course.driving_guides.map((leg, i) => <details key={i}>
        <summary>{points[i].label} → {points[i + 1].label}</summary>
        <ol start={guides.indexOf(leg[0]) + 1}>{leg.map((g, j) => <li key={j}><button type="button" aria-pressed={step?.lat === g.lat && step.lon === g.lon && step.text === g.text}
          onClick={e => { setStep({ ...g }); e.currentTarget.closest(".res-map")?.querySelector(".map")?.scrollIntoView({ block: "center" }); }}>{g.text}</button></li>)}</ol>
      </details>)}
    </details>}
    </>}
  </>;
}
