import React from "react";
import { createRoot } from "react-dom/client";
import Page from "@/app/page";
import { makeApi } from "./api.js";
import DATA from "./data.json";

const api = makeApi(DATA as any);
// 제보 양식(FormData)은 글만 받는다. 데모에는 서버가 없어 사진·AI 분석은 하지 않는다.
const bodyOf = (b: any) => (!b ? null : b instanceof FormData
  ? Object.fromEntries([...b.entries()].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name]))
  : JSON.parse(b));
const orig = window.fetch.bind(window);

// 날씨: 데모에는 서버가 없어 브라우저가 Open-Meteo 일별 예보를 직접 받는다 (서버 backend/app/public_apis.py forecast()와 같은 규칙)
const KIND: [number[], string, string, string][] = [[[0], "맑음", "Clear", "sun"], [[1, 2], "구름 조금", "Partly cloudy", "part"], [[3], "흐림", "Cloudy", "cloud"],
  [[45, 48], "안개", "Fog", "fog"], [[51, 52, 53, 54, 55, 56, 57], "이슬비", "Drizzle", "rain"], [[61, 62, 63, 64, 65, 66, 67], "비", "Rain", "rain"],
  [[71, 72, 73, 74, 75, 76, 77, 85, 86], "눈", "Snow", "snow"], [[80, 81, 82], "소나기", "Showers", "rain"], [[95, 96, 99], "뇌우", "Thunderstorm", "storm"]];
let wx: any = null, wxAt = 0;
// 두 번째 출처: 노르웨이 기상청(MET Norway) 시간별 예보를 한국 날짜별로 묶기 (서버 _met_norway와 같은 규칙)
const SYM: [string, string, string, string, number][] = [["thunder", "뇌우", "Thunderstorm", "storm", 95], ["snow", "눈", "Snow", "snow", 71], ["sleet", "진눈깨비", "Sleet", "snow", 66],
  ["rainshowers", "소나기", "Showers", "rain", 80], ["rain", "비", "Rain", "rain", 61], ["fog", "안개", "Fog", "fog", 45], ["cloudy", "흐림", "Cloudy", "cloud", 3],
  ["partlycloudy", "구름 조금", "Partly cloudy", "part", 2], ["fair", "구름 조금", "Partly cloudy", "part", 1], ["clearsky", "맑음", "Clear", "sun", 0]];
async function metNorway() {
  const ts = (await (await orig("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=37.5245&lon=129.1143")).json()).properties.timeseries;
  const by: Record<string, { temps: number[]; mm: number; syms: string[] }> = {};
  for (const t of ts) {
    const at = new Date(new Date(t.time).getTime() + 9 * 3600e3), date = at.toISOString().slice(0, 10), h = at.getUTCHours();
    const d = (by[date] ||= { temps: [], mm: 0, syms: [] });
    d.temps.push(t.data.instant.details.air_temperature);
    const n1 = t.data.next_1_hours, n6 = t.data.next_6_hours;
    if (n1) { d.mm += n1.details?.precipitation_amount || 0; if (h >= 9 && h <= 18) d.syms.push(n1.summary.symbol_code); }
    else if (n6 && h % 6 === 3) { d.mm += n6.details?.precipitation_amount || 0; if (h >= 6 && h <= 15) d.syms.push(n6.summary.symbol_code); }
  }
  return Object.entries(by).sort().filter(([, d]) => d.syms.length).map(([date, d]) => {
    const bases = d.syms.map((x) => x.split("_")[0]);
    const s = SYM.find((x, i) => bases.some((b) => (i < 5 ? b.includes(x[0]) : b === x[0]))) || SYM[SYM.length - 1];
    const mm = Math.round(d.mm * 10) / 10;
    return { date, code: s[4], ko: s[1], en: s[2], icon: s[3], pop: null, mm, tmax: Math.round(Math.max(...d.temps)), tmin: Math.round(Math.min(...d.temps)), wind: null, rain: mm >= 5 || (s[4] >= 61 && mm >= 1) };
  });
}
async function weather() {
  if (wx && Date.now() - wxAt < 3600e3) return wx;
  let days: any[] = [], source = "Open-Meteo 일별 예보 (기상청 등 수치예보 모델 종합)";
  try { days = await openMeteo(); } catch { days = await metNorway(); source = "노르웨이 기상청(MET Norway) 예보"; }
  api.setForecast(days);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const t = days.find((d: any) => d.date === today) || days[0];
  wx = { sample: false, rain: t.rain, today: t, days, source, updated: new Date().toISOString().slice(0, 16) }; wxAt = Date.now();
  return wx;
}
async function openMeteo() {
  const q = "latitude=37.5245&longitude=129.1143&timezone=Asia%2FSeoul&forecast_days=16&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max";
  const j = (await (await orig("https://api.open-meteo.com/v1/forecast?" + q)).json()).daily;
  const days = j.time.map((d: string, i: number) => {
    const code = +j.weather_code[i] || 0, pop = +j.precipitation_probability_max[i] || 0, mm = +j.precipitation_sum[i] || 0;
    const k = KIND.find(([cs]) => cs.includes(code)) || [[], "알 수 없음", "Unknown", "cloud"];
    const wet = (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || [80, 81, 82, 85, 86, 95, 96, 99].includes(code);
    return { date: d, code, ko: k[1], en: k[2], icon: k[3], pop, mm: Math.round(mm * 10) / 10, tmax: Math.round(j.temperature_2m_max[i]), tmin: Math.round(j.temperature_2m_min[i]),
      wind: Math.round(j.wind_speed_10m_max[i] / 3.6 * 10) / 10, rain: pop >= 60 || mm >= 5 || (wet && pop >= 40) };
  });
  return days;
}

window.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("/api/weather")) {
    try { return new Response(JSON.stringify(await weather()), { status: 200, headers: { "content-type": "application/json" } }); }
    catch { return new Response(JSON.stringify({ sample: true, rain: false, days: [] }), { status: 200, headers: { "content-type": "application/json" } }); }
  }
  if (url.startsWith("/api/")) {
    const u = new URL(url, "http://demo.local");
    await new Promise((r) => setTimeout(r, 300));   // 실제 서버처럼 잠깐 생각하는 시간
    try {
      const tok = (init.headers && (init.headers["x-admin-token"] || init.headers["X-Admin-Token"])) || "";
      const out = api.handle(init.method || "GET", u.pathname, { ...Object.fromEntries(u.searchParams), __token: tok }, bodyOf(init.body));
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    } catch (e: any) {
      const m = String(e?.message || "").match(/^(\d{3}):(.*)$/);   // "401:다시 로그인해 주세요" → 서버와 같은 오류 모양
      if (m) return new Response(JSON.stringify({ detail: m[2] }), { status: +m[1], headers: { "content-type": "application/json" } });
      console.error(e);
      return new Response("{}", { status: 500 });
    }
  }
  return orig(input, init);
}) as any;

createRoot(document.getElementById("root")!).render(<Page />);
