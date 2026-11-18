"use client";
// 관리자: 계정마다 로그인 → 역할(총괄 관리자·편집자·현장 조사원)에 맞는 탭만 보인다.
// 장소 정보·임시 알림·공지·행사를 고치면 사이트에 바로 반영. 모든 변경은 '누가' 바꿨는지와 함께 이력에 남고 되돌릴 수 있다.
// 팀 현장 확인 기록과 이용자 제보 검수, 관리자 계정 관리도 여기서 한다. (관리 화면은 팀용이라 한국어만)
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

type Lang = "ko" | "en";
// [탭, 이름, 필요한 권한(null = 누구나)]
const TABS = [["home", "한눈에", null], ["place", "장소 정보", "place"], ["notice", "임시 알림", "notice"], ["site", "공지·행사", "site"], ["reports", "제보 검수", "reports"],
  ["visits", "현장 확인 기록", "visits"], ["history", "변경 이력·백업", "history"], ["data", "공공데이터 점검", "data"], ["accounts", "계정 관리", "accounts"], ["me", "내 계정", null]] as const;
type TabKey = (typeof TABS)[number][0];
type User = { id: string; name: string; role: string; role_name: string; perms: string[]; must_change?: boolean; expires_at?: string };
const ROLE_INFO: Record<string, string> = { owner: "모든 일 + 계정 관리·백업·초기화", editor: "장소·알림·공지·행사·제보·현장 기록·되돌리기", surveyor: "현장 확인 기록 입력과 제보 검수만" };
const LEVEL: Record<string, string> = { closed: "임시 휴무 (코스에서 빠짐)", warn: "주의 (공사·우회 등)", info: "안내" };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const ACTION: Record<string, string> = { place: "장소 정보 수정", notice_add: "알림 올림", notice_remove: "알림 내림", banner: "공지 배너", event_add: "행사 추가",
  event_remove: "행사 삭제", revert: "되돌리기", restore: "백업 복원", reset: "처음 상태로", account_add: "계정 만듦", account_update: "계정 바꿈", password: "비밀번호 변경" };
const STATUS = ["접수", "확인 중", "반영", "반려"];
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "wide" : undefined}>{label}{children}</label>;
}

export function AdminPage({ lang }: { lang: Lang }) {
  const [tok, setTok] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [info, setInfo] = useState<{ demo: boolean; id?: string; password?: string } | null>(null);
  const [id, setId] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    try { const t = sessionStorage.getItem("gd-admin-tok") || ""; setTok(t);
      if (t) api.get("/api/admin/me", t).then(setUser).catch(() => { setTok(""); sessionStorage.removeItem("gd-admin-tok"); }); } catch { /* 무시 */ }
    api.get("/api/admin/login-info").then(setInfo).catch(() => setInfo({ demo: false }));
  }, []);
  async function login(uid = id, pass = pw) {
    setErr("");
    try {
      const r = await api.post("/api/admin/login", { id: uid, password: pass });
      setTok(r.token); setUser(r.user); try { sessionStorage.setItem("gd-admin-tok", r.token); } catch { /* 무시 */ }
    } catch (e: any) { setErr(e.message || "로그인하지 못했어요."); }
  }
  function demoLogin() {   // [임시 로그인]: 대표 계정을 자동으로 채우고 바로 로그인
    if (!info?.id || !info.password) return;
    setId(info.id); setPw(info.password); login(info.id, info.password);
  }
  function logout() { api.post("/api/admin/logout", {}, tok).catch(() => {}); setTok(""); setUser(null); try { sessionStorage.removeItem("gd-admin-tok"); } catch { /* 무시 */ } }

  if (!tok) return (
    <section className="sec wrap admin">
      <div className="page-head"><nav className="crumb"><a href="#/">처음</a> › 관리자</nav><h1>관리자 로그인</h1>
        <p className="muted">관리자 계정으로 들어가요. 계정마다 할 수 있는 일이 달라요. 여기서 바꾼 내용은 사이트에 바로 반영돼요.</p></div>
      <form className="panel login" onSubmit={(e) => { e.preventDefault(); login(); }}>
        <label>아이디<input autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} /></label>
        <label>비밀번호<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <div className="chips">
          <button className="chip go">로그인</button>
          {info?.demo && <button type="button" className="chip demo" onClick={demoLogin}>임시 로그인</button>}
        </div>
        {info?.demo && <p className="muted small">[임시 로그인]은 본선 시연용이에요. 누르면 총괄 관리자 계정이 자동으로 들어가요. 대회가 끝나면 서버 설정(DEMO_LOGIN)에서 꺼 주세요.</p>}
        <p className="muted small">비밀번호를 5번 틀리면 10분 동안 잠겨요. 계정이 없으면 총괄 관리자에게 만들어 달라고 하세요.</p>
        {err && <p role="alert" className="err">{err}</p>}
      </form>
    </section>
  );
  if (!user) return <section className="sec wrap admin"><p className="muted" role="status">계정 정보를 불러오는 중…</p></section>;
  return <Console tok={tok} user={user} setUser={setUser} onLogout={logout} onExpired={() => { setTok(""); setUser(null); setErr("로그인 시간이 지났어요. 다시 로그인해 주세요."); }} />;
}

function Console({ tok, user, setUser, onLogout, onExpired }: { tok: string; user: User; setUser: (u: User) => void; onLogout: () => void; onExpired: () => void }) {
  const can = (perm: string | null) => !perm || user.perms.includes(perm);
  const tabs = TABS.filter(([, , perm]) => can(perm));
  const [tab, setTab] = useState<TabKey>(user.must_change ? "me" : "home");
  const [db, setDb] = useState<any>(null);
  const [places, setPlaces] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const call = async (fn: () => Promise<any>, ok: string, link?: string) => {
    setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: ok, link }); await reload(); return r; }
    catch (e: any) { if (e.status === 401) onExpired(); else setMsg({ ok: false, text: e.message || "저장하지 못했어요." }); throw e; }
  };
  async function reload() {
    try { setDb(await api.get("/api/admin/cms", tok)); } catch (e: any) { if (e.status === 401) onExpired(); }
    api.get("/api/places").then((ps: any[]) => setPlaces(ps)).catch(() => {});
  }
  useEffect(() => { reload(); }, []);
  const name = (pid: string) => places.find((p) => p.id === pid)?.name_ko || pid;
  return (
    <section className="sec wrap admin">
      <div className="page-head admin-top">
        <div><nav className="crumb"><a href="#/">처음</a> › 관리자</nav><h1>관리자</h1>
          <p className="muted">저장하면 바로 사이트에 보여요. 잘못 바꿨으면 [변경 이력]에서 되돌리세요.</p></div>
        <div className="admin-who">
          <span className="who-badge"><b>{user.name}</b> <small className={`role-${user.role}`}>{user.role_name}</small></span>
          {user.expires_at && <small className="muted">{user.expires_at.slice(11, 16)}까지 로그인 유지</small>}
          <button className="chip" onClick={onLogout}>로그아웃</button>
        </div>
      </div>
      {user.must_change && tab !== "me" && <p className="admin-msg bad" role="alert">처음 받은 임시 비밀번호예요. [내 계정]에서 비밀번호를 바꿔 주세요. <button className="link-btn" onClick={() => setTab("me")}>지금 바꾸기</button></p>}
      <div className="tabs admin-tabs" role="group" aria-label="관리 메뉴">
        {tabs.map(([k, t]) => <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setMsg(null); }}>{t}</button>)}
      </div>
      {msg && <p role="status" className={`admin-msg ${msg.ok ? "ok" : "bad"}`}>{msg.ok ? "✓ " : "! "}{msg.text}{msg.link && <> · <a href={msg.link}>사이트에서 보기</a></>}</p>}
      {tab === "home" && <Dashboard tok={tok} user={user} go={(k: TabKey) => setTab(k)} can={can} onExpired={onExpired} />}
      {tab === "accounts" && can("accounts") && <Accounts tok={tok} call={call} me={user} />}
      {tab === "me" && <MyAccount tok={tok} user={user} call={call} onChanged={() => setUser({ ...user, must_change: false })} />}
      {tab === "place" && <PlaceEditor places={places} db={db} tok={tok} call={call} />}
      {tab === "notice" && <Notices places={places} db={db} tok={tok} call={call} name={name} />}
      {tab === "site" && <SiteEditor db={db} tok={tok} call={call} />}
      {tab === "reports" && <Reports tok={tok} call={call} onExpired={onExpired} canNotice={can("notice")} />}
      {tab === "visits" && <Visits places={places} tok={tok} call={call} me={user} />}
      {tab === "history" && <History db={db} tok={tok} call={call} name={name} canBackup={can("backup")} />}
      {tab === "data" && <Probe tok={tok} />}
    </section>
  );
}

/* ---------- 장소 정보 ---------- */
function PlaceEditor({ places, db, tok, call }: any) {
  const [pid, setPid] = useState("");
  const [f, setF] = useState<any>({});
  const [segs, setSegs] = useState<any[]>([]);
  const [reason, setReason] = useState("");
  const [orig, setOrig] = useState<any>(null);
  useEffect(() => {
    if (!pid) return;
    api.place(pid).then((p: any) => {
      setOrig(p); setReason("");
      setF({ open: p.open || "", close: p.close || "", b0: p.break_time?.[0] || "", b1: p.break_time?.[1] || "", closed_day_nums: p.closed_day_nums || [],
        last_entry: p.last_entry || "", stay_min: p.stay_min, phone: p.phone || "", fee: p.fee || "", intro_ko: p.intro_ko || "", tip_ko: p.tip_ko || "",
        carer_tip: p.carer_tip || "", walk_load: p.walk_load, wheelchair: p.wheelchair, entrance_step: tri(p.entrance_step), table: p.table || "",
        indoor: tri(p.indoor), benches: tri(p.benches) });
      setSegs((p.segments || []).map((s: any) => ({ ...s })));
    });
  }, [pid, db]);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  function diff() {
    if (!orig) return { fields: {}, segments: null };
    const want: any = { open: f.open, close: f.close, break_time: f.b0 && f.b1 ? [f.b0, f.b1] : null, closed_day_nums: f.closed_day_nums, last_entry: f.last_entry,
      stay_min: f.stay_min === "" ? null : +f.stay_min, phone: f.phone, fee: f.fee, intro_ko: f.intro_ko, tip_ko: f.tip_ko, carer_tip: f.carer_tip,
      walk_load: f.walk_load, wheelchair: f.wheelchair, entrance_step: untri(f.entrance_step), table: f.table, indoor: untri(f.indoor), benches: untri(f.benches) };
    const fields: any = {};
    for (const [k, v] of Object.entries(want)) if (JSON.stringify(norm(v)) !== JSON.stringify(norm(orig[k]))) fields[k] = v;
    const segChanged = JSON.stringify(segs.map(segKey)) !== JSON.stringify((orig.segments || []).map(segKey));
    return { fields, segments: segChanged ? segs : null };
  }
  const d = diff();
  const changed = Object.keys(d.fields).length + (d.segments ? 1 : 0);
  const access = ["walk_load", "wheelchair", "entrance_step", "table", "indoor", "benches"].some((k) => k in d.fields) || !!d.segments;
  const ov = db?.overrides?.[pid] || {};
  return (
    <div className="panel">
      <label className="pick-place">고칠 장소
        <select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">고르세요</option>
          {places.map((p: any) => <option key={p.id} value={p.id}>{p.name_ko}{p.sample ? " (예시)" : ""}{db?.overrides?.[p.id] || db?.segments?.[p.id] ? " · 수정됨" : ""}</option>)}</select></label>
      {pid && orig && (<form className="visit-form" onSubmit={(e) => { e.preventDefault();
        call(() => api.post(`/api/admin/places/${pid}`, { fields: d.fields, segments: d.segments, reason }, tok), `${orig.name_ko} 정보를 바꿨어요. 코스 추천과 장소 페이지에 바로 반영됐어요.`, `#/place/${pid}`); }}>
        <h2 className="h3">운영시간 {Object.keys(ov).some((k) => ["open", "close", "break_time", "closed_day_nums"].includes(k)) && <span className="badge b-plain">관리자 확인</span>}</h2>
        <Field label="여는 시각"><input type="time" value={f.open} onChange={(e) => set("open", e.target.value)} /></Field>
        <Field label="닫는 시각 (상시 개방은 24:00)"><input value={f.close} placeholder="18:00" onChange={(e) => set("close", e.target.value)} /></Field>
        <Field label="쉬는 시간 시작"><input type="time" value={f.b0} onChange={(e) => set("b0", e.target.value)} /></Field>
        <Field label="쉬는 시간 끝"><input type="time" value={f.b1} onChange={(e) => set("b1", e.target.value)} /></Field>
        <Field label="마지막 입장"><input type="time" value={f.last_entry} onChange={(e) => set("last_entry", e.target.value)} /></Field>
        <Field label="머무는 시간(분)"><input inputMode="numeric" value={f.stay_min} onChange={(e) => set("stay_min", e.target.value)} /></Field>
        <fieldset className="wide days"><legend>정기 휴무</legend>
          {WD.map((w, i) => <label key={w} className="day"><input type="checkbox" checked={f.closed_day_nums.includes(i)}
            onChange={(e) => set("closed_day_nums", e.target.checked ? [...f.closed_day_nums, i].sort() : f.closed_day_nums.filter((x: number) => x !== i))} />{w}</label>)}
        </fieldset>
        <Field label="전화"><input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="요금"><input value={f.fee} onChange={(e) => set("fee", e.target.value)} /></Field>
        <Field label="소개" wide><textarea rows={2} value={f.intro_ko} onChange={(e) => set("intro_ko", e.target.value)} /></Field>
        <Field label="한 줄 팁" wide><input value={f.tip_ko} onChange={(e) => set("tip_ko", e.target.value)} /></Field>

        <h2 className="h3">걷기·접근성 <span className="muted small">(바꾸면 근거 필수)</span></h2>
        <Field label="걷기 정보"><select value={f.walk_load} onChange={(e) => set("walk_load", e.target.value)}>{["평지", "완만한경사", "급경사", "확인 전"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="휠체어"><select value={f.wheelchair} onChange={(e) => set("wheelchair", e.target.value)}>{["가능", "일부", "불가", "확인 전"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="출입구 턱"><select value={f.entrance_step} onChange={(e) => set("entrance_step", e.target.value)}><option value="">모름</option><option value="yes">있음</option><option value="no">없음</option></select></Field>
        <Field label="테이블 (식당·카페)"><select value={f.table} onChange={(e) => set("table", e.target.value)}><option value="">-</option>{["입식", "좌식", "혼합"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="실내"><select value={f.indoor} onChange={(e) => set("indoor", e.target.value)}><option value="">모름</option><option value="yes">실내</option><option value="no">야외</option></select></Field>
        <Field label="쉬는 벤치"><select value={f.benches} onChange={(e) => set("benches", e.target.value)}><option value="">모름</option><option value="yes">있음</option><option value="no">없음</option></select></Field>
        <Field label="보호자 꿀팁" wide><textarea rows={2} value={f.carer_tip} onChange={(e) => set("carer_tip", e.target.value)} /></Field>

        <div className="wide">
          <h2 className="h3">도착부터 떠날 때까지 구간</h2>
          <div className="tbl-wrap"><table className="tbl seg-edit">
            <thead><tr><th>구간</th><th>경사(°)</th><th>턱(cm)</th><th>폭(m)</th><th>계단</th><th>바닥</th><th>메모</th><th>출처</th><th /></tr></thead>
            <tbody>{segs.map((s, i) => (
              <tr key={i}>
                {(["name", "slope_deg", "curb_cm", "width_m", "steps", "surface", "note", "source"] as const).map((k) =>
                  <td key={k}><input aria-label={k} value={s[k] ?? ""} onChange={(e) => setSegs(segs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></td>)}
                <td><button type="button" className="chip" onClick={() => setSegs(segs.filter((_, j) => j !== i))} aria-label="구간 삭제">삭제</button></td>
              </tr>))}</tbody>
          </table></div>
          <button type="button" className="chip" onClick={() => setSegs([...segs, { name: "", source: "현장 답사" }])}>구간 추가</button>
        </div>
        <Field label={access ? "바꾼 이유·근거 (필수: 측정값, 확인한 날짜, 확인한 사람)" : "바꾼 이유 (선택)"} wide>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 11/20 현장 측정 — 매표소 앞 경사 4°, 정일환 확인" /></Field>
        <div className="wide save-row">
          <button className="chip go" disabled={!changed || (access && reason.trim().length < 4)}>저장하고 바로 반영</button>
          <span className="muted small">{changed ? `바뀐 항목 ${changed}개` : "바뀐 것이 없어요"}</span>
          <a className="chip" href={`#/place/${pid}`}>장소 페이지 보기</a>
        </div>
      </form>)}
    </div>
  );
}
const tri = (v: any) => (v === true ? "yes" : v === false ? "no" : "");
const untri = (v: string) => (v === "yes" ? true : v === "no" ? false : null);
const norm = (v: any) => (v === "" || v === undefined ? null : v);
const segKey = (s: any) => ["name", "slope_deg", "curb_cm", "width_m", "steps", "surface", "note", "source"].map((k) => (s[k] === "" || s[k] == null ? null : String(s[k])));

/* ---------- 임시 알림 ---------- */
function Notices({ places, db, tok, call, name }: any) {
  const blank = { place_id: "", level: "warn", title: "", body: "", start: today(), end: "" };
  const [n, setN] = useState<any>(blank);
  return (<>
    <form className="panel visit-form" onSubmit={(e) => { e.preventDefault();
      call(() => api.post("/api/admin/notices", n, tok), "알림을 올렸어요. 장소 페이지와 코스 추천에 바로 반영됐어요.", n.place_id ? `#/place/${n.place_id}` : "#/").then(() => setN(blank)); }}>
      <h2 className="h3">알림 올리기</h2>
      <Field label="장소 (비우면 사이트 전체)"><select value={n.place_id} onChange={(e) => setN({ ...n, place_id: e.target.value })}><option value="">사이트 전체</option>
        {places.map((p: any) => <option key={p.id} value={p.id}>{p.name_ko}</option>)}</select></Field>
      <Field label="종류"><select value={n.level} onChange={(e) => setN({ ...n, level: e.target.value })}>{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="시작일"><input type="date" value={n.start} onChange={(e) => setN({ ...n, start: e.target.value })} /></Field>
      <Field label="끝일 (비우면 계속)"><input type="date" value={n.end} onChange={(e) => setN({ ...n, end: e.target.value })} /></Field>
      <Field label="제목" wide><input value={n.title} maxLength={80} placeholder="예: 데크 보수로 휠체어는 해안 쪽 우회" onChange={(e) => setN({ ...n, title: e.target.value })} /></Field>
      <Field label="내용" wide><textarea rows={2} value={n.body} onChange={(e) => setN({ ...n, body: e.target.value })} /></Field>
      <button className="chip go" disabled={!n.title.trim()}>올리고 바로 반영</button>
    </form>
    <ul className="rv-list">
      {(db?.notices || []).map((x: any) => (
        <li key={x.id} className={`panel notice-${x.level}`}>
          <div className="seg-top"><span className="badge b-plain">{LEVEL[x.level]}</span><b>{x.title}</b><small className="muted">{x.place_id ? name(x.place_id) : "사이트 전체"} · {x.start || "지금"} ~ {x.end || "계속"}</small></div>
          {x.body && <p>{x.body}</p>}
          {x.end && x.end < today() && <p className="muted small">기간이 지나 사이트에는 안 보여요.</p>}
          <button className="chip" onClick={() => call(() => api.post(`/api/admin/notices/${x.id}/delete`, {}, tok), "알림을 내렸어요.")}>내리기</button>
        </li>))}
      {!(db?.notices || []).length && <li className="muted">올린 알림이 없어요.</li>}
    </ul>
  </>);
}

/* ---------- 공지 배너·행사 ---------- */
function SiteEditor({ db, tok, call }: any) {
  const [b, setB] = useState<any>({ text: "", level: "info", until: "" });
  useEffect(() => { if (db?.banner) setB({ until: "", ...db.banner }); }, [db?.banner]);
  const blank = { name: "", start: today(), end: "", venue: "", tel: "", url: "", access: "" };
  const [e, setE] = useState<any>(blank);
  return (<>
    <form className="panel visit-form" onSubmit={(ev) => { ev.preventDefault(); call(() => api.post("/api/admin/banner", b, tok), "첫 화면 공지를 바꿨어요.", "#/"); }}>
      <h2 className="h3">모든 화면 위 공지 {db?.banner && <span className="badge b-open">게시 중</span>}</h2>
      <Field label="공지 문구" wide><input value={b.text} maxLength={200} placeholder="예: 11/21~22 도째비페스타로 묵호항 주변 주차가 어려워요" onChange={(x) => setB({ ...b, text: x.target.value })} /></Field>
      <Field label="종류"><select value={b.level} onChange={(x) => setB({ ...b, level: x.target.value })}><option value="info">안내</option><option value="warn">주의</option></select></Field>
      <Field label="이 날까지 보이기 (비우면 계속)"><input type="date" value={b.until || ""} onChange={(x) => setB({ ...b, until: x.target.value })} /></Field>
      <div className="wide save-row">
        <button className="chip go" disabled={!b.text.trim()}>게시</button>
        {db?.banner && <button type="button" className="chip" onClick={() => call(() => api.post("/api/admin/banner", {}, tok), "공지를 내렸어요.").then(() => setB({ text: "", level: "info", until: "" }))}>내리기</button>}
      </div>
    </form>
    <form className="panel visit-form" onSubmit={(ev) => { ev.preventDefault(); call(() => api.post("/api/admin/events", e, tok), "행사를 추가했어요. 행사 달력과 코스 추천에 바로 보여요.", "#/events").then(() => setE(blank)); }}>
      <h2 className="h3">행사 추가 <span className="muted small">(공공데이터에 없는 행사)</span></h2>
      <Field label="행사 이름" wide><input value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></Field>
      <Field label="시작일"><input type="date" value={e.start} onChange={(x) => setE({ ...e, start: x.target.value })} /></Field>
      <Field label="끝일"><input type="date" value={e.end} onChange={(x) => setE({ ...e, end: x.target.value })} /></Field>
      <Field label="장소"><input value={e.venue} onChange={(x) => setE({ ...e, venue: x.target.value })} /></Field>
      <Field label="문의 전화"><input value={e.tel} onChange={(x) => setE({ ...e, tel: x.target.value })} /></Field>
      <Field label="안내 링크" wide><input value={e.url} placeholder="https://" onChange={(x) => setE({ ...e, url: x.target.value })} /></Field>
      <Field label="접근성 메모 (휠체어석·장애인 화장실·셔틀 등)" wide><input value={e.access} onChange={(x) => setE({ ...e, access: x.target.value })} /></Field>
      <button className="chip go" disabled={!e.name.trim() || !e.start}>추가하고 바로 반영</button>
    </form>
    <ul className="rv-list">
      {(db?.events || []).map((x: any) => (
        <li key={x.id} className="panel"><div className="seg-top"><b>{x.name}</b><small className="muted">{x.start}{x.end && x.end !== x.start ? ` ~ ${x.end}` : ""} · {x.venue}</small></div>
          {x.access && <p className="muted">휠체어 접근: {x.access}</p>}
          <button className="chip" onClick={() => call(() => api.post(`/api/admin/events/${x.id}/delete`, {}, tok), "행사를 지웠어요.")}>삭제</button></li>))}
    </ul>
  </>);
}

/* ---------- 제보 검수 (반영하면 알림으로 바로 올리기) ---------- */
function Reports({ tok, call, onExpired, canNotice }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api.get("/api/admin/reports", tok).then(setRows).catch((e: any) => { if (e.status === 401) onExpired(); setRows([]); });
  useEffect(() => { load(); }, []);
  return (
    <ul className="rv-list">
      {(rows || []).map((r) => <ReportRow key={r.id} r={r} canNotice={canNotice} onSave={(body: any) => call(() => api.post(`/api/admin/reports/${r.id}`, body, tok), body.notice ? "반영하고 장소 알림으로 올렸어요." : "검수 결과를 저장했어요.", body.notice ? `#/place/${r.place_id}` : undefined).then(load)} />)}
      {rows && !rows.length && <li className="muted">아직 제보가 없어요. 코스 결과 아래 [현장 제보]로 들어와요.</li>}
    </ul>
  );
}
function ReportRow({ r, onSave, canNotice }: { r: any; onSave: (b: any) => void; canNotice: boolean }) {
  const [s, setS] = useState(r.status || "접수");
  const [m, setM] = useState(r.memo || "");
  const [post, setPost] = useState(false);
  const [n, setN] = useState({ level: "warn", title: (r.note || "").slice(0, 60), start: today(), end: "" });
  return (
    <li className="panel">
      <div className="seg-top"><b>{r.name}</b><span className="badge b-plain">{r.kind}</span><span className="badge b-plain">{r.status}</span><small className="muted">{r.created_at?.replace("T", " ")}</small></div>
      {r.note && <p>{r.note}</p>}
      {r.ai && <p className="muted">AI 사진 분석: {(r.ai.obstacles || []).join(", ") || "장애물 없음"} {r.ai.summary ? `· ${r.ai.summary}` : ""} — 사람이 확인한 뒤에만 반영</p>}
      {r.notice_id && <p className="muted small">이 제보로 올린 알림이 있어요.</p>}
      {r.reviewed_by && <p className="muted small">마지막 검수: {r.reviewed_by} · {String(r.reviewed_at || "").slice(0, 16).replace("T", " ")}</p>}
      <div className="chips">
        <select value={s} onChange={(e) => setS(e.target.value)} aria-label="처리 상태">{STATUS.map((x) => <option key={x}>{x}</option>)}</select>
        <input value={m} onChange={(e) => setM(e.target.value)} placeholder="검수 메모" aria-label="검수 메모" />
      </div>
      {s === "반영" && !r.notice_id && canNotice && (
        <div className="post-notice">
          <label className="day"><input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} />장소 알림으로 바로 올리기</label>
          {post && <div className="visit-form">
            <Field label="종류"><select value={n.level} onChange={(e) => setN({ ...n, level: e.target.value })}>{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="시작일"><input type="date" value={n.start} onChange={(e) => setN({ ...n, start: e.target.value })} /></Field>
            <Field label="끝일"><input type="date" value={n.end} onChange={(e) => setN({ ...n, end: e.target.value })} /></Field>
            <Field label="알림 제목" wide><input value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} /></Field>
          </div>}
        </div>)}
      <button className="chip go" onClick={() => onSave({ status: s, memo: m, notice: s === "반영" && post && n.title.trim() ? n : null })}>저장</button>
    </li>
  );
}

/* ---------- 현장 확인 기록 ---------- */
function Visits({ places, tok, call, me }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const blank = { place_id: "", date: today(), who: me?.name || "", segment: "", slope_deg: "", curb_cm: "", width_m: "", steps: "", surface: "", toilet: "", note: "" };
  const [f, setF] = useState<any>(blank);
  const load = () => api.get("/api/admin/visits", tok).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const seg = places.find((p: any) => p.id === f.place_id)?.segments || [];
  const num = (v: string) => (v === "" ? null : Number(v));
  return (<>
    <form className="panel visit-form" onSubmit={(e) => { e.preventDefault();
      call(() => api.post("/api/admin/visits", { ...f, slope_deg: num(f.slope_deg), curb_cm: num(f.curb_cm), width_m: num(f.width_m), steps: num(f.steps) }, tok),
        "현장 확인 기록을 저장했어요. 장소 페이지에 확인 날짜가 보여요.", `#/place/${f.place_id}`).then(() => { setF({ ...blank, date: f.date, who: f.who }); load(); }); }}>
      <h2 className="h3">현장 확인 기록 추가</h2>
      <Field label="장소"><select value={f.place_id} onChange={(e) => setF({ ...f, place_id: e.target.value, segment: "" })}><option value="">고르세요</option>
        {places.filter((p: any) => !p.sample).map((p: any) => <option key={p.id} value={p.id}>{p.name_ko}</option>)}</select></Field>
      <Field label="구간"><input list="segs" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })} placeholder="예: 주차장 → 매표소" />
        <datalist id="segs">{seg.map((s: any) => <option key={s.name} value={s.name} />)}</datalist></Field>
      <Field label="날짜"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="확인한 사람"><input value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} placeholder={me?.name} /></Field>
      <Field label="경사(°)"><input inputMode="decimal" value={f.slope_deg} onChange={(e) => setF({ ...f, slope_deg: e.target.value })} /></Field>
      <Field label="가장 높은 턱(cm)"><input inputMode="decimal" value={f.curb_cm} onChange={(e) => setF({ ...f, curb_cm: e.target.value })} /></Field>
      <Field label="가장 좁은 폭(m)"><input inputMode="decimal" value={f.width_m} onChange={(e) => setF({ ...f, width_m: e.target.value })} /></Field>
      <Field label="계단 수"><input inputMode="numeric" value={f.steps} onChange={(e) => setF({ ...f, steps: e.target.value })} /></Field>
      <Field label="바닥"><select value={f.surface} onChange={(e) => setF({ ...f, surface: e.target.value })}>{["", "포장", "데크", "자갈", "데크 이음새", "흙길", "모래", "산길"].map((s) => <option key={s} value={s}>{s || "-"}</option>)}</select></Field>
      <Field label="장애인 화장실"><select value={f.toilet} onChange={(e) => setF({ ...f, toilet: e.target.value })}>{["", "있음", "없음", "있지만 사용 어려움"].map((s) => <option key={s} value={s}>{s || "-"}</option>)}</select></Field>
      <Field label="메모" wide><textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button className="chip go" disabled={!f.place_id}>저장</button>
      <p className="wide muted small">측정값을 장소 판정에 쓰려면 [장소 정보] 탭의 구간 표에 같은 값을 넣고 근거에 이 기록 날짜를 적어 주세요.</p>
    </form>
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>날짜</th><th>장소·구간</th><th>측정</th><th>화장실</th><th>확인</th><th>메모</th></tr></thead>
      <tbody>{rows.map((v) => <tr key={v.id}><td>{v.date}</td><td>{v.name}<br /><small>{v.segment}</small></td>
        <td><small>{[v.slope_deg != null && `경사 ${v.slope_deg}°`, v.curb_cm != null && `턱 ${v.curb_cm}cm`, v.width_m != null && `폭 ${v.width_m}m`, v.steps != null && `계단 ${v.steps}`, v.surface].filter(Boolean).join(" · ")}</small></td>
        <td>{v.toilet || "-"}</td><td>{v.who}</td><td><small>{v.note}</small></td></tr>)}
        {!rows.length && <tr><td colSpan={6} className="muted">아직 기록이 없어요.</td></tr>}</tbody>
    </table></div>
  </>);
}

/* ---------- 변경 이력·백업 ---------- */
// 공공 빅데이터 API 응답 점검 (캐시를 비우고 모든 서비스를 한 번씩 부른다)
function Probe({ tok }: { tok: string }) {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const NAMES: Record<string, string> = { bf_food: "무장애 음식점", bf_stay: "무장애 숙소", bf_sight: "무장애 관광지", crowd: "집중률 예측(장소 수)",
    related: "연관 관광지(장소 수)", visitors: "방문자수(일 수)", audio: "오디오 가이드", photo: "관광사진" };
  async function run() { setBusy(true); try { setR(await api.get("/api/admin/probe", tok)); } catch (e: any) { setR({ error: String(e.message || e) }); } setBusy(false); }
  return (
    <div className="panel">
      <p className="muted">공공데이터포털에서 활용 신청한 API가 실제로 응답하는지 확인해요. 1분쯤 걸릴 수 있어요. 0건이면 신청·승인 상태를 확인하세요.</p>
      <button className="chip go" onClick={run} disabled={busy}>{busy ? "확인하는 중…" : "지금 점검하기"}</button>
      {r && !r.error && (
        <table className="tbl" style={{ marginTop: 12 }}><tbody>
          {Object.keys(NAMES).map((k) => <tr key={k}><th>{NAMES[k]}</th><td>{r[k] > 0 ? `✓ ${r[k]}건` : "✗ 0건"}</td></tr>)}
        </tbody></table>
      )}
      {r && <details style={{ marginTop: 12 }}><summary>자세한 응답</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(r, null, 1)}</pre></details>}
    </div>
  );
}

function History({ db, tok, call, name, canBackup }: any) {
  const [sure, setSure] = useState(false);
  const rows: any[] = db?.history || [];
  const what = (h: any) => h.action === "place" ? `${name(h.target)} — ${Object.keys(h.after || {}).map(label).join(", ")}`
    : h.action.startsWith("notice") ? (h.after || h.before)?.title : h.action.startsWith("event") ? (h.after || h.before)?.name
    : h.action === "banner" ? (h.after?.text || "공지 내림") : h.action.startsWith("account") ? `${h.target} (${(h.after || h.before)?.role_name || ""}${h.after && h.after.active === false ? ", 사용 멈춤" : ""})` : h.reason;
  const [who, setWho] = useState("");
  const people = Array.from(new Set(rows.map((h) => h.who).filter(Boolean)));
  const shown = who ? rows.filter((h) => h.who === who) : rows;
  function download() {
    const blob = new Blob([JSON.stringify(db, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `gildongmu-cms-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function upload(file?: File) {
    if (!file) return;
    try { const j = JSON.parse(await file.text()); call(() => api.post("/api/admin/restore", j, tok), "백업 파일로 되돌렸어요."); }
    catch { call(() => Promise.reject(new Error("백업 파일을 읽지 못했어요.")), ""); }
  }
  return (<>
    {canBackup && <div className="panel backup">
      <h2 className="h3">백업</h2>
      <p className="muted small">서버를 다시 켜면 저장한 내용이 지워지는 호스팅도 있어요. 본선 전후로 백업을 내려받아 두세요.</p>
      <div className="chips">
        <button className="chip" onClick={download}>백업 내려받기</button>
        <label className="chip">백업 올려서 복원<input type="file" accept="application/json" hidden onChange={(e) => upload(e.target.files?.[0])} /></label>
        {!sure ? <button className="chip" onClick={() => setSure(true)}>처음 상태로…</button>
          : <button className="chip danger" onClick={() => { setSure(false); call(() => api.post("/api/admin/reset", { reason: "관리 화면에서 초기화" }, tok), "관리자 변경을 모두 지우고 처음 상태로 돌렸어요. (이력·계정은 남아요)"); }}>정말 모두 지우기</button>}
      </div>
      <p className="muted small">백업 파일에는 관리자 계정·비밀번호가 들어가지 않아요.</p>
    </div>}
    {people.length > 1 && <label className="who-filter">누가 바꿨는지 골라 보기
      <select value={who} onChange={(e) => setWho(e.target.value)}><option value="">모두</option>{people.map((p) => <option key={p}>{p}</option>)}</select></label>}
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>언제</th><th>누가</th><th>무엇을</th><th>내용</th><th>근거·이유</th><th /></tr></thead>
      <tbody>{shown.map((h) => (
        <tr key={h.id} className={h.reverted ? "reverted" : ""}>
          <td><small>{h.at.slice(5, 16).replace("T", " ")}</small></td><td><small>{h.who === "admin" ? "총괄 관리자" : h.who}</small></td><td>{ACTION[h.action] || h.action}</td><td>{what(h)}</td><td><small>{h.reason}</small></td>
          <td>{["place", "notice_add", "notice_remove", "banner", "event_add", "event_remove"].includes(h.action) && (h.reverted ? <small className="muted">되돌림</small>
            : <button className="chip" onClick={() => call(() => api.post(`/api/admin/history/${h.id}/revert`, {}, tok), "되돌렸어요. 사이트에도 바로 반영됐어요.")}>되돌리기</button>)}</td>
        </tr>))}
        {!shown.length && <tr><td colSpan={6} className="muted">아직 바꾼 것이 없어요.</td></tr>}</tbody>
    </table></div>
  </>);
}
const LABELS: Record<string, string> = { open: "여는 시각", close: "닫는 시각", break_time: "쉬는 시간", closed_day_nums: "정기 휴무", last_entry: "마지막 입장", stay_min: "머무는 시간",
  phone: "전화", fee: "요금", intro_ko: "소개", tip_ko: "팁", carer_tip: "보호자 꿀팁", walk_load: "걷기 정보", wheelchair: "휠체어", entrance_step: "출입구 턱",
  table: "테이블", indoor: "실내", benches: "벤치", segments: "구간", soft_menu: "부드러운 메뉴", parking_easy: "주차" };
const label = (k: string) => LABELS[k] || k;

/* ---------- 한눈에 (로그인하면 처음 보는 화면) ---------- */
function Dashboard({ tok, user, go, can, onExpired }: { tok: string; user: User; go: (k: TabKey) => void; can: (p: string | null) => boolean; onExpired: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get("/api/admin/dashboard", tok).then(setD).catch((e: any) => { if (e.status === 401) onExpired(); else setD({}); }); }, []);
  if (!d) return <p className="muted" role="status">불러오는 중…</p>;
  const card = (k: TabKey, ic: string, title: string, big: React.ReactNode, sub: string, warn = false) => (
    <button className={`dash-card${warn ? " warn" : ""}`} onClick={() => go(k)} disabled={!can(TABS.find((t) => t[0] === k)?.[2] ?? null)}>
      <span className="dash-k"><Icon name={ic} />{title}</span><b>{big}</b><span className="muted small">{sub}</span></button>);
  return (<>
    <p className="dash-hello"><b>{user.name}</b>님, 안녕하세요. 오늘은 {d.today} 이에요. <span className="muted">({user.role_name}: {ROLE_INFO[user.role]})</span></p>
    <div className="dash-grid">
      {card("reports", "camera", "새 제보", d.reports?.new ?? 0, `확인 중 ${d.reports?.doing ?? 0} · 전체 ${d.reports?.total ?? 0}`, (d.reports?.new ?? 0) > 0)}
      {card("notice", "warn", "지금 걸린 알림", d.notices?.length ?? 0, d.banner ? `공지: ${d.banner.text.slice(0, 20)}` : "사이트 공지 없음")}
      {card("visits", "walk", "현장 확인 기록", d.visits?.total ?? 0, d.visits?.last ? `마지막 ${d.visits.last}` : "아직 없음")}
      {card("place", "pin", "고친 장소", d.overrides ?? 0, "원본 위에 덮어쓴 곳")}
    </div>
    <div className="cards2">
      <div className="panel">
        <h2 className="h3">지금 사이트에 보이는 알림</h2>
        {d.notices?.length ? <ul className="plain">{d.notices.map((n: any) => <li key={n.id}><span className={`badge ${n.level === "closed" ? "g-R" : n.level === "warn" ? "g-Y" : "b-plain"}`}>{LEVEL[n.level]?.split(" ")[0]}</span> {n.name ? `${n.name} · ` : ""}{n.title}{n.end ? <small className="muted"> ~{n.end}</small> : null}</li>)}</ul>
          : <p className="muted">걸려 있는 알림이 없어요.</p>}
        {d.events_week?.length > 0 && <><h3 className="h3" style={{ marginTop: 14 }}>이번 주 관리자 추가 행사</h3><ul className="plain">{d.events_week.map((e: any) => <li key={e.id}>{e.name} · {e.start}{e.end && e.end !== e.start ? `~${e.end}` : ""}</li>)}</ul></>}
      </div>
      <div className="panel">
        <h2 className="h3">최근 변경</h2>
        {d.recent?.length ? <ul className="plain dash-recent">{d.recent.map((h: any) => <li key={h.id}><small className="muted">{h.at.slice(5, 16).replace("T", " ")}</small> <b>{h.who === "admin" ? "총괄 관리자" : h.who}</b> · {ACTION[h.action] || h.action}{h.reverted ? <small className="muted"> (되돌림)</small> : null}</li>)}</ul>
          : <p className="muted">아직 바꾼 것이 없어요.</p>}
        {can("history") && <button className="chip" onClick={() => go("history")}>변경 이력 전체 보기</button>}
      </div>
    </div>
  </>);
}

/* ---------- 계정 관리 (총괄 관리자만) ---------- */
function Accounts({ tok, call, me }: { tok: string; call: any; me: User }) {
  const [d, setD] = useState<any>(null);
  const blank = { id: "", name: "", role: "editor", password: "" };
  const [f, setF] = useState(blank);
  const [reset, setReset] = useState<{ id: string; pw: string } | null>(null);
  const load = () => api.get("/api/admin/accounts", tok).then(setD).catch(() => setD({ accounts: [] }));
  useEffect(() => { load(); }, []);
  const temp = () => { const c = "abcdefghjkmnpqrstuvwxyz23456789"; let x = ""; const r = new Uint32Array(10); crypto.getRandomValues(r); r.forEach((n) => (x += c[n % c.length])); return x.slice(0, 6) + (r[0] % 90 + 10); };
  const save = (fn: () => Promise<any>, ok: string) => call(fn, ok).then(load).catch(() => {});
  return (<>
    <div className="panel">
      <h2 className="h3">역할마다 할 수 있는 일</h2>
      <ul className="plain role-list">{Object.entries(ROLE_INFO).map(([k, v]) => <li key={k}><small className={`role-${k}`}>{d?.roles?.[k] || k}</small> {v}</li>)}</ul>
    </div>
    <form className="panel visit-form" onSubmit={(e) => { e.preventDefault(); save(() => api.post("/api/admin/accounts", f, tok), `${f.name} 계정을 만들었어요. 임시 비밀번호를 직접 전해 주세요(처음 로그인하면 바꾸라고 나와요).`).then(() => setF(blank)); }}>
      <h2 className="h3">새 계정 만들기</h2>
      <Field label="아이디 (영문·숫자)"><input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} autoComplete="off" placeholder="예: kim.editor" /></Field>
      <Field label="이름"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="예: 김동해" /></Field>
      <Field label="역할"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="editor">편집자</option><option value="surveyor">현장 조사원</option></select></Field>
      <Field label="임시 비밀번호 (8자 이상, 글자+숫자)"><span className="pw-row"><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        <button type="button" className="chip" onClick={() => setF({ ...f, password: temp() })}>만들어 주기</button></span></Field>
      <button className="chip go" disabled={!f.id || !f.name || !f.password}>계정 만들기</button>
    </form>
    <div className="tbl-wrap"><table className="tbl acc-tbl">
      <thead><tr><th>이름·아이디</th><th>역할</th><th>상태</th><th>마지막 로그인</th><th>관리</th></tr></thead>
      <tbody>{(d?.accounts || []).map((a: any) => (
        <tr key={a.id} className={a.active === false ? "reverted" : ""}>
          <td><b>{a.name}</b><br /><small className="muted">{a.id}{a.id === me.id ? " · 나" : ""}</small></td>
          <td>{a.builtin ? <small className="role-owner">{a.role_name}</small>
            : <select aria-label={`${a.name} 역할`} value={a.role} onChange={(e) => save(() => api.post(`/api/admin/accounts/${a.id}`, { role: e.target.value }, tok), `${a.name}님 역할을 바꿨어요. 다시 로그인해야 적용돼요.`)}>
                <option value="editor">편집자</option><option value="surveyor">현장 조사원</option></select>}</td>
          <td>{a.builtin ? "서버 설정" : a.active === false ? "사용 멈춤" : a.must_change ? "임시 비밀번호" : "사용 중"}</td>
          <td><small>{a.last_login ? String(a.last_login).slice(0, 16).replace("T", " ") : "-"}</small></td>
          <td>{a.builtin ? <small className="muted">.env 의 ADMIN_ID·ADMIN_PASSWORD</small> : <div className="chips">
            <button className="chip sm" onClick={() => save(() => api.post(`/api/admin/accounts/${a.id}`, { active: a.active === false }, tok), a.active === false ? "다시 쓸 수 있게 했어요." : "사용을 멈췄어요. 바로 로그아웃돼요.")}>{a.active === false ? "다시 쓰기" : "사용 멈춤"}</button>
            {reset?.id === a.id
              ? <span className="pw-row"><input aria-label="새 임시 비밀번호" value={reset!.pw} onChange={(e) => setReset({ id: a.id, pw: e.target.value })} />
                  <button className="chip sm go" onClick={() => save(() => api.post(`/api/admin/accounts/${a.id}`, { password: reset!.pw }, tok), `새 임시 비밀번호를 정했어요: ${reset!.pw} (직접 전해 주세요)`).then(() => setReset(null))}>정하기</button>
                  <button className="chip sm" onClick={() => setReset(null)}>취소</button></span>
              : <button className="chip sm" onClick={() => setReset({ id: a.id, pw: temp() })}>임시 비밀번호</button>}
          </div>}</td>
        </tr>))}</tbody>
    </table></div>
    <p className="muted small">비밀번호는 그대로 저장하지 않고 바꾼 값(해시)만 저장해요. 계정을 지우는 대신 [사용 멈춤]으로 막아 두면 그 사람이 바꾼 이력도 그대로 남아요.</p>
  </>);
}

/* ---------- 내 계정 (비밀번호 바꾸기) ---------- */
function MyAccount({ tok, user, call, onChanged }: { tok: string; user: User; call: any; onChanged: () => void }) {
  const [f, setF] = useState({ old: "", new: "", again: "" });
  const mismatch = f.again !== "" && f.new !== f.again;
  return (<>
    <div className="panel">
      <h2 className="h3">내 계정</h2>
      <dl className="trip-facts"><div><dt>이름</dt><dd>{user.name}</dd></div><div><dt>아이디</dt><dd>{user.id}</dd></div><div><dt>역할</dt><dd>{user.role_name}</dd></div><div><dt>할 수 있는 일</dt><dd>{ROLE_INFO[user.role]}</dd></div></dl>
    </div>
    {user.role === "owner" ? <p className="panel muted">총괄 관리자 비밀번호는 서버 설정(.env 의 ADMIN_PASSWORD, Render 환경 변수)에서 바꿔요.</p> : (
      <form className="panel visit-form" onSubmit={(e) => { e.preventDefault(); if (mismatch) return; call(() => api.post("/api/admin/password", { old: f.old, new: f.new }, tok), "비밀번호를 바꿨어요.").then(() => { setF({ old: "", new: "", again: "" }); onChanged(); }).catch(() => {}); }}>
        <h2 className="h3">비밀번호 바꾸기</h2>
        <Field label="지금 비밀번호"><input type="password" autoComplete="current-password" value={f.old} onChange={(e) => setF({ ...f, old: e.target.value })} /></Field>
        <Field label="새 비밀번호 (8자 이상, 글자+숫자)"><input type="password" autoComplete="new-password" value={f.new} onChange={(e) => setF({ ...f, new: e.target.value })} /></Field>
        <Field label="새 비밀번호 한 번 더"><input type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} aria-invalid={mismatch} /></Field>
        {mismatch && <p className="err wide" role="alert">새 비밀번호가 서로 달라요.</p>}
        <button className="chip go" disabled={!f.old || !f.new || mismatch}>바꾸기</button>
      </form>)}
  </>);
}
