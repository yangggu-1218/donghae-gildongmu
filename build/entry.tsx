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
window.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url;
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
