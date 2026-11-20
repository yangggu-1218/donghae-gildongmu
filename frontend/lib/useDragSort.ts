"use client";
// 일정 카드 끌어서 순서 바꾸기 (마우스·터치·키보드). 라이브러리 없이 pointer 이벤트로.
// - 마우스: 카드 아무 곳이나(버튼·링크 제외) 6px 이상 끌면 시작
// - 터치: 왼쪽 손잡이(⋮⋮)로만 — 카드 본문은 화면 스크롤을 그대로 두기 위해
// - 끄는 동안 다른 카드는 움직이지 않고(흔들림 없음) 놓일 자리에 선만 보인다
// - 놓으면 바뀐 순서를 onDrop 으로 넘기고, 순서가 바뀐 뒤 카드들이 제자리로 미끄러지는 애니메이션(FLIP)
// - 키보드: 손잡이에서 ↑·↓
import { useLayoutEffect, useRef, useState } from "react";

export type DragState = { id: string; from: number; over: number; dy: number; lineY: number };

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 2) return p;
  }
  return null;
}

export function useDragSort(ids: string[], onDrop: (next: string[]) => void, disabled = false) {
  const listRef = useRef<HTMLOListElement>(null);
  const [st, setSt] = useState<DragState | null>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const dragged = useRef(false);   // 방금 끌어서 놓았으면 이어지는 클릭(카드 고르기)을 무시
  const key = ids.join("|");

  const snapshot = () => {
    const m = new Map<string, DOMRect>();
    listRef.current?.querySelectorAll<HTMLElement>("[data-sort-id]").forEach((el) => m.set(el.dataset.sortId!, el.getBoundingClientRect()));
    return m;
  };

  // 순서가 바뀐 뒤: 예전 자리에서 새 자리로 미끄러지게
  useLayoutEffect(() => {
    const old = prevRects.current;
    if (!old.size || !listRef.current) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    listRef.current.querySelectorAll<HTMLElement>("[data-sort-id]").forEach((el) => {
      const r0 = old.get(el.dataset.sortId!);
      if (!r0 || reduce) return;
      const d = r0.top - el.getBoundingClientRect().top;
      if (Math.abs(d) > 1) el.animate([{ transform: `translateY(${d}px)` }, { transform: "translateY(0)" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    prevRects.current = new Map();
  }, [key]);

  const commit = (next: string[]) => {
    if (next.join("|") === key) return;
    prevRects.current = snapshot();
    onDrop(next);
  };

  const onPointerDown = (e: React.PointerEvent, id: string, handle: boolean) => {
    dragged.current = false;   // 앞서 끈 표시는 새로 누를 때 지운다 (터치에서 첫 탭이 무시되던 것)
    if (disabled || e.button > 0 || ids.length < 2) return;
    if (!handle) {
      if (e.pointerType !== "mouse") return;
      if ((e.target as HTMLElement).closest("button, a, summary, input, select, textarea, label, dialog, .tl-more")) return;
    }
    const list = listRef.current;
    if (!list) return;
    dragged.current = false;
    const from = ids.indexOf(id);
    const rects = snapshot();
    const listTop = list.getBoundingClientRect().top;
    const startY = e.clientY;
    const scroller = scrollParent(list);
    const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY);
    const s0 = scrollTop();
    let active = handle;
    let latest: DragState | null = null;
    let raf = 0;
    let lastY = startY;
    if (handle) e.preventDefault();

    const place = () => {
      const delta = scrollTop() - s0;
      const y = lastY + delta;                         // 끌기 시작할 때 화면 좌표계로
      const others = ids.filter((o) => o !== id);
      let over = 0;
      others.forEach((o) => { const r = rects.get(o); if (r && r.top + r.height / 2 < y) over++; });
      const rr = others.map((o) => rects.get(o)!).filter(Boolean);
      const lineY = (over === 0 ? rr[0].top - 5 : rr[over - 1].bottom + 4) - listTop;
      latest = { id, from, over, dy: lastY - startY + delta, lineY };
      setSt(latest);
    };
    const autoscroll = () => {
      const edge = 70, step = 14;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      let d = 0;   // 끄는 방향 쪽 가장자리에서만 (아래 끝 카드를 위로 끌 때 화면이 내려가지 않게)
      if (lastY < top + edge && lastY < startY - 8) d = -step; else if (lastY > bottom - edge && lastY > startY + 8) d = step;
      if (d) { if (scroller) scroller.scrollTop += d; else window.scrollBy(0, d); place(); }
      raf = requestAnimationFrame(autoscroll);
    };
    const move = (ev: PointerEvent) => {
      lastY = ev.clientY;
      if (!active) {
        if (Math.abs(ev.clientY - startY) < 6) return;
        active = true;
      }
      ev.preventDefault();
      if (!raf) raf = requestAnimationFrame(autoscroll);
      place();
    };
    const end = (ok: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", upOk);
      window.removeEventListener("pointercancel", cancel);
      if (raf) cancelAnimationFrame(raf);
      document.body.classList.remove("is-sorting");
      const fin = latest;
      if (active) dragged.current = true;
      setSt(null);
      if (ok && active && fin && fin.over !== from) {
        const next = ids.filter((o) => o !== id);
        next.splice(fin.over, 0, id);
        commit(next);
      }
    };
    const upOk = () => end(true);
    const cancel = () => end(false);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", upOk);
    window.addEventListener("pointercancel", cancel);
    document.body.classList.add("is-sorting");
  };

  // 키보드: 손잡이에서 ↑·↓로 한 칸씩
  const onKey = (e: React.KeyboardEvent, id: string) => {
    if (disabled) return;
    const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = ids.indexOf(id), j = i + d;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-sort-id="${id}"] .drag-h`)?.focus());
  };

  const wasDrag = () => { const d = dragged.current; dragged.current = false; return d; };
  return { listRef, st, onPointerDown, onKey, wasDrag };
}
