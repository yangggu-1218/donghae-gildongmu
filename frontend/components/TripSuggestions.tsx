"use client";

import { useEffect, useMemo, useState } from "react";
import type { Conditions, Stop } from "@/lib/api";
import KakaoMap from "./KakaoMap";

type Candidate = Pick<Stop, "id" | "kind" | "grade">;

export function TripSuggestions({ conditions, places, lang, t }: {
  conditions: Conditions; places: Record<string, any>; lang: "ko" | "en"; t: (key: string) => string;
}) {
  const body = JSON.stringify(conditions);
  const [result, setResult] = useState<{ body: string; stops: Candidate[] | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/course-preview", {
          method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
        });
        if (!response.ok) throw new Error("preview unavailable");
        const stops: Candidate[] = await response.json();
        if (!controller.signal.aborted) setResult({ body, stops });
      } catch {
        if (!controller.signal.aborted) setResult({ body, stops: null });
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [body]);

  const ko = lang === "ko";
  const stops = result?.body === body ? result.stops : undefined;
  const pins = useMemo(() => (stops ?? []).flatMap(s => {
    const p = places[s.id];
    return p?.lat && p.lon ? [{ lat: p.lat, lon: p.lon, label: (ko ? p.name_ko : p.name_en) || p.name_ko, grade: s.grade }] : [];
  }), [stops, places, ko]);
  const tags = [...conditions.move, ...conditions.style, ...(conditions.meal || [])].map(tag => t("opt." + tag));
  return <section className="trip-suggestions">
    <h3>{ko ? "내 조건에 맞는 후보" : "Places for your trip"}</h3>
    {!!tags.length && <p className="muted">{tags.join(" · ")}</p>}
    {stops?.length ? <>
      <ol>{stops.map(s => {
        const p = places[s.id];
        if (!p) return null;
        return <li key={s.id}><a href={"#/place/" + s.id}>{(ko ? p.name_ko : p.name_en) || p.name_ko}</a>
          {s.grade && <small>{t("grade." + s.grade)}{(p.access_source === "예시" || p.segments?.some((g: any) => g.source === "예시")) && (ko ? " · 예시 정보" : " · sample data")}</small>}</li>;
      })}</ol>
      {!!pins.length && <KakaoMap pins={pins} overview />}
    </> : <p>{stops === undefined ? (ko ? "조건에 맞는 장소를 찾고 있어요." : "Finding places…")
      : stops === null ? (ko ? "후보를 불러오지 못했어요." : "Could not load suggestions.")
      : (ko ? "이 조건으로 추천할 수 있는 장소가 없어요." : "No matching places.")}</p>}
  </section>;
}
