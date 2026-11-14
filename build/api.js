// 동해 길동무 데모: backend/app (engine.py, public_data.py, talk.py 규칙 경로, main.py)를 브라우저용으로 옮긴 것.
// 서버 없이 같은 계산을 한다. LLM 대신 규칙 대화, 병원·약국은 예시, 날씨는 '비 안 옴'으로 둔다 (키 없는 서버와 같음).
export function makeApi(DATA) {
  const PLACES = {};
  const BASE = JSON.stringify(DATA.places);   // 관리자 변경을 덮기 전 원본
  const PUB = DATA.pub;

  // ---------- 공통 ----------
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const distM = (la1, lo1, la2, lo2) => {
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    return Math.trunc(2 * R * Math.asin(Math.sqrt(a)));
  };
  const good = (r) => r.lat != null && r.lon != null && !r.bad_coords;
  const kstNow = () => {
    const d = new Date(Date.now() + 9 * 3600e3);
    return { month: d.getUTCMonth() + 1, isoWeekday: d.getUTCDay() || 7,
      hm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
      date: d.toISOString().slice(0, 10) };
  };
  const byKey = (fn) => (a, b) => { const x = fn(a), y = fn(b);
    for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; };
  const near = (kind, lat, lon, radius) => lat == null ? [] :
    (PUB[kind] || []).filter(good).map((r) => ({ ...r, dist_m: distM(lat, lon, r.lat, r.lon) }))
      .filter((r) => r.dist_m <= radius).sort((a, b) => a.dist_m - b.dist_m);

  // ---------- public_data.py ----------
  const LANG_KO = { en: "영어", ja: "일본어", zh: "중국어" };
  const LANG_EN = { en: "English", ja: "Japanese", zh: "Chinese", "러시아어": "Russian" };
  const ZONE_KO = { chuam: "추암", mureung: "무릉", cheongok: "천곡", mukho: "묵호", mangsang: "망상", station: "동해역 주변" };
  const ZONE_EN = { chuam: "Chuam", mureung: "Mureung", cheongok: "Cheongok", mukho: "Mukho", mangsang: "Mangsang", station: "Donghae Station area" };

  const stories = (lat, lon, radius = 600, limit = 4) => lat == null ? [] :
    near("heritage", lat, lon, radius).slice(0, limit).map((h) => ({ name: h.name, kind: h.kind, era: h.era, intro: h.intro, dist_m: h.dist_m }));
  const trails = (names = null) => (PUB.trails || []).filter((t) => names === null || names.includes(t.name))
    .map((t) => ({ name: t.name, intro: t.intro, length_km: t.length_km, duration: t.duration, route: t.route, start: t.start, end: t.end, tel: t.tel }));
  function infoCenters(lat, lon, lang = "ko", limit = 3) {
    const now = kstNow(), winter = [11, 12, 1, 2, 3].includes(now.month);
    const out = (PUB.info_centers || []).filter(good).map((c) => {
      const langs = ["en", "ja", "zh"].filter((k) => c[k]).concat(c.other_lang ? [c.other_lang] : []);
      const names = lang === "en" ? LANG_EN : LANG_KO;
      const o = winter ? c.open_winter : c.open_summer, cl = winter ? c.close_winter : c.close_summer;
      const [status, hours] = c.hours_suspect ? ["check", ""] : [(o <= now.hm && now.hm < cl) ? "open" : "closed", `${o}~${cl}`];
      return { name: c.name, spot: c.spot, tel: c.tel, hours, status, closed_days: c.closed, languages: langs.map((x) => names[x] || x),
        tourist_info: !c.hours_suspect, interpret: (c.service || "").includes("통역"), dist_m: distM(lat, lon, c.lat, c.lon) };
    });
    return out.sort(byKey((x) => [x.tourist_info ? 0 : 1, (lang === "en" && !x.languages.length) ? 1 : 0, x.dist_m])).slice(0, limit);
  }
  function events(today) {
    today = today || kstNow().date;
    const evs = [...(PUB.events || []), ...cmsLoad().events.map((e) => ({ ...e, as_of: "" }))];
    const keys = ["name", "venue", "kind", "start", "end", "start_time", "end_time", "fee_type", "fee", "age", "tel", "ticket", "url", "lat", "lon", "festival", "access", "added_by_admin", "id"];
    const up = evs.filter((e) => (e.end || e.start) >= today).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return { as_of: evs.reduce((m, e) => (e.as_of > m ? e.as_of : m), ""), today,
      upcoming: up.map((e) => Object.fromEntries(keys.map((k) => [k, e[k] ?? null]))) };
  }
  const eventsNear = (lat, lon, radius = 800) => lat == null ? [] :
    events().upcoming.filter((e) => e.lat && distM(lat, lon, e.lat, e.lon) <= radius);
  function lodging(zone = "", limit = 0) {
    const seen = new Set(), ls = [];
    for (const l of [...(PUB.lodging || [])].sort((a, b) => (a.tourist ? 0 : 1) - (b.tourist ? 0 : 1)))
      if ((!zone || l.zone === zone) && !seen.has(l.name)) { seen.add(l.name); ls.push(l); }
    const items = ls.map((l) => ({ name: l.name, kind: l.kind, address: l.road || l.jibun || "", tel: l.tel || "", zone: l.zone, tourist: !!l.tourist }));
    return { count: items.length, zone, accessibility: "확인 전", items: limit ? items.slice(0, limit) : items };
  }
  function signalsNear(lat, lon, radius = 300) {
    const sg = near("signals", lat, lon, radius);
    return { radius_m: radius, total: sg.length, countdown: sg.filter((s) => s.countdown).length, audio: sg.filter((s) => s.audio).length };
  }
  function openToday(r, now) {
    const wd = now.isoWeekday;
    const [o, c] = wd === 6 ? [r.sat_open, r.sat_close] : wd === 7 ? [r.hol_open, r.hol_close] : [r.wk_open, r.wk_close];
    if (!o || o === c) return [false, ""];
    return [o <= now.hm && now.hm < c, `${o}~${c}`];
  }
  const chargers = (lat, lon, limit = 2) => { const now = kstNow();
    return near("wheelchair_chargers", lat, lon, 50000).slice(0, limit).map((r) => { const [ok, hours] = openToday(r, now);
      return { name: r.name, spot: r.spot, address: r.road, tel: r.tel, slots: r.slots, open_now: ok, hours_today: hours,
        weekday_hours: `${r.wk_open}~${r.wk_close}`, phone_charge: r.phone_charge, dist_m: r.dist_m }; }); };
  const parkingNear = (lat, lon, radius = 800, limit = 2) => near("parking", lat, lon, radius).slice(0, limit).map((r) => ({
    name: r.name.includes("주차") ? r.name : `${r.name} 앞 공영주차장`, spaces: Math.trunc(r.spaces || 0), fee_type: r.fee_type, fee: r.base_fee ? `${Math.trunc(r.base_min)}분 ${Math.trunc(r.base_fee)}원` : "",
    disabled_free: (r.note || "").includes("장애"), note: r.note || "", dist_m: r.dist_m }));
  const TAXI_PLACE = { "추암해변 입구": ["chotdae", "chuam_bridge", "haeamjeong", "chuam_sculpture", "chuam_camp"],
    "무릉계곡 주차장": ["valley", "samhwasa", "yongchu", "mureung_camp", "forest"], "망상해변 입구": ["mangsang", "mangsang_camp", "mangsang_hanok"],
    "동쪽바다중앙시장 입구": ["central_market", "mukho_port", "nongol", "mukho_lighthouse"], "묵호항여객선터미널": ["mukho_port", "dokkaebi", "haerang"] };
  const taxiFor = (pid) => (PUB.taxi_stands || []).filter((t) => (TAXI_PLACE[t.name] || []).includes(pid))
    .map((t) => ({ name: t.name, address: t.road, spaces: Math.trunc(t.spaces || 0) }));
  const taxiAtStart = (start) => { const t = (PUB.taxi_stands || []).find((t) => t.name === start);
    return t ? { name: t.name, address: t.road, spaces: Math.trunc(t.spaces || 0) } : null; };
  const TOUR_PLACE = { "동쪽바다중앙시장": ["central_market", "mukho_port"], "묵호시장": ["nongol", "mukho_lighthouse", "dokkaebi", "haerang"],
    "망상해변": ["mangsang", "mangsang_camp", "mangsang_hanok"], "천곡황금박쥐동굴": ["cave"], "무릉별유천지": ["mureung"],
    "무릉계곡": ["valley", "samhwasa", "yongchu", "forest", "mureung_camp"], "추암해변": ["chotdae", "chuam_bridge", "haeamjeong", "chuam_sculpture", "chuam_camp"],
    "감추사": ["gamchu", "hanseom"] };
  function cityTour(stopIds = []) {
    const ct = (PUB.city_tour || [])[0]; if (!ct) return null;
    const served = new Set();
    for (const st of ct.stops) for (const [k, ids] of Object.entries(TOUR_PLACE)) if (st.includes(k)) ids.forEach((i) => served.add(i));
    return { name: ct.name, board: ct.board, days: ct.days, first: ct.first, last: ct.last, interval_min: ct.interval_min,
      fare: ct.fare.split("+").join(" · "), contact: ct.contact, url: ct.url, stops: ct.stops, covers: stopIds.filter((i) => served.has(i)), wheelchair: "확인 전" };
  }
  function restaurants(zone, kinds = null, limit = 5) {
    const rs = (PUB.restaurants || []).filter((r) => r.zone === zone && (!kinds || kinds.includes(r.kind)));
    return { zone, count: rs.length, accessibility: "확인 전",
      items: rs.slice(0, limit).map((r) => ({ name: r.name, kind: r.kind, address: r.road || r.jibun || "", tel: r.tel || "" })) };
  }
  function mobilityCenter() {
    const m = (PUB.mobility_center || [])[0]; if (!m) return null;
    return { name: m.name, tel: m.tel, app: m.app, web: m.web, vehicles: Math.trunc(m.vehicles || 0),
      wheelchair_vehicles: Math.trunc((m.slope || 0) + (m.lift || 0)), hours: `${m.run_open}~${m.run_close}`, advance: m.advance,
      area_out: m.area_out, fare: m.fare.split("+").join(" · "), who: m.who, office_tel: m.office_tel };
  }
  const parksNear = (lat, lon, radius = 500, limit = 1) => near("parks", lat, lon, radius).slice(0, limit).map((r) => ({ name: r.name, kind: r.kind, dist_m: r.dist_m }));
  const rentalsNear = (lat, lon, radius = 1500, limit = 3) => near("rentals", lat, lon, radius).filter((r) => r.cars).slice(0, limit).map((r) => ({
    name: r.name, tel: r.tel, cars: Math.trunc(r.cars || 0), vans: Math.trunc(r.vans || 0), weekday: `${r.wk_open}~${r.wk_close}`, weekend: `${r.we_open}~${r.we_close}`, dist_m: r.dist_m }));

  // ---------- engine.py ----------
  const RANK = { G: 0, Y: 1, R: 2 };
  const STARTS = { "동해역": [37.4995, 129.124], "묵호역": [37.548, 129.116], "자가용": [37.4995, 129.124] };
  const worst = (gs) => { gs = gs.filter(Boolean); return gs.length ? gs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null; };
  function gradeSegment(s, mode) {
    const measured = [s.steps, s.curb_cm, s.slope_deg, s.width_m, s.surface].some((v) => v != null);
    let g;
    if (measured) {
      g = "G"; const surface = (s.surface || "").trim();
      if ((s.steps || 0) > 0) g = s.alt_route ? "Y" : "R";
      if (s.curb_cm != null) { if (s.curb_cm > 5) g = worst([g, "R"]); else if (s.curb_cm > 2) g = worst([g, "Y"]); }
      if (s.slope_deg != null) { if (s.slope_deg > 7.1) g = worst([g, "R"]); else if (s.slope_deg > 4.8) g = worst([g, "Y"]); }
      if (s.width_m != null) { if (s.width_m < 0.9) g = worst([g, "R"]); else if (s.width_m < 1.2) g = worst([g, "Y"]); }
      if (["모래", "흙길", "산길"].includes(surface)) g = worst([g, "R"]); else if (["자갈", "데크 이음새"].includes(surface)) g = worst([g, "Y"]);
    } else g = s.grade || "Y";
    if (mode === "walk") {
      const hard = (s.steps || 0) > 10 || ["산길", "모래"].includes(s.surface || "");
      if (g === "R" && !hard) g = "Y";
      if ((s.distance_m || 0) > 300) g = worst([g, "Y"]);
    } else if (mode === "stroller" && s.curb_cm != null && s.curb_cm > 2 && s.curb_cm <= 5) g = worst([g, "Y"]);
    return g;
  }
  function gradePlace(p, mode, lessWalk = false) {
    if (mode === "none") return null;
    let segs = p.segments;
    if (lessWalk) { const f = segs.filter((s) => !((s.distance_m || 0) > 300 || s.name.includes("전망 데크"))); segs = f.length ? f : segs; }
    return worst(segs.map((s) => gradeSegment(s, mode))) || "Y";
  }
  const modeFrom = (move) => move.includes("휠체어") ? "wheel" : move.includes("유모차") ? "stroller"
    : (move.includes("오래 걷기 어려움") || move.includes("계단 어려움")) ? "walk" : "none";
  function driveMin([la1, lo1], [la2, lo2]) {
    const r = 6371.0;
    const d = 2 * r * Math.asin(Math.sqrt(Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2));
    return pyRound((d * 1.4) / 35 * 60) + 5;
  }
  function pyRound(x) { const f = Math.floor(x), d = x - f; if (d > 0.5) return f + 1; if (d < 0.5) return f; return f % 2 === 0 ? f : f + 1; }
  const drive = (fromXy, p) => (p.lat ? driveMin(fromXy, [p.lat, p.lon]) : 15);
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  function score(p, c, rain) {
    let s = 2.0 * p.styles.filter((x) => c.style.includes(x)).length;
    if (rain) s += p.indoor ? 3.0 : -2.0;
    if (c.wish.includes(p.id)) s += 10.0;
    if (p.segments.some((seg) => seg.source === "현장 답사")) s += 1.0;
    if (["부모님과", "아이와"].includes(c.who) && p.styles.includes("체험")) s += 1.0;
    if (modeFrom(c.move) !== "none") s += ({ "평지": 1.5, "완만한경사": 0.5 }[p.walk_load] || 0) + (p.benches ? 0.5 : 0);
    if (["식당", "카페"].includes(p.type)) {
      if (c.meal.includes("부드러운 메뉴") && p.soft_menu) s += 2.0;
      if (c.meal.includes("입식") && p.table === "입식") s += 1.0;
      if (c.meal.includes("주차 편한 곳") && p.parking_easy) s += 2.0;
    }
    return s;
  }

  // ---------- 날짜 (UTC 기준 날짜 계산으로 시간대 영향 없음) ----------
  const dOf = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const sOf = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = dOf(s); d.setUTCDate(d.getUTCDate() + n); return sOf(d); };
  const weekdayOf = (s) => dOf(s).getUTCDay();       // 0=일
  const validDate = (y, m, d) => { const x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? sOf(x) : null; };
  const tripDate = (c) => (c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && validDate(...c.date.split("-").map(Number))) ? c.date : kstNow().date;

  // ---------- details.py ----------
  const MED = DATA.med || [];
  const WD_KO = ["일", "월", "화", "수", "목", "금", "토"], WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const mins = (hm) => { if (!hm) return null; const [h, m] = hm.split(":"); return +h * 60 + +m; };
  function openCheck(p, wd, arrive, stay) {
    if ((p.closed_day_nums || []).includes(wd)) return [false, "closed_day", 0];
    const o = mins(p.open), c = mins(p.close);
    if (o == null || c == null) return [true, "unknown", 0];
    if (o === 0 && c === 1440) return [true, "always", 0];
    const last = mins(p.last_entry) || (c - 30);
    let wait = 0;
    if (arrive < o) { wait = o - arrive; if (wait > 45) return [false, "not_open_yet", wait]; }
    let t = arrive + wait;
    if (p.break_time) {
      const b0 = mins(p.break_time[0]), b1 = mins(p.break_time[1]);
      if ((b0 <= t && t < b1) || (t < b0 && b0 < t + Math.min(stay, 45) && ["식당", "카페"].includes(p.type))) {
        const w2 = b1 - t; if (w2 > 30) return [false, "break", w2]; wait += w2; t = b1;
      }
    }
    if (t > last) return [false, "after_last_entry", 0];
    return [true, "open", wait];
  }
  function hoursText(p, lang = "ko") {
    if (!p.open) return lang === "ko" ? "운영시간 정보 없음" : "Hours unknown";
    if (p.open === "00:00" && p.close === "24:00") return lang === "ko" ? "상시 개방" : "Open 24h";
    let t = `${p.open}~${p.close}`;
    if (p.break_time) t += lang === "ko" ? ` (쉬는 시간 ${p.break_time[0]}~${p.break_time[1]})` : ` (break ${p.break_time[0]}-${p.break_time[1]})`;
    const cd = p.closed_day_nums || [];
    if (cd.length) t += lang === "ko" ? " · " + cd.map((i) => WD_KO[i]).join("·") + " 휴무" : " · closed " + cd.map((i) => WD_EN[i]).join("/");
    return t;
  }
  function medicalNear(lat, lon, wd = null, at = null) {
    if (lat == null) return {};
    const out = {};
    for (const kind of ["약국", "의원", "응급실"]) {
      const cand = MED.filter((m) => m.kind === kind).map((m) => {
        let isOpen = null;
        if (wd != null && at != null) isOpen = !m.closed_days.includes(wd) && mins(m.open) <= at && at < mins(m.close);
        return { name: m.name, kind: m.kind, tel: m.tel, open: m.open, close: m.close, dist_m: distM(lat, lon, m.lat, m.lon), open_then: isOpen, sample: true };
      }).map((x, i) => [x, i]).sort((a, b) => ((a[0].open_then === false) - (b[0].open_then === false)) || (a[0].dist_m - b[0].dist_m) || (a[1] - b[1])).map((x) => x[0]);
      if (cand.length) out[kind] = cand[0];
    }
    return out;
  }
  function nearby(p, lang = "ko", wd = null, at = null) {
    if (p.lat == null) return {};
    let pk = parkingNear(p.lat, p.lon, 3000, 1);
    const ch = chargers(p.lat, p.lon, 1), ic = infoCenters(p.lat, p.lon, lang, 1);
    if (!pk.length && p.parking) pk = [{ name: `${p.name_ko} 주차장`, spaces: p.parking, own: true, dist_m: 0 }];
    return { parking: pk[0] || null, charger: ch[0] || null, info_center: ic[0] || null, medical: medicalNear(p.lat, p.lon, wd, at) };
  }
  const eventsOn = (day) => events("0000-00-00").upcoming.filter((e) => e.start <= day && day <= (e.end || e.start));

  // ---------- edits.py josa ----------
  function josa(word, pair) {
    const w = word.replace(/\s*\(예시\)$/, ""), ch = w ? w[w.length - 1] : "가";
    const code = ch.charCodeAt(0), has = ch >= "가" && ch <= "힣" && (code - 0xAC00) % 28 !== 0;
    if (pair === "에서") return word + "에서";
    if (pair === "으로") return word + (has && (code - 0xAC00) % 28 !== 8 ? "으로" : "로");
    return word + (has ? pair[0] : pair[1]);
  }

  // ---------- engine.plan ----------
  function plan(places, c, rain) {
    const mode = modeFrom(c.move), less = c.move.includes("오래 걷기 어려움");
    const cap = c.cap || (c.days === "1박 2일" ? 6 : 4);
    const day = tripDate(c), wd = weekdayOf(day);
    const notes = [], skipped = [];
    let pool = Object.values(places).filter((p) => (p.type !== "숙박" || c.days === "1박 2일") && p.lat != null && !c.exclude.includes(p.id));
    if (mode !== "none") {
      const unv = pool.filter((p) => !p.verified && !c.must.includes(p.id));
      pool = pool.filter((p) => !unv.includes(p));
      if (unv.length) notes.push(`접근성을 아직 확인하지 못한 ${unv.length}곳은 코스에서 뺐어요.`);
    }
    if (c.flat_only) pool = pool.filter((p) => p.walk_load === "평지" || ["식당", "카페"].includes(p.type));
    const ok = pool.filter((p) => gradePlace(p, mode, less) !== "R");
    const dropped = pool.filter((p) => (c.wish.includes(p.id) || c.must.includes(p.id)) && !ok.includes(p)).map((p) => p.name_ko);
    if (dropped.length) notes.push(`담아 두신 ${josa(dropped.join(", "), "은는")} 이 조건으로 갈 수 없어 뺐어요.`);
    for (const p of [...ok]) {
      const tmp = noticeOn(p, "closed", day);
      if ((p.closed_day_nums || []).includes(wd) || tmp) {
        ok.splice(ok.indexOf(p), 1);
        if (c.must.includes(p.id) || c.wish.includes(p.id) || p.id === c.lunch) skipped.push({ id: p.id, name: p.name_ko, reason: tmp ? `임시 휴무(${tmp.title})` : `${WD_KO[wd]}요일 휴무` });
      }
    }
    const needTable = c.meal.includes("입식");
    const foodOk = (p) => !needTable || ["입식", "혼합"].includes(p.table);
    const byScore = (arr) => arr.map((p, i) => [p, i, -score(p, c, rain)]).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map((x) => x[0]);
    let food = byScore(ok.filter((p) => p.type === "식당" && foodOk(p)));
    const cafes = byScore(ok.filter((p) => p.type === "카페" && foodOk(p)));
    const sights = byScore(ok.filter((p) => !["식당", "숙박", "카페"].includes(p.type)));
    if (c.lunch && food.some((p) => p.id === c.lunch)) food = food.filter((p) => p.id === c.lunch).concat(food.filter((p) => p.id !== c.lunch));
    const wantRest = c.rest != null ? c.rest : ["wheel", "walk"].includes(mode);
    const nSights = Math.max(1, cap - 1 - (wantRest && cafes.length ? 1 : 0));
    const must = sights.filter((p) => c.must.includes(p.id));
    const chosen = must.concat(sights.filter((p) => !must.includes(p)).slice(0, Math.max(0, nSights - must.length)));
    const spare = sights.filter((p) => !chosen.includes(p));
    const start = STARTS[c.start];
    let t = mins(c.start_time || "10:00"); const t0 = t;
    let cur = start; const stops = [];
    let rest = [...chosen];
    let needLunch = food.length > 0 && !c.skip_lunch, needCafe = !!(wantRest && cafes.length);
    const seen = new Set(); let filled = false;
    const visit = (p, kind) => {
      const dm = drive(cur, p), arrive = t + dm;
      const [, why, wait] = openCheck(p, wd, arrive, p.stay_min);
      const st = why === "always" ? "always" : why === "unknown" ? "unknown" : "open";
      t = arrive + wait;
      stops.push({ id: p.id, arrive: hhmm(t), drive_min: dm, grade: gradePlace(p, mode, less), why: "", depart: hhmm(t + p.stay_min), kind,
        open_state: st, hours_text: hoursText(p, c.lang), hours_sample: !["공공데이터", "상시 개방", "관리자 확인"].includes(p.hours_source), wait_min: wait,
        notice: (noticeOn(p, "warn", day) || {}).title || "" });
      t += p.stay_min; cur = [p.lat || cur[0], p.lon || cur[1]]; seen.add(p.id);
    };
    const REASON = { break: "브레이크타임", after_last_entry: "마지막 입장 시간이 지남", not_open_yet: "아직 문을 열기 전" };
    const firstOpen = (cands) => {
      let best = null;
      for (const p of cands) {
        if (seen.has(p.id)) continue;
        const dm = drive(cur, p); const [okk, why, wait] = openCheck(p, wd, t + dm, p.stay_min);
        if (okk) { const cost = dm + wait; if (!best || cost < best[0]) best = [cost, p]; continue; }
        if ((c.must.includes(p.id) || p.id === c.lunch || c.wish.includes(p.id)) && !skipped.some((s) => s.id === p.id))
          skipped.push({ id: p.id, name: p.name_ko, reason: REASON[why] || why });
      }
      return best ? best[1] : null;
    };
    const mealTime = () => (680 <= t && t <= 870) || t >= 1020;
    let guard = 0;
    while ((rest.length || needLunch || needCafe) && guard < 20 && t < 1200) {
      guard++;
      if (needLunch && mealTime()) {
        const pick = (c.lunch ? firstOpen(food.slice(0, 1)) : null) || firstOpen(food.slice(0, 4)) || firstOpen(food);
        needLunch = false;
        if (pick) visit(pick, "lunch"); else notes.push("방문 시각에 문을 연 식당을 찾지 못했어요. 시작 시간을 바꿔 보세요.");
        continue;
      }
      if (needCafe && !needLunch && stops.filter((s) => s.kind === "sight").length >= 2) {
        const pick = firstOpen(cafes); needCafe = false;
        if (pick) { visit(pick, "cafe"); continue; }
      }
      if (!rest.length) {
        if (needLunch && t < 660 && stops.length) {
          const fill = (c.cap != null || filled) ? null : firstOpen(spare);
          filled = true;
          if (fill) { spare.splice(spare.indexOf(fill), 1); visit(fill, "sight"); notes.push(`점심때까지 시간이 남아 ${josa(fill.name_ko, "을를")} 넣었어요.`); continue; }
          const last = stops[stops.length - 1], extra = 680 - 15 - t;
          if (extra > 0) { t += extra; last.depart = hhmm(mins(last.depart) + extra); notes.push(`점심 전까지 ${josa(places[last.id].name_ko, "에서")} ${extra}분 더 여유 있게 쉬어요.`); }
          continue;
        }
        if (needLunch) { const pick = (c.lunch ? firstOpen(food.slice(0, 1)) : null) || firstOpen(food); needLunch = false; if (pick) visit(pick, "lunch"); continue; }
        if (needCafe) { const pick = firstOpen(cafes); needCafe = false; if (pick) visit(pick, "cafe"); }
        break;
      }
      let pick = firstOpen(rest);
      if (!pick) {
        for (const p of rest) if ((c.must.includes(p.id) || c.wish.includes(p.id)) && !skipped.some((s) => s.id === p.id))
          skipped.push({ id: p.id, name: p.name_ko, reason: "방문 시각에 운영하지 않음" });
        pick = firstOpen(spare); rest = [];
        if (!pick) continue;
        spare.splice(spare.indexOf(pick), 1);
      } else rest.splice(rest.indexOf(pick), 1);
      visit(pick, "sight");
    }
    const back = t + driveMin(cur, start);
    for (const s of skipped) notes.push(`${josa(s.name, "은는")} ${s.reason}라서 뺐어요.`);
    return { mode, stops, overall: mode !== "none" ? worst(stops.map((s) => s.grade)) : null, back_at: hhmm(back), notes,
      date: day, weekday: wd, start_time: hhmm(t0), skipped };
  }

  // ---------- edits.py (규칙 편집기) ----------
  const E = {
    REMOVE: "빼|제외|지워|없애|말고|안\\s*갈|안\\s*가|skip|remove|drop",
    REPLACE: "다른\\s*(곳|데|집|식당|데로)|바꿔|바꾸|교체|대신|change|swap|another",
    ADD: "넣어|추가|넣자|가고\\s*싶|들러|add|include",
    UPHILL: "오르막|경사|언덕|계단|가파|힘든\\s*길|hill|slope|stairs",
    INDOOR: "실내|비\\s*(가|와|오|온|올)|우천|indoor|rain",
    FLAT: "덜\\s*걷|평지|평평|적게\\s*걷|걷기\\s*(힘|어려)|less\\s*walk|flat",
    RELAX: "여유|느긋|천천히|한\\s*(군데|곳)\\s*(만)?\\s*(빼|줄)|하나\\s*(빼|줄)|줄여|fewer|relax",
    CAFE: "카페|쉬(어|었|는|다|ㄹ|면|고)|쉴|휴식|커피|rest|cafe|coffee",
    LUNCH: "점심|식당|밥|저녁|음식|lunch|dinner|restaurant",
    NEARBY: "충전기|충전|주차|charger|parking",
  };
  const rx = (p) => new RegExp(p);
  const norm = (s) => (s || "").replace(/\s|\(예시\)|\(.*?\)/g, "");
  function findPlace(text, ids = []) {
    const tt = norm(text); let best = null;
    for (const p of Object.values(PLACES)) {
      const names = new Set([norm(p.name_ko), norm(p.name_en).toLowerCase()]);
      for (const w of p.name_ko.split(/[\s·]/)) if (norm(w).length >= 3) names.add(norm(w));
      for (const n of [...names]) if (/(해변|해수욕장)$/.test(n)) names.add(n.replace(/(해변|해수욕장)$/, ""));
      for (const n of names) if (n.length >= 2 && (tt.includes(n) || tt.toLowerCase().includes(n))) {
        const k = [ids.includes(p.id) ? 1 : 0, n.length, p.id];
        if (!best || k[0] > best[0] || (k[0] === best[0] && (k[1] > best[1] || (k[1] === best[1] && k[2] > best[2])))) best = k;
      }
    }
    return best ? best[2] : null;
  }
  function findIndex(text, n) {
    const m = text.match(/(\d)\s*번|(첫|두|세|네|다섯)\s*번째|(\d)(st|nd|rd|th)/);
    if (!m) return null;
    const k = (m[1] || m[3]) ? +(m[1] || m[3]) : { "첫": 1, "두": 2, "세": 3, "네": 4, "다섯": 5 }[m[2]];
    return k >= 1 && k <= n ? k - 1 : null;
  }
  function parseDate(text, base) {
    base = base || kstNow().date;
    text = text.replace(/\d\s*박\s*\d\s*일|당일/g, "");
    const [by, bm, bd] = base.split("-").map(Number);
    let m;
    if ((m = text.match(/(20\d\d)[-./](\d{1,2})[-./](\d{1,2})/))) return validDate(+m[1], +m[2], +m[3]);
    if ((m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || text.match(/(\d{1,2})\/(\d{1,2})/))) {
      const mo = +m[1], d = +m[2];
      return validDate(by + ((mo < bm || (mo === bm && d < bd)) ? 1 : 0), mo, d);
    }
    if (/오늘|today/.test(text)) return base;
    if (/모레/.test(text)) return addDays(base, 2);
    if (/내일|tomorrow/.test(text)) return addDays(base, 1);
    m = text.match(/([일월화수목금토])요일/) || text.toLowerCase().match(/\b(sun|mon|tue|wed|thu|fri|sat)/);
    if (m) {
      const W = { "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const w = W[m[1]], cur = weekdayOf(base);
      let ahead = ((w - cur) % 7 + 7) % 7;
      if (/다음\s*주|next\s*week/.test(text)) ahead = (8 - (cur || 7)) + (((w - 1) % 7) + 7) % 7;
      return addDays(base, ahead);
    }
    if ((m = text.match(/(?<![\d월])(\d{1,2})\s*일(?!\s*(정|간|째))/))) {
      const d = +m[1]; let y = by, mo = bm;
      if (d < bd) { mo += 1; if (mo > 12) { y += 1; mo = 1; } }
      return validDate(y, mo, d);
    }
    return null;
  }
  function parseTime(text) {
    let h, mi, m = text.match(/(\d{1,2}):(\d{2})/);
    if (m) { h = +m[1]; mi = +m[2]; }
    else {
      m = text.match(/(오전|오후|아침|낮|저녁)?\s*(\d{1,2})\s*시(?!간|청|장|내)\s*(반|(\d{1,2})\s*분)?/);
      if (!m) {
        const m2 = text.toLowerCase().match(/(\d{1,2})\s*(am|pm)/);
        if (!m2) return null;
        h = (+m2[1]) % 12 + (m2[2] === "pm" ? 12 : 0); mi = 0;
      } else {
        h = +m[2]; mi = m[3] === "반" ? 30 : +(m[4] || 0);
        if (["오후", "저녁", "낮"].includes(m[1]) && h < 12) h += 12;
        else if (!m[1] && h >= 1 && h <= 7) h += 12;
      }
    }
    if (!(h >= 0 && h <= 23 && mi >= 0 && mi < 60)) return null;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  const kinds = (ids) => Object.fromEntries(ids.filter((i) => PLACES[i]).map((i) => [i, PLACES[i].type === "식당" ? "lunch" : PLACES[i].type === "카페" ? "cafe" : "sight"]));
  function keep(c, ids, drop) {
    const k = kinds(ids);
    c.must = ids.filter((i) => k[i] === "sight" && !drop.has(i));
    const lunch = ids.find((i) => k[i] === "lunch") || null;
    c.lunch = lunch && !drop.has(lunch) ? lunch : null;
    if (c.cap == null) c.cap = ids.length || null;
  }
  const uniq = (a) => [...new Set(a)];
  function applyEdit(c0, ids, text = "", action = "", target = null) {
    const c = JSON.parse(JSON.stringify(c0)), ko = c.lang === "ko";
    const nm = (pid) => PLACES[pid] ? (ko ? PLACES[pid].name_ko : PLACES[pid].name_en || PLACES[pid].name_ko) : "";
    const low = text.toLowerCase(), k = kinds(ids);
    let act = action;
    if (!act && text) {
      const idx = findIndex(text, ids.length);
      const pid = target || (idx != null ? ids[idx] : null) || findPlace(text, ids);
      const hasTime = parseTime(text), hasDate = parseDate(text);
      if (rx(E.NEARBY).test(low) && /보여|어디|알려|근처|찾|show|where|near/.test(low) && !rx(E.REMOVE).test(low)) act = "nearby";
      else if ((hasDate || hasTime) && /바꿔|로\b|으로|출발|시작|가요|갈래|갈게|변경|옮겨|미뤄|당겨|에\s|start|leave|move|change|$/.test(text)) { act = "set_when"; target = null; }
      else if (rx(E.UPHILL).test(low) && rx(E.REMOVE + "|" + E.REPLACE + "|없는|피해|avoid").test(low)) act = "remove_uphill";
      else if (rx(E.RELAX).test(low) && !(pid && ids.includes(pid))) act = "relax";
      else if (rx(E.LUNCH).test(low) && rx(E.REPLACE + "|" + E.REMOVE).test(low) && !(pid && ids.includes(pid) && k[pid] !== "lunch")) act = "replace_lunch";
      else if (rx(E.INDOOR).test(low)) act = "indoor";
      else if (rx(E.FLAT).test(low)) act = "flat";
      else if (rx(E.CAFE).test(low) && rx(E.ADD + "|중간|쉬").test(low) && !(pid && k[pid] !== "cafe" && rx(E.REMOVE).test(low))) act = "add_cafe";
      else if (pid && rx(E.REPLACE).test(low) && ids.includes(pid)) { act = "replace"; target = pid; }
      else if (pid && rx(E.REMOVE).test(low)) { act = "remove"; target = pid; }
      else if (pid && rx(E.ADD).test(low)) { act = "add"; target = pid; }
      else if (hasDate || hasTime) act = "set_when";
      else act = "none";
    }
    let reply = "", changed = true;
    if (act === "remove" && ids.includes(target)) {
      const kind = k[target];
      keep(c, ids, new Set([target])); c.exclude = uniq([...c.exclude, target]); c.cap = Math.max(2, (c.cap || ids.length) - 1);
      if (kind === "lunch") c.skip_lunch = true;
      if (kind === "cafe") c.rest = false;
      reply = ko ? `${josa(nm(target), "을를")} 뺐어요. 남은 곳의 시간을 다시 맞췄어요.` : `Removed ${nm(target)} and re-timed the rest.`;
    } else if (act === "remove" && target) {
      changed = false; reply = ko ? `${josa(nm(target), "은는")} 지금 코스에 없어요.` : `${nm(target)} isn't in the course.`;
    } else if (act === "replace" && ids.includes(target)) {
      keep(c, ids, new Set([target])); c.exclude = uniq([...c.exclude, target]);
      if (k[target] === "cafe") c.rest = true;
      reply = ko ? `${nm(target)} 대신 다른 곳을 넣었어요.` : `Swapped ${nm(target)} for another stop.`;
    } else if (act === "replace_lunch") {
      const cur = ids.find((i) => k[i] === "lunch") || null;
      keep(c, ids, new Set(cur ? [cur] : [])); if (cur) c.exclude = uniq([...c.exclude, cur]); c.skip_lunch = false;
      reply = ko ? (cur ? `점심을 ${nm(cur)} 말고 다른 식당으로 바꿨어요.` : "점심 식당을 넣었어요.") : "Changed the lunch spot.";
    } else if (act === "remove_uphill") {
      const hilly = ids.filter((i) => ["완만한경사", "급경사"].includes(PLACES[i].walk_load) || (!["식당", "카페"].includes(PLACES[i].type) && PLACES[i].walk_load === "확인 전"));
      keep(c, ids, new Set(hilly)); c.exclude = uniq([...c.exclude, ...hilly]); c.flat_only = true;
      reply = ko ? (hilly.length ? `오르막이 있는 ${josa(hilly.map(nm).join(", "), "을를")} 빼고 평지 위주로 다시 짰어요.` : "지금 코스에는 오르막 있는 곳이 없어요. 평지만 쓰도록 맞춰 뒀어요.")
        : (hilly.length ? `Removed uphill stops (${hilly.map(nm).join(", ")}).` : "No uphill stops in this course.");
    } else if (act === "flat") {
      const hilly = ids.filter((i) => PLACES[i].walk_load !== "평지" && k[i] === "sight");
      keep(c, ids, new Set(hilly)); c.flat_only = true; c.move = uniq([...c.move, "오래 걷기 어려움"]).sort();
      reply = ko ? (hilly.length ? "덜 걷도록 평지 코스로 바꿨어요." : "지금 코스는 이미 평지 위주예요. 앞으로도 평지만 고를게요.") : "Switched to flat, shorter walks.";
    } else if (act === "indoor") {
      const out = ids.filter((i) => k[i] === "sight" && !PLACES[i].indoor);
      keep(c, ids, new Set(out)); c.rain = true;
      reply = ko ? "비가 와도 괜찮게 실내 위주로 바꿨어요." : "Switched to indoor stops for the rain.";
    } else if (act === "relax") {
      const sights = ids.filter((i) => k[i] === "sight");
      if (sights.length <= 1) { changed = false; reply = ko ? "이미 한 곳만 남아 있어서 더 뺄 곳이 없어요." : "Only one stop left."; }
      else {
        const order = { "급경사": 3, "완만한경사": 2, "확인 전": 1, "평지": 0 };
        const key = (i) => [order[PLACES[i].walk_load] ?? 1, PLACES[i].stay_min];
        const drop = sights.reduce((a, b) => { const ka = key(a), kb = key(b); return (kb[0] > ka[0] || (kb[0] === ka[0] && kb[1] > ka[1])) ? b : a; });
        keep(c, ids, new Set([drop])); c.exclude = uniq([...c.exclude, drop]); c.cap = Math.max(2, (c.cap || ids.length) - 1);
        reply = ko ? `여유 있게 ${josa(nm(drop), "을를")} 빼고 시간을 다시 맞췄어요.` : `Dropped ${nm(drop)} for a slower pace.`;
      }
    } else if (act === "add_cafe") {
      keep(c, ids, new Set()); c.rest = true;
      const has = ids.some((i) => k[i] === "cafe");
      if (!has) c.cap = (c.cap || ids.length) + 1;
      reply = ko ? (has ? "이미 쉬어 갈 카페가 들어 있어요. 다른 카페가 좋으면 '카페 다른 곳으로'라고 해 주세요." : "중간에 쉬어 갈 카페를 넣었어요.") : "Added a café break.";
      changed = !has;
    } else if (act === "add" && ids.includes(target)) {
      changed = false; reply = ko ? `${josa(nm(target), "은는")} 이미 코스에 들어 있어요.` : `${nm(target)} is already in the course.`;
    } else if (act === "add" && PLACES[target]) {
      keep(c, ids, new Set()); c.must = uniq([...c.must, target]); c.exclude = c.exclude.filter((i) => i !== target); c.cap = (c.cap || ids.length) + 1;
      reply = ko ? `${josa(nm(target), "을를")} 넣었어요.` : `Added ${nm(target)}.`;
    } else if (act === "set_when") {
      let d = text ? parseDate(text) : null, tm = text ? parseTime(text) : null;
      if (action === "set_when" && target) { const parts = target.split(/\s+/); d = parts.find((x) => x.includes("-")) || d; tm = parts.find((x) => x.includes(":")) || tm; }
      keep(c, ids, new Set());
      if (d) c.date = d;
      if (tm) c.start_time = tm;
      if (!(d || tm)) { changed = false; reply = ko ? "날짜나 시간을 알아듣지 못했어요. 예: '토요일 오전 10시'" : "I couldn't read the date or time."; }
      else {
        const day = c.date || kstNow().date, [, mo, dd] = day.split("-").map(Number);
        reply = ko ? `${mo}월 ${dd}일(${WD_KO[weekdayOf(day)]}) ${c.start_time} 출발로 바꿨어요. 쉬는 날·브레이크타임을 다시 확인했어요.` : `Moved to ${day} ${c.start_time}. Closed spots were replaced.`;
      }
    } else if (act === "nearby") {
      changed = false; reply = ko ? "코스 카드마다 가장 가까운 공영주차장·전동휠체어 충전기를 펼쳐 놨어요." : "I opened the nearest parking and chargers on each card.";
    } else {
      act = "none"; changed = false;
      reply = ko ? "이렇게 말해 보세요: '2번 빼줘', '점심 다른 곳으로', '비 오는데 실내로', '덜 걷는 평지로', '토요일 오후 1시로'"
        : "Try: 'remove stop 2', 'change lunch', 'indoor for rain', 'flatter route', 'Saturday 1pm'.";
    }
    return { action: act, target, conditions: c, reply, changed };
  }
  function diffReply(before, after, skipped, ko) {
    const nw = after.filter((i) => !before.includes(i)); let s = "";
    if (nw.length) { const names = nw.map((i) => ko ? PLACES[i].name_ko : PLACES[i].name_en || PLACES[i].name_ko).join(", "); s += ko ? ` 새로 들어간 곳: ${names}.` : ` New: ${names}.`; }
    if (skipped.length && ko) s += " " + skipped.map((x) => `${josa(x.name, "은는")} ${x.reason}라서 뺐어요.`).join(" ");
    return s;
  }
  function runEdit(c, ids, text = "", action = "", target = null) {
    ids = ids.filter((i) => PLACES[i]);
    const r = applyEdit(c, ids, text, action, target);
    let c2 = r.conditions;
    if (!r.changed && ids.length) keep(c2, ids, new Set());
    let res = plan(PLACES, c2, !!c2.rain), reply = r.reply, changed = r.changed;
    if (r.action === "add" && changed && !res.stops.some((s) => s.id === r.target)) {
      const p = PLACES[r.target];
      c2 = JSON.parse(JSON.stringify(c)); keep(c2, ids, new Set());
      res = plan(PLACES, c2, !!c2.rain); changed = false;
      const hard = (["급경사", "완만한경사"].includes(p.walk_load) || p.segments.some((sg) => (sg.steps || 0) > 0)) ? "계단·경사가 있어" : "길이 험해";
      reply = c.lang === "ko" ? `${josa(p.name_ko, "은는")} ${hard} 지금 이동 조건(${c.move.join(", ") || "없음"})으로는 넣지 못했어요. 코스는 그대로 뒀어요.`
        : `I couldn't add ${p.name_en || p.name_ko} with your mobility needs. The course is unchanged.`;
    } else if (changed) {
      reply += diffReply(ids, res.stops.map((s) => s.id), res.skipped, c.lang === "ko");
      if (c.lang === "ko") reply += res.notes.filter((n) => n.startsWith("점심 전까지") || n.startsWith("점심때까지")).map((n) => " " + n).join("");
    }
    return { c: c2, res, reply, action: r.action, target: r.target, changed };
  }

  // ---------- llm.py 규칙 경로 ----------
  const RAIN = /비\s*(가|와|오|온|올|옵|예보|소식|내)|우천|우산|소나기|rain/i;
  const KW = { "휠체어": "휠체어", "유모차": "유모차", "계단": "계단 어려움", "걷기": "오래 걷기 어려움", wheelchair: "휠체어", stroller: "유모차" };
  const parseConditions = (text) => ({ move: [...new Set(Object.entries(KW).filter(([k]) => text.toLowerCase().includes(k)).map(([, v]) => v))].sort(), rain: RAIN.test(text) });
  function chatEdit(message, candidates) {
    const s = message.replace(/ /g, "");
    const named = Object.entries(candidates).filter(([, n]) => s.includes(n.replace(/ /g, "").slice(0, 4))).map(([id]) => id);
    if (named.length && /빼|제외|remove/i.test(s)) return { action: "remove", place_id: named[0] };
    if (RAIN.test(message)) return { action: "rain" };
    if (/덜걷|걷기|힘들|walk/i.test(s)) return { action: "less_walk" };
    if (named.length) return { action: "add", place_id: named[0] };
    return { action: "none" };
  }

  // ---------- main.py ----------
  const defaults = () => ({ who: "혼자", move: [], style: [], days: "당일", start: "동해역", memo: "", rain: null, wish: [], must: [], lang: "ko",
    date: null, start_time: "10:00", meal: [], exclude: [], cap: null, rest: null, flat_only: false, lunch: null, skip_lunch: false });
  const cond = (c) => { const o = { ...defaults(), ...(c || {}) }; for (const k of ["move", "style", "wish", "must", "meal", "exclude"]) o[k] = o[k] || []; if (!o.start_time) o.start_time = "10:00"; return o; };
  const extras = (p, lang = "ko") => ({
    stories: stories(p.lat, p.lon), trail_info: trails(p.trails), info_center: p.lat != null ? (infoCenters(p.lat, p.lon, lang, 1)[0] || null) : null,
    parking_near: parkingNear(p.lat, p.lon), taxi: taxiFor(p.id), signals: signalsNear(p.lat, p.lon), charger: chargers(p.lat, p.lon, 1)[0] || null,
    park: parksNear(p.lat, p.lon), events_here: eventsNear(p.lat, p.lon), hours: p.hours, closed_days: p.closed_days, fee: p.fee });
  const STOP_KEYS = ["walk_load", "wheelchair", "entrance_step", "table", "benches", "carer_tip", "indoor", "soft_menu", "parking_easy", "hours_source", "access_source", "sample", "type"];
  const stopInfo = (p, lang, wd, at) => ({ ...Object.fromEntries(STOP_KEYS.map((k) => [k, p[k] ?? null])), nearby: nearby(p, lang, wd, at) });
  function stayHint(result, c) {
    if (c.days !== "1박 2일" || !result.stops.length) return null;
    const zone = PLACES[result.stops[result.stops.length - 1].id].zone;
    return { zone, zone_name: (c.lang === "en" ? ZONE_EN : ZONE_KO)[zone] || zone, ...lodging(zone, 5) };
  }
  function moveHint(result, c) {
    if (c.start === "자가용") return null;
    const ids = result.stops.map((s) => s.id), xy = STARTS[c.start];
    return { taxi: taxiAtStart(c.start), city_tour: cityTour(ids), rentals: rentalsNear(xy[0], xy[1]), mobility_center: c.move.includes("휠체어") ? mobilityCenter() : null };
  }
  function coursePayload(result, c, rain, summary = "") {
    for (const s of result.stops) if (!s.why) { const p = PLACES[s.id]; s.why = c.lang === "ko" ? p.tip_ko : (p.tip_en || p.tip_ko); }
    const onDay = eventsOn(result.date);
    return { course: result, rain, summary, conditions: c,
      extras: Object.fromEntries(result.stops.map((s) => { const p = PLACES[s.id];
        return [s.id, { phone: p.phone, address: p.address, ...extras(p, c.lang), ...stopInfo(p, c.lang, result.weekday, mins(s.arrive)) }]; })),
      stay: stayHint(result, c), events: onDay.length ? onDay : events().upcoming.slice(0, 3), events_on_day: onDay.length > 0, move: moveHint(result, c) };
  }
  function course(body) {
    const c = cond(body);
    if (c.memo) {
      const ex = parseConditions(c.memo);
      c.move = [...new Set([...c.move, ...ex.move])].filter((m) => m !== "없어요").sort();
      if (c.rain == null && ex.rain) c.rain = true;
    }
    const rain = c.rain != null ? c.rain : false;
    const result = plan(PLACES, c, rain);
    for (const s of result.stops) s.why = c.lang === "ko" ? PLACES[s.id].tip_ko : PLACES[s.id].tip_en;
    return coursePayload(result, c, rain);
  }
  function edit(body) {
    const r = runEdit(cond(body.conditions), body.course_ids || [], (body.text || "").slice(0, 300), body.action || "", body.target || null);
    return { ...coursePayload(r.res, r.c, !!r.c.rain), reply: r.reply, action: r.action, target: r.target, changed: r.changed, via: "rule" };
  }

  // ---------- talk.py 규칙 경로 ----------
  const WHO = ["혼자", "연인·친구", "부모님과", "아이와", "단체"], MOVE = ["휠체어", "오래 걷기 어려움", "계단 어려움", "유모차"], STYLE = ["바다 보기", "자연·산책", "카페", "맛집", "역사·문화"];
  const HELP_KW = [["charger", /충전|charg/], ["mobility_van", /휠체어\s*(차|택시|콜)|이동지원|장애인\s*콜|wheelchair (van|taxi)/],
    ["info_center", /안내소|통역|외국어|interpret|info\w*\s*(center|centre|desk)|information/], ["city_tour", /시티\s*투어|버스|city tour|bus/],
    ["events", /행사|축제|공연|festival|event/], ["lodging", /숙소|숙박|호텔|펜션|게스트|hotel|stay/], ["restaurants", /식당|밥집|맛집|먹을|restaurant/],
    ["parking", /주차|parking/], ["taxi", /택시|taxi/], ["hospital_pharmacy", /약국|병원|아파|다쳤|응급|pharmacy|hospital/]];
  const WHO_KW = [["부모님과", /부모|엄마|아빠|어머니|아버지|할머니|할아버지|parents?|mom|dad/], ["아이와", /아이|아기|애기|딸|아들|kid|child|baby/],
    ["연인·친구", /친구|연인|여자친구|남자친구|friend/], ["단체", /단체|동아리|회사|group/], ["혼자", /혼자|alone|solo/]];
  const MOVE_KW = [["휠체어", /휠체어|wheelchair/], ["유모차", /유모차|stroller|pram/], ["계단 어려움", /계단/],
    ["오래 걷기 어려움", /무릎|오래\s*못\s*걷|걷기\s*(힘|어려)|다리가?\s*(아프|불편)|지팡이|walk/]];
  const STYLE_KW = [["바다 보기", /바다|해변|sea|beach/], ["자연·산책", /자연|산책|계곡|숲|nature/], ["카페", /카페|커피|cafe/],
    ["맛집", /맛집|회|먹|food/], ["역사·문화", /역사|문화|절|유적|history|culture/]];
  const NO_MOVE = /없어요|없음|괜찮|문제\s*없|다\s*잘\s*걸|no one|none|we're fine|no$/, GO = /코스|짜\s*줘|추천|만들어|plan|course|go$/;
  const ZONE_KW = [["mukho", /묵호|도째비/], ["chuam", /추암|촛대/], ["mureung", /무릉|삼화/], ["mangsang", /망상/], ["cheongok", /천곡|동굴/]];
  const SAY = {
    ko: { ask_who: "누구랑 오셨어요? 편하게 말씀해 주세요.", ask_move: "혹시 휠체어, 유모차를 쓰시거나 오래 걷기 힘든 분이 계세요? 없으면 '없어요'라고 해 주세요.",
      made: "조건에 맞춰 {n}곳으로 코스를 짰어요.{caution} 바꾸고 싶은 게 있으면 말씀해 주세요.", remade: "말씀하신 대로 코스를 다시 짰어요.{caution}",
      caution: " 주의할 곳이 {k}곳 있으니 카드를 확인해 주세요.", help: "찾아봤어요. 아래 카드를 확인해 주세요.",
      none: "비, 덜 걷기, 장소 넣기·빼기를 말씀해 주시거나 충전기·안내소·숙소 같은 걸 물어봐 주세요." },
    en: { ask_who: "Who are you travelling with?", ask_move: "Does anyone use a wheelchair or stroller, or find long walks hard? If not, just say 'none'.",
      made: "I planned {n} stops for you.{caution} Tell me if you'd like any changes.", remade: "Done — I re-planned the course.{caution}",
      caution: " {k} of them need care — please check the cards.", help: "Here's what I found — see the cards below.",
      none: "Tell me about rain, less walking, or a place to add or remove — or ask about chargers, info centers or places to stay." } };
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);

  function talk(body) {
    let c = cond(body.conditions); const state = { ...(body.state || {}) };
    let courseIds = [...(body.course_ids || [])], crs = null; const cards = [];
    const lat0 = body.lat || 37.5245, lon0 = body.lon || 129.1143;
    const L = SAY[c.lang] || SAY.ko, message = (body.message || "").trim().slice(0, 500), low = message.toLowerCase();
    const setRes = (res) => { crs = res; courseIds = res.stops.map((s) => s.id); };
    const result = (reply) => {
      const out = { reply, pose: crs ? "happy" : (reply.trimEnd().endsWith("?") ? "ask" : "neutral"), via: "rule", conditions: c, state, course: crs, cards };
      if (crs) { const pl = coursePayload(crs, c, !!c.rain); for (const k of ["extras", "stay", "events", "events_on_day", "move"]) out[k] = pl[k]; }
      return out; };
    const made = (again) => { const k = crs.stops.filter((s) => s.grade && s.grade !== "G").length;
      const dropped = crs.notes.filter((n) => n.includes("담아"));
      return fmt(L[again ? "remade" : "made"], { n: crs.stops.length, caution: k ? fmt(L.caution, { k }) : "" }) + (dropped.length && c.lang === "ko" ? " " + dropped[0] : ""); };
    function findHelp(kind, zone) {
      let lat = lat0, lon = lon0;
      if (courseIds.length && PLACES[courseIds[0]].lat) { lat = PLACES[courseIds[0]].lat; lon = PLACES[courseIds[0]].lon; }
      zone = zone || (courseIds.length ? PLACES[courseIds[courseIds.length - 1]].zone : "mukho");
      const f = { info_center: () => infoCenters(lat, lon, c.lang, 2), charger: () => chargers(lat, lon, 2), mobility_van: () => mobilityCenter(),
        city_tour: () => cityTour(courseIds), events: () => events().upcoming.slice(0, 3), lodging: () => lodging(zone, 5),
        restaurants: () => restaurants(zone, null, 5), parking: () => parkingNear(lat, lon, 3000, 2),
        taxi: () => { const x = courseIds.flatMap((pid) => taxiFor(pid)).slice(0, 2); return x.length ? x : taxiAtStart(c.start); },
        hospital_pharmacy: () => ({ say: "화면 위 '안심' 버튼에서 지금 문 연 약국·병원과 응급실을 보여 드려요. 위급하면 119." }) }[kind];
      cards.push({ kind, data: f ? f() : { error: "모르는 종류" } });
    }
    if (/아파|다쳤|응급|쓰러/.test(message)) {
      findHelp("hospital_pharmacy");
      return result(c.lang === "ko" ? "많이 놀라셨죠. 위급하면 바로 119에 전화해 주세요. 화면 위 '안심' 버튼에서 가까운 병원·약국을 보여 드려요."
        : "If it's an emergency, call 119 now. Tap 'Safety' at the top for nearby hospitals and pharmacies.");
    }
    for (const [kind, pat] of HELP_KW) if (pat.test(low)) {
      const z = ZONE_KW.find(([, pz]) => pz.test(message)); findHelp(kind, z ? z[0] : null); return result(L.help);
    }
    if (courseIds.length) {
      const r = applyEdit(c, courseIds.filter((i) => PLACES[i]), message);
      if (r.action === "nearby") { findHelp("parking"); findHelp("charger"); return result(r.reply); }
      if (r.action !== "none") {
        const e = runEdit(c, courseIds, message, r.action, r.target);
        c = e.c; setRes(e.res); return result(e.reply);
      }
    }
    const who = (WHO_KW.find(([, p]) => p.test(low)) || [null])[0];
    const move = MOVE_KW.filter(([, p]) => p.test(low)).map(([m]) => m);
    const style = STYLE_KW.filter(([, p]) => p.test(low)).map(([s]) => s);
    if (who && WHO.includes(who)) { c.who = who; state.who_known = true; }
    if (move.length) { c.move = [...new Set([...c.move, ...move])].sort(); state.move_known = true; }
    if (!move.length && NO_MOVE.test(low)) { c.move = []; state.move_known = true; }
    if (style.length) c.style = style;
    if (/1박|하룻밤|overnight/.test(low)) c.days = "1박 2일";
    const start = /묵호역|mukho st/.test(low) ? "묵호역" : /동해역|donghae st/.test(low) ? "동해역" : /차로|자가용|운전|by car|driving/.test(low) ? "자가용" : null;
    if (start) c.start = start;
    if (RAIN.test(message)) c.rain = true;
    if (!state.who_known && !who && !courseIds.length) return result(L.ask_who);
    if (!state.move_known) return result(L.ask_move);
    if (!courseIds.length || GO.test(low) || who || move.length || style.length) { setRes(plan(PLACES, c, !!c.rain)); return result(made(false)); }
    return result(L.none);
  }

  function safety(lat, lon, lang) {
    return { sample: true, places: [
      { name: lang === "en" ? "○○ Pharmacy (sample)" : "○○약국 (예시)", kind: "약국", until: "21:00", dist_m: 350, tel: "033-000-0000" },
      { name: lang === "en" ? "△△ Clinic (sample)" : "△△의원 (예시)", kind: "의원", until: "18:00", dist_m: 800, tel: "033-000-0000" },
      { name: lang === "en" ? "Local ER (sample)" : "지역 응급실 (예시)", kind: "응급실", until: "24시간", dist_m: 2100, tel: "033-000-0000" }],
      help: infoCenters(lat, lon, lang, 2), chargers: chargers(lat, lon, 2), mobility_center: mobilityCenter() };
  }

  // ---------- cms.py (관리자 페이지 관리) — 데모는 이 브라우저에만 저장 ----------
  const DEMO_ID = "admin", DEMO_PW = "gildongmu2026", DEMO_TOKEN = "demo-session";
  const CMS_EMPTY = () => ({ overrides: {}, segments: {}, notices: [], banner: null, events: [], history: [] });
  const NONE = "__없음__";
  const CMS_FIELDS = { open: "str", close: "str", break_time: "list", closed_day_nums: "ints", last_entry: "str", stay_min: "int", phone: "str", fee: "str",
    intro_ko: "str", tip_ko: "str", carer_tip: "str", walk_load: "str", wheelchair: "str", entrance_step: "bool", table: "str", indoor: "bool", benches: "bool",
    soft_menu: "bool", parking_easy: "bool" };
  const ACCESS = new Set(["walk_load", "wheelchair", "entrance_step", "table", "indoor", "benches", "segments"]);
  function cmsLoad() { try { return { ...CMS_EMPTY(), ...JSON.parse(localStorage.getItem("gd-cms") || "{}") }; } catch { return CMS_EMPTY(); } }
  function cmsSave(db) { try { localStorage.setItem("gd-cms", JSON.stringify(db)); } catch { /* 저장 불가 */ } rebuild(); }
  const nowIso = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + "+09:00";
  const hid = () => Math.random().toString(16).slice(2, 12);
  function cmsLog(db, action, target, before, after, reason = "") {
    const h = { id: hid(), at: nowIso(), who: "admin", action, target, before, after, reason: reason.slice(0, 300), reverted: false };
    db.history = [h, ...db.history].slice(0, 500); return h;
  }
  function clean(f, v) {
    const k = CMS_FIELDS[f];
    if (v === "" || v == null) return null;
    if (k === "int") return parseInt(v, 10);
    if (k === "bool") return typeof v === "boolean" ? v : ["true", "1", "예", "있음", "yes"].includes(String(v).toLowerCase());
    if (k === "ints") return [...new Set(v.map((x) => +x).filter((x) => x >= 0 && x <= 6))].sort();
    if (k === "list") return v.length ? v.slice(0, 2).map(String) : null;
    return String(v).slice(0, 500);
  }
  function segClean(sg) {
    const o = {};
    for (const k of ["name", "distance_m", "steps", "alt_route", "curb_cm", "slope_deg", "width_m", "surface", "note", "source"]) {
      let v = sg[k]; if (v === "" || v == null) continue;
      if (["distance_m", "curb_cm", "slope_deg", "width_m"].includes(k)) v = +v; else if (k === "steps") v = parseInt(v, 10); else if (k === "alt_route") v = !!v; else v = String(v).slice(0, 200);
      o[k] = v;
    }
    return o;
  }
  const SEG_DEFAULT = { distance_m: null, steps: 0, alt_route: false, curb_cm: null, slope_deg: null, width_m: null, surface: null, note: "", source: "" };
  function rebuild() {
    for (const k of Object.keys(PLACES)) delete PLACES[k];
    for (const p of JSON.parse(BASE)) PLACES[p.id] = p;
    const db = cmsLoad();
    for (const [pid, ov] of Object.entries(db.overrides)) {
      const p = PLACES[pid]; if (!p) continue;
      for (const [f, v] of Object.entries(ov)) if (v != null && CMS_FIELDS[f]) p[f] = v;
      if (["open", "close", "break_time", "closed_day_nums"].some((f) => f in ov)) { p.hours_source = "관리자 확인"; p.hours = hoursText(p, "ko"); }
      if (Object.keys(ov).some((f) => ACCESS.has(f))) p.access_source = "관리자 확인";
    }
    for (const [pid, segs] of Object.entries(db.segments)) if (PLACES[pid]) PLACES[pid].segments = segs.map((sg) => ({ ...SEG_DEFAULT, ...sg }));
    for (const p of Object.values(PLACES)) p.notices = db.notices.filter((n) => n.place_id === p.id);
  }
  function noticeOn(p, level, day) {
    return (p.notices || []).find((n) => n.level === level && (!n.start || n.start <= day) && (!n.end || day <= n.end)) || null;
  }
  function cmsSetPlace(pid, fields, segments, reason) {
    const touched = [...Object.keys(fields).filter((f) => CMS_FIELDS[f]), ...(segments != null ? ["segments"] : [])];
    if (touched.some((f) => ACCESS.has(f)) && reason.trim().length < 4) throw new Error("400:걷기·휠체어·구간 정보를 바꿀 때는 근거(측정값, 확인한 날짜 등)를 적어 주세요.");
    const db = cmsLoad(), ov = (db.overrides[pid] = db.overrides[pid] || {});
    const cur = PLACES[pid];
    const before = Object.fromEntries(touched.map((f) => [f, cur[f] ?? null]));
    const prev = Object.fromEntries(touched.filter((f) => f !== "segments").map((f) => [f, f in ov ? ov[f] : NONE]));
    if (segments != null) prev.segments = pid in db.segments ? db.segments[pid] : NONE;
    for (const f of Object.keys(fields)) if (CMS_FIELDS[f]) ov[f] = clean(f, fields[f]);
    if (segments != null) db.segments[pid] = segments.filter((sg) => sg.name).map(segClean);
    const after = { ...Object.fromEntries(touched.filter((f) => f !== "segments").map((f) => [f, ov[f] ?? null])), ...(segments != null ? { segments: db.segments[pid] } : {}) };
    const h = cmsLog(db, "place", pid, before, after, reason); h.prev = prev;
    cmsSave(db); return h;
  }
  function cmsAddNotice(n, reason = "") {
    if (!["closed", "warn", "info"].includes(n.level)) throw new Error("400:알림 종류를 골라 주세요.");
    if (!(n.title || "").trim()) throw new Error("400:알림 제목을 적어 주세요.");
    const rec = { id: hid(), place_id: n.place_id || null, level: n.level, title: n.title.slice(0, 80), body: (n.body || "").slice(0, 500),
      start: n.start || null, end: n.end || null, from_report: n.from_report || null, created_at: nowIso() };
    const db = cmsLoad(); db.notices = [rec, ...db.notices]; cmsLog(db, "notice_add", rec.id, null, rec, reason); cmsSave(db); return rec;
  }
  function cmsRevert(id) {
    const db = cmsLoad(), h = db.history.find((x) => x.id === id);
    if (!h || h.reverted) throw new Error("400:되돌릴 수 없는 이력이에요.");
    const a = h.action;
    if (a === "place") {
      const ov = (db.overrides[h.target] = db.overrides[h.target] || {});
      for (const [f, v] of Object.entries(h.prev || {})) {
        const box = f === "segments" ? db.segments : ov, key = f === "segments" ? h.target : f;
        if (v === NONE) delete box[key]; else box[key] = v;
      }
    } else if (a === "notice_add") db.notices = db.notices.filter((n) => n.id !== h.target);
    else if (a === "notice_remove") db.notices = [h.before, ...db.notices];
    else if (a === "banner") db.banner = h.before;
    else if (a === "event_add") db.events = db.events.filter((e) => e.id !== h.target);
    else if (a === "event_remove") db.events = [...db.events, h.before];
    else throw new Error("400:되돌릴 수 없는 이력이에요.");
    h.reverted = true; cmsLog(db, "revert", id, null, null, `${a} 되돌림`); cmsSave(db); return h;
  }
  function cmsAdmin(method, path, q, body) {
    if (path === "/api/admin/login-info") return { demo: true, id: DEMO_ID, password: DEMO_PW };
    if (path === "/api/admin/login") { if (body.id === DEMO_ID && body.password === DEMO_PW) return { token: DEMO_TOKEN, hours: 12 }; throw new Error("401:아이디나 비밀번호가 맞지 않아요"); }
    if (path === "/api/admin/logout") return { ok: true };
    if ((q.__token || "") !== DEMO_TOKEN) throw new Error("401:다시 로그인해 주세요");
    const db = cmsLoad();
    if (path === "/api/admin/cms" || path === "/api/admin/backup") return db;
    let m;
    if ((m = path.match(/^\/api\/admin\/places\/(.+)$/))) { if (!PLACES[m[1]]) throw new Error("404:알 수 없는 장소예요"); return cmsSetPlace(m[1], body.fields || {}, body.segments ?? null, body.reason || ""); }
    if (path === "/api/admin/notices") return cmsAddNotice(body, body.reason || "");
    if ((m = path.match(/^\/api\/admin\/notices\/(.+)\/delete$/))) { const old = db.notices.find((n) => n.id === m[1]); if (!old) return { ok: false };
      db.notices = db.notices.filter((n) => n.id !== m[1]); cmsLog(db, "notice_remove", m[1], old, null); cmsSave(db); return { ok: true }; }
    if (path === "/api/admin/banner") { const old = db.banner; db.banner = !(body.text || "").trim() ? null : { text: body.text.slice(0, 200), level: ["closed", "warn", "info"].includes(body.level) ? body.level : "info", until: body.until || null };
      cmsLog(db, "banner", "site", old, db.banner); cmsSave(db); return { banner: db.banner }; }
    if (path === "/api/admin/events") { if (!(body.name && body.start)) throw new Error("400:행사 이름과 시작일을 적어 주세요.");
      const rec = { id: hid(), name: body.name.slice(0, 80), start: body.start, end: body.end || body.start, venue: body.venue || "", tel: body.tel || "", url: body.url || "", kind: body.kind || "행사", access: body.access || "", added_by_admin: true };
      db.events = [...db.events, rec]; cmsLog(db, "event_add", rec.id, null, rec); cmsSave(db); return rec; }
    if ((m = path.match(/^\/api\/admin\/events\/(.+)\/delete$/))) { const old = db.events.find((e) => e.id === m[1]); if (!old) return { ok: false };
      db.events = db.events.filter((e) => e.id !== m[1]); cmsLog(db, "event_remove", m[1], old, null); cmsSave(db); return { ok: true }; }
    if ((m = path.match(/^\/api\/admin\/history\/(.+)\/revert$/))) return cmsRevert(m[1]);
    if (path === "/api/admin/restore") { const keep = { ...CMS_EMPTY(), ...body, history: db.history }; cmsLog(keep, "restore", "all", null, null, "백업 파일로 복원"); cmsSave(keep); return { ok: true }; }
    if (path === "/api/admin/reset") { const keep = { ...CMS_EMPTY(), history: db.history }; cmsLog(keep, "reset", "all", null, null, body.reason || "전체 초기화"); cmsSave(keep); return { ok: true }; }
    return undefined;
  }
  function cmsSite() {
    const db = cmsLoad(), day = kstNow().date;
    const b = db.banner && (!db.banner.until || db.banner.until >= day) ? db.banner : null;
    return { banner: b, notices: db.notices.filter((n) => !n.place_id && (!n.start || n.start <= day) && (!n.end || day <= n.end)) };
  }

  // ---------- pages.py (v4 페이지) ----------
  const TOILETS = DATA.toilets || [], ST = DATA.static || {};
  function toiletsNear(lat, lon, radius = 1500, limit = 2) {
    if (lat == null) return [];
    const out = [], seen = new Set();
    const xs = TOILETS.filter((t) => t.lat).map((t, i) => [t, distM(lat, lon, t.lat, t.lon), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    for (const [t, d] of xs) {
      const k = t.lat + "," + t.lon;
      if (d > radius || seen.has(k)) continue;
      seen.add(k); out.push({ ...t, dist_m: d });
      if (out.length >= limit) break;
    }
    return out;
  }
  function segmentsOf(p, mode) {
    const m = ["wheel", "stroller", "walk"].includes(mode) ? mode : "wheel";
    return p.segments.map((s) => {
      const facts = [];
      if (s.distance_m) facts.push(`${s.distance_m}m`);
      if (s.steps) facts.push(`계단 ${s.steps}개` + (s.alt_route ? " (우회로 있음)" : ""));
      if (s.curb_cm != null) facts.push(`턱 ${s.curb_cm}cm`);
      if (s.slope_deg != null) facts.push(`경사 ${s.slope_deg}°`);
      if (s.width_m != null) facts.push(`폭 ${s.width_m}m`);
      if (s.surface) facts.push(s.surface);
      return { name: s.name, grade: gradeSegment(s, m), facts, note: s.note || "", source: s.source || "",
        measured: [s.steps, s.curb_cm, s.slope_deg, s.width_m, s.surface].some((v) => v != null) };
    });
  }
  function placePage(p, lang, mode) {
    const now = kstNow(), wd = weekdayOf(now.date), at = mins(now.time);
    const [ok, why] = openCheck(p, wd, at, 0);
    const today = why === "closed_day" ? "closed" : why === "always" ? "always" : why === "unknown" ? "unknown" : ok ? "open" : "closed_now";
    return { segments: segmentsOf(p, mode), today, hours_text: hoursText(p, lang), nearby: nearby(p, lang, wd, at), toilets: toiletsNear(p.lat, p.lon),
      last_visit: (adminGet("visits").filter((v) => v.place_id === p.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]) || null };
  }
  // 데모의 관리자 기록은 이 브라우저에만 저장된다 (서버 없음)
  function adminGet(k) { try { return JSON.parse(localStorage.getItem("gd-admin-" + k) || "[]"); } catch { return []; } }
  function adminSet(k, v) { try { localStorage.setItem("gd-admin-" + k, JSON.stringify(v)); } catch { /* 저장 불가 */ } }

  rebuild();
  function handle(method, path, q, body) {
    if (path === "/api/site") return cmsSite();
    if (path.startsWith("/api/admin/") && !path.startsWith("/api/admin/reports") && !path.startsWith("/api/admin/visits")) {
      const r = cmsAdmin(method, path, q, body || {}); if (r !== undefined) return r;
    }
    if (path === "/api/reports") {
      if (!PLACES[body.place_id]) throw new Error("404");
      const rec = { id: Math.random().toString(16).slice(2, 14), place_id: body.place_id, kind: body.kind, note: (body.note || "").slice(0, 300),
        status: "접수", created_at: new Date().toISOString().slice(0, 19), photo: body.photo || null, ai: null };
      adminSet("reports", [...adminGet("reports"), rec]);
      return { ok: true, id: rec.id, ai: null, demo: true };
    }
    if (path === "/api/transport") return ST.transport;
    if (path === "/api/facilities") return ST.facilities;
    if (path === "/api/sources") return { ...ST.sources, ai: { connected: false, demo: true } };
    if (path === "/api/events/all") return { events: events("0000-00-00").upcoming, as_of: ST.events_all.as_of };
    if (path === "/api/lodging") { const items = ST.lodging.items.filter((l) => !q.zone || l.zone === q.zone); return { count: items.length, zone: q.zone || "", accessibility: "확인 전", items: +q.limit ? items.slice(0, +q.limit) : items }; }
    if (path === "/api/admin/reports" && method === "GET") return adminGet("reports").map((r) => ({ ...r, name: PLACES[r.place_id]?.name_ko || r.place_id }));
    if (path.startsWith("/api/admin/reports/")) { const id = path.split("/").pop();
      adminSet("reports", adminGet("reports").map((r) => { if (r.id !== id) return r;
        const out = { ...r, status: body.status || r.status, memo: (body.memo || r.memo || "").slice(0, 300) };
        if (out.status === "반영" && body.notice && body.notice.level) out.notice_id = cmsAddNotice({ ...body.notice, place_id: r.place_id, from_report: id }, `제보 ${id} 반영`).id;
        return out; }));
      return { ok: true }; }
    if (path === "/api/admin/visits" && method === "GET") return adminGet("visits").sort((a, b) => (a.date < b.date ? 1 : -1));
    if (path === "/api/admin/visits") { if (!PLACES[body.place_id]) throw new Error("404"); const rec = { ...body, id: Math.random().toString(16).slice(2, 14), name: PLACES[body.place_id].name_ko }; adminSet("visits", [...adminGet("visits"), rec]); return { ok: true, id: rec.id }; }
    if (path === "/api/places") return Object.values(PLACES).map((p) => ({ ...p, grade: p.verified ? gradePlace(p, q.mode || "none") : null }));
    if (path.startsWith("/api/places/")) { const p = PLACES[decodeURIComponent(path.split("/").pop())]; if (!p) throw new Error("404"); return { ...p, ...extras(p, q.lang || "ko"), ...placePage(p, q.lang || "ko", q.mode || "wheel") }; }
    if (path === "/api/course") return course(body);
    if (path === "/api/talk") return talk(body);
    if (path === "/api/edit") return edit(body);
    if (path === "/api/safety") return safety(+q.lat, +q.lon, q.lang || "ko");
    if (path === "/api/health") return { ok: true, demo: true, places: Object.keys(PLACES).length };
    throw new Error("404 " + path);
  }
  return { handle, plan, talk, course, edit, parseDate, parseTime };
}
