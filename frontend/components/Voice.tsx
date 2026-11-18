"use client";
// 말로 입력하기: 타자가 어려운 사람을 위해 브라우저의 음성 인식(Web Speech API)으로 입력칸을 채운다.
// 크롬·엣지·사파리·삼성 인터넷에서 된다. 안 되는 브라우저에서는 버튼을 숨긴다.
// 들은 말은 입력칸에만 넣고 바로 보내지 않는다 (틀리게 알아들었을 때 고칠 수 있게).
// 참고: 크롬은 음성을 구글 서버로 보내 글자로 바꾼다. 우리 서버에는 음성이 오지 않는다.
import { useEffect, useRef, useState } from "react";

type Rec = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };

const getRec = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

export function MicButton({ lang, onText, onError, disabled, className = "chip cam mic" }: {
  lang: string; onText: (text: string, final: boolean) => void; onError?: (msg: string) => void; disabled?: boolean; className?: string;
}) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => { setOk(!!getRec()); return () => rec.current?.abort(); }, []);
  if (!ok) return null;
  const ko = lang === "ko";
  function toggle() {
    if (on) { rec.current?.stop(); return; }
    const R = getRec(); if (!R) return;
    const r = new R();
    r.lang = ko ? "ko-KR" : "en-US"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      let text = "", final = false;
      for (let i = 0; i < e.results.length; i++) { text += e.results[i][0].transcript; if (e.results[i].isFinal) final = true; }
      onText(text.trim(), final);
    };
    r.onerror = (e: any) => {
      const why = e?.error === "not-allowed" || e?.error === "service-not-allowed"
        ? (ko ? "마이크를 쓸 수 없어요. 주소창 옆 자물쇠에서 마이크를 허용해 주세요." : "Microphone is blocked. Allow it from the lock icon next to the address bar.")
        : e?.error === "no-speech" ? (ko ? "말소리가 들리지 않았어요. 버튼을 누르고 다시 말해 주세요." : "I didn't hear anything. Tap and try again.")
        : (ko ? "음성 입력이 잠시 안 돼요. 글자로 써 주세요." : "Voice input isn't working right now. Please type instead.");
      onError?.(why);
    };
    r.onend = () => setOn(false);
    rec.current = r;
    try { r.start(); setOn(true); } catch { setOn(false); }
  }
  return (
    <button type="button" className={`${className}${on ? " listening" : ""}`} aria-pressed={on} disabled={disabled} onClick={toggle}
      title={ko ? "말로 입력하기: 누르고 말하면 글자로 바꿔 드려요" : "Speak instead of typing"}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
      <span className="sr-only">{on ? (ko ? "듣는 중. 누르면 멈춰요" : "Listening. Tap to stop") : (ko ? "말로 입력하기" : "Speak instead of typing")}</span>
    </button>
  );
}
