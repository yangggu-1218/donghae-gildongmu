"use client";
// 카카오맵 JavaScript API. .env.local 에 NEXT_PUBLIC_KAKAO_JS_KEY 가 없으면 안내 문구만 보여 준다.
// 카카오 개발자 콘솔 > 내 애플리케이션 > 플랫폼 > Web 에 http://localhost:3000 과 배포 주소를 등록해야 지도가 뜬다.
import { useEffect, useRef } from "react";

declare global { interface Window { kakao: any } }
type Pin = { lat: number; lon: number; label: string; grade: "G" | "Y" | "R" | null };
const COLOR = { G: "#1E8A3C", Y: "#F2B416", R: "#C9302C" } as const;

export default function KakaoMap({ pins }: { pins: Pin[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  useEffect(() => {
    if (!key || !ref.current || !pins.length) return;
    const draw = () => {
      const { maps } = window.kakao;
      const map = new maps.Map(ref.current, { center: new maps.LatLng(pins[0].lat, pins[0].lon), level: 8 });
      const bounds = new maps.LatLngBounds();
      const path = pins.map((p) => new maps.LatLng(p.lat, p.lon));
      pins.forEach((p, i) => {
        const pos = path[i]; bounds.extend(pos);
        const bg = p.grade ? COLOR[p.grade] : "#2462B4";
        new maps.CustomOverlay({ map, position: pos, content:
          `<div style="width:28px;height:28px;border-radius:50%;background:${bg};color:${p.grade === "Y" ? "#1A2433" : "#fff"};display:grid;place-items:center;font-weight:700;border:3px solid #fff" title="${p.label}">${i + 1}</div>` });
      });
      new maps.Polyline({ map, path, strokeWeight: 3, strokeColor: "#566275", strokeStyle: "shortdash" });
      map.setBounds(bounds);
    };
    if (window.kakao?.maps) { window.kakao.maps.load(draw); return; }
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.onload = () => window.kakao.maps.load(draw);
    document.head.appendChild(s);
  }, [key, pins]);

  if (!key) return <Sketch pins={pins} />;
  return <div className="map" ref={ref} role="img" aria-label="코스 지도. 아래 목록과 같은 내용입니다." />;
}

// 지도 키가 없을 때(데모·키 발급 전): 좌표로 그린 코스 약도. 실제 지도는 아니고 순서와 방향만 보여 준다.
function Sketch({ pins }: { pins: Pin[] }) {
  if (!pins.length) return <div className="map muted">코스를 만들면 여기에 경로가 그려져요.</div>;
  const W = 520, H = 300, P = 40;
  const lats = pins.map((p) => p.lat), lons = pins.map((p) => p.lon);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const span = Math.max(la1 - la0, (lo1 - lo0) * 0.79, 0.01);
  const x = (lo: number) => W / 2 + ((lo - (lo0 + lo1) / 2) * 0.79 / span) * (H - 2 * P);
  const y = (la: number) => H / 2 - ((la - (la0 + la1) / 2) / span) * (H - 2 * P);
  const pts = pins.map((p) => [x(p.lon), y(p.lat)]);
  return (
    <div className="map" role="img" aria-label="코스 약도. 아래 목록과 같은 순서입니다." style={{ display: "block", position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <text x={W - 14} y={22} textAnchor="end" fontSize="12" fill="var(--muted)">N ↑ · 약도 (지도 키를 넣으면 실제 지도)</text>
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="6 6" />
        {pts.map(([px, py], i) => {
          const g = pins[i].grade; const bg = g ? `var(--${g === "G" ? "go" : g === "Y" ? "warn-dot" : "stop"})` : "var(--sea)";
          return (
            <g key={i}>
              <circle cx={px} cy={py} r="15" fill={bg} stroke="var(--surface)" strokeWidth="3" />
              <text x={px} y={py + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={g === "Y" ? "#1A2433" : "var(--on-signal)"}>{i + 1}</text>
              {!pts.slice(0, i).some(([qx, qy]) => Math.hypot(qx - px, qy - py) < 60) && <text x={px > W * 0.6 ? px - 20 : px + 20} y={py + 5} textAnchor={px > W * 0.6 ? "end" : "start"} fontSize="13" fill="var(--ink)">{pins[i].label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
