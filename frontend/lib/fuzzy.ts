// 검색칸 오타 알아듣기 (서버 edits.py fuzzy_place 와 같은 규칙)
// "촛데바위" → 촛대바위, "도깨비골" → 도째비골. 글자를 자모로 풀어 비교하고 3~4글자는 1개, 5글자 이상은 2개까지 틀려도 된다.
export function jamo(s: string): string {
  let out = "";
  for (const ch of s) {
    const o = ch.charCodeAt(0) - 0xac00;
    if (o >= 0 && o < 11172) out += String.fromCharCode(0x1100 + Math.floor(o / 588), 0x1161 + (Math.floor(o / 28) % 21)) + (o % 28 ? String.fromCharCode(0x11a7 + (o % 28)) : "");
    else out += ch.toLowerCase();
  }
  return out;
}

export function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[b.length];
}

const clean = (s: string) => (s || "").replace(/\s|\(.*?\)/g, "");

/** 검색어 q 가 이름 name 안의 어느 부분과 거의 같은지 (거리, 못 찾으면 -1). 검색어가 3글자 이상일 때만 */
export function fuzzyHit(name: string, q: string): number {
  const n = clean(name), k = clean(q);
  if (k.length < 3 || !/[가-힣]/.test(k)) return -1;
  const lim = k.length <= 4 ? 1 : 2, jk = jamo(k);
  let best = -1;
  for (const L of [k.length - 1, k.length, k.length + 1]) {
    for (let i = 0; i + L <= n.length; i++) {
      const d = lev(jamo(n.slice(i, i + L)), jk);
      if (d <= lim && (best < 0 || d < best)) best = d;
    }
  }
  return best;
}
