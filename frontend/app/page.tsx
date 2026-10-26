"use client";
// 코스 만들기 화면의 최소 구현(동이와 대화 → 코스 → 말로 수정 → 안심).
// 관광지·추천 코스·후기 섹션은 프로토타입 v2의 구조를 그대로 옮겨 붙이면 된다 (README의 '화면 옮기기' 참고).
import { useEffect, useMemo, useState } from "react";
import ko from "@/i18n/ko.json";
import en from "@/i18n/en.json";
import Dongi from "@/components/Dongi";
import KakaoMap from "@/components/KakaoMap";
import { api, Conditions, Course, Extra } from "@/lib/api";

type Lang = "ko" | "en";
type Msg = { me?: boolean; pose?: string; text: string; cards?: { kind: string; data: any }[] };
const Q = [
  { k: "who", q: "q.who", multi: false, o: ["혼자", "연인·친구", "부모님과", "아이와", "단체"] },
  { k: "move", q: "q.move", multi: true, none: "없어요", o: ["없어요", "휠체어", "오래 걷기 어려움", "계단 어려움", "유모차"] },
  { k: "style", q: "q.style", multi: true, o: ["바다 보기", "자연·산책", "카페", "맛집", "역사·문화"] },
] as const;

export default function Page() {
  const [lang, setLang] = useState<Lang>("ko");
  const D = (lang === "ko" ? ko : en) as Record<string, string>;
  const t = (k: string, v: Record<string, string | number> = {}) =>
    (D[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ""));
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<Record<string, string[]>>({});
  const [cond, setCond] = useState<Conditions>({ who: "혼자", move: [], style: [], days: "당일", start: "동해역", memo: "", wish: [], lang: "ko" });
  const [log, setLog] = useState<Msg[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [places, setPlaces] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [safety, setSafety] = useState<any>(null);
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [talkState, setTalkState] = useState<Record<string, boolean>>({});
  const [hint, setHint] = useState<{ stay: any; move: any; events: any[] } | null>(null);

  useEffect(() => { setLog([{ pose: "wave", text: t("plan.greet") }, { pose: "ask", text: t("q.who") }]); setStep(0); }, [lang]);
  useEffect(() => { api.places().then((ps) => setPlaces(Object.fromEntries(ps.map((p) => [p.id, p])))).catch(() => {}); }, []);

  const say = (m: Msg) => setLog((l) => [...l, m]);
  const name = (id: string) => (lang === "ko" ? places[id]?.name_ko : places[id]?.name_en || places[id]?.name_ko) ?? id;

  function pick(o: string) {
    const q = Q[step];
    if (!q.multi) { finishQ({ ...ans, [q.k]: [o] }, [o]); return; }
    let cur = ans[q.k] || [];
    if ("none" in q && o === q.none) cur = cur.includes(o) ? [] : [o];
    else cur = cur.filter((x) => !("none" in q) || x !== q.none).includes(o) ? cur.filter((x) => x !== o) : [...cur.filter((x) => !("none" in q) || x !== q.none), o];
    setAns({ ...ans, [q.k]: cur });
  }
  function finishQ(next: Record<string, string[]>, chosen: string[]) {
    setAns(next);
    say({ me: true, text: chosen.map((o) => t(`opt.${o}`)).join(", ") });
    const n = step + 1; setStep(n);
    say({ pose: "ask", text: n < Q.length ? t(Q[n].q) : t("q.last") });
  }
  async function make() {
    const c: Conditions = { ...cond, who: ans.who?.[0] || "혼자", move: (ans.move || []).filter((x) => x !== "없어요"), style: ans.style || [], lang };
    setCond(c); setBusy(true);
    say({ me: true, text: `${t(`opt.${c.days}`)} · ${t(`opt.${c.start}`)}${c.memo ? " · " + c.memo : ""}` });
    say({ pose: "think", text: t("plan.thinking") });
    try {
      const r = await api.course(c);
      setCourse(r.course); setExtras(r.extras || {}); setHint({ stay: r.stay, move: r.move, events: r.events || [] });
      say({ pose: "happy", text: t("plan.done", { n: r.course.stops.length }) + (r.summary ? " " + r.summary : "") });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false); setStep(Q.length + 1);
  }
  // 자유 대화: 동이(LLM 또는 규칙)가 조건을 알아듣고, 코스는 서버 엔진이 계산한다
  async function chat(msg: string) {
    say({ me: true, text: msg }); setBusy(true);
    const base: Conditions = { ...cond, lang, who: ans.who?.[0] || cond.who,
      move: ans.move ? ans.move.filter((x) => x !== "없어요") : cond.move, style: ans.style || cond.style };
    try {
      const r = await api.talk({ message: msg, history: log.slice(-10), conditions: base,
        state: { who_known: !!ans.who || talkState.who_known, move_known: !!ans.move || talkState.move_known },
        course_ids: course?.stops.map((s) => s.id) || [] });
      setCond(r.conditions); setTalkState(r.state);
      if (r.course) { setCourse(r.course); setExtras((x) => ({ ...x, ...(r.extras || {}) })); setStep(Q.length + 1); setHint(null); }
      else if (!course) setStep((n) => Math.max(n, r.state.move_known ? 2 : r.state.who_known ? 1 : 0));   // 말로 답한 질문은 버튼 단계도 넘긴다
      say({ pose: r.pose, text: r.reply, cards: r.cards });
    } catch { say({ pose: "worry", text: t("error.server") }); }
    setBusy(false);
  }
  async function openSafety() {
    const go = (lat: number, lon: number) => api.safety(lat, lon, lang).then(setSafety).catch(() => setSafety({ places: [] }));
    navigator.geolocation?.getCurrentPosition((p) => go(p.coords.latitude, p.coords.longitude), () => go(37.5245, 129.1143));
  }

  const pins = useMemo(() => (course?.stops || []).filter((s) => places[s.id]?.lat)
    .map((s) => ({ lat: places[s.id].lat, lon: places[s.id].lon, label: name(s.id), grade: s.grade })), [course, places, lang]);
  const q = Q[step];

  return (
    <main className="wrap">
      <header className="bar">
        <div className="brand"><img src="/dongi/neutral.webp" alt="" />{t("brand")}</div>
        <div className="tools">
          <button className="sos" onClick={openSafety}>{t("tool.safety")}</button>
          <button className="box" onClick={() => document.body.classList.toggle("big")}>{t("tool.big")}</button>
          <label className="sr-only" htmlFor="lang">{t("tool.lang")}</label>
          <select id="lang" className="box" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="ko">한국어</option><option value="en">English</option>
          </select>
        </div>
      </header>

      <div className="grid">
        <section className="panel" aria-label={t("nav.plan")}>
          {log.map((m, i) => m.me
            ? <div key={i} className="me"><span>{m.text}</span></div>
            : <div key={i}><Dongi pose={m.pose} name={t("dongi")}>{m.text}</Dongi>{m.cards?.map((c, k) => <HelpCard key={k} c={c} t={t} onSafety={openSafety} />)}</div>)}

          {step < Q.length && (
            <div className="chips">
              {q.o.map((o) => <button key={o} className="chip" aria-pressed={q.multi ? (ans[q.k] || []).includes(o) : undefined} onClick={() => pick(o)}>{t(`opt.${o}`)}</button>)}
              {q.multi && <button className="chip go" onClick={() => (ans[q.k] || []).length && finishQ(ans, ans[q.k])}>{t("plan.next")}</button>}
            </div>
          )}
          {step === Q.length && (
            <div className="chips">
              {(["당일", "1박 2일"] as const).map((d) => <button key={d} className="chip" aria-pressed={cond.days === d} onClick={() => setCond({ ...cond, days: d })}>{t(`opt.${d}`)}</button>)}
              {(["동해역", "묵호역", "자가용"] as const).map((s) => <button key={s} className="chip" aria-pressed={cond.start === s} onClick={() => setCond({ ...cond, start: s })}>{t(`opt.${s}`)}</button>)}
              <input aria-label={t("plan.memo")} placeholder={t("plan.memoPh")} value={cond.memo} onChange={(e) => setCond({ ...cond, memo: e.target.value })} />
              <button className="chip go" disabled={busy} onClick={make}>{t("plan.make")}</button>
            </div>
          )}
          {step > Q.length && (
            <div className="chips">
              {["chat.rain", "chat.less", "chat.sea"].map((k) => <button key={k} className="chip" disabled={busy} onClick={() => chat(t(k))}>{t(k)}</button>)}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { chat(input.trim()); setInput(""); } }} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input style={{ flex: 1, minHeight: 46 }} aria-label={t("chat.ph")} placeholder={step > Q.length ? t("chat.ph") : t("talk.ph")} value={input} onChange={(e) => setInput(e.target.value)} />
                <button className="chip go" disabled={busy}>{t("chat.send")}</button>
          </form>
        </section>

        <section className="panel" aria-live="polite">
          {!course ? <Dongi pose="neutral" name={t("dongi")}>{t("plan.empty")}</Dongi> : (
            <>
              <p>{!course.overall ? t("result.noMode") : course.overall === "G" ? t("result.allOk")
                : t("result.caution", { n: course.stops.filter((s) => s.grade && s.grade !== "G").length })}</p>
              <KakaoMap pins={pins} />
              {course.stops.map((s, i) => (
                <div key={s.id}>
                  <p className="muted">{t("result.drive", { m: s.drive_min })}</p>
                  <div className="stop">
                    <div><b>{i + 1}. {name(s.id)}</b> <span className="muted">{s.arrive}</span><br /><span className="muted">{s.why}</span></div>
                    {s.grade && <span className={`badge g-${s.grade}`}>{t(`grade.${s.grade}`)}</span>}
                  </div>
                  <StopExtra x={extras[s.id]} wheel={cond.move.includes("휠체어")} t={t} />
                </div>
              ))}
              <p className="muted">{t("result.back", { s: t(`opt.${cond.start}`), t: course.back_at })}</p>
              {course.notes.map((n) => <p key={n} className="muted">{n}</p>)}
              {hint?.move && (
                <div className="stop" style={{ display: "block" }}>
                  <b>{t("x.tourTitle")}</b>
                  {hint.move.taxi && <p className="muted">{t("x.taxiStart", { s: t(`opt.${cond.start}`), n: hint.move.taxi.spaces })}</p>}
                  {hint.move.mobility_center && (<>
                    <p className="muted">♿ {t("x.mobility", { n: hint.move.mobility_center.wheelchair_vehicles, t: hint.move.mobility_center.tel, f: hint.move.mobility_center.fare })}</p>
                    <p className="muted">{t("x.mobilityWho")}</p>
                  </>)}
                  {hint.move.rentals?.[0] && <p className="muted">🚗 {t("x.rental", { n: hint.move.rentals[0].name, h: hint.move.rentals[0].weekday })} · {hint.move.rentals[0].tel}</p>}
                  {hint.move.city_tour?.covers.length > 0 && (<>
                    <p className="muted">{t("x.tour", { ...hint.move.city_tour, m: hint.move.city_tour.interval_min, n: hint.move.city_tour.covers.length })}</p>
                    {cond.move.length > 0 && <p className="muted">{t("x.tourWheel", { c: hint.move.city_tour.contact })}</p>}
                  </>)}
                </div>
              )}
              {hint?.stay && <p className="muted">🛏 {t("x.stay", { z: hint.stay.zone_name, n: hint.stay.count })}</p>}
              {hint?.events?.length ? <p className="muted">🎭 {t("x.events")}: {hint.events.map((e) => `${e.name} (${e.start})`).join(", ")}</p> : null}
              <p className="muted" style={{ fontSize: ".8em" }}>{t("x.src")}</p>
            </>
          )}
        </section>
      </div>

      {safety && (
        <section className="panel" style={{ marginTop: 20 }} aria-label={t("tool.safety")}>
          <Dongi pose="neutral" name={t("dongi")}>{t("safety.say")}</Dongi>
          <p><b>119</b> {t("safety.119")} · <b>1330</b> {t("safety.1330")}</p>
          {safety.help?.length > 0 && <h3>{t("safety.help")}</h3>}
          {safety.help?.map((c: any) => <div key={c.name} className="stop"><span>{c.name} · {c.languages.length ? t("safety.langs", { l: c.languages.join(", ") }) : ""}</span><span className="muted">{c.status === "check" ? t("safety.check") : `${t(c.status === "open" ? "safety.open" : "safety.closed")} ${c.hours}`} · {c.dist_m}m · {c.tel}</span></div>)}
          {safety.chargers?.length > 0 && <h3>{t("safety.chargers")}</h3>}
          {safety.chargers?.map((c: any) => <div key={c.name} className="stop"><span>{c.name} · {c.spot}</span><span className="muted">{c.open_now ? t("safety.open") : t("safety.closed")} ({t("x.chargerWk", { h: c.weekday_hours })}) · {c.dist_m}m · {c.tel}</span></div>)}
          {safety.mobility_center && <>
            <h3>{t("safety.mobility")}</h3>
            <div className="stop"><span>{safety.mobility_center.name} · {safety.mobility_center.hours}</span><span className="muted">{safety.mobility_center.tel} · {safety.mobility_center.app}</span></div>
            <p className="muted">{t("x.mobilityWho")}</p>
          </>}
          {safety.places.map((p: any) => <div key={p.name} className="stop"><span>{p.name} · {p.kind}</span><span className="muted">{p.until} · {p.dist_m}m · {p.tel}</span></div>)}
          <button className="box" onClick={() => setSafety(null)}>{t("common.close")}</button>
        </section>
      )}
    </main>
  );
}

// 코스 카드 아래: 공공데이터로 붙인 이야기·택시·주차·충전기·신호등
function StopExtra({ x, wheel, t }: { x?: Extra; wheel: boolean; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!x) return null;
  const rows: string[] = [];
  if (x.stories?.[0]) rows.push(`📜 ${t("x.story")}: ${x.stories.slice(0, 2).map((s) => s.name).join(", ")} — ${x.stories[0].intro}`);
  if (x.trail_info?.[0]) rows.push(`🚶 ${t("x.trail")}: ${x.trail_info[0].name} ${t("x.km", { k: x.trail_info[0].length_km, d: x.trail_info[0].duration })}`);
  if (x.events_here?.[0]) rows.push(`🎉 ${t("x.eventHere")}: ${x.events_here[0].name} (${x.events_here[0].start}~${x.events_here[0].end})`);
  if (x.hours) rows.push(`🕘 ${t("x.hours", { h: x.hours, c: x.closed_days || "-" })}${x.fee ? " · " + x.fee : ""}`);
  if (x.park?.[0]) rows.push(`🌳 ${t("x.park")}: ${x.park[0].name} ${x.park[0].dist_m}m`);
  if (x.taxi?.[0]) rows.push(`🚕 ${t("x.taxi")}: ${x.taxi[0].name}`);
  if (x.parking_near?.[0]) rows.push(`🅿 ${t("x.parking")}: ${x.parking_near[0].name} (${x.parking_near[0].spaces})${x.parking_near[0].disabled_free ? " · " + t("x.parkingFree") : ""}`);
  if (wheel && x.charger) rows.push(`🔋 ${t("x.charger")}: ${x.charger.name} ${Math.round(x.charger.dist_m / 100) / 10}km · ${t("x.chargerWk", { h: x.charger.weekday_hours })}`);
  if (x.signals?.total) rows.push(`🚦 ${t("x.signals", { n: x.signals.total, c: x.signals.countdown })}`);
  if (x.phone) rows.push(`☎ ${x.phone}`);
  return rows.length ? <ul className="muted" style={{ margin: "0 0 8px 14px", padding: 0, fontSize: ".85em" }}>{rows.map((r) => <li key={r}>{r}</li>)}</ul> : null;
}

// 동이가 찾아 준 정보 카드 (공공데이터)
function HelpCard({ c, t, onSafety }: { c: { kind: string; data: any }; t: (k: string, v?: Record<string, string | number>) => string; onSafety: () => void }) {
  const d = c.data;
  const row = (a: string, b = "") => <div className="stop" key={a + b}><span>{a}</span><span className="muted">{b}</span></div>;
  let body: any = null;
  if (!d || (Array.isArray(d) && !d.length) || d.error) body = <p className="muted">{t("card.none")}</p>;
  else if (c.kind === "info_center") body = d.map((x: any) => row(`${x.name}${x.languages.length ? " · " + x.languages.join(", ") : ""}`, `${x.hours || t("safety.check")} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "charger") body = d.map((x: any) => row(`${x.name} · ${x.spot}`, `${t("x.chargerWk", { h: x.weekday_hours })} · ${x.dist_m}m · ${x.tel}`));
  else if (c.kind === "mobility_van") body = <>{row(d.name, `${d.tel} · ${d.hours}`)}<p className="muted">{t("x.mobilityWho")}</p></>;
  else if (c.kind === "city_tour") body = row(`${d.name} · ${d.days}`, `${d.board} ${d.first}~${d.last} · ${d.fare}`);
  else if (c.kind === "events") body = d.map((x: any) => row(x.name, `${x.start}~${x.end} · ${x.venue}`));
  else if (c.kind === "lodging" || c.kind === "restaurants") body = <>{d.items.map((x: any) => row(`${x.name} · ${x.kind}`, x.tel || x.address))}<p className="muted">{t("card.unverified", { n: d.count })}</p></>;
  else if (c.kind === "parking") body = d.map((x: any) => row(`${x.name} (${x.spaces})`, `${x.fee}${x.disabled_free ? " · " + t("x.parkingFree") : ""} · ${x.dist_m}m`));
  else if (c.kind === "taxi") body = (Array.isArray(d) ? d : [d]).map((x: any) => row(x.name, x.address || ""));
  else if (c.kind === "hospital_pharmacy") body = <button className="sos" onClick={onSafety}>{t("tool.safety")}</button>;
  return <div className="card-help" style={{ margin: "4px 0 12px 56px" }}>{body}<p className="muted" style={{ fontSize: ".75em" }}>{t("x.src")}</p></div>;
}
