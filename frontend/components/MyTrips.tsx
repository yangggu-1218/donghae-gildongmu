"use client";
// 내 일정: 저장한 코스를 즐겨찾기·다가오는 여행(달마다)·지난 여행으로 묶어 카드로 보여 준다.
// 카드: 대표 사진 · 코스 이름 · 날짜·장소 수 · 편의 키워드 · [자세히 보기](코스 추천 최종 화면 그대로) · [가족에게 보내기]
// 오른쪽 위: 즐겨찾기 별, 톱니바퀴(이름 변경·삭제). 저장은 이 기기(localStorage)에만.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { decodePlan } from "@/components/Timeline";
import { Icon } from "@/components/Icon";
import { PlacePhoto } from "@/components/Sections";
import { CourseHero } from "@/components/CourseHero";
import { fuzzyHit } from "@/lib/fuzzy";
import { ruleTitle, repPhoto, courseKeywords, Keyword } from "@/lib/courseTitle";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);

export type SavedPlan = { id: string; title: string; date: string; start_time: string; start: string; stops: string[]; hash: string; saved_at: string; fav?: boolean;
  ids?: string[]; auto?: string; kw?: Keyword[];   // ids·auto(코스 이름)·kw(편의 키워드)는 2026-11-21부터 저장
  res?: { course: any; extras: Record<string, any>; conditions: any } };   // 저장한 코스 그대로 (자세히 보기에서 다시 계산하지 않고 이걸 보여 줌)
export function loadPlans(): SavedPlan[] { try { return JSON.parse(localStorage.getItem("gd-plans") || "[]"); } catch { return []; } }
// 저장한 일정 이름 (붙인 이름 → 코스 이름 → 'OO 외 n곳') — 커뮤니티·내 정보에서도 같은 이름으로
export const planName = (p: SavedPlan) => p.title || p.auto || `${p.stops[0] || "동해"} 외 ${Math.max(0, p.stops.length - 1)}곳`;
// 저장한 일정 열기: 저장해 둔 코스를 그대로 (다시 계산하지 않음)
export function openSavedPlan(p: SavedPlan) {
  try { sessionStorage.setItem("gd-open-my", "1"); sessionStorage.setItem("gd-open-title", p.title || ""); if (p.res) sessionStorage.setItem("gd-open-res", JSON.stringify(p.res)); } catch { /* 무시 */ }
  location.hash = `#plan=${p.hash}`;
}
export function savePlans(v: SavedPlan[]) { try { localStorage.setItem("gd-plans", JSON.stringify(v)); return true; } catch { return false; } }

const todayIso = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayDiff = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(todayIso() + "T00:00:00").getTime()) / 864e5);
const WD_N = (w: number, lang: string) => (lang === "ko" ? "일월화수목금토"[w] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w]);
const dateLabel = (d: string, lang: string) => { const [y, m, dd] = d.split("-").map(Number); return lang === "ko" ? `${m}월 ${dd}일` : new Date(y, m - 1, dd).toLocaleDateString("en", { month: "short", day: "numeric" }); };

// 예전에 저장한 일정(ids 없음)은 저장한 조건에서 장소 id 를 되살린다
function planIds(p: SavedPlan): string[] {
  if (p.ids?.length) return p.ids;
  const c: any = decodePlan(p.hash);
  if (!c) return [];
  return c.order?.length ? c.order : [...(c.must || []), ...(c.lunch ? [c.lunch] : [])];
}

export function MyPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [order, setOrder] = useState<"date" | "saved">("date");
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Record<string, any>>({});
  useEffect(() => setPlans(loadPlans()), []);
  useEffect(() => { api.places().then((l) => setPlaces(Object.fromEntries(l.map((x: any) => [x.id, x])))).catch(() => {}); }, []);
  const put = (v: SavedPlan[]) => { setPlans(v); savePlans(v); };
  const upd = (id: string, patch: Partial<SavedPlan>) => put(plans.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (id: string) => put(plans.filter((p) => p.id !== id));
  const key = q.trim().replace(/\s+/g, "");
  const hay = (p: SavedPlan) => `${p.title}${p.auto || ""}${p.stops.join("")}${p.start}${p.date}`.replace(/\s+/g, "");
  const exactHit = plans.some((p) => hay(p).includes(key));
  const shown = plans.filter((p) => !key || (exactHit ? hay(p).includes(key) : [p.title, p.auto || "", ...p.stops].some((n) => fuzzyHit(n, key) >= 0)));
  const today = todayIso();
  const byDate = (a: SavedPlan, b: SavedPlan) => (a.date + a.start_time).localeCompare(b.date + b.start_time);
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
  return (
    <section className="sec wrap my-page">
      <CourseHero lang={lang} mascot={false} />
      {!plans.length ? (
        <div className="panel empty">
          <img src="/dongi/full-cheer.webp" alt="" />
          <div>
            <p><b>{L("아직 저장한 일정이 없어요", "No saved trips yet")}</b></p>
            <p className="muted">{L("코스를 짠 뒤 [내 일정에 저장]을 누르면 여기에 모여요.", "Plan a route and tap [Save to my trips].")}</p>
            <a className="btn-go" href="#plan">{L("코스 찾으러 가기", "Find a course")}</a>
          </div>
        </div>
      ) : (<>
        <div className="my-tools">
          <div className="chips" role="group" aria-label={L("보는 순서", "Order")}>
            <button className="chip" aria-pressed={order === "date"} onClick={() => setOrder("date")}>{L("여행 날짜별", "By trip date")}</button>
            <button className="chip" aria-pressed={order === "saved"} onClick={() => setOrder("saved")}>{L("저장한 순", "Recently saved")}</button>
          </div>
          <label className="my-search"><span className="sr-only">{L("일정 찾기", "Find a trip")}</span><Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("장소·이름으로 찾기", "Find by place or name")} /></label>
        </div>
        {!shown.length && <p className="muted">{L("찾는 일정이 없어요.", "No trips match.")}</p>}
        {groups.map((g) => (
          <section key={g.k} className="my-group" aria-labelledby={`mg-${g.k}`}>
            <h2 id={`mg-${g.k}`} className="my-gh">{g.k === "fav" && <Icon name="star" className="star-on" />}{g.title}<span className="my-count">{g.items.length}</span></h2>
            <ul className="my-list">{g.items.map((p) => <TripCard key={p.id} p={p} lang={lang} places={places}
              onFav={() => upd(p.id, { fav: !p.fav })} onRename={(title) => upd(p.id, { title })} onDelete={() => del(p.id)} />)}</ul>
          </section>
        ))}
      </>)}
      <div className="my-outro">
        <p>{L("더 편리한 여행을 위한 동행,", "A companion for easier travel,")}<br /><b>{L("동해 길동무와 함께하세요!", "travel with Donghae Gildongmu!")}</b></p>
        <img src="/dongi/full-cheer.webp" alt="" />
      </div>
    </section>
  );
}

function TripCard({ p, lang, places, onFav, onRename, onDelete }: { p: SavedPlan; lang: Lang; places: Record<string, any>; onFav: () => void; onRename: (t: string) => void; onDelete: () => void }) {
  const L = pick(lang);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [sure, setSure] = useState(false);
  const [name, setName] = useState(p.title);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {   // 메뉴·확인 칸이 열리면 첫 버튼으로 포커스 (확인 칸은 [취소]로)
    if (!menu) return;
    const id = window.setTimeout(() => { const bs = menuRef.current?.querySelectorAll<HTMLButtonElement>(".trip2-menu button"); (sure ? bs?.[bs.length - 1] : bs?.[0])?.focus(); }, 50);
    return () => window.clearTimeout(id);
  }, [menu, sure]);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) { setMenu(false); setSure(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); setSure(false); gearRef.current?.focus(); } };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const ids = planIds(p);
  const stops = ids.map((id) => ({ id, kind: places[id]?.type === "식당" ? "lunch" : places[id]?.type === "카페" ? "cafe" : "sight" }));
  const auto = p.auto || (Object.keys(places).length ? ruleTitle(stops, places, lang) : "");
  const title = p.title || auto || L(`${p.stops[0] || "동해"} 외 ${Math.max(0, p.stops.length - 1)}곳`, `${p.stops[0] || "Donghae"} + ${Math.max(0, p.stops.length - 1)} more`);
  const kws = p.kw?.length ? p.kw : Object.keys(places).length ? courseKeywords(stops, places, {}, (decodePlan(p.hash) as any)?.move || [], null, lang) : [];
  const photo = repPhoto(stops);
  const dd = dayDiff(p.date);
  const wd = new Date(p.date + "T00:00:00").getDay();
  const open = () => openSavedPlan(p);
  async function share() {
    const url = `${location.origin}${location.pathname}#plan=${p.hash}`;
    const text = `${title} · ${p.date} ${p.start_time}\n${p.stops.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n${url}`;
    try { if (navigator.share) { await navigator.share({ title, text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* 복사 막힘 */ }
  }
  return (
    <li className={`trip2${p.fav ? " is-fav" : ""}${dd < 0 ? " is-past" : ""}`}>
      <button type="button" className="trip2-photo" onClick={open} aria-label={L(`${title} 자세히 보기`, `Open ${title}`)} tabIndex={-1}>
        {photo ? <PlacePhoto id={photo} lang={lang} /> : <span className="trip2-noph"><Icon name="sea" /></span>}</button>
      <div className="trip2-main">
        {edit ? (
          <form className="trip-name" onSubmit={(e) => { e.preventDefault(); onRename(name.trim()); setEdit(false); }}>
            <label className="sr-only" htmlFor={`tn-${p.id}`}>{L("일정 이름", "Trip name")}</label>
            <input id={`tn-${p.id}`} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={auto} autoFocus />
            <button className="chip go">{L("저장", "Save")}</button>
            <button type="button" className="chip" onClick={() => { setName(p.title); setEdit(false); }}>{L("취소", "Cancel")}</button>
          </form>
        ) : <h3 className="trip2-title"><button type="button" onClick={open}>{title}</button></h3>}
        <p className="trip2-when"><Icon name="cal" />{dateLabel(p.date, lang)} ({WD_N(wd, lang)}) {p.start_time}<span aria-hidden="true">·</span>{p.stops.length}{L("곳", " stops")}
          {dd >= 0 && <span className={`dday${dd === 0 ? " now" : ""}`}>{dd === 0 ? L("오늘", "Today") : `D-${dd}`}</span>}</p>
        {kws.length > 0 && <ul className="trip2-kw">{kws.map((k) => <li key={k.text}><Icon name={k.icon} />{k.text}</li>)}</ul>}
      </div>
      <div className="trip2-act">
        <button type="button" className="trip2-go" onClick={open}>{L("자세히 보기", "View details")}<span aria-hidden="true">›</span></button>
        <button type="button" className="trip2-share" onClick={share}><Icon name="share" />{copied ? L("복사했어요", "Copied") : L("가족에게 보내기", "Send to family")}</button>
      </div>
      <div className="trip2-tools" ref={menuRef}>
        <button type="button" className="trip2-ic" aria-pressed={!!p.fav} onClick={onFav} aria-label={p.fav ? L("즐겨찾기에서 빼기", "Remove from favorites") : L("즐겨찾기", "Add to favorites")}
          title={L("즐겨찾기", "Favorite")}><Icon name="star" className={p.fav ? "star-on" : ""} /></button>
        <button ref={gearRef} type="button" className="trip2-ic" aria-expanded={menu} onClick={() => { setMenu(!menu); setSure(false); }} aria-label={L("설정", "Settings")} title={L("설정", "Settings")}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></button>
        {menu && <div className="trip2-menu">
          {!sure ? <>
            <button type="button" onClick={() => { setMenu(false); setName(p.title); setEdit(true); }}><Icon name="edit" />{L("이름 변경", "Rename")}</button>
            <button type="button" className="danger" onClick={() => setSure(true)}><Icon name="trash" />{L("삭제", "Delete")}</button>
          </> : <div className="trip2-sure" role="alert"><p>{L("이 일정을 지울까요?", "Delete this trip?")}</p>
            <button type="button" className="chip danger" onClick={() => { setMenu(false); onDelete(); }}>{L("지우기", "Delete")}</button>
            <button type="button" className="chip" onClick={() => { setSure(false); setMenu(false); gearRef.current?.focus(); }}>{L("취소", "Cancel")}</button></div>}
        </div>}
      </div>
    </li>
  );
}
