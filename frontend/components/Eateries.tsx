"use client";
// 근처 식당: 동해시 일반음식점 인허가 현황(1,400여 곳)을 카카오 주소 검색으로 지도 좌표로 바꿔 거리순으로 보여 준다.
// 접근성은 확인 전. 한국관광공사 이동약자 정보로 확인한 식당만 '확인됨'으로 표시하고 먼저 보여 준다.
import { useEffect, useState } from "react";
import { dropFakeTel } from "@/lib/api";
import { Icon } from "@/components/Icon";

type Eat = { closed_suspect?: boolean; years: number; since: string; name: string; kind: string; group: string; dist_m: number; tel: string; address: string; place_id: string; checked: boolean; lat: number; lon: number };
type Res = { count: number; total: number; groups: [string, number][]; items: Eat[]; source: string };
const G_EN: Record<string, string> = { "한식": "Korean", "회·해산물": "Seafood", "고기·탕": "BBQ & stew", "중식": "Chinese", "분식·국수": "Noodles & snacks", "양식·일식": "Western & Japanese", "치킨": "Chicken", "기타": "Other" };
// 인허가 업태 이름 (영어 화면용)
const KIND_EN: Record<string, string> = { "한식": "Korean", "중국식": "Chinese", "일식": "Japanese", "경양식": "Western", "회집": "Raw fish", "분식": "Snacks", "식육(숯불구이)": "BBQ", "탕류(보신용)": "Stew", "통닭(치킨)": "Chicken", "호프/통닭": "Pub & chicken", "뷔페식": "Buffet", "패스트푸드": "Fast food", "김밥(도시락)": "Gimbap", "냉면집": "Cold noodles", "횟집": "Raw fish", "외국음식전문점(인도,태국등)": "World food", "감성주점": "Bar", "정종/대포집/소주방": "Pub" };
const dist = (m: number, ko: boolean) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`) + (ko ? "" : "");

export function NearbyEats({ lat, lon, lang, r = 600, limit = 6, title, exclude, short = false }: { lat: number; lon: number; lang: string; r?: number; limit?: number; title?: string; exclude?: string; short?: boolean }) {
  const ko = lang === "ko";
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState<"pick" | "dist" | "old" | "access">(short ? "dist" : "pick");   // short: 관광지 상세용 — 가까운 곳만, 고르기 상자 없이
  const [d, setD] = useState<Res | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/eateries?lat=${lat}&lon=${lon}&r=${r}&limit=${limit + 1}&group=${encodeURIComponent(group)}&sort=${sort}`).then((x) => x.json()).then((j) => live && setD(dropFakeTel(j))).catch(() => {});
    return () => { live = false; };
  }, [lat, lon, r, limit, group, sort]);
  if (!d) return <p className="muted">{ko ? "근처 식당을 찾는 중…" : "Finding places to eat…"}</p>;
  const items = d.items.filter((x) => x.place_id !== exclude).slice(0, limit);
  return (
    <div className="eats">
      {title && <h3 className="h4">{title}</h3>}
      {/* 정보 밀도: 종류·정렬은 고르기 상자 한 줄, 출처·고른 기준은 (i)에 마우스를 올리면 */}
      {!short && <div className="eat-bar">
        <span className="muted small" title={ko ? "휠체어 접근은 가기 전 전화로 확인해 주세요."
          : "Source: Donghae restaurant licences (2026-03). Call ahead to check wheelchair access."}>{ko ? `반경 ${dist(r, ko)} 안 ${d.total}곳` : `${d.total} within ${dist(r, ko)}`} <Icon name="info" /></span>
        <label><span className="sr-only">{ko ? "음식 종류" : "Cuisine"}</span>
          <select className="box sm" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">{ko ? "전체" : "All"}</option>
            {d.groups.map(([g, n]) => <option key={g} value={g}>{ko ? g : G_EN[g] || g} ({n})</option>)}
          </select></label>
        <label><span className="sr-only">{ko ? "정렬" : "Sort"}</span>
          <select className="box sm" value={sort} onChange={(e) => setSort(e.target.value as any)}
            title={sort === "pick" ? (ko ? "이동약자 정보 확인 · 오래 영업한 곳 · 가까운 곳을 함께 따져 골랐어요." : "Weighs access info, years in business and distance.") : undefined}>
            {([["pick", "길동무 추천순", "Recommended"], ["dist", "가까운 순", "Nearest"], ["old", "오래된 가게 순", "Longest-running"], ["access", "이동약자 정보 먼저", "Access info first"]] as const).map(([k, a, b]) =>
              <option key={k} value={k}>{ko ? a : b}</option>)}
          </select></label>
      </div>}
      <ul className="eat-list">
        {items.map((x) => (
          <li key={x.name + x.address}>
            <div className="eat-n"><b>{x.name}</b>{x.checked ? <span className="badge g-G">{ko ? "이동약자 정보 있음" : "Access info"}</span> : null}{x.closed_suspect ? <span className="badge b-unknown" title={ko ? "공공데이터 인허가 목록에서 두 번 연속 빠졌어요. 가기 전에 전화로 확인해 주세요." : "Missing from the licence list twice. Call ahead."}>{ko ? "폐업 의심" : "May be closed"}</span> : null}
              <small className="muted">{[x.kind === "기타" ? "" : ko ? x.kind : KIND_EN[x.kind] || "", dist(x.dist_m, ko), x.years >= 10 ? (ko ? `${x.years}년째 영업` : `${x.years} yrs`) : ""].filter(Boolean).join(" · ")}</small></div>
            <div className="eat-a">
              {x.tel && <a className="chip" href={`tel:${x.tel}`}><Icon name="phone" />&nbsp;{ko ? "전화" : "Call"}</a>}
              <a className="chip" href={`https://map.kakao.com/link/map/${encodeURIComponent(x.name)},${x.lat},${x.lon}`} target="_blank" rel="noreferrer">{ko ? "지도" : "Map"}</a>
            </div>
          </li>))}
        {!items.length && <li className="muted">{ko ? "이 반경엔 해당 식당이 없어요." : "None in this radius."}</li>}
      </ul>
    </div>
  );
}
