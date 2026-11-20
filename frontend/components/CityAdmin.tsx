"use client";
// 관리자 [제보·민원] — 시 담당자 화면 (docs/19_CITY_REPORTS.md 2-3)
//  목록(묶음 단위) · 몰리는 곳 지도 · 기간 요약(AI 보고서) · 설정(부서 이름·가상 데이터·백업)
// AI가 낸 분류·심각도·부서·우선순위는 담당자가 고칠 수 있고, 고친 값이 먼저 보인다(AI 값은 따로 남음).
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import KakaoMap from "@/components/KakaoMap";
import { Icon, Picto } from "@/components/Icon";

type Any = any;
const SEVC: Record<string, string> = { block: "#C9302C", help: "#E07A00", minor: "#B08A00" };
const PRIC: Record<string, string> = { urgent: "g-R", high: "b-unknown", normal: "b-plain", low: "b-plain" };
const OPEN = (s: string) => !["완료", "반려", "중복"].includes(s);
const iso = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

export function CityAdmin({ tok, call, onExpired, can }: { tok: string; call: Any; onExpired: () => void; can: (p: string) => boolean }) {
  const [view, setView] = useState<"list" | "map" | "sum" | "set">("list");
  const [d, setD] = useState<Any>(null);
  const [withSample, setWithSample] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ status: "열린 것", cat: "", dept: "", pri: "", q: "" });
  const load = () => api.get(`/api/admin/city?sample=${withSample ? 1 : 0}`, tok).then(setD).catch((e: Any) => { if (e.status === 401) onExpired(); });
  useEffect(() => { load(); }, [withSample]);   // eslint-disable-line
  const list = useMemo(() => (d?.clusters || []).filter((c: Any) =>
    (f.status === "전체" || (f.status === "열린 것" ? OPEN(c.status) : c.status === f.status)) && (!f.cat || c.category === f.cat) && (!f.dept || c.dept === f.dept)
    && (!f.pri || c.priority === f.pri) && (!f.q || `${c.title} ${c.summary} ${c.place_name} ${c.landmark}`.includes(f.q))), [d, f]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const openN = d.clusters.filter((c: Any) => OPEN(c.status));
  return (
    <div className="ca">
      {d.demo && <p className="ca-warn" role="note"><Picto name="ask" size={18} /><span>데모 화면이에요. 서버·AI가 연결되어 있지 않아 이 기기에서 보낸 제보만 '규칙'으로 보여요.</span></p>}
      {!d.ai && <p className="muted small"><Icon name="info" /> AI 연결 안 됨 — 새 제보는 이용자가 고른 종류로 '규칙' 정리돼요.</p>}
      <div className="ca-top">
        <div className="ca-kpi"><b>{openN.length}</b><small>처리할 곳</small></div>
        <div className="ca-kpi"><b>{openN.reduce((a: number, c: Any) => a + c.count, 0)}</b><small>처리할 제보</small></div>
        <div className="ca-kpi warn"><b>{openN.filter((c: Any) => c.stale || c.overdue).length}</b><small>밀린 곳 (7일·기한)</small></div>
        <div className="ca-kpi"><b>{openN.filter((c: Any) => c.priority === "urgent").length}</b><small>긴급</small></div>
      </div>
      <div className="tabs ca-views" role="group" aria-label="제보·민원 보기">
        {([["list", "목록"], ["map", "몰리는 곳 지도"], ["sum", "기간 요약"], ["set", "설정·백업"]] as const).map(([k, t]) =>
          <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{t}</button>)}
        {d.sample_loaded && <label className="day small ca-sample"><input type="checkbox" checked={withSample} onChange={(e) => setWithSample(e.target.checked)} />가상 제보 보기</label>}
      </div>

      {view === "list" && <>
        <div className="ca-filter">
          <select className="box sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="상태">{["열린 것", "전체", ...d.statuses].map((s: string) => <option key={s}>{s}</option>)}</select>
          <select className="box sm" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} aria-label="분류"><option value="">모든 분류</option>{Object.entries(d.cats).map(([k, v]: Any) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="box sm" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })} aria-label="부서"><option value="">모든 부서</option>{Object.entries(d.depts).map(([k, v]: Any) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="box sm" value={f.pri} onChange={(e) => setF({ ...f, pri: e.target.value })} aria-label="우선순위"><option value="">모든 우선순위</option>{Object.entries(d.pri).map(([k, v]: Any) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="box sm" placeholder="장소·내용 찾기" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <a className="chip sm" href={`/api/admin/city-export.csv?t=${tok}&sample=${withSample ? 1 : 0}`}>CSV 내려받기</a>
        </div>
        <ul className="ca-list">
          {list.map((c: Any) => <ClusterRow key={c.id} c={c} d={d} tok={tok} call={call} can={can} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} reload={load} />)}
          {!list.length && <li className="muted">조건에 맞는 제보가 없어요.</li>}
        </ul>
      </>}

      {view === "map" && <HotMap d={d} onPick={(id) => { setOpen(id); setF({ ...f, status: "전체" }); setView("list"); setTimeout(() => document.getElementById(`ca-${id}`)?.scrollIntoView({ block: "start" }), 50); }} />}
      {view === "sum" && <Summary tok={tok} withSample={withSample} onExpired={onExpired} />}
      {view === "set" && <Settings d={d} tok={tok} call={call} can={can} reload={load} />}
    </div>
  );
}

function ClusterRow({ c, d, tok, call, can, open, onToggle, reload }: Any) {
  const [e, setE] = useState({ status: c.status, category: c.category, severity: c.severity, dept: c.dept, priority: c.priority, reply: c.reports.find((r: Any) => r.reply)?.reply || "", memo: "" });
  const [into, setInto] = useState("");
  const [contact, setContact] = useState<Record<string, string>>({});
  const save = () => {
    const body: Any = { status: e.status !== c.status ? e.status : undefined, reply: e.reply, memo: e.memo };
    for (const k of ["category", "severity", "dept", "priority"]) if ((e as Any)[k] !== c[k]) body[k] = (e as Any)[k];
    call(() => api.post(`/api/admin/city/${c.id}`, body, tok), `묶음 ${c.count}건을 저장했어요.`).then(reload).catch(() => {});
  };
  const others = d.clusters.filter((x: Any) => x.id !== c.id && x.category === c.category && x.sample === c.sample);
  // 읽기 쉽게(2026-11-21 팀장 요청): 접힌 줄은 제목·부서·기간·상태 칩만, 펼치면 할 일 → 제보 한 줄씩 → 자주 쓰는 처리 칸. 나머지는 [더보기]에 접음(기능은 그대로).
  const late = c.stale || c.overdue;
  const age = Math.round(c.age_days);
  const dept = String(c.dept_name || "").replace(/\s*\(.*\)\s*$/, "");
  const md = (s: string) => String(s).slice(5, 16).replace("-", "/").replace("T", " ");
  const extra = (r: Any) => (r.triage?.obstacles || []).map((o: Any) => o.detail || o.type).filter(Boolean).join(", ");
  return (
    <li id={`ca-${c.id}`} className={`ca-row panel${late ? " stale" : ""}${c.sample ? " sample" : ""}${open ? " open" : ""}`}>
      <button className="ca-head" aria-expanded={open} onClick={onToggle}>
        <span className="ca-count" style={{ background: SEVC[c.severity] }} title={`${c.severity_name} · 제보 ${c.count}건`}>{c.count}</span>
        <span className="ca-main"><b>{c.sample && <span className="ca-sample-tag">가상</span>}{c.title}</b>
          <small className="muted">{dept} · {c.first_at.slice(5, 10).replace("-", "/")}~ {late ? <b className="ca-late">{age}일째 지연</b> : `${age}일째`}</small></span>
        <span className="ca-tags">
          {(c.priority === "urgent" || c.priority === "high") && <span className={`badge ${PRIC[c.priority]}`}>{c.priority_name}</span>}
          <span className={`badge st-${c.status.replace(" ", "")}`}>{c.status}</span>
          {c.privacy && <span title="사진에 얼굴·번호판이 보일 수 있어요 (공개 금지)"><Picto name="warn" size={18} label="개인정보 포함" /></span>}
        </span>
      </button>
      {open && <div className="ca-body">
        {c.action ? <p className="ca-do"><b>할 일</b> {c.action}</p> : <p className="ca-do">{c.summary}</p>}
        <p className="ca-meta small">
          {c.who.length > 0 && <span>대상 {c.who.join("·")}</span>}
          {c.near && <span>{c.near.name} {c.near.dist_m}m</span>}
          {c.lat && <span><a href={`https://map.kakao.com/link/map/${encodeURIComponent(c.title)},${c.lat},${c.lon}`} target="_blank" rel="noreferrer">지도</a> · <a href={`https://map.kakao.com/link/roadview/${c.lat},${c.lon}`} target="_blank" rel="noreferrer">로드뷰</a></span>}
          <span className="muted">분류 {c.edited ? "담당자" : c.by === "ai" ? "AI" : "규칙"}</span>
        </p>
        {c.action && c.count > 1 && c.summary && <details className="ca-more-sum"><summary className="small">묶음 요약</summary><p className="small">{c.summary}</p></details>}
        <ul className="ca-reports">{c.reports.map((r: Any) => (
          <li key={r.id}>
            <p className="ca-r-line"><b>{r.code}</b><small className="muted">{md(r.created_at)}</small>
              <span className="ca-r-q">{r.note ? `“${r.note}”` : r.triage?.summary || ""}</span>
              {c.count > 1 && <button className="link-btn small" onClick={() => call(() => api.post(`/api/admin/city/${c.id}/merge`, { split: r.id }, tok), "이 제보를 따로 떼었어요.").then(reload).catch(() => {})}>떼어 내기</button>}</p>
            {extra(r) && <p className="small ca-ai"><span className={`via ${r.triage.by === "ai" ? "via-llm" : "via-rule"}`}>{r.triage.by === "ai" ? "AI" : "규칙"}</span><span>{extra(r)}</span></p>}
            {((r.photos || []).length > 0 || r.has_contact) && <div className="ca-photos">
              {(r.photos || []).map((p: string) => <a key={p} href={`/api/admin/city-photo/${p}?t=${tok}`} target="_blank" rel="noreferrer"><img src={`/api/admin/city-photo/${p}?t=${tok}`} alt="제보 사진" loading="lazy" /></a>)}
              {(r.triage?.faces || r.triage?.plates) && <small className="ca-priv" title="공개·공유 금지"><Picto name="warn" size={16} />{[r.triage.plates && "번호판", r.triage.faces && "얼굴"].filter(Boolean).join("·")} 보임</small>}
              {r.has_contact && (contact[r.id] ? <small>연락처 <b>{contact[r.id]}</b></small>
                : <button className="link-btn small" title="본 기록이 남아요 · 완료 90일 뒤 자동 삭제" onClick={() => api.get(`/api/admin/city-contact/${r.id}`, tok).then((x: Any) => setContact({ ...contact, [r.id]: x.contact || "(없음)" }))}>연락처 보기</button>)}
            </div>}
          </li>))}</ul>
        <div className="visit-form ca-edit">
          <label>상태<select value={e.status} onChange={(x) => setE({ ...e, status: x.target.value })}>{d.statuses.map((s: string) => <option key={s}>{s}</option>)}</select></label>
          <label>담당 부서<select value={e.dept} onChange={(x) => setE({ ...e, dept: x.target.value })}>{Object.entries(d.depts).map(([k, v]: Any) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>우선순위{c.priority_rule && c.priority_rule !== e.priority && <small className="muted"> 제안 {d.pri[c.priority_rule]}</small>}<select value={e.priority} onChange={(x) => setE({ ...e, priority: x.target.value })}>{Object.entries(d.pri).map(([k, v]: Any) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="wide">공개 답변<textarea rows={2} value={e.reply} onChange={(x) => setE({ ...e, reply: x.target.value })} placeholder="이용자 [내 제보]에 보임 · 예: 12월 첫 주 보도블록 교체" /></label>
          <details className="wide ca-more" open={e.status === "반려" || undefined}>
            <summary>더보기 <small className="muted">분류·심각도·내부 메모·사진·알림·합치기</small></summary>
            <div className="visit-form">
              <label>분류<select value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })}>{Object.entries(d.cats).map(([k, v]: Any) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>심각도<select value={e.severity} onChange={(x) => setE({ ...e, severity: x.target.value })}>{Object.entries(d.sev).map(([k, v]: Any) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="wide">내부 메모 {e.status === "반려" && <b className="err">(반려 사유 필수)</b>}<input value={e.memo} onChange={(x) => setE({ ...e, memo: x.target.value })} /></label>
              <div className="wide save-row">
                <label className="chip"><input type="file" accept="image/*" hidden onChange={(x) => { const fl = x.target.files?.[0]; if (!fl) return; const fd = new FormData(); fd.append("photo", fl);
                  call(() => api.form(`/api/admin/city/${c.id}/after-photo`, fd, tok), "고친 뒤 사진을 올렸어요. 이용자 [내 제보]에 보여요.").then(reload).catch(() => {}); }} />고친 뒤 사진</label>
                {c.place_id && !c.sample && can("notice") && <button className="chip" onClick={() => call(() => api.post(`/api/admin/city/${c.id}/notice`, { title: c.title, body: c.summary, level: e.severity === "block" ? "warn" : "info" }, tok), "관광지 임시 알림으로 올렸어요. [임시 알림]에서 내릴 수 있어요.", `#/place/${c.place_id}`).then(reload).catch(() => {})}>여행 정보에 알리기</button>}
                {others.length > 0 && <span className="ca-merge"><select className="box sm" value={into} onChange={(x) => setInto(x.target.value)} aria-label="합칠 묶음"><option value="">합치기…</option>
                  {others.map((o: Any) => <option key={o.id} value={o.id}>{o.title} ({o.count}건)</option>)}</select>
                  {into && <button className="chip sm" onClick={() => call(() => api.post(`/api/admin/city/${c.id}/merge`, { into }, tok), "묶음을 합쳤어요.").then(reload).catch(() => {})}>합치기</button>}</span>}
              </div>
            </div>
          </details>
          <div className="wide save-row"><button className="chip go" onClick={save}>저장 ({c.count}건)</button></div>
        </div>
      </div>}
    </li>
  );
}

function HotMap({ d, onPick }: { d: Any; onPick: (id: string) => void }) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const cs = d.clusters.filter((c: Any) => c.lat && (!onlyOpen || OPEN(c.status)));
  const pins = cs.map((c: Any) => ({ lat: c.lat, lon: c.lon, label: `${c.sample ? "[가상] " : ""}${c.title}`, grade: null, color: SEVC[c.severity], icon: String(c.count),
    sub: `${c.count}건 · ${c.status} · ${c.priority_name}`, addr: c.dept_name }));
  const top = [...cs].sort((a: Any, b: Any) => b.count - a.count || b.score - a.score).slice(0, 8);
  return (
    <div className="ca-map">
      <div className="ca-legend"><span><i style={{ background: SEVC.block }} />지나갈 수 없음</span><span><i style={{ background: SEVC.help }} />도움 필요</span><span><i style={{ background: SEVC.minor }} />불편</span>
        <span className="muted small">숫자 = 알린 사람 수</span>
        <label className="day small"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />처리 안 된 곳만</label></div>
      <div className="ca-map-cols">
        <KakaoMap pins={pins} dots cluster start={{ lat: 37.523, lon: 129.11, level: 8 }} onPick={(i) => onPick(cs[i].id)} label="제보가 몰리는 곳 지도" />
        <ol className="ca-top-list">{top.map((c: Any) => <li key={c.id}><button onClick={() => onPick(c.id)}><span className="ca-count" style={{ background: SEVC[c.severity] }}>{c.count}</span>
          <span><b>{c.title}</b><small className="muted">{c.status} · {c.priority_name}{c.sample ? " · 가상" : ""}</small></span></button></li>)}</ol>
      </div>
    </div>
  );
}

function Summary({ tok, withSample, onExpired }: { tok: string; withSample: boolean; onExpired: () => void }) {
  const today = iso(new Date());
  const [range, setRange] = useState({ start: iso(new Date(Date.now() - 6 * 864e5)), end: today });
  const [s, setS] = useState<Any>(null);
  const [busy, setBusy] = useState(false);
  const get = (ai = false) => { setBusy(ai); return api.get(`/api/admin/city-summary?start=${range.start}&end=${range.end}&sample=${withSample ? 1 : 0}&ai_text=${ai ? 1 : 0}`, tok)
    .then((x: Any) => { setS(x); setBusy(false); }).catch((e: Any) => { setBusy(false); if (e.status === 401) onExpired(); }); };
  useEffect(() => { get(); }, [range, withSample]);   // eslint-disable-line
  const presets: [string, number][] = [["이번 주", 6], ["최근 30일", 29], ["최근 90일", 89]];
  const bars = (o: Record<string, number>) => { const m = Math.max(1, ...Object.values(o)); return <ul className="ca-bars">{Object.entries(o).map(([k, v]) => <li key={k}><span>{k}</span><i style={{ width: `${(v / m) * 100}%` }} /><b>{v}</b></li>)}</ul>; };
  return (
    <div className="ca-sum-view">
      <div className="ca-filter no-print">
        {presets.map(([t, n]) => <button key={t} className="chip sm" aria-pressed={range.start === iso(new Date(Date.now() - n * 864e5)) && range.end === today} onClick={() => setRange({ start: iso(new Date(Date.now() - n * 864e5)), end: today })}>{t}</button>)}
        <input className="box sm" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} aria-label="시작일" />~
        <input className="box sm" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} aria-label="끝일" />
        <button className="chip go sm" disabled={busy} onClick={() => get(true)}>{busy ? "AI가 보고서를 쓰는 중…" : "AI 보고서 만들기"}</button>
        <button className="chip sm" onClick={() => window.print()}>인쇄</button>
      </div>
      {!s ? <p className="muted">불러오는 중…</p> : <div className="ca-report">
        <h2 className="h3">불편 제보 기간 요약 <small className="muted">{s.stats.start} ~ {s.stats.end}{s.stats.with_sample ? " · 가상 제보 포함" : ""}</small></h2>
        <div className="ca-top">
          <div className="ca-kpi"><b>{s.stats.received}</b><small>들어온 제보</small></div>
          <div className="ca-kpi"><b>{s.stats.resolved}</b><small>완료</small></div>
          <div className="ca-kpi"><b>{s.stats.avg_days ?? "-"}</b><small>평균 처리일</small></div>
          <div className="ca-kpi warn"><b>{s.stats.open}</b><small>처리 대기 ({s.stats.open_clusters}곳)</small></div>
        </div>
        {s.report && <section className="ca-ai-rep">
          <p className="ca-rep-h"><span className={`via ${s.report.by === "ai" ? "via-llm" : "via-rule"}`}>{s.report.by === "ai" ? "AI 보고서" : "규칙 요약 (AI 연결 안 됨)"}</span> <b>{s.report.headline}</b></p>
          {([["핵심", s.report.highlights], ["많이 몰린 곳", s.report.hotspots], ["오래 밀린 건", s.report.delayed], ["부서별 할 일", s.report.by_dept], ["다음 기간 제안", s.report.next]] as [string, string[]][])
            .filter(([, xs]) => xs?.length).map(([h, xs]) => <div key={h}><h3>{h}</h3><ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul></div>)}
          <p className="muted small">{s.report.by === "ai" ? "숫자는 서버가 계산했고, AI는 문장만 썼어요. 결재에 붙이기 전에 한 번 확인해 주세요." : "AI가 연결되지 않아 서버가 계산한 숫자로만 정리했어요."}</p>
        </section>}
        <div className="ca-two">
          <div><h3>종류별</h3>{bars(s.stats.by_category)}</div>
          <div><h3>부서별</h3>{bars(s.stats.by_dept)}</div>
        </div>
        <div className="ca-two">
          <div><h3>많이 몰린 곳 (처리 대기)</h3><ol>{s.hot.map((c: Any) => <li key={c.id}>{c.title} — <b>{c.count}건</b> · {c.status}{c.sample ? " · 가상" : ""}</li>)}</ol></div>
          <div><h3>오래 밀린 건</h3><ol>{s.stale.map((c: Any) => <li key={c.id}>{c.title} — {Math.round(c.age_days)}일째 {c.status}</li>)}{!s.stale.length && <li className="muted">없어요</li>}</ol></div>
        </div>
      </div>}
    </div>
  );
}

function Settings({ d, tok, call, can, reload }: Any) {
  const [depts, setDepts] = useState<Record<string, string>>(d.depts);
  return (
    <div className="ca-set">
      <section className="panel">
        <h3>담당 부서 이름 {!can("accounts") && <small className="muted">(총괄 관리자만 바꿀 수 있어요)</small>}</h3>
        <p className="muted small">AI·규칙이 고르는 부서 목록이에요. 시의 실제 부서 이름으로 바꿔 주세요.</p>
        <div className="visit-form">{Object.entries(depts).map(([k, v]) => <label key={k}>{k}<input value={v} disabled={!can("accounts")} onChange={(e) => setDepts({ ...depts, [k]: e.target.value })} /></label>)}</div>
        {can("accounts") && <button className="chip go" onClick={() => call(() => api.post("/api/admin/city-settings", { depts }, tok), "부서 이름을 저장했어요.").then(reload).catch(() => {})}>저장</button>}
      </section>
      <section className="panel">
        <h3>가상 제보·문의 (점검용)</h3>
        <p className="muted small">가상 제보 18건(묵호항 보도 5건, 동해역 앞 횡단보도 3건, 추암 주차장 3건 등)·가상 문의 5건과 가상 알림·행사·AI 제안·현장 확인 기록을 넣어 관리자 화면을 확인해요. 실제 제보·문의 파일과 따로 두고, 관리자 화면에만 [가상]으로 보여요. 공개 지도·관광지 알림·최근 길 상태에는 쓰이지 않아요. 모두 지우면 서버를 다시 켜도 다시 들어가지 않아요.</p>
        <div className="chips">
          <button className="chip go" onClick={() => call(() => api.post("/api/admin/city-sample", { action: "load" }, tok), "가상 제보·문의를 넣었어요.").then(reload).catch(() => {})}>{d.sample_loaded ? "가상 데이터 다시 넣기" : "가상 데이터 넣기"}</button>
          {d.sample_loaded && <button className="chip" onClick={() => { if (confirm("가상 제보·문의를 모두 지울까요? (실제 제보·문의는 그대로예요)")) call(() => api.post("/api/admin/city-sample", { action: "clear" }, tok), "가상 제보·문의를 모두 지웠어요.").then(reload).catch(() => {}); }}>가상 데이터 모두 지우기</button>}
        </div>
      </section>
      <section className="panel">
        <h3>백업 {!can("backup") && <small className="muted">(총괄 관리자만)</small>}</h3>
        <p className="muted small">{d.persistent ? "영구 디스크에 저장 중이에요. 그래도 가끔 내려받아 두세요." : "지금은 재배포 때 제보가 지워질 수 있어요. 재배포 전에 꼭 내려받고, 다시 켠 뒤 올려 주세요."} 백업에는 연락처(개인정보)가 들어 있어요 — 안전한 곳에 두세요.</p>
        {can("backup") && <div className="chips">
          <a className="chip go" href={`/api/admin/city-backup?t=${tok}`}>백업 내려받기 (.zip)</a>
          <label className="chip"><input type="file" accept=".zip" hidden onChange={(e) => { const fl = e.target.files?.[0]; if (!fl) return; const fd = new FormData(); fd.append("file", fl);
            call(() => api.form("/api/admin/city-restore", fd, tok), "백업을 되살렸어요.").then(reload).catch(() => {}); }} />백업 올리기</label>
        </div>}
      </section>
    </div>
  );
}
