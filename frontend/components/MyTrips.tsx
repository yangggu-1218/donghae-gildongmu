"use client";
// 내 일정: 저장한 코스를 즐겨찾기·여행 날짜(달마다)·지난 여행으로 묶어 보여 주고,
// '자세히 보기'를 누르면 저장해 둔 조건으로 코스를 다시 계산해 시간표처럼 보여 준다.
// 저장은 이 기기(localStorage)에만. 서버에는 아무것도 남기지 않는다.
import { useEffect, useState } from "react";
import { api, getJSON } from "@/lib/api";
import { Head } from "@/components/Pages";
import { decodePlan } from "@/components/Timeline";
import { Icon } from "@/components/Icon";
import { fuzzyHit } from "@/lib/fuzzy";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);

export type SavedPlan = { id: string; title: string; date: string; start_time: string; start: string; stops: string[]; hash: string; saved_at: string; fav?: boolean };
export function loadPlans(): SavedPlan[] { try { return JSON.parse(localStorage.getItem("gd-plans") || "[]"); } catch { return []; } }
export function savePlans(v: SavedPlan[]) { try { localStorage.setItem("gd-plans", JSON.stringify(v)); return true; } catch { return false; } }

const todayIso = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayDiff = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(todayIso() + "T00:00:00").getTime()) / 864e5);
const WD_N = (w: number, lang: string) => (lang === "ko" ? "일월화수목금토"[w] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w]);
const dateLabel = (d: string, lang: string) => { const [y, m, dd] = d.split("-").map(Number); return lang === "ko" ? `${m}월 ${dd}일` : new Date(y, m - 1, dd).toLocaleDateString("en", { month: "short", day: "numeric" }); };
const GRADE_W: Record<string, [string, string]> = { G: ["가능", "OK"], Y: ["주의", "Caution"], R: ["어려움", "Hard"] };
const WHO_W: Record<string, string> = { "혼자": "Solo", "연인·친구": "Partner/friends", "부모님과": "With parents", "아이와": "With kids", "단체": "Group" };
const MOVE_W: Record<string, string> = { "휠체어": "Wheelchair", "유모차": "Stroller", "오래 걷기 어려움": "Limited walking", "계단 어려움": "No stairs" };
const WALK_W: Record<string, string> = { "평지": "flat", "완만한경사": "gentle slope", "급경사": "steep" };

export function MyPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [order, setOrder] = useState<"date" | "saved">("date");
  const [q, setQ] = useState("");
  useEffect(() => setPlans(loadPlans()), []);
  const put = (v: SavedPlan[]) => { setPlans(v); savePlans(v); };
  const upd = (id: string, patch: Partial<SavedPlan>) => put(plans.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (id: string) => put(plans.filter((p) => p.id !== id));
  const key = q.trim().replace(/\s+/g, "");
  const hay = (p: SavedPlan) => `${p.title}${p.stops.join("")}${p.start}${p.date}`.replace(/\s+/g, "");
  const exactHit = plans.some((p) => hay(p).includes(key));
  const shown = plans.filter((p) => !key || (exactHit ? hay(p).includes(key) : [p.title, ...p.stops].some((n) => fuzzyHit(n, key) >= 0)));   // 오타면 비슷한 이름으로
  const today = todayIso();
  const byDate = (a: SavedPlan, b: SavedPlan) => (a.date + a.start_time).localeCompare(b.date + b.start_time);
  // 묶음: 즐겨찾기 → 다가오는 여행(달마다) → 지난 여행. '저장한 순'이면 즐겨찾기 → 나머지(최근 저장 먼저)
  const groups: { k: string; title: string; items: SavedPlan[] }[] = [];
  const favs = shown.filter((p) => p.fav).sort(byDate);
  if (favs.length) groups.push({ k: "fav", title: L("즐겨찾기", "Favorites"), items: favs });
  const rest = shown.filter((p) => !p.fav);
  if (order === "saved") {
    if (rest.length) groups.push({ k: "all", title: L("저장한 순서", "Recently saved"), items: [...rest].sort((a, b) => b.saved_at.localeCompare(a.saved_at)) });
  } else {
    const up = rest.filter((p) => p.date >= today).sort(byDate);
    for (const m of Array.from(new Set(up.map((p) => p.date.slice(0, 7)))))
      groups.push({ k: m, title: L(`다가오는 여행 · ${+m.slice(5)}월`, `Upcoming · ${new Date(m + "-01T00:00:00").toLocaleDateString("en", { month: "long" })}`), items: up.filter((p) => p.date.startsWith(m)) });
    const past = rest.filter((p) => p.date < today).sort((a, b) => -byDate(a, b));
    if (past.length) groups.push({ k: "past", title: L("지난 여행", "Past trips"), items: past });
  }
  const nFav = plans.filter((p) => p.fav).length;
  return (
    <section className="sec wrap">
      <Head lang={lang} mascot="full-cheer" photo="haerang" title={L("내 일정", "My trips")} sub={L("저장한 일정은 이 기기에만 남아요. 서버에는 아무것도 저장하지 않아요.", "Saved only on this device; nothing is stored on a server.")} />
      {!plans.length ? (
        <div className="panel empty">
          <img src="/dongi/full-cheer.webp" alt="" />
          <div>
            <p><b>{L("아직 저장한 일정이 없어요", "No saved trips yet")}</b></p>
            <p className="muted">{L("코스를 짠 뒤 [내 일정에 저장]을 누르면 여기에 모여요. 저장한 일정은 다시 열어 고치거나 가족에게 보낼 수 있어요.", "Plan a route and tap [Save to my trips]. Saved trips can be reopened, edited and shared.")}</p>
            <a className="btn-go" href="#plan">{L("코스 짜러 가기", "Plan a route")}</a>
          </div>
        </div>
      ) : (<>
        <div className="my-tools">
          <div className="chips" role="group" aria-label={L("보는 순서", "Order")}>
            <button className="chip" aria-pressed={order === "date"} onClick={() => setOrder("date")}>{L("여행 날짜별", "By trip date")}</button>
            <button className="chip" aria-pressed={order === "saved"} onClick={() => setOrder("saved")}>{L("저장한 순", "Recently saved")}</button>
          </div>
          <label className="my-search"><span className="sr-only">{L("일정 찾기", "Find a trip")}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("장소·이름으로 찾기 (예: 추암)", "Find by place or name")} /></label>
          <p className="muted small" role="status">{L(`${plans.length}개 저장 · 즐겨찾기 ${nFav}개`, `${plans.length} saved · ${nFav} favorites`)}{key ? L(` · 찾은 것 ${shown.length}개`, ` · ${shown.length} found`) : ""}</p>
        </div>
        {!shown.length && <p className="muted">{L("찾는 일정이 없어요. 다른 장소 이름으로 찾아 보세요.", "No trips match.")}</p>}
        {groups.map((g) => (
          <section key={g.k} className="my-group" aria-labelledby={`mg-${g.k}`}>
            <h2 id={`mg-${g.k}`} className="my-gh">{g.k === "fav" && <Icon name="star" className="star-on" />}{g.title} <small>{g.items.length}</small></h2>
            <ul className="my-list">{g.items.map((p) => <TripCard key={p.id} p={p} lang={lang} onFav={() => upd(p.id, { fav: !p.fav })} onRename={(title) => upd(p.id, { title })} onDelete={() => del(p.id)} />)}</ul>
          </section>
        ))}
      </>)}
    </section>
  );
}

// 저장한 코스 한 개: 겉에는 날짜·D-day·장소 순서. 버튼으로 자세히 보기·열기·보내기·이름 붙이기·삭제
function TripCard({ p, lang, onFav, onRename, onDelete }: { p: SavedPlan; lang: Lang; onFav: () => void; onRename: (t: string) => void; onDelete: () => void }) {
  const L = pick(lang);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(p.title);
  const [sure, setSure] = useState(false);
  const [copied, setCopied] = useState(false);
  const dd = dayDiff(p.date);
  const wd = new Date(p.date + "T00:00:00").getDay();
  const dLabel = dd === 0 ? L("오늘", "Today") : dd > 0 ? `D-${dd}` : L("지난 여행", "Past");
  const fallback = L(`${p.stops[0] || "동해"} 외 ${Math.max(0, p.stops.length - 1)}곳`, `${p.stops[0] || "Donghae"} + ${Math.max(0, p.stops.length - 1)} more`);
  async function share() {
    const url = `${location.origin}${location.pathname}#plan=${p.hash}`;
    const text = `${p.title || fallback} · ${p.date} ${p.start_time}\n${p.stops.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n${url}`;
    try { if (navigator.share) { await navigator.share({ title: p.title || fallback, text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* 복사 막힘 */ }
  }
  return (
    <li className={`panel trip${p.fav ? " is-fav" : ""}${dd < 0 ? " is-past" : ""}`}>
      <div className="trip-top">
        <div className="trip-when">
          <span className={`dday${dd === 0 ? " now" : dd < 0 ? " past" : ""}`}>{dLabel}</span>
          <b>{dateLabel(p.date, lang)}({WD_N(wd, lang)}) {p.start_time}</b>
          <span className="muted">{L(`${p.start} 출발`, `from ${p.start}`)}</span>
        </div>
        <button className="chip star-btn" aria-pressed={!!p.fav} onClick={onFav} aria-label={p.fav ? L("즐겨찾기에서 빼기", "Remove from favorites") : L("즐겨찾기에 넣기", "Add to favorites")}>
          <Icon name="star" className={p.fav ? "star-on" : ""} /></button>
      </div>
      {edit ? (
        <form className="trip-name" onSubmit={(e) => { e.preventDefault(); onRename(name.trim()); setEdit(false); }}>
          <label className="sr-only" htmlFor={`tn-${p.id}`}>{L("일정 이름", "Trip name")}</label>
          <input id={`tn-${p.id}`} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={L("예: 엄마랑 묵호 바다", "e.g. Mukho with mom")} autoFocus />
          <button className="chip go">{L("이름 저장", "Save name")}</button>
          <button type="button" className="chip" onClick={() => { setName(p.title); setEdit(false); }}>{L("취소", "Cancel")}</button>
        </form>
      ) : <h3 className="trip-title">{p.title || fallback}</h3>}
      <ol className="trip-stops">{p.stops.map((s, i) => <li key={i}><span className="n" aria-hidden="true">{i + 1}</span>{s}</li>)}</ol>
      <div className="chips trip-act">
        <button className="chip go" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="down" className={open ? "flip" : ""} />&nbsp;{open ? L("접기", "Hide details") : L("자세히 보기", "Show details")}</button>
        <a className="chip" href={`#plan=${p.hash}`}>{L("코스 화면에서 열기·고치기", "Open & edit")}</a>
        <button className="chip" onClick={share}><Icon name="share" />&nbsp;{copied ? L("복사했어요", "Copied") : L("가족에게 보내기", "Share")}</button>
        <button className="chip" onClick={() => setEdit(true)}><Icon name="edit" />&nbsp;{L("이름 붙이기", "Rename")}</button>
        {!sure ? <button className="chip" onClick={() => setSure(true)}><Icon name="trash" />&nbsp;{L("삭제", "Delete")}</button>
          : <span className="trip-sure" role="alert">{L("이 일정을 지울까요? 되돌릴 수 없어요.", "Delete this trip? This can't be undone.")}
              <button className="chip danger" onClick={onDelete}>{L("지우기", "Delete")}</button><button className="chip" onClick={() => setSure(false)}>{L("그대로 두기", "Keep")}</button></span>}
      </div>
      {open && <TripDetail p={p} lang={lang} />}
      <small className="muted trip-saved">{L("저장", "Saved")} {p.saved_at.slice(0, 16).replace("T", " ")}</small>
    </li>
  );
}

// 자세히 보기: 저장해 둔 조건으로 코스를 다시 계산해 시간표처럼 보여 준다 (영업시간·판정은 오늘 기준 최신 값)
// 예보가 없는 까닭을 사실대로: 지난 날짜 / 16일 이후 / 불러오기 실패 (예전엔 늘 '16일 앞까지만')
function wxWhy(date: string, failed: boolean, L: (ko: string, en: string) => string): string {
  if (failed) return L("예보를 불러오지 못함", "Couldn't load the forecast");
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 864e5);
  if (days < 0) return L("지난 날짜", "Past date");
  if (days > 15) return L("16일 이후 날짜 — 예보 전", "More than 16 days ahead");
  return L("예보 없음", "No forecast");
}

function TripDetail({ p, lang }: { p: SavedPlan; lang: Lang }) {
  const L = pick(lang);
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [names, setNames] = useState<Record<string, any>>({});
  const [wx, setWx] = useState<any>(undefined);
  useEffect(() => {
    const c = decodePlan(p.hash);
    if (!c) { setErr(true); return; }
    api.course({ ...c, lang } as any).then(setR).catch(() => setErr(true));
    api.places().then((l) => setNames(Object.fromEntries(l.map((x: any) => [x.id, x])))).catch(() => {});
    getJSON("/api/weather").then((w: any) => { const ds = w.days || []; setWx(ds.length ? ds.find((d: any) => d.date === p.date) || null : "fail"); }).catch(() => setWx("fail"));
  }, [p.hash, p.date, lang]);
  if (err) return <p className="muted">{L("이 일정을 다시 계산하지 못했어요. '코스 화면에서 열기'로 열어 보세요.", "Couldn't rebuild this trip. Try 'Open & edit'.")}</p>;
  if (!r) return <p className="muted" role="status">{L("일정을 불러오는 중…", "Loading…")}</p>;
  const c = r.conditions || {};
  const course = r.course;
  const nm = (id: string) => (lang === "ko" ? names[id]?.name_ko : names[id]?.name_en || names[id]?.name_ko) || id;
  return (
    <div className="trip-detail">
      <dl className="trip-facts">
        <div><dt>{L("누구와", "Who")}</dt><dd>{lang === "ko" ? c.who : WHO_W[c.who] || c.who}</dd></div>
        <div><dt>{L("걸음", "Walking")}</dt><dd>{(c.move || []).length ? c.move.map((m: string) => (lang === "ko" ? m : MOVE_W[m] || m)).join(", ") : L("문제 없음", "No limits")}</dd></div>
        <div><dt>{L("날씨", "Weather")}</dt><dd>{wx && wx !== "fail" ? <><Icon name={wx.icon} /> {lang === "ko" ? wx.ko : wx.en} · {wx.tmin}~{wx.tmax}°C</> : wxWhy(p.date, wx === "fail", L)}</dd></div>
        <div><dt>{L("돌아오는 시각", "Back at")}</dt><dd>{course.back_at} · {p.start}</dd></div>
      </dl>
      <ol className="trip-tl">
        {course.stops.map((s: any, i: number) => {
          const x = r.extras?.[s.id] || {};
          return (
            <li key={s.id}>
              <span className="tt-time">{s.arrive}<small>~{s.depart}</small></span>
              <div className="tt-body">
                <div className="tt-head"><b>{i + 1}. {nm(s.id)}</b>
                  {s.kind !== "sight" && <small className="tl-kind">{s.kind === "lunch" ? L("점심", "Lunch") : L("쉬어 가기", "Break")}</small>}
                  {s.grade && <span className={`badge g-${s.grade}`}>{L(...GRADE_W[s.grade])}</span>}</div>
                <p className="muted small">{s.hours_text}
                  {x.walk_load && x.walk_load !== "확인 전" ? ` · ${lang === "ko" ? `걷기 ${x.walk_load}` : `walking: ${WALK_W[x.walk_load] || x.walk_load}`}` : ""}
                  {s.kind !== "sight" && x.table ? ` · ${lang === "ko" ? `${x.table} 테이블` : x.table === "입식" ? "chairs & tables" : "floor seating"}` : ""}</p>
                <p className="tt-links">
                  {x.phone && <a href={`tel:${x.phone}`}><Icon name="phone" />{x.phone}</a>}
                  {x.nearby?.parking && <span><Icon name="parking" />{x.nearby.parking.name}</span>}
                  <a href={`#/place/${s.id}`}>{L("장소 자세히", "Place details")}</a>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {course.skipped?.length > 0 && <p className="muted small">{L("그날 쉬는 곳은 뺐어요: ", "Closed that day, left out: ")}{course.skipped.map((x: any) => (lang === "ko" ? x.name : nm(x.id))).join(", ")}</p>}
      <p className="muted small">{L("영업시간·판정은 오늘 기준으로 다시 확인한 값이에요. 저장할 때와 달라졌으면 순서도 바뀔 수 있어요.", "Hours and grades are re-checked today, so details may differ from when you saved.")}</p>
    </div>
  );
}
