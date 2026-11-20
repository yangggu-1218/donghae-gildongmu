"use client";
// 관광지 상세의 AI 카드 두 개 (docs/17_AI_FEATURES.md)
//  - AiJudge: ② AI 접근성 판정관 — 구간 측정값·공사 정보·최근 제보를 읽고 '이 사람 기준'으로 판정 + 근거·확신도·주의·물어볼 것
//  - AiStatus: ③ 최근 길 상태 — 최근 90일 제보·길 메모를 AI가 정리 (제보가 없으면 안 보임)
// AI를 못 쓰면(키 없음·오류·데모) 규칙 판정이나 아무것도 안 보이게 조용히 물러난다.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

type Lang = "ko" | "en";
const pick = (lang: Lang) => (ko: string, en: string) => (lang === "ko" ? ko : en);

type Judge = {
  by: "ai" | "rule" | "none"; model?: string | null; verdict: "G" | "Y" | "R" | "U"; confidence: "high" | "medium" | "low";
  headline: string; reasons: { text: string; source: string }[]; cautions: string[]; ask_before: string[]; tip: string;
  rule_grade?: string | null; evidence_count?: number; reports_used?: number;
};
const VERDICT: Record<string, [string, string]> = {
  G: ["편하게 갈 수 있어요", "Easy to visit"], Y: ["도움이 있으면 갈 수 있어요", "OK with some help"],
  R: ["어려워요", "Difficult"], U: ["판단하기 어려워요", "Not sure yet"],
};
const CONF: Record<string, [string, string]> = { high: ["확신 높음", "High confidence"], medium: ["확신 보통", "Medium confidence"], low: ["확신 낮음", "Low confidence"] };

export function AiJudge({ id, mode, lang }: { id: string; mode: string; lang: Lang }) {
  const L = pick(lang);
  const [d, setD] = useState<Judge | null>(null);
  const [state, setState] = useState<"load" | "ok" | "fail">("load");
  useEffect(() => {
    let live = true;
    setState("load"); setD(null);
    api.get(`/api/ai/judge/${id}?mode=${mode}&lang=${lang}`)
      .then((r: Judge) => { if (live) { setD(r); setState(r && r.by !== "none" ? "ok" : "fail"); } })
      .catch(() => { if (live) setState("fail"); });
    return () => { live = false; };
  }, [id, mode, lang]);
  if (state === "fail") return null;
  if (state === "load" || !d) return (
    <div className="ai-card ai-judge loading" aria-live="polite">
      <p className="ai-by"><Icon name="info" />{L("AI 판정관이 길 정보와 최근 제보를 읽는 중이에요…", "The AI is reading the path data and recent reports…")}</p>
    </div>);
  const v = d.verdict in VERDICT ? d.verdict : "U";
  return (
    <div className={`ai-card ai-judge v-${v}`} aria-live="polite">
      <div className="ai-top">
        <span className={`badge ${v === "U" ? "b-unknown" : `g-${v}`}`}>{L(VERDICT[v][0], VERDICT[v][1])}</span>
        <span className="badge b-plain">{L(CONF[d.confidence]?.[0] || "", CONF[d.confidence]?.[1] || "")}</span>
        <span className="ai-by small">{d.by === "ai" ? L("AI 판정관", "AI judge") : L("구간 정보로 계산", "From path data")}</span>
      </div>
      {d.headline && <p className="ai-head">{d.headline}</p>}
      {d.reasons.length > 0 && <>
        <h3 className="ai-sub">{L("이렇게 판단했어요", "Why")}</h3>
        <ul className="ai-list">{d.reasons.map((r, i) => <li key={i}>{r.text}{r.source && <small className="muted"> ({L("근거", "source")}: {r.source})</small>}</li>)}</ul></>}
      {d.cautions.length > 0 && <>
        <h3 className="ai-sub">{L("조심할 곳", "Watch out")}</h3>
        <ul className="ai-list warn">{d.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul></>}
      {d.ask_before.length > 0 && <>
        <h3 className="ai-sub">{L("가기 전에 전화로 물어보세요", "Ask before you go")}</h3>
        <ul className="ai-list">{d.ask_before.map((c, i) => <li key={i}>{c}</li>)}</ul></>}
      {d.tip && <p className="tl-tip"><b>{L("도움말", "Tip")}</b> {d.tip}</p>}
      <p className="muted small">{d.by === "ai"
        ? L(`AI가 근거 ${d.evidence_count ?? 0}가지(최근 제보 ${d.reports_used ?? 0}건 포함)를 읽고 낸 의견이에요. 현장 상황은 바뀔 수 있어요.`,
          `AI opinion from ${d.evidence_count ?? 0} pieces of evidence. Conditions on site can change.`)
        : L("AI 판정을 쓸 수 없어 구간 정보만으로 계산했어요.", "AI is unavailable, so this is calculated from the path data only.")}</p>
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
        <span className={`badge ${d.state === "issue" ? "g-R" : d.state === "caution" ? "g-Y" : "g-G"}`}>{L(STATE[d.state]?.[0] || "", STATE[d.state]?.[1] || "")}</span>
      </div>
      <p className="ai-head">{d.headline}</p>
      {(d.items || []).length > 0 && <ul className="ai-list">{d.items!.map((x, i) => (
        <li key={i}><b>{x.kind}</b> {x.text}{(x.since || x.count > 1) && <small className="muted"> ({[x.since && L(`${x.since}부터`, `since ${x.since}`), x.count > 1 && L(`${x.count}건`, `${x.count} reports`)].filter(Boolean).join(", ")})</small>}</li>))}
      </ul>}
      <p className="muted small">{d.by === "ai"
        ? L(`최근 90일 이용자 제보 ${d.count}건을 AI가 정리했어요. 사이트 정보는 관리자가 확인한 뒤에 바뀌어요.`, `AI summary of ${d.count} visitor reports from the last 90 days. Site info changes only after staff review.`)
        : L(`최근 90일 이용자 제보 ${d.count}건이 있어요.`, `${d.count} visitor reports in the last 90 days.`)}</p>
    </section>
  );
}
