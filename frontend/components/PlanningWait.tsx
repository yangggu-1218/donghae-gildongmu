import { useEffect, useId, useMemo, useState } from "react";

// 코스를 짜는 동안 보여 주는 지도 애니메이션.
// 고른 조건으로 규칙 엔진 후보(/api/course-preview, AI·외부 API 안 부름)를 받아 출발지 → 후보 장소 → 출발지를 동이가 따라 움직인다.
// 후보를 못 받으면 예전처럼 묵호역 → 묵호항 → 해랑전망대 예시 길을 보여 준다.
type Pt = { lat: number; lon: number; label: string };

// 묵호역에서 묵호항을 거쳐 해랑전망대 앞까지 이어지는 도로 (예시 그림용 좌표)
const road = "M279.3 409.9 277.1 398.9 316 389.1 329.5 380.2 332.7 369.2 336.9 309.7 343.7 293.3 367.9 255.4 390.4 230.1 426.8 207.6 449.1 188 467.7 179.7 599.8 172.3 621.7 174.5 651.9 185.3 667 181.9 680.4 171.4 698.5 146.6 715.7 116.3 729.6 85.4";

// 동해시 해안선 개략 (해변·항구 좌표 바로 바깥, 북 → 남). 지도 배경의 바다를 그리는 데만 쓴다.
const COAST: [number, number][] = [[37.66, 129.03], [37.6, 129.083], [37.592, 129.093], [37.587, 129.103], [37.581, 129.112], [37.569, 129.12],
  [37.556, 129.124], [37.549, 129.123], [37.534, 129.119], [37.527, 129.126], [37.52, 129.124], [37.515, 129.128], [37.5, 129.141],
  [37.488, 129.151], [37.48, 129.162], [37.468, 129.171], [37.42, 129.205]];

const W = 1000, H = 500, PAD = 70;

function project(pts: Pt[]) {
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  let x0 = Math.min(...pts.map((p) => p.lon * kx)), x1 = Math.max(...pts.map((p) => p.lon * kx));
  let y0 = Math.min(...pts.map((p) => p.lat)), y1 = Math.max(...pts.map((p) => p.lat));
  const minSpan = 0.02;   // 너무 가까운 곳끼리는 확대하지 않게
  if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
  if (y1 - y0 < minSpan / 2) { const c = (y0 + y1) / 2; y0 = c - minSpan / 4; y1 = c + minSpan / 4; }
  const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
  const ox = (W - s * (x1 - x0)) / 2, oy = (H - s * (y1 - y0)) / 2;
  return (lat: number, lon: number) => [ox + (lon * kx - x0) * s, oy + (y1 - lat) * s] as [number, number];
}

export function PlanningWait({ lang, conditions, places, start }: { lang: string; conditions?: any; places?: Record<string, any>; start?: Pt }) {
  const ko = lang === "ko";
  const markerId = useId();
  // 동작 줄이기를 켠 사람에게는 움직이는 표시를 그리지 않는다 (CSS 로 숨기는 것과 함께)
  const [still, setStill] = useState(false);
  useEffect(() => { try { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* 무시 */ } }, []);
  const [stops, setStops] = useState<Pt[] | null>(null);
  useEffect(() => {
    if (!conditions || !places || !start) return;
    const ctl = new AbortController();
    fetch("/api/course-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...conditions, day_no: 1 }), signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        const pts = (Array.isArray(rows) ? rows : []).map((r) => places[r.id]).filter((p) => p && p.lat != null && p.lon != null)
          .slice(0, 5).map((p) => ({ lat: p.lat, lon: p.lon, label: ko ? p.name_ko : p.name_en || p.name_ko }));
        setStops(pts.length ? pts : []);
      }).catch(() => {});
    return () => ctl.abort();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const live = useMemo(() => {
    if (!stops?.length || !start) return null;
    const all = [start, ...stops];
    const P = project(all);
    const xy = [...all, start].map((p) => P(p.lat, p.lon));
    const d = "M" + xy.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
    // 장소마다 잠깐 멈추도록: 꼭짓점까지의 거리 비율로 keyPoints/keyTimes
    const seg = xy.slice(1).map((p, i) => Math.hypot(p[0] - xy[i][0], p[1] - xy[i][1]));
    const total = seg.reduce((a, b) => a + b, 0) || 1;
    const frac = [0]; seg.forEach((l) => frac.push(frac[frac.length - 1] + l / total));
    const n = frac.length - 1, pause = 0.06, move = (1 - pause * (n + 1)) / n;
    const kp: number[] = [], kt: number[] = []; let t = 0;
    for (let i = 0; i <= n; i++) {
      kp.push(Math.min(1, frac[i]), Math.min(1, frac[i])); kt.push(t, Math.min(1, t + pause)); t += pause + move;
    }
    kt[kt.length - 1] = 1;
    const sea = [...COAST.map(([la, lo]) => P(la, lo)), P(37.3, 131), P(37.8, 131)];
    const seaD = "M" + sea.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L") + "Z";
    const dur = Math.max(8, n * 2.4);
    // 이름표가 겹치지 않게: 가까운 이름표가 이미 있으면 아래로 비켜 놓는다
    const placed: [number, number][] = [];
    const lab = all.map((_, i) => {
      const [x, y] = xy[i]; const left = x > W * 0.62; const lx = left ? x - 20 : x + 20; let ly = y + 6;
      while (placed.some(([px, py]) => Math.abs(px - lx) < 200 && Math.abs(py - ly) < 24)) ly += 26;
      placed.push([lx, ly]);
      return { lx, ly, left };
    });
    return { xy, d, kp: kp.join(";"), kt: kt.map((x) => x.toFixed(3)).join(";"), seaD, dur, labels: all, lab };
  }, [stops, start]);

  return <section className="planning-wait">
    <div className="planning-heading" role="status">
      <span className="planning-indicator" aria-hidden="true" />
      <strong>{ko ? "동이가 여행 코스를 준비하고 있어요" : "Dongi is planning your route"}</strong>
    </div>
    <div className="planning-map">
      {live ? <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="planning-live">
        <defs>
          <g id={markerId}>
            <path d="M-7 -4 0 4 7 -4" fill="#195fa4" />
            <circle cy="-22" r="23" fill="white" stroke="#195fa4" strokeWidth="3"/>
            <image href="/dongi/happy.webp" x="-19" y="-41" width="38" height="38"/>
          </g>
        </defs>
        <rect width={W} height={H} fill="#f1efe9" />
        <path d={live.seaD} fill="#c9e4ef" />
        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d={live.d} stroke="white" strokeWidth="11" />
          <path d={live.d} stroke="#9fc4ea" strokeWidth="6" strokeDasharray="2 12" />
          <path className="planning-trace" style={still ? { animation: "none", strokeDashoffset: 0 } : { animationDuration: `${live.dur}s` }} d={live.d} pathLength="1" stroke="#1473cf" strokeWidth="6" />
        </g>
        <g className="planning-pin-label">
          {live.labels.map((p, i) => { const [x, y] = live.xy[i]; const L = live.lab[i]; return <g key={i}>
            {i === 0 ? <circle cx={x} cy={y} r="8" fill="#187451" stroke="white" strokeWidth="3"/>
              : <><circle cx={x} cy={y} r="13" fill="#195fa4" stroke="white" strokeWidth="3"/><text x={x} y={y + 5} textAnchor="middle" className="pw-num">{i}</text></>}
            <text x={L.lx} y={L.ly} textAnchor={L.left ? "end" : "start"}>{i > 0 ? `${i}. ` : ""}{p.label}</text></g>; })}
        </g>
        {!still && <g className="planning-guide-moving">
          <animateMotion path={live.d} dur={`${live.dur}s`} repeatCount="indefinite" calcMode="linear" keyPoints={live.kp} keyTimes={live.kt}/>
          <use href={"#" + markerId}/>
        </g>}
        {still && <use href={"#" + markerId} x={live.xy[1][0]} y={live.xy[1][1]}/>}
      </svg>
      : <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
      </svg>}
      <div className="planning-map-meta"><span>{live ? (ko ? "고른 조건의 후보 코스 · 개략도 (최종 코스와 다를 수 있음)" : "Likely route for your choices · schematic") : (ko ? "묵호 해안" : "Mukho coast · sample route")}</span>
        {!live && <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}</div>
    </div>
  </section>;
}
