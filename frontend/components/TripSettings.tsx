"use client";

import { useState } from "react";
import type { Conditions } from "@/lib/api";

type Props = {
  conditions: Conditions; busy: boolean; t: (key: string) => string;
  onApply: (draft: Conditions) => Promise<void>; onCancel: () => void;
};

export function TripSettings({ conditions, busy, t, onApply, onCancel }: Props) {
  const [draft, setDraft] = useState(conditions);
  const [group, setGroup] = useState("time");
  const ko = conditions.lang === "ko";
  const tr = (k: string, e: string) => ko ? k : e;
  const options = (key: "move" | "meal" | "style", label: string, values: string[]) => (
    <fieldset><legend>{label}</legend><div className="prefs-choices">{values.map(value => {
      const selections = draft[key] ?? [];
      const active = selections.includes(value);
      return <label key={value}><input type="checkbox" checked={active} onChange={() =>
        setDraft({ ...draft, [key]: active ? selections.filter(x => x !== value) : [...selections, value] })} />{t("opt." + value)}</label>;
    })}</div></fieldset>
  );
  return <form className="trip-settings" onSubmit={e => { e.preventDefault(); if (!busy) void onApply(draft); }}>
    <fieldset disabled={busy} className="prefs-fields">
      <div className="settings-groups" role="group" aria-label={tr("설정 항목","Settings group")}>
        {[["time",tr("출발·동행","Departure")],["move",tr("보행","Mobility")],["meal",tr("식사","Meals")],["style",tr("취향","Interests")]].map(([id,label]) =>
          <button type="button" className="chip" key={id} aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>)}
      </div>
      <div hidden={group !== "time"}><div className="prefs-pair">
        <label>{tr("여행 날짜", "Visit date")}<input required type="date" value={draft.date || ""} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
        <label>{tr("출발 시각", "Departure time")}<input required type="time" value={draft.start_time || ""} onChange={e => setDraft({ ...draft, start_time: e.target.value })} /></label>
        <label>{tr("출발 장소", "Starting point")}<select value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value as Conditions["start"] })}>
          {["동해역", "묵호역", "동해종합버스터미널", "자가용"].map(s => <option key={s} value={s}>{t("opt." + s)}</option>)}</select></label>
        <label>{tr("동행", "Travel party")}<select value={draft.who} onChange={e => setDraft({ ...draft, who: e.target.value })}>
          {["혼자","부모님과","아이와","연인·친구","단체"].map(s => <option key={s} value={s}>{t("opt." + s)}</option>)}</select></label>
      </div></div>
      {group === "move" && options("move", tr("이동할 때 고려할 점", "Mobility needs"), ["휠체어","유모차","계단 어려움","오래 걷기 어려움"])}
      {group === "meal" && options("meal", tr("식사", "Meals"), ["입식","부드러운 메뉴","주차 편한 곳"])}
      {group === "style" && options("style", tr("여행 취향", "Interests"), ["바다 보기","자연·산책","카페","맛집","역사·문화"])}
      <div className="chips"><button type="submit" className="chip go" disabled={JSON.stringify(conditions) === JSON.stringify(draft)}>
        {busy ? tr("다시 계산 중…", "Updating…") : tr("변경 사항 적용", "Apply changes")}</button>
        <button type="button" className="chip" onClick={onCancel}>{tr("취소", "Cancel")}</button></div>
    </fieldset>
  </form>;
}
