"use client";
// 작업2·3·4: 시간표 카드(영업 중 배지·보행 난이도·입식 테이블·가까운 주차·충전기·약국), 빠른 수정 버튼, 큰 글씨 요약 일정표.
import { Course, Conditions, Extra, Stop } from "@/lib/api";
import { PlacePhoto } from "@/components/Sections";

type T = (k: string, v?: Record<string, string | number>) => string;
const WD_KO = "일월화수목금토";
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WALK_CLS: Record<string, string> = { "평지": "flat", "완만한경사": "gentle", "급경사": "steep" };

export const wdName = (w: number, lang: string) => (lang === "ko" ? WD_KO[w] : WD_EN[w]);
export const dateLabel = (d: string, lang: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return lang === "ko" ? `${m}월 ${dd}일` : new Date(y, m - 1, dd).toLocaleDateString("en", { month: "short", day: "numeric" });
};
const dist = (m: number | undefined, t: T) => (m == null ? "" : m >= 1000 ? t("tl.km", { k: Math.round(m / 100) / 10 }) : t("tl.m", { m: Math.round(m) }));

// ---------- 방문 시각 영업 배지 ----------
export function OpenBadge({ s, t }: { s: Stop; t: T }) {
  if (s.open_state === "always") return <span className="badge b-open">{t("tl.always")}</span>;
  if (s.open_state === "unknown") return <span className="badge b-unknown">{t("tl.unknown")}</span>;
  return <span className="badge b-open">✓ {t("tl.open", { t: s.arrive })}</span>;
}

// 장소 하나의 '한눈에' 배지들: 보행 난이도, 입식 테이블, 휠체어, 실내
export function AccessBadges({ x, t, kind }: { x?: Extra; t: T; kind: string }) {
  if (!x) return null;
  const out: JSX.Element[] = [];
  if (x.walk_load) out.push(<span key="w" className={`badge b-walk ${WALK_CLS[x.walk_load] || "unk"}`}>{t(`walk.${x.walk_load}`)}</span>);
  if (kind !== "sight" && x.table) out.push(<span key="tb" className={`badge b-table ${x.table === "좌식" ? "floor" : ""}`}>{t(`tl.table.${x.table}`)}</span>);
  if (x.indoor) out.push(<span key="in" className="badge b-plain">{t("tl.indoor")}</span>);
  return <>{out}</>;
}

// ---------- 시간표 카드 ----------
export function StopCard({ s, i, x, name, t, lang, wheel, showNear, isNew, busy, onRemove, onReplace }: {
  s: Stop; i: number; x?: Extra; name: string; t: T; lang: string; wheel: boolean; showNear: boolean; isNew: boolean; busy: boolean;
  onRemove: () => void; onReplace: () => void;
}) {
  const n = x?.nearby;
  const facts: string[] = [];
  if (x?.wheelchair && x.wheelchair !== "확인 전") facts.push(t("tl.wheel", { v: x.wheelchair }));
  if (x?.entrance_step === true) facts.push(t("tl.step"));
  if (x?.entrance_step === false) facts.push(t("tl.noStep"));
  if (x?.benches) facts.push(t("tl.bench"));
  const med = n?.medical;
  return (
    <article className={`tl-card${isNew ? " is-new" : ""}`} aria-label={`${i + 1}. ${name}`}>
      <div className="tl-time" aria-hidden="true"><b>{s.arrive}</b><span>{s.depart}</span></div>
      <div className="tl-dot" aria-hidden="true">{i + 1}</div>
      <div className="tl-body">
        <p className="tl-time-m">{s.arrive} ~ {s.depart}</p>
        <div className="tl-top">
          <PlacePhoto id={s.id} lang={lang as "ko" | "en"} small />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h4>{name}{s.kind !== "sight" && <small className="tl-kind">{t(s.kind === "lunch" ? "tl.lunch" : "tl.cafe")}</small>}
              {isNew && <small className="tl-kind new">{t("tl.new")}</small>}</h4>
            <p className="muted tl-hours">{s.hours_text || t("tl.unknown")}{s.hours_sample && s.open_state !== "always" ? ` · ${t("tl.sample")}` : ""}</p>
          </div>
          {s.grade && <span className={`badge g-${s.grade}`}>{t(`grade.${s.grade}`)}</span>}
        </div>
        <div className="tl-badges"><OpenBadge s={s} t={t} /><AccessBadges x={x} t={t} kind={s.kind} /></div>
        {s.notice && <p className="tl-notice" role="note">⚠ {s.notice}</p>}
        {s.wait_min > 0 && <p className="muted">⏳ {t("tl.wait", { m: s.wait_min })}</p>}
        {s.why && <p className="tl-why">{s.why}</p>}
        {facts.length > 0 && <p className="muted">{facts.join(" · ")}</p>}
        {x?.carer_tip && <p className="tl-tip"><b>{t("tl.carer")}</b> {x.carer_tip}</p>}
        {n && (
          <details className="tl-near" open={showNear || undefined}>
            <summary>{[n.parking && `🅿 ${n.parking.name}`, n.charger && `🔋 ${dist(n.charger.dist_m, t)}`].filter(Boolean).join("  ·  ")}</summary>
            <ul>
              {n.parking && <li><b>{t("tl.parking")}</b> {n.parking.name}{n.parking.spaces ? ` (${n.parking.spaces})` : ""} {n.parking.dist_m ? dist(n.parking.dist_m, t) : ""}</li>}
              {n.charger && <li className={wheel ? "hl" : ""}><b>{t("tl.charger")}</b> {n.charger.name}{n.charger.spot ? ` · ${n.charger.spot}` : ""} · {dist(n.charger.dist_m, t)}{n.charger.weekday_hours ? ` · ${n.charger.weekday_hours}` : ""}</li>}
              {med?.["약국"] && <li><b>{t("tl.pharmacy")}</b> {med["약국"].name} · {dist(med["약국"].dist_m, t)} · {med["약국"].tel}</li>}
              {med?.["응급실"] && <li><b>{t("tl.er")}</b> {med["응급실"].name} · {dist(med["응급실"].dist_m, t)} · {med["응급실"].tel}</li>}
              {n.info_center && <li><b>ℹ</b> {n.info_center.name} · {n.info_center.tel}</li>}
            </ul>
          </details>
        )}
        <div className="tl-act">
          <button className="chip" disabled={busy} onClick={onRemove}>{t("tl.remove")}</button>
          <button className="chip" disabled={busy} onClick={onReplace}>{t("tl.replace")}</button>
        </div>
      </div>
    </article>
  );
}

// ---------- 큰 글씨 요약 일정표 (가족 공유·인쇄) ----------
export function summaryText(course: Course, extras: Record<string, Extra>, name: (id: string) => string, t: T, lang: string, start: string, url: string) {
  const lines = [`[${t("sum.title")}] ${dateLabel(course.date, lang)}(${wdName(course.weekday, lang)}) ${course.start_time}`];
  course.stops.forEach((s, i) => {
    const x = extras[s.id];
    const bits = [x?.walk_load && x.walk_load !== "확인 전" ? t(`walk.${x.walk_load}`) : "", s.kind !== "sight" && x?.table ? t(`tl.table.${x.table}`) : ""].filter(Boolean);
    lines.push(`${s.arrive} ${i + 1}. ${name(s.id)}${bits.length ? ` (${bits.join(", ")})` : ""}${x?.phone ? ` ☎ ${x.phone}` : ""}`);
  });
  lines.push(t("sum.back", { s: start, t: course.back_at }));
  lines.push(`119 · 1330`);
  if (url) lines.push(`${t("sum.link")}: ${url}`);
  return lines.join("\n");
}

export function Summary({ course, extras, name, t, lang, start, url, onClose }: {
  course: Course; extras: Record<string, Extra>; name: (id: string) => string; t: T; lang: string; start: string; url: string; onClose: () => void;
}) {
  const first = extras[course.stops[0]?.id]?.nearby?.medical;
  async function share() {
    const text = summaryText(course, extras, name, t, lang, start, url);
    try {
      if (navigator.share) { await navigator.share({ title: t("sum.title"), text }); return; }
    } catch { /* 공유 창을 닫은 경우 */ return; }
    try { await navigator.clipboard.writeText(text); alertBox(t("sum.copied")); } catch { alertBox(text); }
  }
  return (
    <div className="sum" role="dialog" aria-modal="true" aria-labelledby="sum-h">
      <div className="sum-in">
        <header className="sum-head">
          <h2 id="sum-h">{t("sum.title")}</h2>
          <p className="sum-date">{dateLabel(course.date, lang)} ({wdName(course.weekday, lang)}) · {course.start_time} {lang === "ko" ? `${start} 출발` : `from ${start}`}</p>
        </header>
        <ol className="sum-list">
          {course.stops.map((s) => {
            const x = extras[s.id];
            return (
              <li key={s.id}>
                <span className="sum-t">{s.arrive}</span>
                <div>
                  <b className="sum-n">{name(s.id)}</b>
                  <p className="sum-b">
                    {s.open_state === "always" ? t("tl.always") : s.open_state === "open" ? t("tl.open", { t: s.arrive }) : t("tl.unknown")}
                    {x?.walk_load && x.walk_load !== "확인 전" ? ` · ${t(`walk.${x.walk_load}`)}` : ""}
                    {s.kind !== "sight" && x?.table ? ` · ${t(`tl.table.${x.table}`)}` : ""}
                  </p>
                  {(x?.phone || x?.nearby?.parking) && <p className="sum-s">{x?.phone ? `☎ ${x.phone}` : ""}{x?.nearby?.parking ? `  🅿 ${x.nearby.parking.name}` : ""}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="sum-back">{t("sum.back", { s: start, t: course.back_at })}</p>
        <div className="sum-emer">
          <p><b>{t("sum.emer")}</b> 119 ({t("safety.119")}) · 1330 ({t("safety.1330")})</p>
          {first?.["약국"] && <p>{t("tl.pharmacy")}: {first["약국"].name} {first["약국"].tel}</p>}
          {first?.["응급실"] && <p>{t("tl.er")}: {first["응급실"].name} {first["응급실"].tel}</p>}
        </div>
        <p className="muted">{t("sum.note")}</p>
        <div className="sum-act">
          <button className="chip go" onClick={share}>{t("sum.share")}</button>
          <button className="chip" onClick={() => window.print()}>{t("sum.print")}</button>
          <button className="chip" onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}

function alertBox(msg: string) {   // 브라우저 alert 대신 화면 아래 알림
  const el = document.createElement("div");
  el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// 공유 링크: 조건을 주소 뒤(#plan=...)에 담는다. 서버에는 아무것도 저장하지 않는다.
export function encodePlan(c: Conditions, course: Course): string {
  const sights = course.stops.filter((s) => s.kind === "sight").map((s) => s.id);
  const lunch = course.stops.find((s) => s.kind === "lunch")?.id || null;
  const keep = { ...c, must: sights, lunch, cap: course.stops.length, rest: course.stops.some((s) => s.kind === "cafe"),
    date: course.date, start_time: course.start_time, memo: "", wish: [] };
  const raw = btoa(unescape(encodeURIComponent(JSON.stringify(keep))));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodePlan(s: string): Conditions | null {
  try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return null; }
}
