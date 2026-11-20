import { useEffect, useId, useState } from "react";

// 묵호역에서 묵호항을 거쳐 해랑전망대 앞까지 이어지는 도로를 지도 좌표로 표시한다.
const road = "M279.3 409.9 277.1 398.9 316 389.1 329.5 380.2 332.7 369.2 336.9 309.7 343.7 293.3 367.9 255.4 390.4 230.1 426.8 207.6 449.1 188 467.7 179.7 599.8 172.3 621.7 174.5 651.9 185.3 667 181.9 680.4 171.4 698.5 146.6 715.7 116.3 729.6 85.4";

export function PlanningWait({ lang }: { lang: string }) {
  const ko = lang === "ko";
  const markerId = useId();
  // 동작 줄이기를 켠 사람에게는 움직이는 표시를 그리지 않는다 (CSS 로 숨기는 것과 함께)
  const [still, setStill] = useState(false);
  useEffect(() => { try { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* 무시 */ } }, []);
  return <section className="planning-wait">
    <div className="planning-heading" role="status">
      <span className="planning-indicator" aria-hidden="true" />
      <strong>{ko ? "동이가 여행 코스를 준비하고 있어요" : "Dongi is planning your route"}</strong>
    </div>
    <div className="planning-map">
      <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <g id={markerId}>
            <path d="M-7 -4 0 4 7 -4" fill="#195fa4" />
            <circle cy="-22" r="23" fill="white" stroke="#195fa4" strokeWidth="3"/>
            <image href="/dongi/happy.webp" x="-19" y="-41" width="38" height="38"/>
          </g>
        </defs>
        <image href="/dongi/mukho-harbor.svg" width="1000" height="500" />
        <g className="planning-area-label">
          <text x="258" y="170">{ko ? "발한동" : "Balhan-dong"}</text>
          <text x="655" y="326">{ko ? "묵호항" : "Mukho Port"}</text>
        </g>
        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d={road} stroke="white" strokeWidth="11" />
          <path d={road} stroke="#9fc4ea" strokeWidth="6" />
          <path className="planning-trace" style={still ? { animation: "none", strokeDashoffset: 0 } : undefined} d={road} pathLength="1" stroke="#1473cf" strokeWidth="6" />
        </g>
        <g className="planning-pin-label">
          <circle cx="279.3" cy="410" r="7" fill="#187451" stroke="white" strokeWidth="3"/>
          <text x="293" y="436">{ko ? "묵호역" : "Mukho Station"}</text>
          <circle cx="556.5" cy="175" r="6" fill="white" stroke="#2865a0" strokeWidth="3"/>
          <text x="541" y="152" textAnchor="end">{ko ? "묵호항 수산시장" : "Harbor market"}</text>
          <path d="M730 86s-10-11-10-18a10 10 0 0 1 20 0c0 7-10 18-10 18Z" fill="#be4847" stroke="white" strokeWidth="2"/>
          <circle cx="730" cy="67" r="3" fill="white"/>
          <text x="709" y="72" textAnchor="end">{ko ? "해랑전망대" : "Haerang Observatory"}</text>
        </g>
        {!still && <g className="planning-guide-moving">
          <animateMotion path={road} dur="8s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;.64;.64;1;1" keyTimes="0;.07;.49;.59;.91;1"/>
          <use href={"#" + markerId}/>
        </g>}
        <use className="planning-guide-static" style={still ? { display: "block" } : undefined} href={"#" + markerId} x="556.5" y="175"/>
      </svg>
      <div className="planning-map-meta"><span>{ko ? "묵호 해안 · 경로 예시" : "Mukho coast · sample route"}</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div>
    </div>
  </section>;
}
