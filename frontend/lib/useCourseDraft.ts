"use client";
import { useCallback, useEffect, useRef } from "react";
import { api, type Conditions, type CourseRes } from "./api";

type Draft = { key: string; result: Promise<CourseRes>; started: number; pending: boolean };

export function useCourseDraft(conditions: Conditions | null) {
  const current = useRef<Draft | null>(null);
  const key = conditions && JSON.stringify(conditions);

  const request = useCallback((key: string) => {
    const previous = current.current;
    if (previous?.key === key && (previous.pending || Date.now() - previous.started < 600_000)) return previous;
    const draft: Draft = { key, started: Date.now(), pending: true, result: api.course(JSON.parse(key)) };
    current.current = draft;
    draft.result.then(() => { draft.pending = false; }, () => {
      draft.pending = false;
      if (current.current === draft) current.current = null;
    });
    return draft;
  }, []);

  useEffect(() => {
    if (!key) { current.current = null; return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      // While one draft runs, keep only the latest answers in the queue.
      const previous = current.current;
      if (previous?.pending && previous.key !== key) await previous.result.catch(() => {});
      if (active) request(key);
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [key, request]);

  return (final: Conditions) => request(JSON.stringify(final)).result;
}
