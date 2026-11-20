"use client";
// 작업2·3·4: 시간표 카드(영업 중 배지·보행 난이도·입식 테이블·가까운 주차·충전기·약국), 빠른 수정 버튼, 큰 글씨 요약 일정표.
import { Course, Conditions, Extra, Stop, VisitWeather } from "@/lib/api";
import { PlacePhoto } from "@/components/Sections";
import { NearbyEats } from "@/components/Eateries";
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

type T = (k: string, v?: Record<string, string | number>) => string;
const WD_KO = "일월화수목금토";
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// 휠체어 이용 값 (영어 화면용). 보호자 꿀팁은 한국어로만 쓰여 있어 영어 화면에서는 보이지 않는다
export const WHEEL_EN: Record<string, string> = { "가능": "yes", "일부": "partly", "불가": "no" };
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
  return <span className="badge b-open">✓ {t("tl.open", { t: s.visit_at || s.arrive })}</span>;
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

function StopWeather({ forecast, lang }: { forecast: VisitWeather; lang: string }) {
  const ko = lang === "ko";
  const describe = (h: VisitWeather["hours"][number]) => {
    const kind = h.pty === 1 ? ["비", "Rain"] : h.pty === 2 ? ["비 또는 눈", "Rain or snow"]
      : h.pty === 3 ? ["눈", "Snow"] : h.pty === 4 ? ["소나기", "Showers"]
      : h.sky === 1 ? ["맑음", "Clear"] : h.sky === 3 ? ["구름 많음", "Mostly cloudy"]
      : h.sky === 4 ? ["흐림", "Overcast"] : ["하늘 상태 미제공", "Sky condition unavailable"];
    return kind[ko ? 0 : 1];
  };
  const hours = forecast.hours;
  const temps = hours.map(h => h.temp);
  const min = Math.min(...temps), max = Math.max(...temps);
  const peak = Math.max(...hours.map(h => h.pop));
  const conditions = [...new Set(hours.map(describe))].join(" → ");
  return <details className="tl-weather">
    <summary><b>{ko ? "방문 시간 날씨" : "Weather during your visit"}</b> · {conditions} · {min === max ? min : `${min}~${max}`}°C
      {" · "}{ko ? "강수확률" : "Precip."} {hours.length > 1 ? (ko ? "최대 " : "up to ") : ""}{peak}%</summary>
    <ul>{hours.map(h => <li key={h.time}>{h.time} · {describe(h)} · {h.temp}°C · {ko ? "강수확률" : "Precip."} {h.pop}%</li>)}</ul>
    <small>{ko ? "기상청 단기예보" : "KMA short-term forecast"} · {forecast.issued.slice(5, 16).replace("T", " ")} {ko ? "발표" : "KST"}</small>
  </details>;
}

// ---------- 시간표 카드 ----------
export function StopCard({ s, i, x, name, t, lang, wheel, showNear, isNew, busy, children, onMap, onRemove, onReplace, crowd, at }: {
  s: Stop; i: number; x?: Extra; name: string; t: T; lang: string; wheel: boolean; showNear: boolean; isNew: boolean; busy: boolean;
  children?: ReactNode; onMap?: () => void; onRemove: () => void; onReplace: () => void; crowd?: number | null; at?: { lat: number; lon: number };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [eatOpen, setEatOpen] = useState(false);
  const lv = crowd == null ? null : crowd >= 70 ? "high" : crowd >= 40 ? "mid" : "low";
  const crowdTxt = lv && ({ high: ["붐빔 예상", "Busy"], mid: ["보통", "Moderate"], low: ["여유", "Quiet"] } as const)[lv][lang === "ko" ? 0 : 1];
  const n = x?.nearby;
  const facts: string[] = [];
  if (x?.wheelchair && x.wheelchair !== "확인 전") facts.push(t("tl.wheel", { v: lang === "ko" ? x.wheelchair : WHEEL_EN[x.wheelchair] || x.wheelchair }));
  if (x?.entrance_step === true) facts.push(t("tl.step"));
  if (x?.entrance_step === false) facts.push(t("tl.noStep"));
  if (x?.benches) facts.push(t("tl.bench"));
  const med = n?.medical;
  return (
    <>
      <article className="stop-overview" aria-label={`${i + 1}. ${name}`}>
        <div className="stop-identity"><PlacePhoto id={s.id} lang={lang as "ko" | "en"} small />
          <div><span>{s.arrive} – {s.depart}</span><h4>{name}</h4></div></div>
        <div className="tl-badges"><OpenBadge s={s} t={t} /><AccessBadges x={x} t={t} kind={s.kind} />
          {s.grade && <span className={`badge g-${s.grade}`}>{t(`grade.${s.grade}`)}</span>}</div>
        {s.notice && <p role="note">{s.notice}</p>}
                <div className="stop-actions">
          <button type="button" className="chip go" onClick={() => dialog.current?.showModal()}>{lang === "ko" ? "장소 상세 보기" : "Stop details"}</button>
          {onMap && <button type="button" className="chip" onClick={onMap}>{lang === "ko" ? "지도에서 보기" : "Show on map"}</button>}
          <button className="chip" disabled={busy} onClick={onRemove}>{t("tl.remove")}</button>
          <button className="chip" disabled={busy} onClick={onReplace}>{t("tl.replace")}</button>
        </div>
      </article>
      <dialog className="stop-detail-dialog" ref={dialog} aria-label={name}>
        <div className="stop-detail-bar"><b>{name}</b><button className="chip" onClick={() => dialog.current?.close()}>{lang === "ko" ? "닫기" : "Close"}</button></div>
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
            <p className="muted tl-hours">{s.hours_text || t("tl.unknown")}</p>
          </div>
          {s.grade && <span className={`badge g-${s.grade}`}>{t(`grade.${s.grade}`)}</span>}
        </div>
        <div className="tl-badges"><OpenBadge s={s} t={t} /><AccessBadges x={x} t={t} kind={s.kind} />
          {lv && <span className={`badge crowd-${lv}`} title={lang === "ko" ? "관광지 혼잡 예측" : "KTO crowd forecast"}>{crowdTxt} {Math.round(crowd!)}%</span>}</div>
        {!!s.weather?.hours.length && <StopWeather forecast={s.weather} lang={lang} />}
        {s.notice && <p className="tl-notice" role="note"><Icon name="warn" /> {s.notice}</p>}
        {s.wait_min > 0 && <p className="muted"><Icon name="wait" /> {t("tl.wait", { m: s.wait_min })}</p>}
        {s.why && <p className="tl-why">{s.why}</p>}
        {facts.length > 0 && <p className="muted">{facts.join(" · ")}</p>}
        {x?.carer_tip && lang === "ko" && <p className="tl-tip"><b>{t("tl.carer")}</b> {x.carer_tip}</p>}
        {n && (
          <details className="tl-near" open={showNear || undefined}>
            <summary>{n.parking && <span className="sum-it"><Icon name="parking" />{n.parking.name}</span>}{n.charger && <span className="sum-it"><Icon name="charger" />{dist(n.charger.dist_m, t)}</span>}</summary>
            <ul>
              {n.parking && <li><b>{t("tl.parking")}</b> {n.parking.name}{n.parking.spaces ? ` (${n.parking.spaces})` : ""} {n.parking.dist_m ? dist(n.parking.dist_m, t) : ""}</li>}
              {n.charger && <li className={wheel ? "hl" : ""}><b>{t("tl.charger")}</b> {n.charger.name}{n.charger.spot ? ` · ${n.charger.spot}` : ""} · {dist(n.charger.dist_m, t)}{n.charger.weekday_hours ? ` · ${n.charger.weekday_hours}` : ""}</li>}
              {med?.["약국"] && <li><b>{t("tl.pharmacy")}</b> {med["약국"].name} · {dist(med["약국"].dist_m, t)} · {med["약국"].tel}</li>}
              {med?.["응급실"] && <li><b>{t("tl.er")}</b> {med["응급실"].name} · {dist(med["응급실"].dist_m, t)} · {med["응급실"].tel}</li>}
              {n.info_center && <li><b><Icon name="info" /></b> {n.info_center.name}{n.info_center.tel ? <> · <a href={`tel:${n.info_center.tel}`}>{n.info_center.tel}</a></> : null}</li>}
            </ul>
          </details>
        )}
        {s.kind === "lunch" && at && (
          <details className="tl-eats" onToggle={(e) => setEatOpen((e.target as HTMLDetailsElement).open)}>
            <summary><Icon name="food" />&nbsp;{lang === "ko" ? "근처 다른 식당 보기" : "Other places to eat nearby"}</summary>
            {eatOpen && <NearbyEats lat={at.lat} lon={at.lon} lang={lang} r={500} limit={5} exclude={s.id} />}
          </details>
        )}

      </div>
    </article>
    {children}</dialog></>
  );
}

function routeCostFields(costs: NonNullable<Course["route_costs"]>, lang: string) {
  const ko = lang === "ko";
  const missing = "-";
  const won = (value: number | null) => value == null ? missing :
    (ko ? `${value.toLocaleString("ko-KR")}원` : `₩${value.toLocaleString("en-US")}`);
  const m = costs.distance_m;
  const distance = m == null ? missing : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
  const taxiLabel = costs.quote_parts > 1 ? (ko ? "구간별 예상 택시요금 합계" : "Sum of taxi estimates")
    : (ko ? "예상 택시요금" : "Estimated taxi fare");
  return [[ko ? "왕복 거리" : "Round-trip distance", distance],
    [ko ? "통행료" : "Tolls", won(costs.toll_won)], [taxiLabel, won(costs.taxi_won)]];
}

export function RouteCosts({ course, lang }: { course: Course; lang: string }) {
  if (!course.route_costs) return null;
  return <dl className="route-costs" aria-label={lang === "ko" ? "카카오 왕복 경로 예상 거리와 요금" : "Kakao round-trip estimates"}>
    {routeCostFields(course.route_costs, lang).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

// ---------- 큰 글씨 요약 일정표 (가족 공유·인쇄) ----------
export function summaryText(course: Course, extras: Record<string, Extra>, name: (id: string) => string, t: T, lang: string, start: string, url: string) {
  const lines = [`[${t("sum.title")}] ${dateLabel(course.date, lang)}(${wdName(course.weekday, lang)}) ${course.start_time}`];
  if (course.route_costs) lines.push(routeCostFields(course.route_costs, lang).map(pair => pair.join(" ")).join(" · "));
  course.stops.forEach((s, i) => {
    const x = extras[s.id];
    const bits = [x?.walk_load && x.walk_load !== "확인 전" ? t(`walk.${x.walk_load}`) : "", s.kind !== "sight" && x?.table ? t(`tl.table.${x.table}`) : ""].filter(Boolean);
    lines.push(`${s.arrive} ${i + 1}. ${name(s.id)}${bits.length ? ` (${bits.join(", ")})` : ""}${x?.phone ? ` · ${x.phone}` : ""}`);
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
          {course.drive_source === "kakao" && <p className="muted">{t("sum.driveSource")}</p>}
          <RouteCosts course={course} lang={lang} />
        </header>
        <ol className="sum-list">
          {course.stops.map((s) => {
            const x = extras[s.id];
            return (
              <li key={s.id}>
                <span className="sum-t">{s.arrive}</span>
                <div>
                  <b className="sum-n">{name(s.id)}</b>
                  <p className="sum-s">{t(course.drive_source === "kakao" ? "result.drive" : "result.estDrive", { m: s.drive_min })} · {s.wait_min > 0 && <>{t("tl.wait", { m: s.wait_min })} · </>}{s.depart} {lang === "ko" ? "출발" : "depart"}</p>
                  <p className="sum-b">
                    {s.open_state === "always" ? t("tl.always") : s.open_state === "open" ? t("tl.open", { t: s.visit_at || s.arrive }) : t("tl.unknown")}
                    {x?.walk_load && x.walk_load !== "확인 전" ? ` · ${t(`walk.${x.walk_load}`)}` : ""}
                    {s.kind !== "sight" && x?.table ? ` · ${t(`tl.table.${x.table}`)}` : ""}
                  </p>
                  {(x?.phone || x?.nearby?.parking) && <p className="sum-s">{x?.phone && <span className="sum-it"><Icon name="phone" />{x.phone}</span>}{x?.nearby?.parking && <span className="sum-it"><Icon name="parking" />{x.nearby.parking.name}</span>}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="sum-back">{course.back_drive_min != null && <>{t("result.drive", { m: course.back_drive_min })} · </>}{t("sum.back", { s: start, t: course.back_at })}</p>
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
