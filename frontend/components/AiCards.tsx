"use client";
// 관광지 상세의 AI 카드 두 개 (docs/17_AI_FEATURES.md)
//  - AiJudge: ② AI 접근성 판정관 — 구간 측정값·공사 정보·최근 제보를 읽고 '이 사람 기준'으로 판정 + 근거·확신도·주의·물어볼 것
//  - AiStatus: ③ 최근 길 상태 — 최근 90일 제보·길 메모를 AI가 정리 (제보가 없으면 안 보임)
// AI를 못 쓰면(키 없음·오류·데모) 규칙 판정이나 아무것도 안 보이게 조용히 물러난다.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon, Picto, VERDICT_PICTO } from "@/components/Icon";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);

type Judge = {
  by: "ai" | "rule" | "none"; model?: string | null; verdict: "G" | "Y" | "R" | "U"; confidence: "high" | "medium" | "low";
  headline: string; reasons: { text: string; source: string }[]; cautions: string[]; ask_before: string[]; tip: string;
  rule_grade?: string | null; evidence_count?: number; reports_used?: number;
};
const VERDICT: Record<string, [string, string]> = {
  G: ["이동 가능", "Easy to visit"], Y: ["주의 구간 있음 · 보조 권장", "OK with some help"],
  R: ["이동 어려움", "Difficult"], U: ["확인 전", "Not checked yet"],
};
const CONF: Record<string, [string, string]> = { high: ["확신 높음", "High confidence"], medium: ["확신 보통", "Medium confidence"], low: ["확신 낮음", "Low confidence"] };

// 판정은 상세 페이지가 한 번만 불러서 맨 위 '판정 한 줄'과 아래 카드에 함께 쓴다
export function useJudge(id: string, mode: string, lang: Lang, skip = false): { d: Judge | null; state: "load" | "ok" | "fail" } {
  const [d, setD] = useState<Judge | null>(null);
  const [state, setState] = useState<"load" | "ok" | "fail">(skip ? "fail" : "load");
  useEffect(() => {
    if (skip) { setState("fail"); setD(null); return; }
    let live = true;
    setState("load"); setD(null);
    api.get(`/api/ai/judge/${id}?mode=${mode}&lang=${lang}`)
      .then((r: Judge) => { if (live) { setD(r); setState(r && r.by !== "none" ? "ok" : "fail"); } })
      .catch(() => { if (live) setState("fail"); });
    return () => { live = false; };
  }, [id, mode, lang, skip]);
  return { d, state };
}
export const verdictText = (v: string, lang: Lang) => pick(lang)(...(VERDICT[v in VERDICT ? v : "U"] as [string, string]));

// 접근성 카드: 보이는 것은 판정 + 조심할 곳 2개 + 꿀팁 1개. 근거·전화로 물어볼 것·한눈에 칩은 접어 둔다
export function AiJudge({ j, lang, chips = [], carerTip = "" }: { j: { d: Judge | null; state: string }; lang: Lang; chips?: string[]; carerTip?: string }) {
  const L = pick(lang);
  const d = j.d;
  if (j.state === "fail") return null;
  if (j.state === "load" || !d) return (
    <div className="ai-card ai-judge loading" aria-live="polite">
      <p className="ai-by"><Icon name="info" />{L("길 정보를 확인하는 중이에요…", "The AI is reading the path data and recent reports…")}</p>
    </div>);
  const v = d.verdict in VERDICT ? d.verdict : "U";
  const ai = d.by === "ai";
  const dots = d.confidence === "high" ? 3 : d.confidence === "medium" ? 2 : 1;
  const generic = !ai && /구간 정보로 계산/.test(d.headline || "");
  const tip = carerTip || d.tip;   // AI 도움말과 보호자 꿀팁은 하나로 (팀이 쓴 꿀팁이 먼저)
  const more = d.reasons.length + d.ask_before.length + chips.length;
  return (
    <div className={`ai-card ai-judge v-${v}`} aria-live="polite">
      <div className="aj-top">
        <Picto name={VERDICT_PICTO[v]} size={30} />
        <b className="aj-verdict">{L(VERDICT[v][0], VERDICT[v][1])}</b>
        <span className="aj-conf" role="img" aria-label={L(CONF[d.confidence]?.[0] || "", CONF[d.confidence]?.[1] || "")}
          title={L(CONF[d.confidence]?.[0] || "", CONF[d.confidence]?.[1] || "")}>{[1, 2, 3].map((i) => <i key={i} className={i <= dots ? "on" : ""} />)}</span>
        <span className={`via ${ai ? "via-llm" : "via-rule"}`}>{ai ? "AI" : L("구간 계산", "Path data")}</span>
      </div>
      {d.headline && !generic && <p className="aj-head">{d.headline}</p>}
      {(d.cautions.length > 0 || tip) && <ul className="aj-list">
        {d.cautions.slice(0, 2).map((c, i) => <li key={"c" + i} className="aj-warn"><Picto name="warn" size={18} label={L("조심할 곳", "Watch out")} />{c}</li>)}
        {tip && <li><Picto name="tip" size={18} label={L("보호자 꿀팁", "Tip for carers")} />{tip}</li>}
      </ul>}
      {more > 0 && <details className="aj-more"><summary>{L("자세히·가기 전에 물어볼 것", "Details, and what to ask ahead")}</summary>
        {chips.length > 0 && <div className="tl-badges">{chips.map((c) => <span key={c} className="badge b-plain">{c}</span>)}</div>}
        <ul className="aj-list">
          {d.reasons.map((r, i) => <li key={"r" + i}><Picto name="ok" size={18} label={L("확인한 내용", "Reason")} />{r.text}</li>)}
          {d.ask_before.map((c, i) => <li key={"a" + i}><Picto name="call" size={18} label={L("가기 전에 물어보기", "Ask ahead")} />{c}</li>)}
        </ul>
      </details>}
    </div>
  );
}

type Status = { by: "ai" | "rule" | "none"; state: "ok" | "caution" | "issue" | "none"; headline?: string; count?: number;
  items?: { kind: string; text: string; since: string; count: number }[] };
const STATE: Record<string, [string, string]> = { ok: ["좋은 소식", "Good news"], caution: ["조심하세요", "Take care"], issue: ["불편 제보", "Reported problem"] };

export function AiStatus({ id, lang }: { id: string; lang: Lang }) {
  const L = pick(lang);
  const [d, setD] = useState<Status | null>(null);
  useEffect(() => {
    let live = true;
    setD(null);
    api.get(`/api/places/${id}/status`).then((r: Status) => { if (live) setD(r); }).catch(() => { /* 없으면 안 보임 */ });
    return () => { live = false; };
  }, [id]);
  if (!d || d.state === "none" || !d.headline) return null;
  return (
    <section className={`ai-card ai-status s-${d.state}`} aria-labelledby="ai-st-h">
      <div className="ai-top">
        <h2 id="ai-st-h" className="h3 pp2-h"><Icon name="walk" />{L("최근 길 상태", "Recent path status")}</h2>
        <span className="aj-state" title={d.by === "ai" ? L(`최근 90일 이용자 제보 ${d.count}건을 AI가 정리했어요. 사이트 정보는 관리자가 확인한 뒤에 바뀌어요.`, `AI summary of ${d.count} visitor reports (90 days).`) : L(`최근 90일 제보 ${d.count}건`, `${d.count} reports (90 days)`)}><Picto name={d.state === "issue" ? "stop" : d.state === "caution" ? "warn" : "ok"} size={20} />{L(STATE[d.state]?.[0] || "", STATE[d.state]?.[1] || "")} · {L(`제보 ${d.count}건`, `${d.count} reports`)}</span>
      </div>
      <p className="ai-head">{d.headline}</p>
      {(d.items || []).length > 0 && <ul className="ai-list">{d.items!.map((x, i) => (
        <li key={i}><b>{x.kind}</b> {x.text}{(x.since || x.count > 1) && <small className="muted"> ({[x.since && L(`${x.since}부터`, `since ${x.since}`), x.count > 1 && L(`${x.count}건`, `${x.count} reports`)].filter(Boolean).join(", ")})</small>}</li>))}
      </ul>}
    </section>
  );
}
