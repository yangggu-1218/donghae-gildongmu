"use client";
// 커뮤니티 '다녀온 길': 다녀온 코스 후기 + 길 메모 + 도움 됐어요 + 댓글. 관광지 상세의 '다녀온 사람들 이야기'.
// 시연판은 이 브라우저에만 저장한다 (lib/community.ts). 결정 배경: docs/16_COMMUNITY_PANEL.md
import { useEffect, useMemo, useState } from "react";
import { getJSON } from "@/lib/api";
import { Head, GuidePage } from "@/components/Pages";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { fuzzyHit } from "@/lib/fuzzy";
import KakaoMap from "@/components/KakaoMap";
import { PHOTOS, photoAt } from "@/lib/photos";
import { allPosts, load, save, today, type Post, type PlaceNote } from "@/lib/community";
import { Avatar } from "@/components/Profile";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);
const ZONE: Record<string, [string, string]> = { mukho: ["묵호", "Mukho"], mangsang: ["망상", "Mangsang"], chuam: ["추암", "Chuam"], mureung: ["무릉", "Mureung"], cheongok: ["천곡", "Cheongok"] };
const MOVE: [string, string, string][] = [["휠체어", "휠체어", "Wheelchair"], ["유모차", "유모차", "Stroller"], ["오래 걷기 어려움", "어르신·무릎", "Limited walking"]];
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

function usePlaces() {
  const [m, setM] = useState<Record<string, any>>({});
  useEffect(() => { getJSON("/api/places?mode=none").then((l: any[]) => setM(Object.fromEntries(l.map((p) => [p.id, p])))).catch(() => {}); }, []);
  return m;
}

// 코스 띠: 장소를 점과 선으로 잇는 작은 노선도 (이 페이지의 단 하나의 눈에 띄는 요소)
function Strip({ ids, places, lang }: { ids: string[]; places: Record<string, any>; lang: Lang }) {
  const nm = (id: string) => (lang === "ko" ? places[id]?.name_ko : places[id]?.name_en || places[id]?.name_ko) || id;
  return (
    <ol className="cm-strip" aria-label={lang === "ko" ? "다녀온 순서" : "Route order"}>
      {ids.map((id) => <li key={id} className={["식당", "카페"].includes(places[id]?.type) ? "eat" : ""}><span>{nm(id)}</span></li>)}
    </ol>
  );
}

export function CommunityPage({ lang, sub, onUse }: { lang: Lang; sub?: string; onUse: (ids: string[]) => void }) {
  const L = pick(lang);
  const places = usePlaces();
  const [st, setSt] = useState(load);
  const upd = (f: (s: ReturnType<typeof load>) => void) => { const s = load(); f(s); save(s); setSt(s); };
  const posts = useMemo(() => allPosts(st), [st]);
  if (sub === "new") return <Write lang={lang} places={places} onDone={(p) => { upd((s) => { s.posts.unshift(p); }); location.hash = `#/community/${p.id}`; }} />;
  const one = sub ? posts.find((p) => p.id === sub) : null;
  if (sub && one) return <Detail lang={lang} p={one} places={places} helped={!!st.helpful[one.id]} onUse={onUse}
    onHelp={() => upd((s) => { s.helpful[one.id] = !s.helpful[one.id]; })}
    onComment={(c) => upd((s) => { (s.comments[one.id] ||= []).push(c); })}
    onHide={() => { upd((s) => { s.hidden[one.id] = true; }); location.hash = "#/community/talk"; }} />;
  if (sub === "talk") return <List lang={lang} posts={posts} places={places} />;
  if (sub === "ask") return <Ask lang={lang} />;
  return <Hub lang={lang} n={posts.length} />;
}

// 커뮤니티 첫 화면: 이야기 나누기 / 문의하기 중 고르기
function Hub({ lang, n }: { lang: Lang; n: number }) {
  const L = pick(lang);
  return (
    <section className="sec wrap cm">
      <Head lang={lang} mascot="full-cheer" title={L("커뮤니티", "Community")} sub={L("다녀온 사람들의 이야기를 보거나, 궁금한 점을 물어보세요.", "Read trips from other travelers or ask us a question.")} />
      <div className="cm-hub">
        <a className="cm-door talk" href="#/community/talk">
          <span className="cm-door-k"><Icon name="story" />{L("이야기 나누기", "Trips & stories")}</span>
          <b>{L("다녀온 길", "Trips people took")}</b>
          <span>{L("다녀온 코스와 길 메모를 보고, 마음에 드는 코스는 그대로 짜 보세요.", "Routes and path notes. Plan any of them in one tap.")}</span>
          <small>{L(`글 ${n}개`, `${n} posts`)}</small>
        </a>
        <a className="cm-door ask" href="#/community/ask">
          <span className="cm-door-k"><Icon name="info" />{L("문의하기", "Questions")}</span>
          <b>{L("자주 묻는 질문 · 문의하기", "FAQ & contact us")}</b>
          <span>{L("자주 묻는 질문과 여행 준비물을 먼저 보고, 없으면 관리자에게 물어보세요.", "Check the FAQ and trip checklist, then ask our team.")}</span>
          <small>{L("답변은 [내 문의]에서 확인", "Answers appear in My questions")}</small>
        </a>
      </div>
    </section>
  );
}

// 문의: 자주 묻는 질문(여행 준비 포함) → 내 문의 → 문의하기
function Ask({ lang }: { lang: Lang }) {
  const L = pick(lang);
  const CATS: [string, string][] = [["이용 방법", "Using the site"], ["장소 정보", "Place info"], ["접근성·길 정보", "Access & paths"], ["오류 신고", "Report a bug"], ["기타", "Other"]];
  const [cat, setCat] = useState("이용 방법");
  const [nick, setNick] = useState(() => { try { return localStorage.getItem("gd-nick") || ""; } catch { return ""; } });
  const [contact, setContact] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [mine, setMine] = useState<any[]>([]);
  const ids = () => { try { return JSON.parse(localStorage.getItem("gd-inq") || "[]") as string[]; } catch { return []; } };
  const loadMine = () => { const x = ids(); if (x.length) api.get(`/api/inquiries/mine?ids=${x.join(",")}`).then(setMine).catch(() => {}); };
  useEffect(loadMine, []);
  const send = async () => {
    if (text.trim().length < 5) { setMsg({ ok: false, t: L("문의 내용을 5자 이상 적어 주세요.", "Write at least 5 characters.") }); return; }
    try {
      const r = await api.post("/api/inquiries", { nick, contact, category: cat, text });
      try { localStorage.setItem("gd-inq", JSON.stringify([...ids(), r.id])); if (nick.trim()) localStorage.setItem("gd-nick", nick.trim()); } catch { /* */ }
      setText(""); setMsg({ ok: true, t: L("문의를 보냈어요. 답변은 아래 [내 문의]에 보여요.", "Sent. The answer will appear under My questions.") }); loadMine();
    } catch (e: any) { setMsg({ ok: false, t: e?.message || L("보내지 못했어요. 잠시 뒤 다시 시도해 주세요.", "Couldn't send. Try again shortly.") }); }
  };
  return (
    <section className="sec wrap cm cm-ask">
      <p className="crumb"><a href="#/">{L("처음", "Home")}</a> › <a href="#/community">{L("커뮤니티", "Community")}</a> › {L("문의하기", "Questions")}</p>
      <a className="cm-back" href="#/community"><Icon name="down" className="cm-back-ic" />{L("커뮤니티로 돌아가기", "Back to community")}</a>
      <h1>{L("자주 묻는 질문 · 문의하기", "FAQ & contact us")}</h1>
      <GuidePage lang={lang} embedded />
      {mine.length > 0 && (
        <section className="panel cm-mine-q" aria-labelledby="cm-mq-h">
          <h2 id="cm-mq-h" className="h3">{L("내 문의", "My questions")}</h2>
          <ul className="cm-clist">{mine.map((m) => <li key={m.id}><b>[{m.category}]</b> <span className={`badge ${m.status === "답변 완료" ? "b-open" : "b-unknown"}`}>{m.status}</span>
            <small className="muted"> {String(m.created_at).slice(0, 10)}</small><p>{m.text}</p>{m.answer && <p className="cm-answer"><b>{L("답변", "Answer")}</b> {m.answer}</p>}</li>)}</ul>
        </section>)}
      <section className="panel cm-form" aria-labelledby="cm-q-h">
        <h2 id="cm-q-h" className="h3">{L("관리자에게 문의하기", "Ask our team")}</h2>
        <p className="muted small">{L("위에서 답을 찾지 못했다면 남겨 주세요. 동해 길동무 관리자가 읽고 답해요. 급한 일은 화면 위 [긴급·도움]을 눌러 주세요.", "If the FAQ didn't help, ask here. For emergencies use Help now at the top.")}</p>
        <fieldset><legend>{L("무엇에 대한 문의인가요?", "Topic")}</legend>
          <div className="chips">{CATS.map(([k, en]) => <button type="button" key={k} className="chip" aria-pressed={cat === k} onClick={() => setCat(k)}>{L(k, en)}</button>)}</div></fieldset>
        <label><span>{L("닉네임", "Nickname")}</span><input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder={L("비우면 '방문자'", "Optional")} /></label>
        <label><span>{L("답변 받을 연락처 (선택)", "Contact for a reply (optional)")}</span><input value={contact} maxLength={60} onChange={(e) => setContact(e.target.value)} placeholder={L("이메일 등. 비워 두면 이 화면에서만 답변을 볼 수 있어요", "Email etc.")} /></label>
        <label><span>{L("문의 내용", "Your question")}</span><textarea rows={5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></label>
        {msg && <p className={msg.ok ? "ok-msg" : "err"} role={msg.ok ? "status" : "alert"}>{msg.t}</p>}
        <button className="btn-go" onClick={send}>{L("문의 보내기", "Send question")}</button>
      </section>
    </section>
  );
}

// '다녀온 길' 목록: 사진 카드(표지 = 글의 첫 장소 중 출처 확인된 관광지 사진) · 카드/지도 보기 · 찜 · 쪽 나누기
const PER = 9;
const FAV_KEY = "gd-cm-fav";
const WHO_TAG: Record<string, [string, string]> = { "부모님과": ["부모님과", "With parents"], "아이와": ["가족 추천", "Family pick"], "연인·친구": ["연인·친구", "Couples & friends"], "혼자": ["혼자 여행", "Solo"] };
const km = (a: any, b: any) => {
  const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
// 글의 장소로 계산한 대략값: 머무는 시간 + 장소 사이 이동 약 20분, 장소 사이 직선거리 합, 걷기 난이도
function facts(p: Post, places: Record<string, any>) {
  const ps = p.stops.map((id) => places[id]).filter(Boolean);
  const min = ps.reduce((s, x) => s + (x.stay_min || 45), 0) + Math.max(0, ps.length - 1) * 20;
  let dist = 0; for (let i = 1; i < ps.length; i++) if (ps[i - 1].lat && ps[i].lat) dist += km(ps[i - 1], ps[i]);
  const loads = ps.filter((x) => !["식당", "카페"].includes(x.type)).map((x) => x.walk_load);
  const level = loads.includes("급경사") ? 2 : loads.includes("완만한경사") ? 1 : 0;
  const cover = p.stops.find((id) => PHOTOS[id]);
  return { min, dist, level, cover, first: ps.find((x) => x.lat) };
}
const StrollerIc = () => (
  <svg className="ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h2l2.2 8.5h9.3L20 7H7.2" /><path d="M12 7V3.5a5 5 0 0 1 5 3.5" /><circle cx="9" cy="18.5" r="1.8" /><circle cx="17" cy="18.5" r="1.8" />
  </svg>);

function List({ lang, posts, places }: { lang: Lang; posts: Post[]; places: Record<string, any> }) {
  const L = pick(lang);
  const [kind, setKind] = useState<"" | "easy" | "free">("");
  const [move, setMove] = useState("");
  const [zone, setZone] = useState("");
  const [sort, setSort] = useState<"new" | "help" | "star">("new");
  const [qIn, setQIn] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"card" | "map">("card");
  const [page, setPage] = useState(1);
  const [fav, setFav] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "{}"); } catch { return {}; } });
  const toggleFav = (id: string) => setFav((f) => { const n = { ...f, [id]: !f[id] }; if (!n[id]) delete n[id]; try { localStorage.setItem(FAV_KEY, JSON.stringify(n)); } catch { /* */ } return n; });
  useEffect(() => setPage(1), [kind, move, zone, sort, q]);
  const key = q.trim().replace(/\s+/g, "");
  const nm = (id: string) => places[id]?.name_ko || "";
  const pn = (id: string) => (lang === "ko" ? places[id]?.name_ko : places[id]?.name_en || places[id]?.name_ko) || "";
  const rows = posts.filter((p) => (!kind || p.kind === kind) && (!move || p.move.includes(move)) && (!zone || p.zone === zone)
      && (!key || `${p.title}${p.body}${p.stops.map(nm).join("")}`.replace(/\s+/g, "").includes(key) || p.stops.some((id) => fuzzyHit(nm(id), key) >= 0)))
    .sort((a, b) => (sort === "help" ? b.helpful - a.helpful : sort === "star" ? b.rating - a.rating || b.helpful - a.helpful : b.date.localeCompare(a.date)));
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * PER, cur * PER);
  const LEVEL: [string, string][] = [["쉬움", "Easy"], ["보통", "Moderate"], ["조금 힘듦", "Harder"]];
  const dur = (m: number) => { const h = Math.floor(m / 60), r = Math.round((m % 60) / 10) * 10; return lang === "ko" ? `${h ? `${h}시간 ` : ""}${r ? `${r}분` : ""}`.trim() || "30분" : `${h ? `${h}h ` : ""}${r ? `${r}m` : ""}`.trim(); };
  const pins = rows.map((p) => { const f = facts(p, places); return f.first ? { lat: f.first.lat, lon: f.first.lon, label: p.title, grade: null, icon: p.kind === "easy" ? L("무", "B") : L("일", "R"), sub: `${p.stops.map(pn).join(" → ")}`, color: p.kind === "easy" ? "#2462B4" : "#C7671A" } : null; }).filter(Boolean) as any[];
  const KIND: [("" | "easy" | "free"), string, string, JSX.Element | null][] = [["", "전체", "All", null], ["easy", "무장애 여행", "Barrier-free", <Icon key="i" name="shield" />], ["free", "일반 여행", "Regular", <Icon key="i" name="trail" />]];
  const MV_IC: Record<string, JSX.Element> = { "휠체어": <Icon name="wheel" />, "유모차": <StrollerIc />, "오래 걷기 어려움": <Icon name="walk" /> };
  const clear = () => { setKind(""); setMove(""); setZone(""); setQ(""); setQIn(""); };
  return (
    <section className="sec wrap cm">
      <Head lang={lang} mascot="full-cheer" crumb={[["#/community", L("커뮤니티", "Community")]]} title={L("다녀온 길", "Trips people took")} sub={L("다녀온 코스와 길 정보를 나누는 곳이에요. 마음에 드는 코스는 그대로 짜 볼 수 있어요.", "Routes and path notes from people who went. Plan any of them in one tap.")} />
      <div className="cm-top">
        <a className="cm-back" href="#/community"><Icon name="down" className="cm-back-ic" />{L("커뮤니티로 돌아가기", "Back to community")}</a>
        <a className="btn-go cm-write" href="#/community/new"><Icon name="edit" />{L("내 코스 올리기", "Share my trip")}</a>
      </div>
      <div className="cm-filter2" role="group" aria-label={L("골라 보기", "Filter")}>
        <div className="cm-chiprow">
          {KIND.map(([k, ko, en, ic]) => <button key={k || "all"} className="cm-fchip" aria-pressed={kind === k} onClick={() => setKind(k)}>{ic}{L(ko, en)}</button>)}
          <span className="cm-chipdiv" aria-hidden="true" />
          {MOVE.map(([v, ko, en]) => <button key={v} className="cm-fchip" aria-pressed={move === v} onClick={() => setMove(move === v ? "" : v)}>{MV_IC[v]}{L(ko, en)}</button>)}
          <span className="cm-sels">
            <label className="cm-sel"><span className="sr-only">{L("지역", "Area")}</span>
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value="">{L("모든 지역", "All areas")}</option>
                {Object.entries(ZONE).map(([k, v]) => <option key={k} value={k}>{L(v[0], v[1])}</option>)}
              </select></label>
            <label className="cm-sel"><span className="sr-only">{L("정렬", "Sort")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="new">{L("최신순", "Newest")}</option><option value="help">{L("도움 많이 된 순", "Most helpful")}</option><option value="star">{L("만족도 높은 순", "Top rated")}</option>
              </select></label>
          </span>
        </div>
        <form className="cm-search2" role="search" onSubmit={(e) => { e.preventDefault(); setQ(qIn); }}>
          <label><span className="sr-only">{L("장소·내용으로 찾기", "Search")}</span>
            <input type="search" value={qIn} onChange={(e) => { setQIn(e.target.value); if (!e.target.value) setQ(""); }} placeholder={L("장소나 내용으로 찾기 (예: 도째비골, 유모차)", "Search by place or word")} /></label>
          <button type="submit" className="btn-go">{L("검색", "Search")}</button>
        </form>
      </div>
      <div className="cm-bar">
        <p role="status">{lang === "ko" ? <>총 <b>{rows.length}</b>개의 길</> : <><b>{rows.length}</b> trips</>}</p>
        <div className="cm-viewsw" role="group" aria-label={L("보기 방식", "View")}>
          <button aria-pressed={view === "card"} onClick={() => setView("card")}><Icon name="story" />{L("카드 보기", "Cards")}</button>
          <button aria-pressed={view === "map"} onClick={() => setView("map")}><Icon name="map" />{L("지도 보기", "Map")}</button>
        </div>
      </div>
      {rows.length === 0 ? <div className="panel cm-empty"><p>{L("조건에 맞는 글이 없어요. 골라 보기를 풀거나 첫 글을 올려 주세요.", "No posts match. Clear the filters or share the first one.")}</p>
        <button className="chip" onClick={clear}>{L("골라 보기 모두 풀기", "Clear filters")}</button></div>
      : view === "map" ? (
        <div className="cm-mapview">
          <KakaoMap pins={pins} dots label={L("다녀온 길 지도: 각 글의 첫 장소", "Trips map: first stop of each post")} />
          <p className="muted small">{L("점은 각 글의 첫 장소예요. 파란 점은 무장애 여행, 주황 점은 일반 여행이에요.", "Each dot is a post's first stop. Blue = barrier-free, orange = regular.")}</p>
          <ul className="cm-maplist">{rows.map((p) => <li key={p.id}><a href={`#/community/${p.id}`}><span className={`cm-badge ${p.kind}`}>{p.kind === "easy" ? L("무장애", "Barrier-free") : L("일반", "Regular")}</span><b>{p.title}</b><small>{p.stops.map(pn).join(" → ")}</small></a></li>)}</ul>
        </div>
      ) : (<>
        <ul className="cm-grid">
          {shown.map((p) => {
            const f = facts(p, places);
            const tag = WHO_TAG[p.who];
            const lv = LEVEL[f.level];
            return (
              <li key={p.id}>
                <article className="cm-pcard">
                  <a className="cm-pimg" href={`#/community/${p.id}`} tabIndex={-1} aria-hidden="true">
                    {f.cover ? <img src={photoAt(f.cover, 500)} alt="" loading="lazy" decoding="async" /> : <span className="cm-pimg-none"><img src="/dongi/full-basic.webp" alt="" /></span>}
                  </a>
                  <span className="cm-badges">
                    <span className={`cm-badge ${p.kind}`}>{p.kind === "easy" ? L("무장애", "Barrier-free") : L("일반", "Regular")}</span>
                    {tag && <span className="cm-badge tag">{L(tag[0], tag[1])}</span>}
                  </span>
                  <button className="cm-heart" aria-pressed={!!fav[p.id]} onClick={() => toggleFav(p.id)} aria-label={fav[p.id] ? L(`'${p.title}' 찜 풀기`, "Remove from saved") : L(`'${p.title}' 찜하기`, "Save this trip")}>
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20.3l-1.3-1.2C5.9 14.8 3 12.1 3 8.8 3 6.1 5.1 4 7.7 4c1.6 0 3.2.8 4.3 2 1.1-1.2 2.7-2 4.3-2C18.9 4 21 6.1 21 8.8c0 3.3-2.9 6-7.7 10.3L12 20.3z" /></svg>
                  </button>
                  <div className="cm-pbody">
                    <h3><a href={`#/community/${p.id}`}>{p.title}</a></h3>
                    <p className="cm-psub">{p.stops.map(pn).filter(Boolean).join(" → ")}</p>
                    <p className="cm-pmeta">
                      <span><Icon name="time" />{L(`약 ${dur(f.min)}`, `~${dur(f.min)}`)}</span>
                      {f.dist > 0 && <span><Icon name="pin" />{`${f.dist < 10 ? f.dist.toFixed(1) : Math.round(f.dist)}km`}</span>}
                      <span className={`cm-lv lv${f.level}`}><Icon name="walk" />{L(lv[0], lv[1])}</span>
                    </p>
                    <div className="cm-pfoot">
                      <span className="cm-rate" aria-label={L(`만족도 5점 중 ${p.rating}점, 도움 됐어요 ${p.helpful}`, `${p.rating} of 5, ${p.helpful} found helpful`)}><span aria-hidden="true">★</span> {p.rating.toFixed(1)} <small>({p.helpful})</small></span>
                      <a className="cm-more" href={`#/community/${p.id}`} aria-label={L(`'${p.title}' 자세히 보기`, `Read: ${p.title}`)}>{L("자세히 보기", "Read more")}</a>
                    </div>
                  </div>
                </article>
              </li>);
          })}
        </ul>
        {pages > 1 && (
          <nav className="cm-pager" aria-label={L("쪽 넘기기", "Pages")}>
            <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label={L("이전 쪽", "Previous page")}>‹</button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => <button key={n} aria-current={n === cur ? "page" : undefined} onClick={() => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{n}</button>)}
            <button disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label={L("다음 쪽", "Next page")}>›</button>
          </nav>)}
      </>)}
      <aside className="cm-cta">
        <img src="/dongi/thanks.webp" alt="" />
        <div><b>{L("나만의 여행 코스를 나눠 주세요", "Share your own Donghae trip")}</b>
          <p>{L("다녀온 순서와 길에서 본 턱·경사·화장실 정보가 다음 사람에게 큰 도움이 돼요.", "Your route and notes on steps, slopes and toilets help the next traveler.")}</p></div>
        <a className="btn-go" href="#/community/new"><Icon name="edit" />{L("글쓰기", "Write a post")}</a>
      </aside>
    </section>
  );
}

function Detail({ lang, p, places, helped, onHelp, onComment, onHide, onUse }: { lang: Lang; p: Post; places: Record<string, any>; helped: boolean; onHelp: () => void; onComment: (c: { nick: string; date: string; text: string }) => void; onHide: () => void; onUse: (ids: string[]) => void }) {
  const L = pick(lang);
  const [nick, setNick] = useState(() => { try { return localStorage.getItem("gd-nick") || ""; } catch { return ""; } });
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const send = () => {
    if (!nick.trim() || !text.trim()) { setErr(L("닉네임과 댓글을 모두 적어 주세요.", "Enter a nickname and a comment.")); return; }
    try { localStorage.setItem("gd-nick", nick.trim()); } catch { /* */ }
    onComment({ nick: nick.trim().slice(0, 20), date: today(), text: text.trim().slice(0, 500) }); setText(""); setErr("");
  };
  return (
    <section className="sec wrap cm cm-detail">
      <p className="crumb"><a href="#/">{L("처음", "Home")}</a> › <a href="#/community">{L("커뮤니티", "Community")}</a> › <a href="#/community/talk">{L("다녀온 길", "Trips")}</a></p>
      <article className="panel cm-post">
        <span className={`cm-kind ${p.kind}`}>{p.kind === "easy" ? L("무장애 여행", "Barrier-free") : L("일반 여행", "Regular")} · {p.who} · {L(ZONE[p.zone]?.[0] || "", ZONE[p.zone]?.[1] || "")}</span>
        <h1 className="cm-h">{p.title}</h1>
        <p className="cm-meta"><span className="cm-who"><Avatar nick={p.nick} />{p.nick}</span><span>{p.date}</span><span className="cm-stars" aria-label={L(`만족도 ${p.rating}점`, `${p.rating} of 5`)}>{stars(p.rating)}</span></p>
        <h2 className="h3">{L("다녀온 순서", "Route")}</h2>
        <Strip ids={p.stops} places={places} lang={lang} />
        <div className="cm-actions">
          <button className="btn-go" onClick={() => onUse(p.stops)}><Icon name="route" />{L("이 코스로 짜 보기", "Plan this route")}</button>
          <button className="chip" aria-pressed={helped} onClick={onHelp}>{L(`도움 됐어요 ${p.helpful}`, `Helpful ${p.helpful}`)}</button>
        </div>
        <p className="cm-body">{p.body}</p>
        {p.tips.length > 0 && (<>
          <h2 className="h3">{L("길 메모", "Path notes")}</h2>
          <ul className="cm-tips">{p.tips.map((x) => <li key={x}><Icon name="info" />{x}</li>)}</ul></>)}
        <h2 className="h3">{L("장소 바로 보기", "Places")}</h2>
        <p className="chips">{p.stops.filter((id) => places[id]).map((id) => <a key={id} className="chip sm" href={`#/place/${id}`}>{lang === "ko" ? places[id].name_ko : places[id].name_en || places[id].name_ko}</a>)}</p>
      </article>
      <section className="panel cm-cmts" aria-labelledby="cm-c-h">
        <h2 id="cm-c-h" className="h3">{L(`댓글 ${p.comments.length}`, `${p.comments.length} comments`)}</h2>
        {p.comments.length === 0 ? <p className="muted">{L("아직 댓글이 없어요. 궁금한 길 정보를 물어보세요.", "No comments yet. Ask about the path.")}</p> :
          <ul className="cm-clist">{p.comments.map((c, i) => <li key={i} className="cm-cmt"><Avatar nick={c.nick} /><div><b>{c.nick}</b> <small className="muted">{c.date}</small><p>{c.text}</p></div></li>)}</ul>}
        <div className="cm-form">
          <label><span>{L("닉네임", "Nickname")}</span><input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} /></label>
          <label className="wide"><span>{L("댓글", "Comment")}</span><textarea value={text} maxLength={500} rows={3} onChange={(e) => setText(e.target.value)} placeholder={L("연락처 같은 개인정보는 적지 말아 주세요.", "Please don't share personal contact details.")} /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn-go" onClick={send}>{L("댓글 남기기", "Post comment")}</button>
        </div>
        <button className="link-btn cm-report" onClick={() => { if (confirm(L("이 글을 이 기기에서 가릴까요?", "Hide this post on this device?"))) onHide(); }}>{L("신고·가리기", "Report / hide")}</button>
      </section>
    </section>
  );
}

function Write({ lang, places, onDone }: { lang: Lang; places: Record<string, any>; onDone: (p: Post) => void }) {
  const L = pick(lang);
  // 코스 결과·내 일정에서 [후기 올리기]로 오면 그 코스를 미리 채운다
  const pre = useMemo(() => { try { return JSON.parse(sessionStorage.getItem("gd-share") || "null"); } catch { return null; } }, []);
  const [stops, setStops] = useState<string[]>(pre?.stops || []);
  const [kind, setKind] = useState<"easy" | "free">(pre?.kind || "easy");
  const [move, setMove] = useState<string[]>(pre?.move || []);
  const [who, setWho] = useState<string>(pre?.who || "연인·친구");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tips, setTips] = useState("");
  const [rating, setRating] = useState(5);
  const [nick, setNick] = useState(() => { try { return localStorage.getItem("gd-nick") || ""; } catch { return ""; } });
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const list = Object.values(places).filter((p: any) => p.type !== "숙박" && !stops.includes(p.id));
  const key = q.trim().replace(/\s+/g, "");
  const hits = key ? list.filter((p: any) => p.name_ko.replace(/\s+/g, "").includes(key) || fuzzyHit(p.name_ko, key) >= 0).slice(0, 6) : [];
  const nm = (id: string) => (lang === "ko" ? places[id]?.name_ko : places[id]?.name_en || places[id]?.name_ko) || id;
  const submit = () => {
    if (!nick.trim() || !title.trim() || stops.length < 1 || !body.trim()) { setErr(L("닉네임, 제목, 다녀온 장소(1곳 이상), 후기를 적어 주세요.", "Add a nickname, title, at least one place and your review.")); return; }
    try { localStorage.setItem("gd-nick", nick.trim()); sessionStorage.removeItem("gd-share"); } catch { /* */ }
    const zone = places[stops[0]]?.zone || "mukho";
    onDone({ id: `u${Date.now()}`, title: title.trim().slice(0, 60), nick: nick.trim().slice(0, 20), date: today(), kind, move: kind === "easy" ? move : [], who, zone, stops, rating,
      body: body.trim().slice(0, 1500), tips: tips.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6), helpful: 0, comments: [], mine: true });
  };
  return (
    <section className="sec wrap cm cm-write-page">
      <p className="crumb"><a href="#/">{L("처음", "Home")}</a> › <a href="#/community">{L("커뮤니티", "Community")}</a> › <a href="#/community/talk">{L("다녀온 길", "Trips")}</a></p>
      <h1>{L("내 코스 올리기", "Share my trip")}</h1>
      <p className="muted">{L("다녀온 순서와 길 정보를 남기면 다음 사람이 그대로 짜 볼 수 있어요. 이 기기에만 저장돼요.", "Your route and path notes help the next traveler. Saved on this device only.")}</p>
      <div className="panel cm-form big">
        <fieldset><legend>{L("어떤 여행이었나요?", "Trip type")}</legend>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={kind === "easy"} onClick={() => setKind("easy")}>{L("무장애 여행", "Barrier-free")}</button>
            <button type="button" className="chip" aria-pressed={kind === "free"} onClick={() => setKind("free")}>{L("일반 여행", "Regular")}</button>
          </div>
          {kind === "easy" && <div className="chips">{MOVE.map(([v, ko, en]) => <button type="button" key={v} className="chip" aria-pressed={move.includes(v)} onClick={() => setMove(move.includes(v) ? move.filter((x) => x !== v) : [...move, v])}>{L(ko, en)}</button>)}</div>}
          <label><span>{L("누구와", "With")}</span><select value={who} onChange={(e) => setWho(e.target.value)}>{["혼자", "연인·친구", "부모님과", "아이와", "단체"].map((w) => <option key={w}>{w}</option>)}</select></label>
        </fieldset>
        <fieldset><legend>{L("다녀온 순서", "Places in order")}</legend>
          {stops.length > 0 && <ol className="cm-pick">{stops.map((id, i) => <li key={id}><span>{nm(id)}</span>
            <button type="button" className="chip sm" disabled={i === 0} onClick={() => { const a = [...stops]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setStops(a); }} aria-label={L("앞으로", "Move up")}>↑</button>
            <button type="button" className="chip sm" onClick={() => setStops(stops.filter((x) => x !== id))} aria-label={L(`${nm(id)} 빼기`, `Remove ${nm(id)}`)}>×</button></li>)}</ol>}
          <label><span>{L("장소 찾아 넣기", "Add a place")}</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("예: 도째비골, 무릉계곡", "e.g. Dokkaebi")} /></label>
          {hits.length > 0 && <p className="chips">{hits.map((p: any) => <button type="button" key={p.id} className="chip sm" onClick={() => { setStops([...stops, p.id]); setQ(""); }}>+ {nm(p.id)}</button>)}</p>}
        </fieldset>
        <label><span>{L("닉네임", "Nickname")}</span><input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} /></label>
        <label><span>{L("제목", "Title")}</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={L("예: 휠체어로 묵호 반나절, 생각보다 수월했어요", "e.g. Mukho by wheelchair")} /></label>
        <label><span>{L("만족도", "Rating")}</span>
          <span className="cm-rate" role="radiogroup" aria-label={L("만족도", "Rating")}>{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={rating === n} className={n <= rating ? "on" : ""} onClick={() => setRating(n)} aria-label={L(`${n}점`, `${n}`)}>★</button>)}</span></label>
        <label><span>{L("후기", "Review")}</span><textarea rows={5} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <label><span>{L("길 메모 (한 줄에 하나)", "Path notes (one per line)")}</span><textarea rows={3} value={tips} onChange={(e) => setTips(e.target.value)} placeholder={L("예: 입구 턱 3cm 정도\n장애인 화장실 2층", "e.g. 3 cm step at the entrance")} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <p className="muted small">{L("연락처·사진 같은 개인정보는 올리지 말아 주세요.", "Please don't post personal details.")}</p>
        <button className="btn-go" onClick={submit}>{L("글 올리기", "Post")}</button>
      </div>
    </section>
  );
}

// 관광지 상세: 다녀온 사람들 이야기 (그 장소가 들어간 글 + 한 줄 후기·길 메모)
export function PlaceTalk({ id, lang }: { id: string; lang: Lang }) {
  const L = pick(lang);
  const [st, setSt] = useState(load);
  const posts = allPosts(st).filter((p) => p.stops.includes(id)).sort((a, b) => b.helpful - a.helpful).slice(0, 3);
  const notes: PlaceNote[] = st.notes[id] || [];
  const tips = allPosts(st).filter((p) => p.stops.includes(id)).flatMap((p) => p.tips.map((t) => ({ t, by: p.nick }))).slice(0, 4);
  const [nick, setNick] = useState(() => { try { return localStorage.getItem("gd-nick") || ""; } catch { return ""; } });
  const [text, setText] = useState("");
  const [tip, setTip] = useState(false);
  const add = () => {
    if (!nick.trim() || !text.trim()) return;
    try { localStorage.setItem("gd-nick", nick.trim()); } catch { /* */ }
    const s = load(); (s.notes[id] ||= []).unshift({ nick: nick.trim().slice(0, 20), date: today(), text: text.trim().slice(0, 300), tip }); save(s); setSt(s); setText(""); setTip(false);
  };
  return (
    <section className="panel cm-place" aria-labelledby="cm-pl-h">
      <h2 id="cm-pl-h" className="h3">{L("다녀온 사람들 이야기", "From people who went")}</h2>
      {tips.length > 0 && <ul className="cm-tips">{tips.map((x, i) => <li key={i}><Icon name="info" />{x.t} <small className="muted">— {x.by}</small></li>)}</ul>}
      {notes.length > 0 && <ul className="cm-clist">{notes.map((n, i) => <li key={i}><b>{n.nick}</b><small className="muted">{n.date}{n.tip ? L(" · 길 메모", " · path note") : ""}</small><p>{n.text}</p></li>)}</ul>}
      {posts.length > 0 && <p className="chips">{posts.map((p) => <a key={p.id} className="chip sm" href={`#/community/${p.id}`}>{p.title.length > 22 ? p.title.slice(0, 22) + "…" : p.title}</a>)}</p>}
      {tips.length === 0 && notes.length === 0 && posts.length === 0 && <p className="muted">{L("아직 이야기가 없어요. 다녀오셨다면 첫 후기를 남겨 주세요.", "No notes yet. Leave the first one.")}</p>}
      <div className="cm-form inline">
        <input aria-label={L("닉네임", "Nickname")} placeholder={L("닉네임", "Nickname")} value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} />
        <input aria-label={L("한 줄 후기", "Short note")} placeholder={L("한 줄 후기 (예: 입구 경사로 있어요)", "Short note")} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        <label className="cm-chk"><input type="checkbox" checked={tip} onChange={(e) => setTip(e.target.checked)} />{L("길 정보예요", "Path info")}</label>
        <button className="chip go" onClick={add} disabled={!nick.trim() || !text.trim()}>{L("남기기", "Post")}</button>
      </div>
      <a className="link-btn" href="#/community">{L("다녀온 길 전체 보기", "See all trips")}</a>
    </section>
  );
}
