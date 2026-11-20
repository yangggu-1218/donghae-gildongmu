import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import Calendar from "./Calendar";
import { Icon } from "./Icon";
import type { Conditions } from "@/lib/api";

const mobility = [
  ["휠체어", "휠체어를 사용해요", "I use a wheelchair"],
  ["유모차", "보행기나 유모차를 사용해요", "I use a walker or stroller"],
  ["오래 걷기 어려움", "오래 걷기 어려워요", "I need shorter walks"],
  ["계단 어려움", "계단이 어려워요", "Stairs are difficult"],
] as const;

export function GuidedPlan({ conditions, setConditions, step, setStep, unrestricted, setUnrestricted, lang, busy, onMake }: {
  conditions: Conditions; setConditions: Dispatch<SetStateAction<Conditions>>; step: number; setStep: (n: number) => void;
  unrestricted: boolean; setUnrestricted: (v: boolean) => void;
  lang: Conditions["lang"]; busy: boolean; onMake: (c: Conditions) => void;
}) {
  const { move, start, date = "", start_time: time = "10:00" } = conditions;
  function choose<K extends keyof Conditions>(field: K, value: Conditions[K]) {
    if (busy) return;
    const next = { ...conditions, [field]: value, lang };
    setConditions(next);
    if (step === 3) onMake(next);
    else setStep(step + 1);
  }
  const title = useRef<HTMLHeadingElement>(null);
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current !== step) title.current?.focus();
    previous.current = step;
  }, [step]);
  const L = (ko: string, en: string) => lang === "ko" ? ko : en;
  const starts = { "동해역": L("동해역", "Donghae Station"), "묵호역": L("묵호역", "Mukho Station"), "자가용": L("자가용으로 출발", "By car") };
  const questions = [L("어떤 이동 지원이 필요하세요?", "What should we consider for getting around?"), L("언제 여행하시나요?", "When are you travelling?"), L("어디에서 출발하시나요?", "Where will you start?"), L("몇 시에 출발할까요?", "What time will you start?")];
  function localDate(offset: number) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }
  const stageNames = [L("이동", "Mobility"), L("날짜", "Date"), L("출발지", "Start"), L("시간", "Time")];
  return <div className="travel-desk"><div className="guided-card">
    <ol className="guide-stages" aria-label={L("코스 만들기 단계", "Planning steps")}>{stageNames.map((label, i) =>
      <li key={label} aria-current={i === step ? "step" : undefined} className={i < step ? "complete" : ""}><span aria-hidden="true">{i < step ? "✓" : i + 1}</span>{label}</li>)}</ol>
    <div className="guide-question">
    <h1 tabIndex={-1} ref={title} id="guided-question">{questions[step]}</h1>
    {step === 0 && <p>{L("가장 필요한 항목을 골라 주세요.", "Choose your main mobility need.")}</p>}
    </div>
    <div className={`guided-options ${["mobility", "travel-date", "departure", "departure-time"][step]}`} role="group" aria-labelledby="guided-question">
      {step === 0 && <>{mobility.map(([v, ko, en], i) => <button key={v} aria-pressed={move.includes(v)} onClick={() => { setUnrestricted(false); choose("move", [v]); }}><Icon name={["wheel", "walk", "route", "trail"][i]} />{L(ko, en)}</button>)}<button aria-pressed={unrestricted} onClick={() => { setUnrestricted(true); choose("move", []); }}><Icon name="sun" />{L("해당 사항 없어요", "None of these")}</button></>}
      {step === 1 && <>{[0, 1].map(n => <button key={n} aria-pressed={date === localDate(n)} onClick={() => choose("date", localDate(n))}>{n ? L("내일", "Tomorrow") : L("오늘", "Today")}</button>)}<label>{L("날짜 선택", "Choose a date")} <input type="date" value={date || ""} min={localDate(0)} onChange={e => { if (e.target.value && e.target.validity.valid) choose("date", e.target.value); }} /></label><Calendar key={date?.slice(0,7)} value={date || localDate(0)} lang={lang} onChange={d => choose("date", d)} /></>}
      {step === 2 && (Object.keys(starts) as Conditions["start"][]).map(s => <button key={s} aria-pressed={start === s} onClick={() => choose("start", s)}><Icon name={s === "자가용" ? "car" : "train"} />{starts[s]}</button>)}
      {step === 3 && ["09:00", "10:00", "11:00", "13:00", "14:00"].map(t => <button key={t} aria-pressed={time === t} onClick={() => choose("start_time", t)}>{t}</button>)}
    </div>
    {step === 3 && <form className="guide-custom-time" onSubmit={e => {
      e.preventDefault();
      const value = new FormData(e.currentTarget).get("departure");
      if (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) choose("start_time", value);
    }}>
      <label htmlFor="departure-time">{L("출발 시간 직접 설정", "Set a departure time")}</label>
      <input id="departure-time" type="time" name="departure" defaultValue={time} step={60} required />
      <button type="submit" className="chip go" disabled={busy}>{L("이 시간으로 코스 보기", "Plan for this time")}</button>
    </form>}
    {step === 3 && <p>{[...mobility.filter(([v]) => move.includes(v)).map(([, ko, en]) => L(ko, en)), date, starts[start]].join(" · ")}</p>}
    {step === 1 && <details className="guide-extra-move">
      <summary>{L("이동 조건 추가·수정", "Edit mobility needs")}</summary>
      {mobility.map(([value, ko, en]) => <label key={value}>
        <input type="checkbox" checked={move.includes(value)} onChange={e => {
          const checked = e.target.checked;
          setConditions(c => ({ ...c, move: checked ? [...c.move, value] : c.move.filter(item => item !== value) }));
          setUnrestricted(!checked && move.length === 1);
        }} /> {L(ko, en)}
      </label>)}
    </details>}
    {step > 0 && <div className="guided-actions"><button type="button" disabled={busy} onClick={() => setStep(step - 1)}>{L("이전", "Back")}</button></div>}
    </div>

  </div>;
}
