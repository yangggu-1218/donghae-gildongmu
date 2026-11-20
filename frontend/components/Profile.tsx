"use client";
// 이 기기 로그인 · 프로필 (마이페이지). 계정·비밀번호(솔트+SHA-256)는 이 브라우저(localStorage)에만 저장한다.
// 구성은 관광 누리집 마이페이지(대한민국 구석구석 등)를 참고: 프로필 카드 → 내 활동 숫자 → 내 일정·담은 장소·내 글·내 문의 → 여행 설정
import { useEffect, useMemo, useState } from "react";
import { Head } from "@/components/Pages";
import { Icon } from "@/components/Icon";
import { loadPlans, planName, openSavedPlan } from "@/components/MyTrips";
import { allPosts, load as loadCm, AVATAR, TEST_NICK } from "@/lib/community";
import { api } from "@/lib/api";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);
export type User = { id: string; nick: string; salt: string; hash: string; created: string; color: string; move: string[]; style: string[]; bio: string; photo?: string };
const UKEY = "gd-users", MKEY = "gd-me";
const COLORS = ["#2462B4", "#1E8A3C", "#A45400", "#6B4FA0", "#C9302C", "#12355E"];
const users = (): User[] => { try { return JSON.parse(localStorage.getItem(UKEY) || "[]"); } catch { return []; } };
const saveUsers = (u: User[]) => { try { localStorage.setItem(UKEY, JSON.stringify(u)); } catch { /* */ } };
export function currentUser(): User | null { try { const id = localStorage.getItem(MKEY); return users().find((u) => u.id === id) || null; } catch { return null; } }
const emit = () => window.dispatchEvent(new Event("gd-user"));
async function sha(salt: string, pw: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pw}`));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
// 프로필 동그라미: 사진이 있으면 사진, 없으면 닉네임 첫 글자
export function Avatar({ nick, color, photo, big }: { nick: string; color?: string; photo?: string; big?: boolean }) {
  const src = photo || AVATAR[nick];
  return src ? <span className={`pf-av photo${big ? " big" : ""}`} aria-hidden="true"><img src={src} alt="" /></span>
    : <span className={`pf-av${big ? " big" : ""}`} style={{ background: color || "#2462B4" }} aria-hidden="true">{nick.slice(0, 1)}</span>;
}
// 시연용 임시 로그인: 비밀번호 없이 [Test] 계정으로 들어간다 (이 기기에만 저장)
export function testLogin() {
  const all = users();
  let u = all.find((x) => x.nick === TEST_NICK);
  if (!u) {
    u = { id: "u-test", nick: TEST_NICK, salt: "test", hash: "-", created: "2026-11-10", color: COLORS[0], move: ["오래 걷기 어려움"], style: ["바다 보기", "카페"], bio: "", photo: AVATAR[TEST_NICK] };
    saveUsers([...all, u]);
  }
  try { localStorage.setItem(MKEY, u.id); localStorage.setItem("gd-nick", u.nick); } catch { /* */ }
  emit(); location.hash = "#/me";
}
export function useUser() {
  const [u, setU] = useState<User | null>(null);
  useEffect(() => { const f = () => setU(currentUser()); f(); window.addEventListener("gd-user", f); window.addEventListener("storage", f); return () => { window.removeEventListener("gd-user", f); window.removeEventListener("storage", f); }; }, []);
  return u;
}

// 머리말 오른쪽 끝: 로그인 전엔 [로그인], 뒤엔 내 이름 첫 글자 동그라미 → 프로필
export function ProfileButton({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const u = useUser();
  return u
    ? <a className="pf-btn" href="#/me" aria-label={L(`${u.nick}님 프로필`, `${u.nick}'s profile`)}><Avatar nick={u.nick} color={u.color} photo={u.photo} /><span className="pf-nick">{u.nick}</span></a>
    : <a className="pf-btn login" href="#/login" aria-label={L("로그인", "Log in")}>
        <svg className="pf-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4.5 20c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <span className="pf-txt">{L("로그인", "Log in")}</span></a>;
}

export function LoginPage({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    const n = nick.trim();
    if (n.length < 2 || n.length > 12) { setErr(L("닉네임은 2~12자로 적어 주세요.", "Nickname: 2–12 characters.")); return; }
    if (pw.length < 6) { setErr(L("비밀번호는 6자 이상이에요.", "Password: at least 6 characters.")); return; }
    const all = users();
    if (mode === "up") {
      if (pw !== pw2) { setErr(L("비밀번호 두 칸이 서로 달라요.", "Passwords don't match.")); return; }
      if (all.some((u) => u.nick === n)) { setErr(L("이 기기에 같은 닉네임이 있어요. 다른 닉네임을 써 주세요.", "That nickname is taken on this device.")); return; }
      const salt = crypto.getRandomValues(new Uint32Array(2)).join("-");
      const u: User = { id: `u${Date.now()}`, nick: n, salt, hash: await sha(salt, pw), created: new Date().toISOString().slice(0, 10), color: COLORS[all.length % COLORS.length], move: [], style: [], bio: "" };
      saveUsers([...all, u]);
      try { localStorage.setItem(MKEY, u.id); localStorage.setItem("gd-nick", n); } catch { /* */ }
      emit(); location.hash = "#/me"; return;
    }
    const u = all.find((x) => x.nick === n);
    if (!u || (await sha(u.salt, pw)) !== u.hash) { setErr(L("닉네임이나 비밀번호가 맞지 않아요.", "Wrong nickname or password.")); return; }
    try { localStorage.setItem(MKEY, u.id); localStorage.setItem("gd-nick", u.nick); } catch { /* */ }
    emit(); location.hash = "#/me";
  };
  return (
    <section className="sec wrap pf-login">
      <Head lang={lang} mascot="full-bow" title={mode === "in" ? L("로그인", "Log in") : L("회원가입", "Sign up")} sub={L("로그인하면 저장한 코스·담은 장소·내 글을 한곳에서 볼 수 있어요.", "See your saved trips, places and posts in one place.")} />
      <div className="panel pf-card">
        <div className="pf-tabs" role="tablist">
          <button role="tab" aria-selected={mode === "in"} onClick={() => { setMode("in"); setErr(""); }}>{L("로그인", "Log in")}</button>
          <button role="tab" aria-selected={mode === "up"} onClick={() => { setMode("up"); setErr(""); }}>{L("회원가입", "Sign up")}</button>
        </div>
        <form className="cm-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label><span>{L("닉네임", "Nickname")}</span><input autoComplete="username" value={nick} maxLength={12} onChange={(e) => setNick(e.target.value)} /></label>
          <label><span>{L("비밀번호", "Password")}</span><input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          {mode === "up" && <label><span>{L("비밀번호 한 번 더", "Confirm password")}</span><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn-go">{mode === "in" ? L("로그인", "Log in") : L("가입하고 시작하기", "Create account")}</button>
        </form>
        <div className="pf-test">
          <button type="button" className="chip pf-test-btn" onClick={testLogin}><Avatar nick={TEST_NICK} />{L("임시 로그인 (Test)", "Quick demo login (Test)")}</button>
          <small className="muted">{L("비밀번호 없이 시연용 [Test] 계정으로 둘러봐요.", "Look around with the demo account, no password.")}</small>
        </div>
        <p className="muted small">{L("계정은 이 기기(브라우저)에만 저장돼요. 다른 기기에서는 다시 가입해야 해요. 이메일·전화번호는 받지 않아요.", "Your account is stored on this device only. We don't collect email or phone numbers.")}</p>
      </div>
    </section>
  );
}

const MOVES: [string, string, string][] = [["휠체어", "휠체어", "Wheelchair"], ["유모차", "유모차", "Stroller"], ["오래 걷기 어려움", "어르신", "Limited walking"]];
const STYLES: [string, string][] = [["바다 보기", "Sea views"], ["자연·산책", "Nature walks"], ["산·등산", "Mountains"], ["카페", "Cafés"], ["맛집", "Food"], ["역사·문화", "History & culture"]];

export function ProfilePage({ lang, wish, places, onRemoveWish }: { lang: Lang; wish: string[]; places: Record<string, any>; onRemoveWish: (id: string) => void }) {
  const L = pick(lang);
  const u = useUser();
  const [tab, setTab] = useState<"trips" | "wish" | "posts" | "qna" | "set">("trips");
  const [mine, setMine] = useState<any[]>([]);
  useEffect(() => { try { const ids = JSON.parse(localStorage.getItem("gd-inq") || "[]"); if (ids.length) api.get(`/api/inquiries/mine?ids=${ids.join(",")}`).then(setMine).catch(() => {}); } catch { /* */ } }, []);
  const plans = useMemo(() => (typeof window === "undefined" ? [] : loadPlans()), [u]);
  const cm = useMemo(() => (typeof window === "undefined" ? null : loadCm()), [u]);
  const myPosts = cm ? allPosts(cm).filter((p) => p.mine || (u && p.nick === u.nick)) : [];
  const myCmts = cm && u ? allPosts(cm).flatMap((p) => p.comments.filter((c) => c.nick === u.nick).map((c) => ({ ...c, pid: p.id }))) : [];
  const nm = (id: string) => (lang === "ko" ? places[id]?.name_ko : places[id]?.name_en || places[id]?.name_ko) || id;
  if (!u) return (
    <section className="sec wrap"><Head lang={lang} title={L("내 프로필", "My profile")} sub={L("로그인하면 볼 수 있어요.", "Log in to see your profile.")} />
      <a className="btn-go" href="#/login">{L("로그인 · 회원가입", "Log in / Sign up")}</a></section>);
  const upd = (f: (x: User) => void) => { const all = users(); const me = all.find((x) => x.id === u.id); if (me) { f(me); saveUsers(all); emit(); } };
  const toggle = (k: "move" | "style", v: string) => upd((x) => { x[k] = x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v]; });
  const tabs: [typeof tab, string, string, number | null][] = [["trips", "내 일정", "My trips", plans.length], ["wish", "담은 장소", "Saved places", wish.length], ["posts", "내 글·댓글", "My posts", myPosts.length + myCmts.length], ["qna", "내 문의", "My questions", mine.length], ["set", "여행 설정", "Settings", null]];
  return (
    <section className="sec wrap pf">
      <div className="pf-hero">
        <Avatar nick={u.nick} color={u.color} photo={u.photo} big />
        <div className="pf-who">
          <h1>{L(`${u.nick}님`, u.nick)}</h1>
          <p className="muted">{L(`${u.created} 가입`, `Joined ${u.created}`)}</p>
          <p className="pf-tags">{[...u.move.map((m) => L(MOVES.find((x) => x[0] === m)?.[1] || m, MOVES.find((x) => x[0] === m)?.[2] || m)), ...u.style.map((s) => L(s, STYLES.find((x) => x[0] === s)?.[1] || s))].map((x) => <span key={x} className="tl-chip">{x}</span>)}
            {!u.move.length && !u.style.length && <button className="link-btn" onClick={() => setTab("set")}>{L("여행 스타일을 정해 보세요", "Set your travel style")}</button>}</p>
        </div>
        <button className="chip pf-out" onClick={() => { try { localStorage.removeItem(MKEY); } catch { /* */ } emit(); location.hash = "#/"; }}>{L("로그아웃", "Log out")}</button>
      </div>
      <div className="pf-stats" role="tablist" aria-label={L("내 활동", "My activity")}>
        {tabs.map(([k, ko, en, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{n != null && <b>{n}</b>}<span>{L(ko, en)}</span></button>)}
      </div>
      <div className="panel pf-body" role="tabpanel">
        {tab === "trips" && (plans.length ? <ul className="pf-list">{plans.slice(0, 8).map((p) => <li key={p.id}><a href={`#plan=${p.hash}`} onClick={(e) => { e.preventDefault(); openSavedPlan(p); }}><b>{planName(p)}</b><small className="muted">{p.date} {p.start_time} · {p.stops.map(nm).join(" → ")}</small></a></li>)}</ul>
          : <p className="muted">{L("저장한 코스가 없어요. 코스를 짠 뒤 [내 일정에 저장]을 눌러 보세요.", "No saved trips yet.")} <a href="#plan">{L("코스 짜러 가기", "Plan a trip")}</a></p>)}
        {tab === "trips" && plans.length > 0 && <a className="link-btn" href="#/my">{L("내 일정 전체 보기", "See all trips")}</a>}
        {tab === "wish" && (wish.length ? <ul className="pf-list">{wish.map((id) => <li key={id}><a href={`#/place/${id}`}><b>{nm(id)}</b></a><button className="chip sm" onClick={() => onRemoveWish(id)}>{L("빼기", "Remove")}</button></li>)}</ul>
          : <p className="muted">{L("담은 장소가 없어요. 관광지에서 [코스에 담기]를 눌러 보세요.", "No saved places.")} <a href="#/places">{L("관광지 보러 가기", "Browse places")}</a></p>)}
        {tab === "posts" && (myPosts.length + myCmts.length ? <ul className="pf-list">
          {myPosts.map((p) => <li key={p.id}><a href={`#/community/${p.id}`}><b>{p.title}</b><small className="muted">{p.date} · {L(`도움 됐어요 ${p.helpful} · 댓글 ${p.comments.length}`, `${p.helpful} helpful · ${p.comments.length} comments`)}</small></a></li>)}
          {myCmts.map((c, i) => <li key={i}><a href={`#/community/${c.pid}`}><b>{L("댓글", "Comment")}</b><small className="muted">{c.date} · {c.text.slice(0, 40)}</small></a></li>)}</ul>
          : <p className="muted">{L("아직 쓴 글이 없어요.", "No posts yet.")} <a href="#/community/new">{L("내 코스 올리기", "Share a trip")}</a></p>)}
        {tab === "qna" && (mine.length ? <ul className="pf-list">{mine.map((m) => <li key={m.id}><div><b>[{m.category}] {m.status}</b><small className="muted">{String(m.created_at).slice(0, 10)} · {m.text.slice(0, 50)}</small>{m.answer && <p className="cm-answer"><b>{L("답변", "Answer")}</b> {m.answer}</p>}</div></li>)}</ul>
          : <p className="muted">{L("보낸 문의가 없어요.", "No questions sent.")} <a href="#/community/ask">{L("문의하러 가기", "Ask a question")}</a></p>)}
        {tab === "set" && (
          <div className="pf-set">
            <fieldset><legend>{L("함께 다니는 분의 이동 (코스 짤 때 참고)", "Mobility needs")}</legend>
              <div className="chips">{MOVES.map(([v, ko, en]) => <button key={v} className="chip" aria-pressed={u.move.includes(v)} onClick={() => toggle("move", v)}>{L(ko, en)}</button>)}</div></fieldset>
            <fieldset><legend>{L("좋아하는 여행", "Favorite things")}</legend>
              <div className="chips">{STYLES.map(([v, en]) => <button key={v} className="chip" aria-pressed={u.style.includes(v)} onClick={() => toggle("style", v)}>{L(v, en)}</button>)}</div></fieldset>
            <p className="muted small">{L("글자 크게 보기·언어는 화면 위 버튼으로 바꿀 수 있어요.", "Text size and language are in the top bar.")}</p>
            <button className="link-btn danger" onClick={() => { if (confirm(L("이 기기에서 계정을 지울까요? 저장한 코스·글은 남아요.", "Delete this account from this device?"))) { saveUsers(users().filter((x) => x.id !== u.id)); try { localStorage.removeItem(MKEY); } catch { /* */ } emit(); location.hash = "#/"; } }}>{L("이 기기에서 계정 지우기", "Delete account on this device")}</button>
          </div>)}
      </div>
    </section>
  );
}
