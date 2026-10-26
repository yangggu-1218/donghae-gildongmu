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

  if (!key) return <div className="map muted">지도 키(NEXT_PUBLIC_KAKAO_JS_KEY)를 넣으면 지도가 보여요. 아래 목록에 같은 내용이 있어요.</div>;
  return <div className="map" ref={ref} role="img" aria-label="코스 지도. 아래 목록과 같은 내용입니다." />;
}
