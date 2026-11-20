"use client";
// 이용자 '불편 알리기' (docs/19_CITY_REPORTS.md 2-1): ① 어디 → ② 무엇·누가 → ③ 사진·한마디(선택) → 접수번호 · AI가 본 내용 · 같은 곳 n명
// 그리고 [내 제보]: 이 기기에서 보낸 제보 + 접수번호로 찾기, 처리 단계 막대와 시 답변.
import { useEffect, useState } from "react";
import KakaoMap from "@/components/KakaoMap";
import { Icon, Picto } from "@/components/Icon";
import { MicButton } from "@/components/Voice";
import { getJSON } from "@/lib/api";

type T = (k: string, v?: Record<string, string | number>) => string;
type Lang = "ko" | "en";
export const CR_CATS: [string, string][] = [["step", "stairs"], ["sidewalk", "crack"], ["ramp", "ramp"], ["parking", "block"], ["toilet", "toilet"], ["lift", "lift"], ["works", "cone"], ["etc", "info"]];
const WHO = ["휠체어", "유모차", "걷기 힘듦", "시각"];
const STEPS = ["접수", "확인", "처리 중", "완료"];
const STN: [number, number] = [37.4995, 129.124];
const KEY = "gd-my-reports";
const myIds = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const saveId = (id: string) => { try { localStorage.setItem(KEY, JSON.stringify([id, ...myIds().filter((x) => x !== id)].slice(0, 30))); } catch { /* 저장 못 해도 접수번호로 찾을 수 있음 */ } };

export function ReportForm({ t, lang, places, placeId = "", source = "불편 알리기", compact = false }: { t: T; lang: Lang; places: { id: string; name: string; lat?: number; lon?: number }[]; placeId?: string; source?: string; compact?: boolean }) {
  const [how, setHow] = useState<"" | "gps" | "map" | "place">(placeId ? "place" : "");
  const [pid, setPid] = useState(placeId);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [locMsg, setLocMsg] = useState("");
  const [cat, setCat] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [useExif, setUseExif] = useState(false);
  const [note, setNote] = useState("");
  const [wantReply, setWantReply] = useState(false);
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<any>(null);
  const [mapOk, setMapOk] = useState(true);
  const urls = files.map((f) => URL.createObjectURL(f));
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [files]);   // eslint-disable-line
  const where = how === "place" ? !!pid : how === "gps" || how === "map" ? !!pos : useExif && files.length > 0;
  const what = !!cat || files.length > 0 || note.trim().length > 1;

  function gps() {
    setHow("gps"); setPos(null); setLocMsg(t("cr.locFinding"));
    if (!navigator.geolocation) { setLocMsg(t("cr.locFail")); return; }
    navigator.geolocation.getCurrentPosition((p) => { setPos([p.coords.latitude, p.coords.longitude]); setLocMsg(t("cr.locOk")); },
      () => setLocMsg(t("cr.locFail")), { timeout: 8000, enableHighAccuracy: true });
  }
  async function send() {
    if (!where || !what) { setErr(t("cr.need")); return; }
    setBusy(true); setErr("");
    const fd = new FormData();
    if (how === "place") fd.append("place_id", pid);
    if ((how === "gps" || how === "map") && pos) { fd.append("lat", String(pos[0])); fd.append("lon", String(pos[1])); }
    fd.append("loc_how", how); fd.append("category", cat || "etc"); fd.append("who", who.join(",")); fd.append("note", note); fd.append("source", source);
    if (useExif) fd.append("use_exif", "1");
    if (wantReply && consent && contact.trim()) { fd.append("contact", contact.trim()); fd.append("consent", "1"); }
    files.forEach((f) => fd.append("photos", f));
    try {
      const r = await fetch("/api/reports", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || t("cr.err"));
      saveId(j.id); setDone(j); window.dispatchEvent(new Event("gd-report-sent"));   // 옆 [내 제보] 새로 고침
    } catch (e: any) { setErr(e.message || t("cr.err")); }
    setBusy(false);
  }
  function reset() { setDone(null); setCat(""); setWho([]); setFiles([]); setNote(""); setContact(""); setConsent(false); setWantReply(false); setUseExif(false); if (!placeId) { setHow(""); setPos(null); } }

  if (done) return (
    <div className="cr-done" role="status">
      <p className="cr-done-h"><Picto name="ok" size={28} /><b>{t("cr.done")}</b></p>
      <p className="cr-code"><small>{t("cr.code")}</small><b>{done.code}</b></p>
      <p className="muted small">{t("cr.codeHint")}</p>
      {done.triage?.by === "ai" ? <p className="cr-saw"><span className="via via-llm">AI</span> {done.triage.summary}</p>
        : <p className="muted small">{t("cr.ruleSaw")}</p>}
      {done.same > 1 && <p className="cr-same"><Icon name="crowd" /> {t("cr.same", { n: done.same })}</p>}
      <StepBar status={done.status} t={t} />
      <div className="chips"><button className="chip" onClick={reset}>{t("cr.again")}</button><a className="chip go" href="#/report">{t("cr.mine")}</a></div>
    </div>);

  return (
    <form className={`cr-form${compact ? " compact" : ""}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
      <p className="cr-danger"><Picto name="warn" size={18} />{t("cr.danger")}</p>
      <fieldset className="cr-step"><legend><span className="cr-n">1</span>{t("cr.s1")}</legend>
        <div className="chips" role="group">
          <button type="button" className="chip" aria-pressed={how === "gps"} onClick={gps}><Icon name="pin" />&nbsp;{t("cr.here")}</button>
          <button type="button" className="chip" aria-pressed={how === "map"} onClick={() => { setHow("map"); setPos(null); setLocMsg(t("cr.mapHelp")); }}><Icon name="map" />&nbsp;{t("cr.mapPick")}</button>
          <button type="button" className="chip" aria-pressed={how === "place"} onClick={() => { setHow("place"); setLocMsg(""); }}><Icon name="flag" />&nbsp;{t("cr.place")}</button>
        </div>
        {how === "place" && <label className="cr-place"><span className="sr-only">{t("cr.placePick")}</span>
          <select className="box" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">{t("cr.placePick")}</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        {how === "map" && (mapOk
          ? <div className="cr-map"><KakaoMap pins={[{ lat: pos?.[0] ?? STN[0], lon: pos?.[1] ?? STN[1], label: pos ? t("cr.mapOk") : t("cr.mapHelp"), grade: null, color: pos ? "#C9302C" : "#2462B4", icon: pos ? "!" : "·" }]}
              start={{ lat: pos?.[0] ?? 37.5245, lon: pos?.[1] ?? 129.1143, level: pos ? 4 : 7 }} label={t("cr.mapHelp")}
              onMapClick={(la, lo) => { setPos([la, lo]); setLocMsg(t("cr.mapOk")); }} />
            <MapCheck onFail={() => { setMapOk(false); setLocMsg(t("cr.mapNo")); }} /></div>
          : null)}
        {locMsg && <p className="muted small" role="status">{locMsg}{pos && how !== "place" ? ` (${pos[0].toFixed(5)}, ${pos[1].toFixed(5)})` : ""}</p>}
      </fieldset>

      <fieldset className="cr-step"><legend><span className="cr-n">2</span>{t("cr.s2")}</legend>
        <div className="cr-cats" role="group">
          {CR_CATS.map(([k, ic]) => <button type="button" key={k} className="cr-cat" aria-pressed={cat === k} onClick={() => setCat(cat === k ? "" : k)}><Icon name={ic} /><span>{t(`cr.c.${k}`)}</span></button>)}
        </div>
        <p className="cr-who"><b>{t("cr.who")}</b>{WHO.map((w) => <button type="button" key={w} className="chip sm" aria-pressed={who.includes(w)}
          onClick={() => setWho(who.includes(w) ? who.filter((x) => x !== w) : [...who, w])}>{t(`cr.w.${w}`)}</button>)}</p>
      </fieldset>

      <fieldset className="cr-step"><legend><span className="cr-n">3</span>{t("cr.s3")}</legend>
        <div className="cr-photos">
          {urls.map((u, i) => <span key={u} className="cr-thumb"><img src={u} alt="" /><button type="button" aria-label="×" onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>)}
          {files.length < 3 && <label className="cr-add"><Icon name="camera" /><span>{t("cr.photo")}</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { const add = Array.from(e.target.files || []); e.target.value = ""; setFiles([...files, ...add].slice(0, 3)); }} /></label>}
        </div>
        {files.length > 0 ? <label className="day small"><input type="checkbox" checked={useExif} onChange={(e) => setUseExif(e.target.checked)} />{t("cr.useExif")}</label>
          : <p className="muted small">{t("cr.photoHint")}</p>}
        <div className="cr-note">
          <input className="box" aria-label={t("cr.note")} placeholder={t("cr.notePh")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <MicButton lang={lang} onText={(x: string) => setNote((n) => (n ? n + " " : "") + x)} onError={() => {}} />
        </div>
        <label className="day small"><input type="checkbox" checked={wantReply} onChange={(e) => setWantReply(e.target.checked)} />{t("cr.contact")}</label>
        {wantReply && <div className="cr-contact">
          <input className="box" placeholder={t("cr.contactPh")} value={contact} maxLength={80} onChange={(e) => setContact(e.target.value)} autoComplete="tel" />
          <label className="day small"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t("cr.consent")}</label></div>}
      </fieldset>
      <button className="chip go cr-send" disabled={busy}>{busy ? t("cr.sending") : t("cr.send")}</button>
      {err && <p className="err small" role="alert">{err}</p>}
      <p className="muted small cr-privacy"><Icon name="info" /> {t("cr.privacy")}</p>
    </form>
  );
}

// 카카오 지도가 이 주소에서 안 뜨면(키·도메인) 지도 찍기 대신 다른 방법을 안내
function MapCheck({ onFail }: { onFail: () => void }) {
  useEffect(() => { const id = setTimeout(() => { if (!document.querySelector(".cr-map .map [style*='position']") && !(window as any).kakao?.maps) onFail(); }, 3500); return () => clearTimeout(id); }, []);   // eslint-disable-line
  return null;
}

export function StepBar({ status, t }: { status: string; t: T }) {
  const off = status === "반려" || status === "중복";
  const at = STEPS.indexOf(status);
  return (
    <ol className={`cr-steps${off ? " off" : ""}`} aria-label={t(`cr.st.${status}`)}>
      {off ? <li className="cur">{t(`cr.st.${status}`)}</li> : STEPS.map((s, i) => <li key={s} className={i < at ? "done" : i === at ? "cur" : ""} aria-current={i === at ? "step" : undefined}>{t(`cr.st.${s}`)}</li>)}
    </ol>);
}

export function MyReports({ t }: { t: T }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => { const ids = myIds(); if (!ids.length) { setRows([]); return; } getJSON(`/api/reports/mine?ids=${ids.join(",")}`).then(setRows).catch(() => setRows([])); };
  useEffect(() => { load(); window.addEventListener("gd-report-sent", load); return () => window.removeEventListener("gd-report-sent", load); }, []);   // eslint-disable-line
  async function find() {
    setMsg("");
    const r: any[] = await getJSON(`/api/reports/mine?code=${encodeURIComponent(code.trim())}`).catch(() => []);
    if (!r.length) { setMsg(t("cr.notFound")); return; }
    saveId(r[0].id); load(); setCode("");
  }
  return (
    <section className="cr-mine" aria-labelledby="cr-mine-h">
      <h2 id="cr-mine-h" className="h3 pp2-h"><Icon name="flag" />{t("cr.mine")}</h2>
      <form className="cr-lookup" onSubmit={(e) => { e.preventDefault(); if (code.trim()) find(); }}>
        <input className="box" aria-label={t("cr.lookup")} placeholder={t("cr.lookupPh")} value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="chip">{t("cr.find")}</button>
      </form>
      {msg && <p className="muted small" role="status">{msg}</p>}
      {rows && !rows.length && <p className="muted">{t("cr.mineNone")}</p>}
      <ul className="cr-list">{(rows || []).map((r) => (
        <li key={r.id} className="panel">
          <div className="cr-li-top"><b>{t(`cr.c.${r.category}`)}</b>{r.sample && <span className="badge b-unknown">{t("cr.sample")}</span>}
            <small className="muted">{r.code} · {String(r.created_at || "").slice(0, 10)}{r.place ? ` · ${r.place}` : ""}</small></div>
          {(r.summary || r.note) && <p className="small">{r.summary || r.note}</p>}
          <StepBar status={r.status} t={t} />
          {r.reply && <p className="cr-reply"><b>{t("cr.reply")}</b> {r.reply}</p>}
          {r.after_photo && <figure className="cr-after"><img src={`/api/reports/after/${r.id}`} alt={t("cr.after")} loading="lazy" /><figcaption>{t("cr.after")}</figcaption></figure>}
        </li>))}</ul>
    </section>
  );
}
