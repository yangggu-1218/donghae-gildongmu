// 더 자세히 묻기: 기본 질문(날짜·누구와·걸음·식사·취향) 뒤에 "조금만 더 여쭤봐도 될까요?"
// 앞에서 고른 답에 따라 묻는 질문이 달라진다. 답은 엔진이 이미 아는 조건(cap·rest·flat_only·style·exclude)으로만 바꾼다.
// → 서버 엔진(engine.py)과 데모 엔진(api.js)은 그대로라 두 엔진의 결과가 같다(parity).
import type { Conditions } from "@/lib/api";

export type ExtraQ = { k: string; q: [string, string]; multi?: boolean; o: [string, string, string][] };
export type ExtraAns = Record<string, string[]>;

const SLOW_MOVE = ["휠체어", "보행보조기·유모차", "거동 불편 어르신"];

export function buildQuestions(ans: Record<string, string[]>, hasCrowd: boolean): ExtraQ[] {
  const who = ans.who?.[0] || "";
  const move = ans.move || [];
  const slow = move.some((m) => SLOW_MOVE.includes(m));
  const qs: ExtraQ[] = [
    slow ? { k: "pace", q: ["하루를 어떤 속도로 다니고 싶으세요?", "What pace suits you?"],
      o: [["slow", "느긋하게 (3곳, 쉬어 가며)", "Relaxed (3 stops, with breaks)"], ["normal", "보통 (4곳)", "Normal (4 stops)"], ["full", "알차게 (5곳)", "Packed (5 stops)"]] }
      : { k: "pace", q: ["어떤 코스가 좋으세요?", "What kind of day?"],
      o: [["slow", "짧고 편안하게 (3곳)", "Short and easy (3 stops)"], ["normal", "보통 (4곳)", "Normal (4 stops)"], ["full", "많이 걸어도 괜찮아요 (5곳)", "Lots of walking is fine (5 stops)"]] },
  ];
  if ((slow || who === "부모님과") && !ans.need?.length) {   // '필요한 것' 단계에서 이미 답했으면 다시 묻지 않음
    qs.push({ k: "rest", q: ["중간에 앉아 쉬어 갈 카페를 꼭 넣을까요?", "Always add a café to rest?"],
      o: [["yes", "네, 꼭 넣어 주세요", "Yes, please"], ["no", "괜찮아요", "No need"]] });
    qs.push({ k: "flat", q: ["오르막 없이 평지만 다닐까요? 고를 수 있는 곳이 조금 줄어요.", "Flat paths only? (fewer places to choose from)"],
      o: [["yes", "네, 평지만", "Yes, flat only"], ["no", "조금은 괜찮아요", "Some slope is fine"]] });
  }
  if (who === "아이와") {
    qs.push({ k: "kid", q: ["아이는 몇 살쯤이에요?", "How old is your child?"],
      o: [["baby", "유모차 타는 아기", "Baby in a stroller"], ["child", "걸어 다니는 어린이", "Walking child"]] });
  }
  if (hasCrowd) {
    qs.push({ k: "crowd", q: ["그날 사람이 많을 것 같은 곳은 피할까요? (한국관광공사 붐빔 예측)", "Avoid places forecast to be busy that day?"],
      o: [["avoid", "네, 한산한 곳으로", "Yes, quieter places"], ["any", "상관없어요", "Doesn't matter"]] });
  }
  qs.push({ k: "focus", multi: true, q: ["이번 여행에서 특히 하고 싶은 게 있으세요? 여러 개 골라도 돼요.", "Anything you especially want to do? Pick any."],
    o: [["sea", "바다 보며 사진", "Sea views & photos"], ["food", "시장·먹거리", "Markets & food"], ["play", "체험", "Hands-on activities"],
        ["walk", "조용한 산책", "Quiet walks"], ["museum", "실내 전시·박물관", "Indoor exhibits"], ["none", "딱히 없어요", "Nothing special"]] });
  return qs;
}

const FOCUS_STYLE: Record<string, string> = { sea: "바다 보기", food: "맛집", play: "체험", walk: "자연·산책", museum: "역사·문화" };

/** 더 묻기 답을 조건에 얹는다. busy = 그날 붐빔 예측이 높은 장소 id */
export function applyExtra(c: Conditions, a: ExtraAns, busy: string[]): Conditions {
  const out: Conditions = { ...c, style: [...(c.style || [])], exclude: [...(c.exclude || [])] };
  const one = (k: string) => a[k]?.[0];
  if (one("pace") === "slow") { out.cap = 3; out.rest = true; }
  if (one("pace") === "full") out.cap = 5;
  if (one("rest") === "yes") out.rest = true;
  if (one("rest") === "no") out.rest = false;
  if (one("flat") === "yes") out.flat_only = true;
  if (one("kid") === "baby") out.rest = true;
  if (one("kid") === "child" && !out.style.includes("체험")) out.style.push("체험");
  if (one("crowd") === "avoid") out.exclude = Array.from(new Set([...(out.exclude || []), ...busy]));
  for (const f of a.focus || []) { const st = FOCUS_STYLE[f]; if (st && !out.style.includes(st)) out.style.push(st); }
  return out;
}

/** 더 묻기 답을 한 줄로 (대화에 "이렇게 맞춰 짤게요"로 보여 줌) */
export function summarize(a: ExtraAns, qs: ExtraQ[], ko: boolean): string {
  return qs.filter((q) => a[q.k]?.length && !(q.k === "focus" && a.focus?.includes("none")))
    .map((q) => a[q.k].map((v) => { const o = q.o.find((x) => x[0] === v); return o ? (ko ? o[1] : o[2]).replace(/ \(.*\)$/, "") : v; }).join(", ")).join(" · ");
}
