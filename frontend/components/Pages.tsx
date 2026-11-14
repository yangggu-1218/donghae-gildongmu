"use client";
// v4 페이지: 장소 상세 · 교통 · 편의시설 지도 · 내 일정 · 행사 달력 · 숙소 · 여행 준비 · 출처·판정 기준 · 관리자
// 주소는 #/place/<id> 처럼 '#/' 뒤에 붙는다 (정적 데모와 Next 서버에서 똑같이 동작).
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import KakaoMap from "@/components/KakaoMap";
import { PlacePhoto, ZONES } from "@/components/Sections";
import { PHOTOS } from "@/lib/photos";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);
const dist = (m?: number) => (m == null ? "" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
const GRADE = { G: ["갈 수 있어요", "Accessible"], Y: ["주의", "Caution"], R: ["어려워요", "Not accessible"] } as const;
const WALK_EN: Record<string, string> = { "평지": "Flat", "완만한경사": "Gentle slope", "급경사": "Steep", "확인 전": "Not checked" };

function Head({ title, sub, crumb, lang }: { title: string; sub?: string; crumb?: [string, string][]; lang: Lang }) {
  const L = pick(lang);
  return (
    <div className="page-head">
      <nav className="crumb" aria-label={L("현재 위치", "Breadcrumb")}>
        <a href="#/">{L("처음", "Home")}</a>
        {(crumb || []).map(([href, t]) => <span key={href}> › <a href={href}>{t}</a></span>)}
        <span aria-current="page"> › {title}</span>
      </nav>
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: any[]): [T | null, boolean] {
  const [v, setV] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let on = true; setErr(false); fn().then((x) => on && setV(x)).catch(() => on && setErr(true)); return () => { on = false; }; }, deps);
  return [v, err];
}
const Loading = ({ err, lang }: { err: boolean; lang: Lang }) =>
  <p className="muted">{err ? pick(lang)("정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.", "Couldn't load. Please try again.") : pick(lang)("불러오는 중이에요.", "Loading…")}</p>;

/* ---------------- 장소 상세 ---------------- */
export function PlacePage({ id, lang, onAdd }: { id: string; lang: Lang; onAdd: (id: string) => void }) {
  const L = pick(lang);
  const [mode, setMode] = useState<"wheel" | "stroller" | "walk">("wheel");
  const [p, err] = useLoad(() => api.place(id, lang, mode), [id, lang, mode]);
  if (!p) return <section className="sec wrap"><Loading err={err} lang={lang} /></section>;
  const name = lang === "ko" ? p.name_ko : p.name_en || p.name_ko;
  const zone = ZONES.find((z) => z.k === p.zone);
  const today = { open: L("지금 운영 중", "Open now"), always: L("상시 개방", "Always open"), closed: L("오늘 쉬는 날", "Closed today"),
    closed_now: L("지금은 운영시간이 아니에요", "Closed right now"), unknown: L("운영시간 확인 필요", "Check hours") }[p.today as string];
  const n = p.nearby || {};
  const pins = [{ lat: p.lat, lon: p.lon, label: name, grade: null, color: "#12355E", icon: "★" },
    ...(p.toilets || []).map((t: any) => ({ lat: t.lat, lon: t.lon, label: t.name, grade: null, color: "#2462B4", icon: "화" })),
    ...(n.parking?.lat ? [{ lat: n.parking.lat, lon: n.parking.lon, label: n.parking.name, grade: null, color: "#566275", icon: "P" }] : []),
    ...(n.charger?.lat ? [{ lat: n.charger.lat, lon: n.charger.lon, label: n.charger.name, grade: null, color: "#1E8A3C", icon: "충" }] : [])].filter((x) => x.lat);
  const chips: string[] = [];
  if (p.walk_load) chips.push(lang === "ko" ? `걷기: ${p.walk_load}` : `Walking: ${WALK_EN[p.walk_load] || p.walk_load}`);
  if (p.wheelchair && p.wheelchair !== "확인 전") chips.push(L(`휠체어 ${p.wheelchair}`, `Wheelchair: ${p.wheelchair}`));
  if (p.entrance_step === false) chips.push(L("출입구 턱 없음", "Step-free entrance"));
  if (p.entrance_step === true) chips.push(L("출입구 턱 있음", "Step at entrance"));
  if (p.table) chips.push(L(`${p.table} 테이블`, `${p.table} seating`));
  if (p.indoor) chips.push(L("실내", "Indoor"));
  if (p.benches) chips.push(L("쉬는 벤치 있음", "Benches"));
  return (
    <section className="sec wrap place-page">
      <Head lang={lang} title={name} crumb={[["#/places", L("관광지", "Places")]]} sub={[zone ? L(zone.ko, zone.en) : "", p.address].filter(Boolean).join(" · ")} />
      <div className="pp-grid">
        <div>
          {PHOTOS[p.id] && <div className="pp-photo"><PlacePhoto id={p.id} lang={lang} /></div>}
          {(p.notices || []).filter((n: any) => !n.end || n.end >= new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)).map((n: any) => (
            <div key={n.id} className={`pp-notice ${n.level}`} role="note">
              <b>{n.level === "closed" ? L("임시 휴무", "Temporarily closed") : n.level === "warn" ? L("주의", "Caution") : L("안내", "Notice")}</b> {n.title}
              <small>{n.start || ""}{n.end ? ` ~ ${n.end}` : ""}</small>{n.body && <p>{n.body}</p>}
            </div>))}
          <div className="panel">
            <p className="pp-today"><span className={`badge ${p.today === "open" || p.today === "always" ? "b-open" : "b-unknown"}`}>{today}</span> {p.hours_text}</p>
            {p.fee && <p>🎟 {p.fee}</p>}
            {p.phone && <p>☎ <a href={`tel:${p.phone}`}>{p.phone}</a></p>}
            {p.sample && <p className="muted">{L("이 장소는 예시 데이터예요. 실제 정보는 확인 전이에요.", "Sample data, not yet verified.")}</p>}
            {chips.length > 0 && <div className="tl-badges">{chips.map((c) => <span key={c} className="badge b-plain">{c}</span>)}</div>}
            {p.carer_tip && <p className="tl-tip"><b>{L("보호자 꿀팁", "Tip for carers")}</b> {p.carer_tip}</p>}
            <p className="muted">{(lang === "ko" ? p.intro_ko || p.tip_ko : p.tip_en || p.intro_ko) || ""}</p>
            <div className="chips">
              <button className="chip go" onClick={() => { onAdd(p.id); location.hash = "#plan"; }}>{L("코스에 담기", "Add to route")}</button>
              <a className="chip" href="#/map">{L("편의시설 지도에서 보기", "Open facilities map")}</a>
            </div>
          </div>
        </div>
        <div>
          <div className="panel">
            <h2 className="h3">{L("도착부터 떠날 때까지", "From arrival to leaving")}</h2>
            <div className="chips" role="group" aria-label={L("누구 기준", "Check for")}>
              {([["wheel", "휠체어", "Wheelchair"], ["stroller", "유모차", "Stroller"], ["walk", "오래 걷기 어려움", "Limited walking"]] as const).map(([k, ko, en]) =>
                <button key={k} className="chip" aria-pressed={mode === k} onClick={() => setMode(k)}>{L(ko, en)}</button>)}
            </div>
            <ol className="seglist">
              {(p.segments || []).map((s: any) => (
                <li key={s.name}>
                  <div className="seg-top"><b>{s.name}</b><span className={`badge g-${s.grade}`}>{L(GRADE[s.grade as "G" | "Y" | "R"][0], GRADE[s.grade as "G" | "Y" | "R"][1])}</span></div>
                  {s.facts.length > 0 && <p>{s.facts.join(" · ")}</p>}
                  {s.note && <p className="muted">{s.note}</p>}
                  <p className="muted seg-src">{s.measured ? L("측정값으로 판정", "Graded from measurements") : L("답사 기록 판정", "Graded from survey notes")} · {L("출처", "Source")}: {s.source || "-"}</p>
                </li>
              ))}
              {!(p.segments || []).length && <li className="muted">{L("아직 구간 정보가 없어요.", "No path data yet.")}</li>}
            </ol>
            <p className="muted">{p.last_visit ? L(`팀 현장 확인: ${p.last_visit.date}${p.last_visit.who ? ` (${p.last_visit.who})` : ""}`, `Team visit: ${p.last_visit.date}`) : L("아직 팀 현장 확인 전이에요.", "Not yet checked on site by the team.")}</p>
          </div>
          <div className="panel">
            <h2 className="h3">{L("가까운 편의시설", "Nearby facilities")}</h2>
            <KakaoMap pins={pins} dots label={L(`${name} 주변 편의시설 지도`, "Nearby facilities map")} />
            <ul className="near-list">
              {(p.toilets || []).map((t: any) => <li key={t.name}><span className="dot" style={{ background: "#2462B4" }}>화</span><b>{L("장애인 화장실", "Accessible toilet")}</b> {t.name} · {dist(t.dist_m)} · {t.hours}</li>)}
              {!(p.toilets || []).length && <li className="muted">{L("1.5km 안에 위치가 확인된 장애인 화장실이 없어요. 관리 사무소에 물어보세요.", "No mapped accessible toilet within 1.5 km.")}</li>}
              {n.parking && <li><span className="dot" style={{ background: "#566275" }}>P</span><b>{L("주차", "Parking")}</b> {n.parking.name}{n.parking.spaces ? ` (${n.parking.spaces}${L("면", "")})` : ""} {n.parking.dist_m ? dist(n.parking.dist_m) : ""}</li>}
              {n.charger && <li><span className="dot" style={{ background: "#1E8A3C" }}>충</span><b>{L("전동휠체어 충전", "Wheelchair charger")}</b> {n.charger.name} · {dist(n.charger.dist_m)}</li>}
              {n.info_center && <li><span className="dot" style={{ background: "#F29A33" }}>i</span><b>{L("관광안내소", "Tourist info")}</b> {n.info_center.name} · {n.info_center.tel}</li>}
              {n.medical?.["약국"] && <li><span className="dot" style={{ background: "#C9302C" }}>약</span><b>{L("약국", "Pharmacy")}</b> {n.medical["약국"].name} · {dist(n.medical["약국"].dist_m)}</li>}
              {n.medical?.["응급실"] && <li><span className="dot" style={{ background: "#C9302C" }}>+</span><b>{L("응급실", "ER")}</b> {n.medical["응급실"].name} · {n.medical["응급실"].tel}</li>}
            </ul>
          </div>
          {(p.stories?.length > 0 || p.trail_info?.length > 0) && (
            <div className="panel">
              <h2 className="h3">{L("이야기와 걷기길", "Stories and trails")}</h2>
              {p.stories?.slice(0, 2).map((s: any) => <p key={s.name}><b>{s.name}</b> {s.intro?.slice(0, 120)}</p>)}
              {p.trail_info?.map((t: any) => <p key={t.name} className="muted">🥾 {t.name} · {t.length_km}km · {t.duration}</p>)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 교통 ---------------- */
export function TransportPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [d, err] = useLoad(() => api.get(`/api/transport?lang=${lang}`), [lang]);
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("교통 안내", "Getting around")} sub={L("기차역에서 관광지까지, 휠체어 차량과 시티투어, 택시·렌터카·주차장을 한곳에 모았어요.", "Stations, wheelchair vehicles, city tour, taxis, rentals and parking.")} />
      {!d ? <Loading err={err} lang={lang} /> : (<>
        <div className="cards2">
          {d.stations.map((s: any) => (
            <div key={s.name} className="panel">
              <h2 className="h3">🚉 {s.name}</h2>
              {s.toilet && <p>{L("역 안 장애인 화장실", "Accessible toilet in station")}: {s.toilet.hours}</p>}
              {s.taxi && <p>{L(`택시 승차대 ${s.taxi.spaces}면 · ${s.taxi.address}`, `Taxi stand (${s.taxi.spaces})`)}</p>}
              {s.rentals?.length > 0 && <p className="muted">🚗 {s.rentals.map((r: any) => `${r.name}${r.vans ? L(` (승합 ${r.vans})`, ` (${r.vans} vans)`) : ""} ${r.tel}`).join(" · ")}</p>}
            </div>
          ))}
        </div>
        {d.mobility_center && (
          <div className="panel">
            <h2 className="h3">♿ {L("휠체어 탈 수 있는 차량", "Wheelchair-accessible vehicles")} — {d.mobility_center.name}</h2>
            <p>{L(`휠체어 차량 ${d.mobility_center.wheelchair_vehicles}대 · 운행 ${d.mobility_center.hours} · 시외 이동은 ${d.mobility_center.advance} 전 예약`, `${d.mobility_center.wheelchair_vehicles} vehicles · ${d.mobility_center.hours}`)}</p>
            {d.mobility_center.area_out && <p className="muted">{L(`시외 운행: ${d.mobility_center.area_out}`, `Out of town: ${d.mobility_center.area_out}`)}</p>}
            <p>☎ <a href={`tel:${d.mobility_center.tel}`}>{d.mobility_center.tel}</a>{d.mobility_center.app ? ` · ${d.mobility_center.app}` : ""} · {d.mobility_center.fare}</p>
            <p className="muted">{L("교통약자로 등록된 분이 이용할 수 있어요. 다른 지역 분은 출발 전에 이용 가능 여부를 전화로 확인하세요.", "Registered users only; visitors should call ahead.")}</p>
          </div>
        )}
        {d.city_tour && (
          <div className="panel">
            <h2 className="h3">🚌 {L("동해 시티투어", "Donghae city tour")} — {d.city_tour.name}</h2>
            <p>{d.city_tour.days} · {d.city_tour.first}~{d.city_tour.last} · {L(`${d.city_tour.interval_min}분 간격`, `every ${d.city_tour.interval_min} min`)} · {d.city_tour.fare}</p>
            <ol className="stops">{d.city_tour_stops.map((s: string) => <li key={s}>{s}</li>)}</ol>
            <p className="muted">{L(`휠체어 탑승 여부는 자료에 없어요. ${d.city_tour.contact}에 먼저 물어보세요.`, `Wheelchair boarding not listed; ask ${d.city_tour.contact}.`)}</p>
          </div>
        )}
        <div className="panel">
          <h2 className="h3">🅿 {L("공영주차장", "Public parking")}</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{L("이름", "Name")}</th><th>{L("면수", "Spaces")}</th><th>{L("장애인 차량", "Disabled permit")}</th><th>{L("요금", "Fee")}</th><th>{L("평일", "Weekdays")}</th></tr></thead>
            <tbody>{d.parking.map((r: any) => <tr key={r.name}><td>{r.name}<br /><small className="muted">{r.road}</small></td><td>{r.spaces}</td><td>{r.disabled || "-"}</td><td>{r.fee_type}{r.base_fee ? ` (${r.base_min}${L("분", "min")} ${r.base_fee}${L("원", "₩")})` : ""}</td><td>{r.wk_open}~{r.wk_close}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="cards2">
          <div className="panel">
            <h2 className="h3">🚕 {L("택시 승차대", "Taxi stands")}</h2>
            <ul className="plain">{d.taxi_stands.map((t: any) => <li key={t.name}>{t.name} · {t.spaces}{L("면", "")} <small className="muted">{t.road}</small></li>)}</ul>
          </div>
          <div className="panel">
            <h2 className="h3">🚗 {L("렌터카", "Car rentals")}</h2>
            <ul className="plain">{d.rentals.map((r: any) => <li key={r.name}>{r.name} · {L(`승용 ${r.cars} / 승합 ${r.vans}`, `${r.cars} cars / ${r.vans} vans`)} · <a href={`tel:${r.tel}`}>{r.tel}</a></li>)}</ul>
            <p className="muted">{L("휠체어 리프트 차량 여부는 업체에 확인해 주세요.", "Ask the company about lift-equipped vans.")}</p>
          </div>
        </div>
      </>)}
    </section>
  );
}

/* ---------------- 편의시설 지도 ---------------- */
const LAYERS = [
  { k: "toilets", ko: "장애인 화장실", en: "Accessible toilets", color: "#2462B4", icon: "화" },
  { k: "chargers", ko: "전동휠체어 충전기", en: "Wheelchair chargers", color: "#1E8A3C", icon: "충" },
  { k: "parking", ko: "공영주차장", en: "Public parking", color: "#566275", icon: "P" },
  { k: "info_centers", ko: "관광안내소", en: "Tourist info", color: "#C46A12", icon: "i" },
  { k: "medical", ko: "약국·병원 (예시)", en: "Pharmacy/clinic (sample)", color: "#C9302C", icon: "약" },
] as const;

export function MapPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [d, err] = useLoad(() => api.get("/api/facilities"), []);
  const [on, setOn] = useState<Record<string, boolean>>({ toilets: true, chargers: true, parking: false, info_centers: false, medical: false });
  const [me, setMe] = useState<[number, number] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const items = useMemo(() => {
    if (!d) return [];
    const out: any[] = [];
    for (const l of LAYERS) {
      if (!on[l.k]) continue;
      const seen = new Set<string>();
      for (const r of d[l.k] || []) {
        if (!r.lat) continue;
        const key = `${r.lat},${r.lon}`;
        if (l.k === "toilets" && seen.has(key)) continue;   // 같은 건물 화장실 여러 개는 점 하나로
        seen.add(key);
        const desc = l.k === "toilets" ? `${r.kind} · ${r.hours}` : l.k === "chargers" ? `${r.spot || ""} · ${L("평일", "Wkdy")} ${r.wk_open}~${r.wk_close}`
          : l.k === "parking" ? `${r.spaces}${L("면", "")}${r.disabled ? L(" · 장애인 차량 요금 면제", " · free for disabled permit") : ""} · ${r.fee_type}`
          : l.k === "info_centers" ? `${r.tel || ""} ${r.hours || ""}` : `${r.kind} · ${r.open}~${r.close} · ${r.tel}`;
        const dm = me ? Math.round(Math.hypot((r.lat - me[0]) * 111000, (r.lon - me[1]) * 88000)) : null;
        out.push({ id: `${l.k}:${r.name}`, layer: l, name: r.name, lat: r.lat, lon: r.lon, desc, road: r.road || r.spot || "", dm });
      }
    }
    return me ? out.sort((a, b) => a.dm - b.dm) : out;
  }, [d, on, me, lang]);
  const pins = items.map((x) => ({ lat: x.lat, lon: x.lon, label: x.name, grade: null, color: x.layer.color, icon: x.layer.icon }));
  const unmapped = (d?.toilets || []).filter((t: any) => !t.lat);
  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => setMe([p.coords.latitude, p.coords.longitude]), () => setMe([37.5245, 129.1143]));
  }
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("편의시설 지도", "Facilities map")} sub={L("보고 싶은 것만 켜세요. 점을 누르면 아래 목록에서 자세히 보여요.", "Turn layers on and tap a dot for details.")} />
      <div className="layers chips" role="group" aria-label={L("지도에 보일 것", "Layers")}>
        {LAYERS.map((l) => (
          <button key={l.k} className="chip" aria-pressed={!!on[l.k]} onClick={() => setOn({ ...on, [l.k]: !on[l.k] })}>
            <span className="dot" style={{ background: l.color }}>{l.icon}</span>{L(l.ko, l.en)}
          </button>))}
        <button className="chip go" onClick={locate}>{L("내 주변부터 보기", "Nearest first")}</button>
      </div>
      {!d ? <Loading err={err} lang={lang} /> : (<>
        <KakaoMap pins={pins} dots onPick={(i) => { setSel(items[i].id); document.getElementById(`f-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
          label={L("편의시설 지도. 아래 목록과 같은 내용입니다.", "Facilities map; same as the list below.")} />
        <ul className="fac-list">
          {items.map((x, i) => (
            <li key={x.id} id={`f-${i}`} className={sel === x.id ? "sel" : ""}>
              <span className="dot" style={{ background: x.layer.color }}>{x.layer.icon}</span>
              <div><b>{x.name}</b>{x.dm != null && <span className="muted"> · {dist(x.dm)}</span>}<br /><small className="muted">{x.desc}{x.road ? ` · ${x.road}` : ""}</small></div>
            </li>))}
        </ul>
        {on.toilets && unmapped.length > 0 && (
          <details className="panel">
            <summary>{L(`지도 위치를 아직 못 정한 장애인 화장실 ${unmapped.length}곳 (주소로 보기)`, `${unmapped.length} accessible toilets without map position`)}</summary>
            <ul className="plain">{unmapped.map((t: any) => <li key={t.name + t.road}>{t.name} · {t.kind} · {t.hours} <small className="muted">{t.road}</small></li>)}</ul>
          </details>
        )}
        <p className="muted small">{L(`장애인 화장실: ${d.toilet_meta?.source} (기준일 ${d.toilet_meta?.as_of}). 약국·병원은 예시 데이터예요.`, "Toilets from national public restroom data. Pharmacies are sample data.")}</p>
      </>)}
    </section>
  );
}

/* ---------------- 내 일정 ---------------- */
export type SavedPlan = { id: string; title: string; date: string; start_time: string; start: string; stops: string[]; hash: string; saved_at: string };
export function loadPlans(): SavedPlan[] { try { return JSON.parse(localStorage.getItem("gd-plans") || "[]"); } catch { return []; } }
export function savePlans(v: SavedPlan[]) { try { localStorage.setItem("gd-plans", JSON.stringify(v)); return true; } catch { return false; } }

export function MyPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  useEffect(() => setPlans(loadPlans()), []);
  const del = (id: string) => { const v = plans.filter((p) => p.id !== id); setPlans(v); savePlans(v); };
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("내 일정", "My trips")} sub={L("저장한 일정은 이 기기에만 남아요. 서버에는 아무것도 저장하지 않아요.", "Saved only on this device; nothing is stored on a server.")} />
      {!plans.length ? (
        <div className="panel"><p>{L("아직 저장한 일정이 없어요. 코스를 만든 뒤 [내 일정에 저장]을 눌러 주세요.", "No saved trips yet. Make a route and tap [Save to my trips].")}</p>
          <a className="chip go" href="#plan">{L("코스 만들러 가기", "Plan a route")}</a></div>
      ) : (
        <ul className="my-list">
          {plans.map((p) => (
            <li key={p.id} className="panel">
              <div><b className="my-date">{p.date} {p.start_time}</b> · {p.start}<p>{p.stops.join(" → ")}</p>
                <small className="muted">{L("저장", "Saved")} {p.saved_at.slice(0, 16).replace("T", " ")}</small></div>
              <div className="chips">
                <a className="chip go" href={`#plan=${p.hash}`}>{L("열기", "Open")}</a>
                <button className="chip" onClick={() => del(p.id)}>{L("삭제", "Delete")}</button>
              </div>
            </li>))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- 행사 달력 ---------------- */
export function EventsPage({ lang, onPlanDate }: { lang: Lang; onPlanDate: (d: string) => void }) {
  const L = pick(lang);
  const [d, err] = useLoad(() => api.get("/api/events/all"), []);
  const today = new Date();
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState<string | null>(null);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const evs: any[] = d?.events || [];
  const on = (k: string) => evs.filter((e) => e.start <= k && k <= (e.end || e.start));
  const y = view.getFullYear(), m = view.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(y, m, i + 1))];
  const monthEvs = evs.filter((e) => (e.end || e.start) >= iso(new Date(y, m, 1)) && e.start <= iso(new Date(y, m, days)));
  const list = day ? on(day) : monthEvs;
  const WD = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("행사·축제 달력", "Events calendar")} sub={L(`동해시 문화행사·축제 공공데이터 (기준일 ${d?.as_of || "-"})`, "Donghae events from public data")} />
      <div className="ev-grid">
        <div className="cal">
          <div className="cal-head">
            <button className="cal-nav" onClick={() => { setView(new Date(y, m - 1, 1)); setDay(null); }} aria-label={L("이전 달", "Previous month")}>‹</button>
            <b>{lang === "ko" ? `${y}년 ${m + 1}월` : view.toLocaleDateString("en", { year: "numeric", month: "long" })}</b>
            <button className="cal-nav" onClick={() => { setView(new Date(y, m + 1, 1)); setDay(null); }} aria-label={L("다음 달", "Next month")}>›</button>
          </div>
          <div className="cal-grid">
            {WD.map((w, i) => <span key={w} className={`cal-wd${i === 0 ? " cal-sun" : i === 6 ? " cal-sat" : ""}`}>{w}</span>)}
            {cells.map((c, i) => {
              if (!c) return <span key={i} />;
              const k = iso(c), n = on(k).length;
              return <button key={k} className={`cal-day${n ? " has-ev" : ""}${k === iso(today) ? " today" : ""}`} aria-pressed={day === k}
                aria-label={`${c.getDate()}${L("일", "")}${n ? L(` 행사 ${n}개`, ` ${n} events`) : ""}`} onClick={() => setDay(day === k ? null : k)}>{c.getDate()}{n > 0 && <i aria-hidden="true" />}</button>;
            })}
          </div>
        </div>
        <div>
          <h2 className="h3">{day ? L(`${day} 행사`, `Events on ${day}`) : L(`${m + 1}월 행사`, "This month")}</h2>
          {!d ? <Loading err={err} lang={lang} /> : !list.length ? <p className="muted">{L("이때 열리는 행사가 없어요.", "No events.")}</p> : (
            <ul className="ev-list">
              {list.map((e) => (
                <li key={e.name + e.start} className="panel">
                  <b>{e.name}</b> <span className="badge b-plain">{e.kind}</span>
                  <p>{e.start}{e.end && e.end !== e.start ? ` ~ ${e.end}` : ""}{e.start_time ? ` · ${e.start_time}~${e.end_time || ""}` : ""} · {e.venue}</p>
                  <p className="muted">{[e.fee_type, e.fee, e.age, e.tel].filter(Boolean).join(" · ")}</p>
                  {e.access && <p>♿ {e.access}</p>}
                  <div className="chips">
                    <button className="chip go" onClick={() => onPlanDate(day && day >= iso(today) ? day : (e.start >= iso(today) ? e.start : iso(today)))}>{L("이 날로 코스 만들기", "Plan for this day")}</button>
                    {e.url && <a className="chip" href={e.url} target="_blank" rel="noopener">{L("행사 안내", "Details")}</a>}
                  </div>
                </li>))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 숙소 ---------------- */
export function StayPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [zone, setZone] = useState("mangsang");
  const [d, err] = useLoad(() => api.get(`/api/lodging?zone=${zone}&limit=0`), [zone]);
  const Q = [L("출입구에 턱이나 계단이 있나요? 경사로가 있나요?", "Steps or a ramp at the entrance?"), L("방문 폭이 휠체어(80cm 이상) 들어갈 만큼 넓은가요?", "Room door at least 80 cm wide?"),
    L("욕실 문턱이 없나요? 손잡이가 있나요?", "Step-free bathroom with grab bars?"), L("엘리베이터가 있나요? (2층 이상 객실이면)", "Is there a lift?"),
    L("장애인 주차 구역이 건물 입구 가까이 있나요?", "Accessible parking near the entrance?"), L("침대 높이가 휠체어 좌석과 비슷한가요?", "Bed height similar to wheelchair seat?")];
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("숙소", "Where to stay")} sub={L("공공데이터에는 객실 접근성 정보가 없어요. 예약 전에 아래 질문을 전화로 꼭 물어보세요.", "Public data has no room accessibility info. Call and ask before booking.")} />
      <div className="panel">
        <h2 className="h3">{L("예약 전에 물어볼 것", "Ask before booking")}</h2>
        <ul className="checks">{Q.map((q) => <li key={q}>{q}</li>)}</ul>
      </div>
      <div className="tabs" role="tablist" aria-label={L("권역", "Areas")}>
        {ZONES.map((z) => <button key={z.k} role="tab" aria-selected={zone === z.k} onClick={() => setZone(z.k)} style={{ ["--z" as any]: z.c }}>{L(z.ko, z.en)}</button>)}
      </div>
      {!d ? <Loading err={err} lang={lang} /> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{L("이름", "Name")}</th><th>{L("종류", "Type")}</th><th>{L("주소", "Address")}</th><th>{L("전화", "Phone")}</th></tr></thead>
          <tbody>{d.items.map((r: any) => <tr key={r.name}><td>{r.name}{r.tourist && <span className="badge b-plain">{L("관광숙박업", "Registered")}</span>}</td><td>{r.kind}</td><td><small>{r.address}</small></td><td>{r.tel ? <a href={`tel:${r.tel}`}>{r.tel}</a> : "-"}</td></tr>)}</tbody>
        </table></div>
      )}
      <p className="muted small">{L(`${d?.count ?? 0}곳 · 무장애 객실 여부는 모두 '확인 전'이에요.`, "Accessible rooms: not verified.")}</p>
    </section>
  );
}

/* ---------------- 여행 준비·자주 묻는 질문 ---------------- */
export function GuidePage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const lists = [
    { t: L("휠체어", "Wheelchair"), i: [L("전동휠체어 충전기 위치 확인 (편의시설 지도)", "Check charger locations"), L("휠체어 차량은 이동지원센터에 미리 문의", "Call the mobility center ahead"), L("장애인 화장실 위치를 코스마다 확인", "Find accessible toilets on each stop"), L("주차할 땐 장애인 주차 구역이 있는 공영주차장으로", "Use lots with accessible bays")] },
    { t: L("유모차·아이", "Stroller & kids"), i: [L("모래 해변은 유모차가 빠져요 — 데크길 위주로", "Beaches are sandy; use boardwalks"), L("기저귀 교환대는 공중화장실 정보에서 확인", "Check baby-changing tables"), L("실내 코스(연필뮤지엄·천곡동굴)를 비 올 때 대비로", "Keep indoor backups for rain")] },
    { t: L("어르신", "Older adults"), i: [L("[덜 걷는 평지로] 버튼으로 경사 있는 곳 빼기", "Use [flatter route]"), L("중간에 쉬어 갈 카페를 넣기", "Add a café break"), L("[큰 글씨 일정표]를 가족과 공유", "Share the large-print plan with family"), L("상비약과 복용 시간표 챙기기", "Bring regular medicines")] },
    { t: L("외국인", "Visitors from abroad"), i: [L("언어를 English로 바꾸면 영어 안내가 되는 안내소를 먼저 보여 줘요", "Switch to English to see English-speaking info centers first"), L("관광통역안내 1330 (24시간)", "Call 1330 for interpretation (24h)")] },
  ];
  const faq = [
    [L("초록·노랑·빨강은 무슨 뜻이에요?", "What do the colors mean?"), L("초록은 그 기준으로 갈 수 있어요, 노랑은 도움이 있거나 조심하면 갈 수 있어요, 빨강은 어려워요. 판정 기준은 [출처·판정 기준] 페이지에 있어요.", "Green = accessible, yellow = with care, red = not accessible. See Sources & criteria.")],
    [L("영업시간이 맞나요?", "Are opening hours accurate?"), L("공공데이터가 있는 곳은 그 값을, 나머지는 '예시 시간'으로 표시했어요. 출발 전에 전화로 한 번 더 확인해 주세요.", "Public data where available; others are marked as samples. Call ahead.")],
    [L("제가 입력한 정보가 저장되나요?", "Is my information stored?"), L("이동 조건은 서버에 저장하지 않아요. [내 일정]도 이 기기에만 남아요.", "No. Saved trips stay on this device.")],
    [L("현장과 다른 정보를 봤어요.", "I found wrong information."), L("코스 결과 아래 [현장 제보]로 사진과 함께 알려 주세요. 팀이 확인한 뒤 반영해요.", "Use the report form below a route; the team reviews it.")],
  ];
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("여행 준비·자주 묻는 질문", "Trip prep & FAQ")} />
      <div className="cards2">
        {lists.map((x) => <div key={x.t} className="panel"><h2 className="h3">{x.t}</h2><ul className="checks">{x.i.map((i) => <li key={i}>{i}</li>)}</ul></div>)}
      </div>
      <div className="panel emer">
        <h2 className="h3">{L("급할 때", "Emergency")}</h2>
        <p><b>119</b> {L("응급·구조", "Emergency")} · <b>1330</b> {L("관광통역안내 (24시간)", "Tourist hotline (24h)")} · <b>112</b> {L("경찰", "Police")}</p>
        <p className="muted">{L("화면 위 [안심] 버튼을 누르면 지금 위치에서 가까운 안내소·충전기를 보여 줘요.", "Tap [Safety] at the top for nearby help.")}</p>
      </div>
      <div className="faq">
        {faq.map(([q, a]) => <details key={q} className="panel"><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>
  );
}

/* ---------------- 출처·판정 기준 ---------------- */
export function SourcesPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [d, err] = useLoad(() => api.get("/api/sources"), []);
  return (
    <section className="sec wrap">
      <Head lang={lang} title={L("출처·판정 기준", "Sources & criteria")} sub={L("어떤 데이터로, 어떤 기준으로 판정했는지 모두 밝혀요.", "Every dataset and rule we use.")} />
      {!d ? <Loading err={err} lang={lang} /> : (<>
        <div className="panel">
          <h2 className="h3">{L("판정 기준", "Grading rules")}</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{L("항목", "Item")}</th><th><span className="badge g-G">{L("갈 수 있어요", "OK")}</span></th><th><span className="badge g-Y">{L("주의", "Caution")}</span></th><th><span className="badge g-R">{L("어려워요", "No")}</span></th><th>{L("근거", "Basis")}</th></tr></thead>
            <tbody>{d.criteria.map((c: any) => <tr key={c.item}><td>{c.item}</td><td>{c.ok}</td><td>{c.warn}</td><td>{c.no}</td><td><small>{c.law}</small></td></tr>)}</tbody>
          </table></div>
          <ul className="plain">{d.notes.map((n: string) => <li key={n} className="muted">{n}</li>)}</ul>
        </div>
        <div className="panel">
          <h2 className="h3">{L(`공공데이터 ${d.datasets.length}종`, `${d.datasets.length} public datasets`)}</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{L("데이터", "Dataset")}</th><th>{L("건수", "Rows")}</th><th>{L("기준일", "As of")}</th></tr></thead>
            <tbody>{d.datasets.map((x: any) => <tr key={x.name + x.file}><td>{x.name}</td><td>{x.count}</td><td>{x.as_of}</td></tr>)}</tbody>
          </table></div>
          <p className="muted small">{L("출처: 공공데이터포털(data.go.kr). 숙박·음식점은 위치·접근성 정보가 없어 권역 안내에만 써요.", "Source: data.go.kr")}</p>
        </div>
        <div className="panel">
          <h2 className="h3">{L("사진 출처", "Photo credits")}</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{L("장소", "Place")}</th><th>{L("저작자", "Author")}</th><th>{L("라이선스", "License")}</th><th>{L("원본", "Original")}</th></tr></thead>
            <tbody>{d.photos.map((x: any) => <tr key={x.id}><td>{x.id}</td><td>{x["저작자"]}</td><td>{x["라이선스"] === "KOGL Type 1" ? L("공공누리 제1유형", "KOGL Type 1") : x["라이선스"]}</td><td><a href={x["출처"]} target="_blank" rel="noopener">{L("위키미디어 공용", "Wikimedia Commons")}</a></td></tr>)}</tbody>
          </table></div>
          <p className="muted small">{L("사진이 없는 장소는 그림으로 보여 줘요.", "Places without a photo show an illustration.")}</p>
        </div>
        <div className="panel">
          <h2 className="h3">{L("서비스 안에서 쓰는 AI", "AI used inside the service")}</h2>
          <p>{d.ai?.connected ? L(`외부 AI API 연결됨 (${d.ai.provider || "Anthropic"} · ${d.ai.model || ""})`, "External AI API connected") : L("이 화면에서는 외부 AI API가 연결되어 있지 않아 규칙 엔진으로 동작해요.", "AI API not connected here; rule engine in use.")}</p>
          <ul className="plain">
            <li>{L("대화로 조건 알아듣기·코스 고치기 (동이 대화)", "Understanding chat and editing routes")}</li>
            <li>{L("코스 설명 문장 만들기", "Writing route explanations")}</li>
            <li>{L("현장 제보 사진에서 장애물 찾기 (관리자 검수용)", "Finding obstacles in reported photos (for review)")}</li>
          </ul>
          <p className="muted small">{L("AI가 틀려도 코스 판정은 바뀌지 않아요. 판정은 규칙 엔진이 하고, 사진 분석은 사람이 확인한 뒤에만 반영해요.", "Grades come from rules; photo analysis is applied only after human review.")}</p>
        </div>
      </>)}
    </section>
  );
}

export { AdminPage } from "@/components/Admin";
