"use client";
// 근처 식당: 동해시 일반음식점 인허가 현황(1,400여 곳)을 카카오 주소 검색으로 지도 좌표로 바꿔 거리순으로 보여 준다.
// 접근성은 확인 전. 한국관광공사 무장애 정보로 확인한 식당만 '확인됨'으로 표시하고 먼저 보여 준다.
import { useEffect, useState } from "react";

type Eat = { years: number; since: string; name: string; kind: string; group: string; dist_m: number; tel: string; address: string; place_id: string; checked: boolean; lat: number; lon: number };
type Res = { count: number; total: number; groups: [string, number][]; items: Eat[]; source: string };
const G_EN: Record<string, string> = { "한식": "Korean", "회·해산물": "Seafood", "고기·탕": "BBQ & stew", "중식": "Chinese", "분식·국수": "Noodles & snacks", "양식·일식": "Western & Japanese", "치킨": "Chicken", "기타": "Other" };
const dist = (m: number, ko: boolean) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`) + (ko ? "" : "");

export function NearbyEats({ lat, lon, lang, r = 600, limit = 6, title, exclude }: { lat: number; lon: number; lang: string; r?: number; limit?: number; title?: string; exclude?: string }) {
  const ko = lang === "ko";
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState<"pick" | "dist" | "old" | "access">("pick");
  const [d, setD] = useState<Res | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/eateries?lat=${lat}&lon=${lon}&r=${r}&limit=${limit + 1}&group=${encodeURIComponent(group)}&sort=${sort}`).then((x) => x.json()).then((j) => live && setD(j)).catch(() => {});
    return () => { live = false; };
  }, [lat, lon, r, limit, group, sort]);
  if (!d) return <p className="muted">{ko ? "근처 식당을 찾는 중…" : "Finding places to eat…"}</p>;
  const items = d.items.filter((x) => x.place_id !== exclude).slice(0, limit);
  return (
    <div className="eats">
      {title && <h3 className="h4">{title}</h3>}
      <p className="muted small">{ko ? `반경 ${dist(r, ko)} 안 ${d.total}곳` : `${d.total} within ${dist(r, ko)}`}</p>
      <div className="chips eat-g" role="group" aria-label={ko ? "음식 종류" : "Cuisine"}>
        <button className="chip" aria-pressed={!group} onClick={() => setGroup("")}>{ko ? "전체" : "All"}</button>
        {d.groups.map(([g, n]) => <button key={g} className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{ko ? g : G_EN[g] || g} <small>{n}</small></button>)}
      </div>
      <div className="eat-sort" role="group" aria-label={ko ? "정렬" : "Sort"}>
        {([["pick", "길동무 추천순", "Recommended"], ["dist", "가까운 순", "Nearest"], ["old", "오래된 가게 순", "Longest-running"], ["access", "무장애 정보 먼저", "Access info first"]] as const).map(([k, a, b]) =>
          <button key={k} className={sort === k ? "on" : ""} aria-pressed={sort === k} onClick={() => setSort(k)}>{ko ? a : b}</button>)}
      </div>
      {sort === "pick" && <p className="muted small eat-why">{ko ? "무장애 정보 확인 · 오래 영업한 곳 · 가까운 곳을 함께 따져 골랐어요." : "Weighs access info, years in business and distance."}</p>}
      <ul className="eat-list">
        {items.map((x) => (
          <li key={x.name + x.address}>
            <div className="eat-n"><b>{x.name}</b>{x.checked ? <span className="badge g-G">{ko ? "무장애 정보 있음" : "Access info"}</span> : null}
              <small className="muted">{[x.kind === "기타" ? "" : x.kind, dist(x.dist_m, ko), x.years >= 10 ? (ko ? `${x.years}년째 영업` : `${x.years} yrs`) : ""].filter(Boolean).join(" · ")}</small></div>
            <div className="eat-a">
              {x.tel && <a className="chip" href={`tel:${x.tel}`}>☎ {ko ? "전화" : "Call"}</a>}
              <a className="chip" href={`https://map.kakao.com/link/map/${encodeURIComponent(x.name)},${x.lat},${x.lon}`} target="_blank" rel="noreferrer">{ko ? "지도" : "Map"}</a>
            </div>
          </li>))}
        {!items.length && <li className="muted">{ko ? "이 반경엔 해당 식당이 없어요." : "None in this radius."}</li>}
      </ul>
      <p className="muted small">{ko ? "출처: 동해시 일반음식점 인허가 현황(2026-03) · 영업 연수는 인허가 연도 기준 · 리뷰 점수는 공개 데이터가 없어 쓰지 않았어요 · 휠체어 접근은 가기 전 전화로 확인해 주세요."
        : "Source: Donghae restaurant licences (2026-03). Call ahead to check wheelchair access."}</p>
    </div>
  );
}
