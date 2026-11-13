"use client";
// 날짜 고르기: 한 달 달력. 칸을 크게 해서 어르신도 쉽게 누르도록. 지난 날짜와 6개월 넘는 날짜는 못 고른다.
import { useState } from "react";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WD = { ko: ["일", "월", "화", "수", "목", "금", "토"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };

export default function Calendar({ value, onChange, lang }: { value: string; onChange: (d: string) => void; lang: "ko" | "en" }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const max = new Date(today); max.setMonth(max.getMonth() + 6);
  const sel = value ? new Date(value + "T00:00:00") : today;
  const [view, setView] = useState(() => new Date(sel.getFullYear(), sel.getMonth(), 1));
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const canPrev = new Date(y, m, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = new Date(y, m + 1, 1) <= max;
  const title = lang === "ko" ? `${y}년 ${m + 1}월` : view.toLocaleDateString("en", { year: "numeric", month: "long" });
  const selText = lang === "ko" ? `${sel.getMonth() + 1}월 ${sel.getDate()}일 (${WD.ko[sel.getDay()]}요일)`
    : sel.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" disabled={!canPrev} onClick={() => setView(new Date(y, m - 1, 1))} aria-label={lang === "ko" ? "이전 달" : "Previous month"}>‹</button>
        <b aria-live="polite">{title}</b>
        <button type="button" className="cal-nav" disabled={!canNext} onClick={() => setView(new Date(y, m + 1, 1))} aria-label={lang === "ko" ? "다음 달" : "Next month"}>›</button>
      </div>
      <div className="cal-grid" role="group" aria-label={title}>
        {WD[lang].map((w, i) => <span key={w} className={`cal-wd${i === 0 ? " cal-sun" : i === 6 ? " cal-sat" : ""}`} aria-hidden="true">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const off = d < today || d > max, k = iso(d), wd = d.getDay();
          return (
            <button type="button" key={k} disabled={off} aria-pressed={k === value}
              className={`cal-day${wd === 0 ? " cal-sun" : wd === 6 ? " cal-sat" : ""}${k === iso(today) ? " today" : ""}`}
              aria-label={lang === "ko" ? `${m + 1}월 ${d.getDate()}일 ${WD.ko[wd]}요일` : d.toDateString()}
              onClick={() => onChange(k)}>{d.getDate()}</button>
          );
        })}
      </div>
      <p className="cal-sel">{lang === "ko" ? "고른 날짜" : "Selected"}: <b>{selText}</b></p>
    </div>
  );
}
