"use client";
// 관리자: 계정마다 로그인 → 역할(총괄 관리자·편집자·현장 조사원)에 맞는 탭만 보인다.
// 장소 정보(+AI 간단 작업)·공지·알림을 고치면 사이트에 바로 반영. 문의와 불편 제보는 '받은 글' 한 탭에서. 모든 변경은 '누가' 바꿨는지와 함께 이력에 남고 되돌릴 수 있다.
// 팀 현장 확인 기록과 이용자 제보 검수, 관리자 계정 관리도 여기서 한다. (관리 화면은 팀용이라 한국어만)
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { SourcesPage } from "@/components/Pages";
import { CityAdmin } from "@/components/CityAdmin";
import { SyncAdmin } from "@/components/SyncAdmin";

type Lang = "ko" | "en";
// [탭, 이름, 필요한 권한(null = 누구나)]
// 위에 늘 보이는 탭 = 운영할 때 매일 쓰는 것. 가끔 쓰는 것은 [더 보기] 안에 (기능은 그대로)
const TABS = [["home", "한눈에", null], ["place", "장소 정보", "place"], ["notice", "공지·알림", "notice"], ["reports", "받은 글 (문의·제보)", "reports"], ["aiprops", "AI 제안", "reports"], ["visits", "현장 확인 기록", "visits"], ["sync", "자동 갱신", "place"],
  ["history", "변경 이력·백업", "history"], ["accounts", "계정 관리", "accounts"], ["sources", "출처·판정 기준", null], ["me", "내 계정", null]] as const;
const MAIN_TABS = new Set(["home", "place", "notice", "reports", "aiprops", "visits"]);
type TabKey = (typeof TABS)[number][0];
type User = { id: string; name: string; role: string; role_name: string; perms: string[]; must_change?: boolean; expires_at?: string };
const ROLE_INFO: Record<string, string> = { owner: "모든 일 + 계정 관리·백업·초기화", editor: "장소·알림·공지·행사·제보·되돌리기", surveyor: "현장 확인 기록 입력과 제보 검수만" };
const LEVEL: Record<string, string> = { closed: "임시 휴무 (코스에서 빠짐)", warn: "주의 (공사·우회 등)", info: "안내" };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const ACTION: Record<string, string> = { place: "장소 정보 수정", notice_add: "알림 올림", notice_remove: "알림 내림", banner: "공지 배너", event_add: "행사 추가",
  event_remove: "행사 삭제", revert: "되돌리기", restore: "백업 복원", reset: "처음 상태로", account_add: "계정 만듦", account_update: "계정 바꿈", password: "비밀번호 변경", ai_models: "AI 모델 설정", city_settings: "제보 담당 부서", contact_view: "제보자 연락처 확인", sync_rules: "자동 갱신 설정", eatery_hide: "폐업 의심 식당 숨김" };
const STATUS = ["접수", "확인", "처리 중", "완료", "반려", "중복"];   // 예전 '확인 중'·'반영'은 서버가 '확인'·'완료'로 읽음
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
  const tabs = TABS.filter(([k, , perm]) => (k === "visits" ? user.role === "surveyor" : k === "notice" ? can("notice") || can("site") : can(perm)));   // 현장 확인 기록은 현장 조사원에게만, 공지·알림은 둘 중 하나라도
  const [tab, setTab] = useState<TabKey>("home");
  const [inbox, setInbox] = useState<"all" | "inq" | "rep">("all");
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
        <div><nav className="crumb"><a href="#/">처음</a> › 관리자</nav><h1 title="저장하면 바로 사이트에 보여요. 잘못 바꿨으면 [더 보기 › 변경 이력]에서 되돌리세요.">관리자</h1></div>
        <div className="admin-who">
          <span className="who-badge"><b>{user.name}</b> <small className={`role-${user.role}`}>{user.role_name}</small></span>
          <button className="chip" onClick={onLogout}>로그아웃</button>
        </div>
      </div>
      {/* '내 계정'은 [더 보기] 안에. 처음 받은 임시 비밀번호일 때는 바꾸는 칸을 맨 위에도 보여 준다 */}
      {user.must_change && tab !== "me" && <div className="admin-msg bad" role="alert"><p>처음 받은 임시 비밀번호예요. 아래에서 비밀번호를 바꿔 주세요.</p>
        <MyAccount tok={tok} user={user} call={call} onChanged={() => setUser({ ...user, must_change: false })} /></div>}
      <div className="tabs admin-tabs" role="group" aria-label="관리 메뉴">
        {tabs.filter(([k]) => MAIN_TABS.has(k)).map(([k, t]) => <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setMsg(null); }}>{t}</button>)}
        <label className={`admin-more${MAIN_TABS.has(tab) ? "" : " on"}`}><span className="sr-only">더 보기</span>
          <select value={MAIN_TABS.has(tab) ? "" : tab} onChange={(e) => { if (e.target.value) { setTab(e.target.value as TabKey); setMsg(null); } }}>
            <option value="">더 보기</option>
            {tabs.filter(([k]) => !MAIN_TABS.has(k)).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></label>
      </div>
      {msg && <p role="status" className={`admin-msg ${msg.ok ? "ok" : "bad"}`}>{msg.ok ? "✓ " : "! "}{msg.text}{msg.link && <> · <a href={msg.link}>사이트에서 보기</a></>}</p>}
      {tab === "home" && <Dashboard tok={tok} user={user} go={(k: TabKey, sub?: "inq" | "rep") => { setTab(k); if (sub) setInbox(sub); }} can={can} onExpired={onExpired} />}
      {tab === "accounts" && can("accounts") && <Accounts tok={tok} call={call} me={user} />}
      {tab === "place" && <PlaceEditor places={places} db={db} tok={tok} call={call} />}
      {tab === "notice" && <NoticeHub places={places} db={db} tok={tok} call={call} name={name} can={can} />}
      {tab === "reports" && <Inbox kind={inbox} setKind={setInbox} tok={tok} call={call} onExpired={onExpired} can={can} />}
      {tab === "aiprops" && <AiProposals tok={tok} call={call} onExpired={onExpired} can={can} />}
      {tab === "sync" && <SyncAdmin tok={tok} call={call} onExpired={onExpired} can={can} />}
      {tab === "visits" && <Visits places={places} tok={tok} call={call} me={user} />}
      {tab === "me" && <MyAccount tok={tok} user={user} call={call} onChanged={() => setUser({ ...user, must_change: false })} />}
      {tab === "sources" && <SourcesPage lang="ko" />}
      {tab === "history" && <History db={db} tok={tok} call={call} name={name} canBackup={can("backup")} />}
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
    api.place(pid).then((p0: any) => {
      const p = { ...p0, segments: p0.segments_raw || p0.segments };   // 표시용이 아닌 원본 구간(측정값·등급·선택 구간)으로 편집
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
      {pid && orig && <div className="pe-grid">
      <form className="visit-form" onSubmit={(e) => { e.preventDefault();
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
            <thead><tr><th>구간</th><th>경사(°)</th><th>높이(m)</th><th>턱(cm)</th><th>폭(m)</th><th>계단</th><th>바닥</th><th>메모</th><th>출처</th><th /></tr></thead>
            <tbody>{segs.map((s, i) => (
              <tr key={i}>
                {(["name", "slope_deg", "rise_m", "curb_cm", "width_m", "steps", "surface", "note", "source"] as const).map((k) =>
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
      </form>
      <AiQuick pid={pid} name={orig.name_ko} feeDone={Object.keys(orig.fee_detail || {}).length > 0} f={f} tok={tok} onFill={(patch: any) => setF({ ...f, ...patch })} />
      </div>}
    </div>
  );
}

/* ---------- AI 간단 작업 (장소 정보 옆): 자료로 확인 · 글 다듬기 · 빠진 칸 확인 ---------- */
// 결과는 미리 보기뿐. [폼에 넣기]는 왼쪽 칸만 바꾸고, 사이트 반영은 관리자가 [저장하고 바로 반영]을 눌러야 한다. 어떤 칸도 미리 체크하지 않는다.
const TIDY_FIELDS: [string, string][] = [["intro_ko", "소개 간결하게"], ["carer_tip", "보호자 꿀팁 다듬기"], ["tip_ko", "한 줄 팁 다듬기"]];
function toForm(c: any): any {
  if (c.key === "break_time") return { b0: c.value?.[0] || "", b1: c.value?.[1] || "" };
  if (["entrance_step", "indoor", "benches"].includes(c.key)) return { [c.key]: tri(c.value) };
  return { [c.key]: c.value ?? "" };
}
function AiQuick({ pid, name, f, tok, onFill, feeDone }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [r, setR] = useState<any>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [td, setTd] = useState<any>(null);
  const [done, setDone] = useState("");
  useEffect(() => { setR(null); setTd(null); setErr(""); setDone(""); setFile(null); setUrl(""); }, [pid]);
  async function read() {
    setErr(""); setDone(""); setBusy("read");
    const fd = new FormData(); fd.append("place_id", pid);
    if (file) fd.append("file", file); else fd.append("url", url.trim());
    try { const x = await api.form("/api/admin/ai/work", fd, tok); setR(x); setPick({}); if (!x.ok) setErr(x.why || "AI가 자료를 읽지 못했어요."); }
    catch (e: any) { setErr(e.message || "자료를 읽지 못했어요."); }
    setBusy("");
  }
  async function tidy(field: string) {
    setErr(""); setDone(""); setBusy(field);
    try { const x = await api.post("/api/admin/ai/tidy", { place_id: pid, field, text: f[field] || "" }, tok); setTd(x); if (!x.ok) setErr(x.why || "AI가 글을 다듬지 못했어요."); }
    catch (e: any) { setErr(e.message || "글을 다듬지 못했어요."); }
    setBusy("");
  }
  const chosen = (r?.changes || []).filter((c: any) => pick[c.key]);
  const MISS: [string, string][] = [["open", "여는 시각"], ["close", "닫는 시각"], ["phone", "전화"], ["fee", "요금"], ["intro_ko", "소개"], ["carer_tip", "보호자 꿀팁"]];
  const missing = [...MISS.filter(([k]) => !String(f[k] ?? "").trim() && !(k === "fee" && feeDone)).map(([, l]) => l),
    ...(f.wheelchair === "확인 전" ? ["휠체어"] : []), ...(f.walk_load === "확인 전" ? ["걷기 정보"] : []), ...(f.entrance_step === "" ? ["출입구 턱"] : [])];
  const ready = !!file || /^https?:\/\/\S+/.test(url.trim());
  return (
    <aside className="panel aiq" aria-label="AI 간단 작업">
      <h2 className="h3"><Icon name="story" />AI 간단 작업 <span className="via via-llm">AI</span></h2>
      <p className="muted small">결과는 미리 보기예요. [폼에 넣기]는 왼쪽 칸만 바꾸고, 사이트 반영은 [저장하고 바로 반영]을 눌러야 돼요.</p>

      <h3 className="aiq-h">빠진 칸 확인 <small className="muted">(AI 없이)</small></h3>
      {missing.length ? <p className="aiq-miss">{missing.map((m) => <span key={m} className="badge b-unknown">{m}</span>)}</p> : <p className="muted small">비어 있는 주요 칸이 없어요.</p>}

      <h3 className="aiq-h">자료로 확인</h3>
      <div className="aiq-in">
        <label className="aiw-file"><input type="file" accept=".hwp,.hwpx,.pdf,.txt" onChange={(e) => { setFile(e.target.files?.[0] || null); setUrl(""); setR(null); }} />
          <Icon name="edit" /><span>{file ? file.name : "한글·PDF·글 파일"}</span></label>
        <input type="url" placeholder="또는 공개 링크 (https://…)" value={url} onChange={(e) => { setUrl(e.target.value); setFile(null); setR(null); }} aria-label="자료 링크" />
        <button type="button" className="chip go" disabled={!!busy || !ready} onClick={read}>{busy === "read" ? "읽는 중…" : "AI에게 읽히기"}</button>
      </div>
      {r?.place?.mismatch && <p className="err" role="alert">자료에 '{r.place.mismatch}' 이름이 더 많이 나와요. {name} 자료가 맞는지 확인해 주세요.</p>}
      {r?.ok && <div className="aiq-res">
        <p className="small"><b>{name}과 다른 칸 {r.changes?.length || 0}개</b>{r.summary && <span className="muted"> · {r.summary}</span>}</p>
        {r.changes?.length > 0 && <ul className="aiq-list">{r.changes.map((c: any) => (
          <li key={c.key}><label><input type="checkbox" checked={!!pick[c.key]} onChange={(e) => setPick({ ...pick, [c.key]: e.target.checked })} />
            <b>{c.label}</b>{c.access && <span className="badge b-unknown">이동약자 정보 · 직접 확인</span>}</label>
            <span className="muted small">지금: {c.now}</span><span className="small">자료: <b>{c.new}</b></span></li>))}</ul>}
        {r.evidence?.length > 0 && <details><summary className="small">근거 문장 {r.evidence.length}개</summary><ul className="ai-list">{r.evidence.map((e: any, i: number) => <li key={i}><b>{e.label}</b> “{e.quote}”</li>)}</ul></details>}
        {r.changes?.length > 0 && <button type="button" className="chip go" disabled={!chosen.length}
          onClick={() => { onFill(Object.assign({}, ...chosen.map(toForm))); setDone(`${chosen.length}칸을 폼에 넣었어요. 확인하고 저장해 주세요.`); setPick({}); }}>고른 {chosen.length}칸 폼에 넣기</button>}
      </div>}

      <h3 className="aiq-h">글 다듬기</h3>
      <div className="chips">{TIDY_FIELDS.map(([k, t]) => <button key={k} type="button" className="chip sm" disabled={!!busy || !String(f[k] || "").trim()} onClick={() => tidy(k)}>{busy === k ? "다듬는 중…" : t}</button>)}</div>
      {td?.ok && <div className="aiq-res">
        <p className="small muted">{td.label} · 지금</p><p className="aiq-before">{td.before}</p>
        <p className="small muted">AI 제안</p><p className="aiq-after">{td.text}</p>
        {td.removed?.length > 0 && <p className="muted small">뺀 내용: {td.removed.join(" · ")}</p>}
        <button type="button" className="chip go" onClick={() => { onFill({ [td.field]: td.text }); setDone(`${td.label}을 폼에 넣었어요. 확인하고 저장해 주세요.`); setTd(null); }}>폼에 넣기</button>
      </div>}
      {err && <p className="err" role="alert">{err}</p>}
      {done && <p className="ok" role="status">{done}</p>}
    </aside>
  );
}
const tri = (v: any) => (v === true ? "yes" : v === false ? "no" : "");
const untri = (v: string) => (v === "yes" ? true : v === "no" ? false : null);
const norm = (v: any) => (v === "" || v === undefined ? null : v);
const segKey = (s: any) => ["name", "slope_deg", "rise_m", "curb_cm", "width_m", "steps", "surface", "note", "source"].map((k) => (s[k] === "" || s[k] == null ? null : String(s[k])));

/* ---------- 공지·알림: 긴급 알림(휴무·주의) · 일반 공지(모든 화면 위 공지·장소 안내) · 행사 안내를 한 탭에서 ---------- */
// 저장 구조(알림·배너·행사)와 API는 그대로. 등록할 종류만 골라 쓰고, 목록은 하나로 모아 종류를 표시한다.
const NH_KINDS = [["urgent", "긴급 알림 (휴무·주의)"], ["general", "일반 공지"], ["event", "행사 안내"]] as const;
const NH_NAME: Record<string, string> = { urgent: "긴급 알림", general: "일반 공지", event: "행사 안내" };
function NoticeHub({ places, db, tok, call, name, can }: any) {
  const [kind, setKind] = useState<"urgent" | "general" | "event">(can("notice") ? "urgent" : "general");
  const [smp, setSmp] = useState<any>({ notices: [], events: [] });   // 가상 알림·행사 (관리자 화면에만, 사이트에는 안 나감)
  useEffect(() => { api.get("/api/admin/samples", tok).then(setSmp).catch(() => {}); }, [db]);   // eslint-disable-line
  const rows: any[] = [
    ...(db?.banner ? [{ k: "general", id: "banner", title: db.banner.text, where: "모든 화면 위 공지", period: db.banner.until ? `~ ${db.banner.until}` : "계속", level: db.banner.level, perm: "site",
      del: () => call(() => api.post("/api/admin/banner", {}, tok), "공지를 내렸어요.") }] : []),
    ...(db?.notices || []).map((x: any) => ({ k: x.level === "info" ? "general" : "urgent", id: x.id, title: x.title, body: x.body, where: x.place_id ? name(x.place_id) : "사이트 전체",
      period: `${x.start || "지금"} ~ ${x.end || "계속"}`, level: x.level, past: x.end && x.end < today(), perm: "notice",
      del: () => call(() => api.post(`/api/admin/notices/${x.id}/delete`, {}, tok), "알림을 내렸어요.") })),
    ...(db?.events || []).map((x: any) => ({ k: "event", id: x.id, title: x.name, where: x.venue, period: `${x.start}${x.end && x.end !== x.start ? ` ~ ${x.end}` : ""}`,
      body: x.access ? `휠체어 접근: ${x.access}` : "", perm: "site", del: () => call(() => api.post(`/api/admin/events/${x.id}/delete`, {}, tok), "행사를 지웠어요.") })),
    ...(smp.notices || []).map((x: any) => ({ k: x.level === "info" ? "general" : "urgent", id: x.id, title: x.title, body: x.body, where: x.name || "사이트 전체",
      period: `${x.start || "지금"} ~ ${x.end || "계속"}`, level: x.level, sample: true })),
    ...(smp.events || []).map((x: any) => ({ k: "event", id: x.id, title: x.name, where: x.venue, period: `${x.start}${x.end && x.end !== x.start ? ` ~ ${x.end}` : ""}`,
      body: x.access ? `휠체어 접근: ${x.access}` : "", sample: true })),
  ];
  const order = { urgent: 0, general: 1, event: 2 } as Record<string, number>;
  rows.sort((a, b) => order[a.k] - order[b.k]);
  return (<>
    <div className="tabs nh-kinds" role="group" aria-label="등록할 종류">
      {NH_KINDS.map(([k, t]) => <button key={k} aria-pressed={kind === k} disabled={k === "urgent" ? !can("notice") : k === "event" ? !can("site") : !(can("notice") || can("site"))}
        onClick={() => setKind(k)}>{t}</button>)}
    </div>
    {kind === "urgent" && <NoticeForm places={places} tok={tok} call={call} levels={["closed", "warn"]} title="긴급 알림 올리기 (휴무·주의 — 휴무는 코스에서 빠져요)" />}
    {kind === "general" && <>
      {can("site") && <BannerForm db={db} tok={tok} call={call} />}
      {can("notice") && <NoticeForm places={places} tok={tok} call={call} levels={["info"]} title="장소·사이트 안내 올리기" />}</>}
    {kind === "event" && <EventForm tok={tok} call={call} />}
    <h2 className="h3">등록된 공지·알림·행사 <span className="muted small">{rows.length}건</span></h2>
    <ul className="rv-list">
      {rows.map((r) => (
        <li key={r.k + r.id} className={`panel notice-${r.k === "urgent" ? r.level : "info"}`}>
          <div className="seg-top">{r.sample && <span className="badge b-unknown">가상</span>}<span className={`badge ${r.k === "urgent" ? "b-urgent" : "b-plain"}`}>{NH_NAME[r.k]}{r.k === "urgent" ? ` · ${({ closed: "휴무", warn: "주의" } as Record<string, string>)[r.level] || ""}` : ""}</span>
            <b>{r.title}</b><small className="muted">{r.where} · {r.period}</small></div>
          {r.body && <p>{r.body}</p>}
          {r.past && <p className="muted small">기간이 지나 사이트에는 안 보여요.</p>}
          {r.sample ? <p className="muted small">관리자 화면 점검용 — 사이트·코스에는 안 보여요. [받은 글 › 불편 제보·민원 › 설정·백업]에서 한 번에 지워요.</p>
            : can(r.perm) && <button className="chip" onClick={r.del}>{r.k === "event" ? "삭제" : "내리기"}</button>}
        </li>))}
      {!rows.length && <li className="muted">등록된 공지·알림·행사가 없어요.</li>}
    </ul>
  </>);
}
function NoticeForm({ places, tok, call, levels, title }: any) {
  const blank = { place_id: "", level: levels[0], title: "", body: "", start: today(), end: "" };
  const [n, setN] = useState<any>(blank);
  return (
    <form className="panel visit-form" onSubmit={(e) => { e.preventDefault();
      call(() => api.post("/api/admin/notices", n, tok), "알림을 올렸어요. 장소 페이지와 코스 추천에 바로 반영됐어요.", n.place_id ? `#/place/${n.place_id}` : "#/").then(() => setN(blank)); }}>
      <h2 className="h3">{title}</h2>
      <Field label="장소 (비우면 사이트 전체)"><select value={n.place_id} onChange={(e) => setN({ ...n, place_id: e.target.value })}><option value="">사이트 전체</option>
        {places.map((p: any) => <option key={p.id} value={p.id}>{p.name_ko}</option>)}</select></Field>
      {levels.length > 1 && <Field label="종류"><select value={n.level} onChange={(e) => setN({ ...n, level: e.target.value })}>{levels.map((k: string) => <option key={k} value={k}>{LEVEL[k]}</option>)}</select></Field>}
      <Field label="시작일"><input type="date" value={n.start} onChange={(e) => setN({ ...n, start: e.target.value })} /></Field>
      <Field label="끝일 (비우면 계속)"><input type="date" value={n.end} onChange={(e) => setN({ ...n, end: e.target.value })} /></Field>
      <Field label="제목" wide><input value={n.title} maxLength={80} placeholder="예: 데크 보수로 휠체어는 해안 쪽 우회" onChange={(e) => setN({ ...n, title: e.target.value })} /></Field>
      <Field label="내용" wide><textarea rows={2} value={n.body} onChange={(e) => setN({ ...n, body: e.target.value })} /></Field>
      <button className="chip go" disabled={!n.title.trim()}>올리고 바로 반영</button>
    </form>
  );
}
function BannerForm({ db, tok, call }: any) {
  const [b, setB] = useState<any>({ text: "", level: "info", until: "" });
  useEffect(() => { if (db?.banner) setB({ until: "", ...db.banner }); }, [db?.banner]);
  return (
    <form className="panel visit-form" onSubmit={(ev) => { ev.preventDefault(); call(() => api.post("/api/admin/banner", b, tok), "첫 화면 공지를 바꿨어요.", "#/"); }}>
      <h2 className="h3">모든 화면 위 공지 {db?.banner && <span className="badge b-open">게시 중</span>}</h2>
      <Field label="공지 문구" wide><input value={b.text} maxLength={200} placeholder="예: 11/21~22 도째비페스타로 묵호항 주변 주차가 어려워요" onChange={(x) => setB({ ...b, text: x.target.value })} /></Field>
      <Field label="종류"><select value={b.level} onChange={(x) => setB({ ...b, level: x.target.value })}><option value="info">안내</option><option value="warn">주의</option></select></Field>
      <Field label="이 날까지 보이기 (비우면 계속)"><input type="date" value={b.until || ""} onChange={(x) => setB({ ...b, until: x.target.value })} /></Field>
      <div className="wide save-row"><button className="chip go" disabled={!b.text.trim()}>게시</button></div>
    </form>
  );
}
function EventForm({ tok, call }: any) {
  const blank = { name: "", start: today(), end: "", venue: "", tel: "", url: "", access: "" };
  const [e, setE] = useState<any>(blank);
  return (
    <form className="panel visit-form" onSubmit={(ev) => { ev.preventDefault(); call(() => api.post("/api/admin/events", e, tok), "행사를 추가했어요. 행사 달력과 코스 추천에 바로 보여요.", "#/events").then(() => setE(blank)); }}>
      <h2 className="h3">행사 안내 추가 <span className="muted small">(공공데이터에 없는 행사)</span></h2>
      <Field label="행사 이름" wide><input value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></Field>
      <Field label="시작일"><input type="date" value={e.start} onChange={(x) => setE({ ...e, start: x.target.value })} /></Field>
      <Field label="끝일"><input type="date" value={e.end} onChange={(x) => setE({ ...e, end: x.target.value })} /></Field>
      <Field label="장소"><input value={e.venue} onChange={(x) => setE({ ...e, venue: x.target.value })} /></Field>
      <Field label="문의 전화"><input value={e.tel} onChange={(x) => setE({ ...e, tel: x.target.value })} /></Field>
      <Field label="안내 링크" wide><input value={e.url} placeholder="https://" onChange={(x) => setE({ ...e, url: x.target.value })} /></Field>
      <Field label="접근성 메모 (휠체어석·장애인 화장실·셔틀 등)" wide><input value={e.access} onChange={(x) => setE({ ...e, access: x.target.value })} /></Field>
      <button className="chip go" disabled={!e.name.trim() || !e.start}>추가하고 바로 반영</button>
    </form>
  );
}

/* ---------- 받은 글: 문의 + 불편 제보·민원을 한 탭에서 ---------- */
// 저장값(문의: 접수/확인 중/답변 완료, 제보: 접수/확인/처리 중/완료/반려/중복)은 그대로 두고, 전체 목록에서만 3단계로 맞춰 보여 준다.
const INQ_CAT: Record<string, string> = { "이용 방법": "일반 문의", "기타": "일반 문의", "장소 정보": "관광지 정보 오류", "오류 신고": "관광지 정보 오류", "접근성·길 정보": "시설·접근성 문제" };
const ACC_CAT = new Set(["step", "sidewalk", "ramp", "toilet", "lift"]);
const STEP3 = (s: string) => (s === "접수" ? "접수" : ["확인", "확인 중", "처리 중"].includes(s) ? "확인 중" : "처리 완료");
function Inbox({ kind, setKind, tok, call, onExpired, can }: any) {
  return (<>
    <div className="tabs inbox-kinds" role="group" aria-label="받은 글 종류">
      {([["all", "전체"], ["inq", "문의"], ["rep", "불편 제보·민원"]] as const).map(([k, t]) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{t}</button>)}
    </div>
    {kind === "all" && <InboxAll tok={tok} onExpired={onExpired} open={setKind} />}
    {kind === "inq" && <Inquiries tok={tok} call={call} onExpired={onExpired} />}
    {kind === "rep" && <CityAdmin tok={tok} call={call} onExpired={onExpired} can={can} />}
  </>);
}
function InboxAll({ tok, onExpired, open }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [todo, setTodo] = useState(true);
  useEffect(() => {
    Promise.all([api.get("/api/admin/inquiries", tok), api.get("/api/admin/city?sample=1", tok)]).then(([inq, city]: any) => {
      const a = (inq || []).map((r: any) => ({ id: `i${r.id}`, kind: "inq", cat: INQ_CAT[r.category] || "일반 문의", step: STEP3(r.status), raw: r.status, at: r.created_at,
        text: r.text, who: r.nick, sample: r.sample }));
      const b = (city?.clusters || []).map((c: any) => ({ id: `c${c.id}`, kind: "rep", cat: ACC_CAT.has(c.category) ? "시설·접근성 문제" : "불편 사항·민원", step: STEP3(c.status), raw: c.status,
        at: c.last_at || c.first_at, text: c.title || c.summary, who: `${c.count}건${c.place_name || c.landmark ? ` · ${c.place_name || c.landmark}` : ""}`, sample: c.sample }));
      setRows([...a, ...b].sort((x, y) => String(y.at || "").localeCompare(String(x.at || ""))));
    }).catch((e: any) => { if (e.status === 401) onExpired(); setRows([]); });
  }, []);   // eslint-disable-line
  if (!rows) return <p className="muted" role="status">불러오는 중…</p>;
  const n = (s: string) => rows.filter((r) => r.step === s).length;
  const shown = rows.filter((r) => !todo || r.step !== "처리 완료");
  return (<>
    <p className="ib-sum"><b>접수 {n("접수")}</b> · 확인 중 {n("확인 중")} · 처리 완료 {n("처리 완료")}
      <label className="day small"><input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} />처리 안 된 것만</label></p>
    <ul className="rv-list ib-list">
      {shown.map((r) => (
        <li key={r.id} className="panel rv-row">
          <p>{r.sample && <span className="badge b-unknown">가상</span>} <span className="badge b-plain">{r.kind === "inq" ? "문의" : "불편 제보"}</span> <b>[{r.cat}]</b>{" "}
            <span className={`badge ib-${r.step === "접수" ? "new" : r.step === "확인 중" ? "doing" : "done"}`}>{r.step}</span>{r.raw !== r.step && <small className="muted"> ({r.raw})</small>}
            <small className="muted"> · {r.who} · {String(r.at || "").replace("T", " ").slice(0, 16)}</small></p>
          <p className="inq-text">{r.text}</p>
          <button className="chip sm" onClick={() => open(r.kind)}>{r.kind === "inq" ? "문의에서 답하기" : "제보·민원에서 처리하기"}</button>
        </li>))}
      {!shown.length && <li className="muted">{todo ? "처리할 글이 없어요." : "받은 글이 없어요."}</li>}
    </ul>
  </>);
}

// 커뮤니티 > 문의하기로 들어온 문의: 읽고, 답변 쓰고, 상태 바꾸기 (답변은 문의한 사람 화면 [내 문의]에 보임)
function Inquiries({ tok, call, onExpired }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api.get("/api/admin/inquiries", tok).then(setRows).catch((e: any) => { if (e.status === 401) onExpired(); setRows([]); });
  useEffect(() => { load(); }, []);
  return (
    <ul className="rv-list">
      {(rows || []).map((r) => <InquiryRow key={r.id} r={r} onSave={(body: any) => call(() => api.post(`/api/admin/inquiries/${r.id}`, body, tok), "문의 처리 결과를 저장했어요.").then(load)} />)}
      {rows && !rows.length && <li className="muted">아직 들어온 문의가 없어요. 커뮤니티 &gt; 문의하기에서 들어와요.</li>}
    </ul>
  );
}
function InquiryRow({ r, onSave }: { r: any; onSave: (b: any) => void }) {
  const [s, setS] = useState(r.status || "접수");
  const [a, setA] = useState(r.answer || "");
  return (
    <li className="panel rv-row">
      <p>{r.sample && <span className="badge b-unknown">가상</span>} <b>[{r.category}]</b> {r.nick}{r.contact ? <small className="muted"> · {r.contact}</small> : null} <small className="muted">· {String(r.created_at).replace("T", " ").slice(0, 16)}</small></p>
      <p className="inq-text">{r.text}</p>
      <label>답변<textarea rows={3} value={a} onChange={(e) => setA(e.target.value)} placeholder="문의한 사람 화면 [내 문의]에 보여요" /></label>
      <div className="chips">
        {["접수", "확인 중", "답변 완료"].map((x) => <button key={x} className="chip sm" aria-pressed={s === x} onClick={() => setS(x)}>{x}</button>)}
        <button className="chip go" onClick={() => onSave({ status: s === "접수" && a.trim() ? "답변 완료" : s, answer: a })}>저장</button>
      </div>
      {r.answered_by && <p className="muted small">마지막 처리: {r.answered_by} · {String(r.answered_at).replace("T", " ").slice(0, 16)}</p>}
    </li>
  );
}

// ③ AI 제안: 제보·길 메모를 AI가 정리해 만든 '사이트 수정 제안'. 승인해야 반영되고, 변경 이력에서 되돌릴 수 있다.
const PROP_KIND: Record<string, string> = { notice: "임시 알림 올리기", hours: "운영시간 바꾸기", facility_add: "편의시설 추가", facility_remove: "편의시설 삭제" };
function AiProposals({ tok, call, onExpired, can }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [show, setShow] = useState<"pending" | "all">("pending");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/api/admin/ai/proposals", tok).then(setRows).catch((e: any) => { if (e.status === 401) onExpired(); setRows([]); });
  useEffect(() => { load(); }, []);
  const refresh = async () => {
    setBusy(true);
    try { await call(() => api.post("/api/admin/ai/refresh", {}, tok), "최근 제보를 AI가 다시 정리했어요."); } catch { /* 위에 안내 */ }
    setBusy(false); load();
  };
  const list = (rows || []).filter((r) => show === "all" || r.status === "pending");
  return (
    <div>
      <p className="muted">이용자 제보와 길 메모를 AI가 장소마다 읽고 정리한 수정 제안이에요. <b>승인</b>해야 사이트에 반영되고, [변경 이력]에서 되돌릴 수 있어요. 근거 원문을 꼭 읽고 판단해 주세요.</p>
      <div className="chips">
        <button className="chip sm" aria-pressed={show === "pending"} onClick={() => setShow("pending")}>기다리는 제안</button>
        <button className="chip sm" aria-pressed={show === "all"} onClick={() => setShow("all")}>전체</button>
        <button className="chip" disabled={busy} onClick={refresh}>{busy ? "AI가 정리하는 중…" : "최근 제보 다시 정리"}</button>
      </div>
      <ul className="rv-list">
        {list.map((r) => <AiPropRow key={r.id} r={r} canApply={can(r.type === "notice" ? "notice" : "place")}
          onDecide={(approve: boolean, memo: string) => call(() => api.post(`/api/admin/ai/proposals/${r.id}`, { approve, memo }, tok), approve ? "승인해서 사이트에 반영했어요." : "반려했어요.").then(load).catch(() => {})} />)}
        {rows && !list.length && <li className="muted">{show === "pending" ? "기다리는 제안이 없어요." : "아직 AI 제안이 없어요. 제보가 들어오면 장소 화면을 열거나 [최근 제보 다시 정리]를 누를 때 만들어져요."}</li>}
      </ul>
    </div>
  );
}
function AiPropRow({ r, canApply, onDecide }: { r: any; canApply: boolean; onDecide: (a: boolean, m: string) => void }) {
  const [memo, setMemo] = useState("");
  const done = r.status !== "pending";
  return (
    <li className={`panel ai-prop${done ? " done" : ""}`}>
      <p>{r.sample && <span className="badge b-unknown">가상</span>} <b>{r.name}</b> · {PROP_KIND[r.type] || r.type} <small className="muted">· {String(r.created_at || "").replace("T", " ").slice(0, 16)}</small>
        {done && <span className={`badge ${r.status === "approved" ? "g-G" : "b-unknown"}`} style={{ marginLeft: 8 }}>{r.status === "approved" ? "승인됨" : "반려됨"}</span>}</p>
      <p><b>{r.title}</b>{r.type === "notice" && <small className="muted"> ({LEVEL[r.level] || r.level}, {r.end_date}까지)</small>}
        {r.type === "hours" && <small className="muted"> ({r.open}~{r.close})</small>}</p>
      {r.detail && <p>{r.detail}</p>}
      <details open={!done}><summary>근거 제보 {r.evidence_rows?.length || 0}건</summary>
        <ul className="ai-list">{(r.evidence_rows || []).map((e: any) => <li key={e.id}><small className="muted">{e.date} · {e.kind || "-"}</small> {e.note || "(내용 없음)"}{e.photo && <> · <a href={e.photo} target="_blank" rel="noreferrer">사진</a></>}</li>)}</ul>
      </details>
      {r.sample ? <p className="muted small">화면 확인용 가상 제안이라 승인·반려할 수 없어요.</p> : !done ? <div className="chips">
        <input className="box" placeholder="메모 (선택)" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} />
        <button className="chip go" disabled={!canApply} title={canApply ? "" : "이 제안을 반영할 권한이 없어요"} onClick={() => onDecide(true, memo)}>승인하고 반영</button>
        <button className="chip" onClick={() => onDecide(false, memo)}>반려</button>
      </div> : r.decided_by && <p className="muted small">처리: {r.decided_by} · {String(r.decided_at || "").replace("T", " ").slice(0, 16)}{r.memo ? ` · ${r.memo}` : ""}</p>}
    </li>
  );
}

// AI 설정: 작업마다 빠른 모델(Haiku)·똑똑한 모델(Sonnet) 고르기 + 이번 실행 동안 쓴 양. 바꾸기는 총괄 관리자만.
function AiSettings({ tok, call, onExpired, isOwner }: any) {
  const [d, setD] = useState<any>(null);
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const load = () => api.get("/api/admin/ai/settings", tok).then((r: any) => { setD(r); setTiers(Object.fromEntries(r.tasks.map((t: any) => [t.key, t.tier]))); })
    .catch((e: any) => { if (e.status === 401) onExpired(); });
  useEffect(() => { load(); }, []);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const price = (m: string) => { const p = d.price_per_mtok?.[m]; return p ? `$${p[0]} / $${p[1]}` : "-"; };
  const total = Object.values(d.usage || {}).reduce((a: number, u: any) => a + (u.usd || 0), 0) as number;
  return (
    <div>
      <p className="muted">{d.connected ? "Claude API 연결됨." : "Claude API 키가 없어 AI 기능이 꺼져 있어요(규칙으로 대신해요)."} 빠른 모델은 Haiku, 똑똑한 모델은 Sonnet이에요. Sonnet은 같은 양에 약 20배 비싸요.</p>
      <table className="ai-models">
        <thead><tr><th>작업</th><th>모델</th><th>쌓인 사용량</th></tr></thead>
        <tbody>{d.tasks.map((t: any) => { const u = d.usage?.[t.key]; return (
          <tr key={t.key}><td>{t.ko}{t.tier !== t.default && <small className="muted"> (기본: {t.default === "smart" ? "Sonnet" : "Haiku"})</small>}</td>
            <td><select className="box" disabled={!isOwner} value={tiers[t.key] || t.tier} onChange={(e) => setTiers({ ...tiers, [t.key]: e.target.value })}>
              <option value="fast">빠른 모델 (Haiku) · {price(d.models.fast)}</option>
              <option value="smart">똑똑한 모델 (Sonnet) · {price(d.models.smart)}</option></select></td>
            <td>{u ? `${u.calls}번 (대체 ${u.fallback}) · 약 $${u.usd}` : "-"}</td></tr>); })}</tbody>
      </table>
      <p className="muted small">가격은 100만 토큰당 (입력 / 출력) 달러. 사용량은 파일에 남아 서버를 다시 켜도 이어 세요(디스크가 없는 요금제에선 재배포 때 0부터). 쌓인 합계 약 ${total.toFixed(4)}.</p>
      {d.limits && <div className="ai-limits">
        <p><b>오늘({d.limits.today.date})</b> AI 작업 {d.limits.today.calls}번 · 약 ${Number(d.limits.today.usd).toFixed(4)}
          {d.limits.daily_usd > 0 ? ` / 하루 상한 $${d.limits.daily_usd}` : " (하루 상한 없음)"}
          {d.limits.today.limited > 0 && <> · <b>한도에 막혀 규칙으로 답한 횟수 {d.limits.today.limited}번</b></>}</p>
        <p className="muted small">요청 수 제한: 같은 접속 주소에서 {d.limits.window_sec / 60}분에 AI 작업 {d.limits.per_ip > 0 ? `${d.limits.per_ip}번까지` : "제한 없음"}. 한도를 넘으면 AI 대신 규칙으로 답해요(화면은 그대로 동작). 바꾸려면 서버 환경 변수 AI_RATE_PER_IP · AI_RATE_WINDOW · AI_DAILY_USD.</p>
        {Object.keys(d.limits.daily || {}).length > 1 && <details><summary>최근 날짜별 사용량</summary><ul className="ai-list">{Object.entries(d.limits.daily).reverse().map(([k, v]: any) =>
          <li key={k}>{k} · {v.calls}번 · 약 ${Number(v.usd).toFixed(4)}{v.limited ? ` · 막힘 ${v.limited}번` : ""}</li>)}</ul></details>}
      </div>}
      {Object.keys(d.last || {}).length > 0 && <details><summary>최근 AI 실패 이유</summary><ul className="ai-list">{Object.entries(d.last).map(([k, v]: any) => <li key={k}><b>{k}</b> {v.at} · {v.why}</li>)}</ul></details>}
      {isOwner ? <button className="chip go" onClick={() => {
        const changed = Object.fromEntries(Object.entries(tiers).filter(([k, v]) => v !== d.tasks.find((t: any) => t.key === k)?.default));
        call(() => api.post("/api/admin/ai/settings", { tiers: changed }, tok), "AI 모델 설정을 저장했어요.").then(load).catch(() => {});
      }}>저장</button> : <p className="muted small">모델 바꾸기는 총괄 관리자만 할 수 있어요.</p>}
    </div>
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
  const NAMES: Record<string, string> = { bf_food: "이동약자 음식점", bf_stay: "이동약자 숙소", bf_sight: "이동약자 관광지", crowd: "집중률 예측(장소 수)",
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
function Dashboard({ tok, user, go, can, onExpired }: { tok: string; user: User; go: (k: TabKey, sub?: "inq" | "rep") => void; can: (p: string | null) => boolean; onExpired: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get("/api/admin/dashboard", tok).then(setD).catch((e: any) => { if (e.status === 401) onExpired(); else setD({}); }); }, []);
  if (!d) return <p className="muted" role="status">불러오는 중…</p>;
  const card = (k: TabKey, ic: string, title: string, big: React.ReactNode, sub: string, warn = false, inbox?: "inq" | "rep") => (
    <button className={`dash-card${warn ? " warn" : ""}`} onClick={() => go(k, inbox)} disabled={!can(TABS.find((t) => t[0] === k)?.[2] ?? null)}>
      <span className="dash-k"><Icon name={ic} />{title}</span><b>{big}</b><span className="muted small">{sub}</span></button>);
  const exN: any[] = d.notices?.length ? [] : d.examples?.notices || [];
  const exR: any[] = d.recent?.length ? [] : d.examples?.recent || [];
  return (<>
    <p className="dash-hello"><b>{user.name}</b>님, 안녕하세요. 오늘은 {d.today} 이에요. <span className="muted">({user.role_name}: {ROLE_INFO[user.role]})</span></p>
    <div className="dash-grid">
      {card("reports", "camera", "새 제보", d.reports?.new ?? 0, `확인 중 ${d.reports?.doing ?? 0} · 전체 ${d.reports?.total ?? 0}${d.reports?.sample ? ` · 가상 ${d.reports.sample}건 따로` : ""}`, (d.reports?.new ?? 0) > 0, "rep")}
      {card("notice", "warn", "지금 걸린 알림", d.notices?.length || exN.length, d.notices?.length ? (d.banner ? `공지: ${d.banner.text.slice(0, 20)}` : "사이트 공지 없음") : exN.length ? "가상 예시 (사이트엔 안 보임)" : "사이트 공지 없음")}
      {card("reports", "story", "새 문의", d.inquiries?.new ?? 0, `전체 ${d.inquiries?.total ?? 0}${d.inquiries?.sample ? ` · 가상 ${d.inquiries.sample}건 따로` : ""}`, (d.inquiries?.new ?? 0) > 0, "inq")}
      {card("place", "pin", "고친 장소", d.overrides ?? 0, "원본 위에 덮어쓴 곳")}
    </div>
    <div className="cards2">
      <div className="panel">
        <h2 className="h3">지금 사이트에 보이는 알림</h2>
        {d.notices?.length ? <ul className="plain">{d.notices.map((n: any) => <li key={n.id}><span className={`badge ${n.level === "closed" ? "g-R" : n.level === "warn" ? "g-Y" : "b-plain"}`}>{LEVEL[n.level]?.split(" ")[0]}</span> {n.name ? `${n.name} · ` : ""}{n.title}{n.end ? <small className="muted"> ~{n.end}</small> : null}</li>)}</ul>
          : exN.length ? <ul className="plain">{exN.map((n: any) => <li key={n.id}><span className="badge b-unknown">가상</span> <span className={`badge ${n.level === "closed" ? "g-R" : "g-Y"}`}>{LEVEL[n.level]?.split(" ")[0]}</span> <b>{n.name}</b> {n.title}</li>)}</ul>
          : <p className="muted">걸려 있는 알림이 없어요.</p>}
        {d.events_week?.length > 0 && <><h3 className="h3" style={{ marginTop: 14 }}>이번 주 관리자 추가 행사</h3><ul className="plain">{d.events_week.map((e: any) => <li key={e.id}>{e.name} · {e.start}{e.end && e.end !== e.start ? `~${e.end}` : ""}</li>)}</ul></>}
      </div>
      <div className="panel">
        <h2 className="h3">최근 변경</h2>
        {d.recent?.length ? <ul className="plain dash-recent">{d.recent.map((h: any) => <li key={h.id}><small className="muted">{h.at.slice(5, 16).replace("T", " ")}</small> <b>{h.who === "admin" ? "총괄 관리자" : h.who}</b> · {ACTION[h.action] || h.action}{h.reverted ? <small className="muted"> (되돌림)</small> : null}</li>)}</ul>
          : exR.length ? <ul className="plain dash-recent">{exR.map((h: any) => <li key={h.id}><small className="muted">{h.at.slice(5, 16).replace("T", " ")}</small> <span className="badge b-unknown">가상</span> <b>{h.who}</b> · {h.summary}</li>)}</ul>
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
