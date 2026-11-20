"use client";
// 관리자 [자동 갱신] (docs/20_AUTO_SYNC.md): 검수 대기 · 자동 반영 기록(되돌리기) · 소스 상태(지금 실행) · 자동 갱신 설정
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon, Picto } from "@/components/Icon";

type Any = any;
const KIND: Record<string, [string, string]> = { update: ["변경", "b-plain"], conflict: ["충돌 (관리자 값과 다름)", "g-R"], mismatch: ["불일치 (출처끼리 다름)", "g-R"],
  recheck: ["다시 확인 요청", "b-unknown"], access: ["이동약자 정보 · 현장 확인 필요", "b-unknown"], closure: ["폐업 의심", "b-unknown"] };
const RES: Record<string, string> = { auto: "자동 반영", approved: "승인", rejected: "거절", reverted: "되돌림", drop: "버림", checked: "확인함", superseded: "불일치로 넘김" };
const RULE: Record<string, string> = { auto: "자동 반영", review: "검수", off: "끄기" };
const fmt = (v: Any) => v == null || v === "" ? "(없음)" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? (v.name ? `${v.name}${v.start ? ` · ${v.start}~${v.end || ""}` : ""}` : JSON.stringify(v)) : String(v);

export function SyncAdmin({ tok, call, onExpired, can }: { tok: string; call: Any; onExpired: () => void; can: (p: string) => boolean }) {
  const [d, setD] = useState<Any>(null);
  const [view, setView] = useState<"pending" | "log" | "src" | "set">("pending");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/api/admin/sync", tok).then(setD).catch((e: Any) => { if (e.status === 401) onExpired(); });
  useEffect(() => { load(); }, []);   // eslint-disable-line
  if (!d) return <p className="muted">불러오는 중…</p>;
  const runNow = (source = "") => { setBusy(true); call(() => api.post(`/api/admin/sync/run?scope=all${source ? `&source=${source}` : ""}`, {}, tok), "자동 갱신을 돌렸어요.").then(load).catch(() => {}).finally(() => setBusy(false)); };
  return (
    <div className="sy">
      {d.demo && <p className="ca-warn" role="note"><Picto name="ask" size={18} /><span>데모 화면이에요. 서버가 없어 자동 갱신이 연결되어 있지 않아요.</span></p>}
      <div className="tabs ca-views" role="group" aria-label="자동 갱신 보기">
        {([["pending", `검수 대기 (${d.pending.length})`], ["log", "반영 기록"], ["src", "소스 상태"], ["set", "자동 갱신 설정"]] as const).map(([k, t]) =>
          <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{t}</button>)}
        <button className="chip go sm ca-sample" disabled={busy || !can("data")} onClick={() => runNow()}>{busy ? "도는 중…" : "지금 실행"}</button>
      </div>
      {view === "pending" && <ul className="sy-list">
        {d.pending.map((c: Any) => <Pending key={c.id} c={c} tok={tok} call={call} reload={load} />)}
        {!d.pending.length && <li className="muted">검수할 건이 없어요.</li>}
      </ul>}
      {view === "log" && <div className="tbl-wrap"><table className="tbl sy-log">
        <thead><tr><th>때</th><th>장소·항목</th><th>이전 → 새 값</th><th>출처</th><th>결과</th><th /></tr></thead>
        <tbody>{d.log.map((c: Any) => <tr key={c.id}>
          <td>{String(c.decided_at || c.at).slice(5, 16).replace("T", " ")}</td>
          <td><b>{c.place_name || "—"}</b> <small className="muted">{c.group_ko}</small></td>
          <td>{fmt(c.old)} → <b>{fmt(c.applied ?? c.new)}</b></td>
          <td><small>{c.source_name}</small></td>
          <td><span className="badge b-plain">{RES[c.result] || c.result}</span>{c.decided_by && <small className="muted"> {c.decided_by}</small>}{c.reason && <small className="muted"> · {c.reason}</small>}</td>
          <td>{["auto", "approved"].includes(c.result) && c.history_id && can("history") && <button className="chip sm" onClick={() => call(() => api.post(`/api/admin/sync/changes/${c.id}/revert`, {}, tok), "되돌렸어요.").then(load).catch(() => {})}>되돌리기</button>}</td>
        </tr>)}{!d.log.length && <tr><td colSpan={6} className="muted">아직 기록이 없어요.</td></tr>}</tbody></table></div>}
      {view === "src" && <ul className="sy-src">{d.sources.map((s: Any) => <li key={s.id} className="panel">
        <div className="sy-src-top"><b>{s.name || s.id}</b><span className="badge b-plain">{s.grade}등급</span><small className="muted">{s.every === "7d" ? "주 1번" : "매일"}</small>
          {can("data") && <button className="chip sm" disabled={busy} onClick={() => runNow(s.id)}>이것만 실행</button>}</div>
        <p className="small">{s.last_ok ? <><Picto name="ok" size={14} /> 마지막 성공 {String(s.last_ok).replace("T", " ").slice(0, 16)} · {s.n ?? 0}건</> : <span className="muted">아직 실행 안 됨</span>}
          {s.last_err && <><br /><Picto name="warn" size={14} /> <span className="err">{s.last_err}</span></>}</p>
      </li>)}
        <li className="muted small">2단계(공식 홈페이지 AI 추출)에서 읽을 수 있는 도메인: {d.allow.join(", ")}</li></ul>}
      {view === "set" && <Rules d={d} tok={tok} call={call} can={can} reload={load} />}
      {(d.suspect.length > 0 || d.hidden.length > 0) && <p className="muted small">폐업 의심(목록에 '폐업 의심' 표시): {d.suspect.join(", ") || "없음"} · 숨긴 식당: {d.hidden.join(", ") || "없음"}</p>}
    </div>
  );
}

function Pending({ c, tok, call, reload }: Any) {
  const [val, setVal] = useState<string>(c.kind === "mismatch" ? "" : fmt(c.new));
  const [edit, setEdit] = useState(false);
  const send = (action: string, value?: Any) => call(() => api.post(`/api/admin/sync/changes/${c.id}`, { action, value }, tok), action === "reject" ? "거절했어요." : "승인해서 반영했어요.").then(reload).catch(() => {});
  const k = KIND[c.kind] || KIND.update;
  const parse = (s: string) => c.field === "coord" ? s : c.field === "closed_days" ? s.split(",").map((x) => +x.trim()) : s;
  return (
    <li className="panel sy-item">
      <div className="sy-top"><b>{c.place_name || (c.field === "closure" ? c.new?.name : "새 항목")}</b><span className="muted">{c.group_ko}{c.field.startsWith("access.") ? ` (${c.field.slice(7)})` : ""}</span>
        <span className={`badge ${k[1]}`}>{k[0]}</span><span className="badge b-plain" title="코드가 계산: 출처 등급 + 같은 값을 낸 출처 수 + 근거 + 최신성">신뢰도 {c.confidence}</span></div>
      {c.kind === "mismatch" ? <div className="sy-opts" role="radiogroup" aria-label="출처별 값">
        <p className="small muted">지금 값: {fmt(c.old)}</p>
        {c.options.map((o: Any) => <label key={o.source} className="day"><input type="radio" name={`m-${c.id}`} checked={val === fmt(o.value)} onChange={() => setVal(fmt(o.value))} />
          <b>{fmt(o.value)}</b> <small className="muted">— {o.source}</small>{o.url && <> <a href={o.url} target="_blank" rel="noreferrer">원문</a></>}</label>)}
      </div> : <p className="sy-diff"><span className="sy-old">{fmt(c.old)}</span> <span aria-hidden="true">→</span> <b className="sy-new">{fmt(c.new)}</b>
        {c.moved_m != null && <small className="muted"> ({c.moved_m}m 이동)</small>}{c.kind === "conflict" && <small> · 관리자 값: <b>{fmt(c.admin_value)}</b></small>}</p>}
      {c.evidence && <p className="sy-ev"><small>근거</small> <mark>{c.evidence}</mark></p>}
      <p className="small muted">{c.source_name}{c.url && <> · <a href={c.url} target="_blank" rel="noreferrer">원문 보기</a></>} · {c.reason}</p>
      {c.site_check && <p className="small"><Picto name="warn" size={16} /> 현장 확인 필요 — 승인하기 전에 현장·전화로 확인해 주세요.</p>}
      {edit && c.kind !== "mismatch" && <label className="sy-edit">고칠 값<input className="box" value={val} onChange={(e) => setVal(e.target.value)} /></label>}
      <div className="chips">
        {c.kind === "recheck" ? <button className="chip go sm" onClick={() => send("approve")}>확인함 (바꾸지 않음)</button>
          : c.kind === "mismatch" ? <button className="chip go sm" disabled={!val} onClick={() => send("approve", parse(val))}>고른 값으로 승인</button>
          : <>
            <button className="chip go sm" onClick={() => send("approve", edit ? parse(val) : undefined)}>{edit ? "고친 값으로 승인" : c.field === "closure" ? "목록에서 숨기기" : "승인"}</button>
            {c.field !== "closure" && c.field !== "event" && <button className="chip sm" aria-pressed={edit} onClick={() => setEdit(!edit)}>고쳐서 승인</button>}</>}
        <button className="chip sm" onClick={() => send("reject")}>거절</button>
      </div>
    </li>
  );
}

function Rules({ d, tok, call, can, reload }: Any) {
  const [r, setR] = useState<Record<string, string>>(d.rules);
  const owner = can("accounts");
  return (
    <div className="panel">
      <p className="muted small">항목마다 공식 소스(1등급)에서 바뀐 값을 어떻게 할지 정해요. 블로그·커뮤니티(3등급)는 항상 '다시 확인 요청'만 만들어요. 관리자가 직접 고친 값은 자동으로 덮어쓰지 않고 '충돌'로 올라와요.{!owner && " 바꾸기는 총괄 관리자만 할 수 있어요."}</p>
      <table className="tbl"><thead><tr><th>항목</th><th>처리</th><th>기본값</th></tr></thead>
        <tbody>{Object.entries(d.groups).map(([k, ko]: Any) => <tr key={k}><td>{ko}{k === "coord" && <small className="muted"> (50m 넘게 움직이면 검수)</small>}</td>
          <td><select className="box sm" disabled={!owner} value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })} aria-label={`${ko} 처리`}>
            {(["auto", "review", "off"] as const).filter((v) => !(d.locked.includes(k) && v === "auto")).map((v) => <option key={v} value={v}>{RULE[v]}</option>)}</select>
            {d.locked.includes(k) && <small className="muted"> 자동 금지</small>}</td>
          <td><small className="muted">{RULE[d.defaults[k]]}</small></td></tr>)}</tbody></table>
      {owner && <button className="chip go" onClick={() => call(() => api.post("/api/admin/sync/rules", { rules: r }, tok), "자동 갱신 설정을 저장했어요.").then(reload).catch(() => {})}>저장</button>}
    </div>
  );
}
