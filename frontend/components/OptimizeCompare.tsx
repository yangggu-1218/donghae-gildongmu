"use client";
// AI 동선 최적화 결과: 기존 일정과 추천 일정을 나란히 비교하고, [이 일정 적용하기]를 눌러야 바뀐다.
// 이동 거리·시간은 실제 길찾기(카카오 자동차·ODsay 대중교통) 값일 때만 '실제'로, 아니면 '추정'으로 표시한다.
// 실제 거리 자료가 없으면 거리 절감 수치를 만들어 보여 주지 않는다.
import { useEffect, useRef } from "react";
import { OptimizeRes, RouteMetric, Stop } from "@/lib/api";

type Props = { opt: OptimizeRes; before: Stop[]; name: (id: string) => string; lang: string; onApply: () => void; onKeep: () => void };

const SRC: Record<string, [string, string]> = {
  kakao: ["카카오 자동차 길찾기 (실제 경로)", "Kakao driving (real route)"],
  transit: ["ODsay 대중교통 길찾기 (실제 경로)", "ODsay transit (real route)"],
  estimate: ["추정값 (실제 길찾기 못 불러옴)", "Estimate (no real route data)"],
};

export function OptimizeCompare({ opt, before, name, lang, onApply, onKeep }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const ko = lang === "ko";
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const real = (m: RouteMetric) => m.source !== "estimate";
  const bothReal = real(opt.before) && real(opt.after) && opt.before.source === opt.after.source;
  const km = (m: number | null) => (m == null ? "-" : `${(m / 1000).toFixed(1)}km`);
  const hm = (m: number) => (ko ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)}시간 ` : ""}${m % 60}분` : `${Math.floor(m / 60)}h ${m % 60}m`);
  const diff = (a: number, b: number, unit: (x: number) => string) => {
    const d = b - a;
    if (!d) return ko ? "같음" : "same";
    return `${d < 0 ? (ko ? "감소 " : "−") : (ko ? "증가 " : "+")}${unit(Math.abs(d))}`;
  };
  const after = opt.result.course.stops;
  const mark = (m: RouteMetric) => (real(m) ? (ko ? "실제" : "real") : (ko ? "추정" : "est."));
  const distRow = bothReal && opt.before.distance_m != null && opt.after.distance_m != null;
  const close = (fn: () => void) => { ref.current?.close(); fn(); };
  return (
    <dialog ref={ref} className="opt-dlg" aria-labelledby="opt-h" onCancel={(e) => { e.preventDefault(); close(onKeep); }}>
      <div className="opt-head">
        <h2 id="opt-h">{ko ? "AI 동선 최적화 결과" : "Route optimization"}</h2>
        <p className="muted small">{opt.reason}</p>
      </div>
      <table className="opt-table">
        <thead><tr><th scope="col"></th><th scope="col">{ko ? "기존 일정" : "Current"}</th><th scope="col">{ko ? "추천 일정" : "Suggested"}</th><th scope="col">{ko ? "차이" : "Change"}</th></tr></thead>
        <tbody>
          {distRow ? <tr><th scope="row">{ko ? "이동 거리 (왕복)" : "Distance (round trip)"}</th><td>{km(opt.before.distance_m)}</td><td>{km(opt.after.distance_m)}</td>
            <td className={opt.after.distance_m! < opt.before.distance_m! ? "good" : ""}>{diff(opt.before.distance_m!, opt.after.distance_m!, (x) => km(x))}</td></tr>
            : <tr><th scope="row">{ko ? "이동 거리" : "Distance"}</th><td colSpan={3} className="muted">{ko ? "실제 경로 거리 자료가 없어 비교하지 않았어요." : "No real distance data, so not compared."}</td></tr>}
          <tr><th scope="row">{ko ? "이동 시간 합계" : "Travel time"}</th><td>{hm(opt.before.move_min)} <small>({mark(opt.before)})</small></td><td>{hm(opt.after.move_min)} <small>({mark(opt.after)})</small></td>
            <td className={opt.after.move_min < opt.before.move_min ? "good" : ""}>{opt.before.source === opt.after.source ? diff(opt.before.move_min, opt.after.move_min, hm) : (ko ? "기준이 달라 비교 안 함" : "different sources")}</td></tr>
          <tr><th scope="row">{ko ? "기다리는 시간" : "Waiting"}</th><td>{hm(opt.before.wait_min)}</td><td>{hm(opt.after.wait_min)}</td><td>{diff(opt.before.wait_min, opt.after.wait_min, hm)}</td></tr>
          <tr><th scope="row">{ko ? "돌아오는 시각" : "Back at"}</th><td>{opt.before.back_at}</td><td>{opt.after.back_at}</td><td>{diff(opt.before.total_min, opt.after.total_min, hm)}</td></tr>
          <tr><th scope="row">{ko ? "운영시간 준수" : "Opening hours"}</th>
            <td className={opt.before.closed.length ? "bad" : ""}>{opt.before.closed.length ? (ko ? `${opt.before.closed.length}곳 안 맞음` : `${opt.before.closed.length} conflict(s)`) : (ko ? "모두 맞음" : "All OK")}</td>
            <td className={opt.after.closed.length ? "bad" : "good"}>{opt.after.closed.length ? (ko ? `${opt.after.closed.length}곳 안 맞음` : `${opt.after.closed.length} conflict(s)`) : (ko ? "모두 맞음" : "All OK")}</td><td></td></tr>
        </tbody>
      </table>
      <p className="muted small">{ko ? "기준: " : "Source: "}{SRC[opt.after.source][ko ? 0 : 1]}{opt.before.source !== opt.after.source ? ` · ${ko ? "기존" : "current"}: ${SRC[opt.before.source][ko ? 0 : 1]}` : ""}</p>

      <div className="opt-cols">
        <section aria-label={ko ? "기존 일정" : "Current"}><h3>{ko ? "기존 일정" : "Current"}</h3>
          <ol>{before.map((s) => <li key={s.id}><span>{s.arrive}</span>{name(s.id)}{opt.before.closed.includes(s.id) && <em className="bad">{ko ? " · 운영 안 함" : " · closed"}</em>}</li>)}</ol></section>
        <section aria-label={ko ? "추천 일정" : "Suggested"}><h3>{ko ? "추천 일정" : "Suggested"}</h3>
          <ol>{after.map((s, i) => {
            const moved = opt.order_before.indexOf(s.id) !== i;
            return <li key={s.id} className={moved ? "moved" : ""}><span>{s.arrive}</span>{name(s.id)}
              {opt.locked.includes(s.id) && <em>{ko ? " · 고정" : " · pinned"}</em>}
              {opt.after.closed.includes(s.id) && <em className="bad">{ko ? " · 운영 안 함" : " · closed"}</em>}</li>;
          })}</ol></section>
      </div>

      <ul className="opt-notes">
        {opt.kept.length > 0 && <li><b>{ko ? "시간 제약으로 순서를 유지한 곳" : "Kept for time limits"}</b> {opt.kept.map(name).join(", ")}</li>}
        {opt.locked.length > 0 && <li><b>{ko ? "직접 고정한 곳" : "Pinned by you"}</b> {opt.locked.map(name).join(", ")}</li>}
        {opt.timed.length > 0 && <li><b>{ko ? "운영시간을 먼저 맞춘 곳" : "Fitted to opening hours"}</b> {opt.timed.map(name).join(", ")}</li>}
        {opt.unknown.length > 0 && <li><b>{ko ? "운영시간 확인 필요" : "Hours unconfirmed"}</b> {opt.unknown.map(name).join(", ")} <small className="muted">{ko ? "— 상시 개방으로 보지 않았어요. 방문 전 전화로 확인하세요." : "— not treated as always open; call ahead."}</small></li>}
        {opt.access.map((a) => <li key={a}><b>{ko ? "접근성" : "Access"}</b> {a}</li>)}
      </ul>
      <p className="muted small">{opt.method}</p>

      <div className="opt-act">
        {opt.changed && <button className="chip go" onClick={() => close(onApply)}>{ko ? "이 일정 적용하기" : "Apply this order"}</button>}
        <button className="chip" onClick={() => close(onKeep)}>{opt.changed ? (ko ? "기존 일정 유지하기" : "Keep current") : (ko ? "닫기" : "Close")}</button>
      </div>
    </dialog>
  );
}
