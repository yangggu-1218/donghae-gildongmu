"""한국관광공사 공공 빅데이터 중계 (공공데이터포털 키 DATA_GO_KR_KEY 하나로 모두 호출).

- 이동약자 여행 정보(KorWithService2): 동해시 음식점·카페·숙소·관광지의 이동약자 항목
- 관광지 집중률 방문자 추이 예측(TatsCnctrRateService): 앞으로 30일 붐빔 정도
- 관광지별 연관 관광지(TarRlteTarService): 함께 많이 가는 곳
- 빅데이터 지역별 방문자수(DataLabService): 동해시 일별 방문자 (현지인·외지인·외국인)
- 관광지 오디오 가이드(Odii): 해설 음성
- 관광사진 정보(PhotoGalleryService1): 공공누리 사진

모든 응답은 하루 동안 파일로 저장해 두고 다시 쓴다(호출 한도 보호). 키가 없거나 실패하면 빈 목록을 돌려주고
화면은 그 부분을 숨긴다. 서비스·파라미터 이름은 버전마다 조금씩 달라서 후보를 차례로 시도한다.
"""
import datetime as dt
import hashlib
import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

KEY = os.getenv("DATA_GO_KR_KEY", "")
BASE = "https://apis.data.go.kr/B551011"
APP = {"MobileOS": "ETC", "MobileApp": "gildongmu", "_type": "json"}
CENTER = (37.5245, 129.1143)            # 동해시청 부근
AREA = [("51", "51170"), ("42", "42170"), ("32", "3")]   # (광역, 기초) 코드 후보: 강원특별자치도 동해시
CACHE = Path(os.getenv("CACHE_DIR") or Path(__file__).resolve().parents[2] / "data" / "cache")
KST = dt.timezone(dt.timedelta(hours=9))
LAST: dict[str, dict] = {}              # 서비스별 마지막 호출 결과(관리자 점검용)


# ---------------- 공통 ----------------
def _cache_get(name: str, ttl: int):
    f = CACHE / f"{name}.json"
    try:
        if f.exists() and time.time() - f.stat().st_mtime < ttl:
            return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


def _cache_put(name: str, data) -> None:
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        tmp = CACHE / f"{name}.tmp"
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(CACHE / f"{name}.json")
    except Exception as e:
        print("[bigdata] cache", e)


def _key(*parts) -> str:
    return hashlib.md5(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def _call(path: str, params: dict, tag: str) -> tuple[list[dict], dict]:
    """한 번 호출. (items, 상태) 를 돌려준다. 상태에는 오류 문구나 전체 건수를 담는다."""
    if not KEY:
        return [], {"ok": False, "error": "no key"}
    try:
        r = httpx.get(f"{BASE}/{path}", params={"serviceKey": KEY, **APP, **params}, timeout=8)
        txt = r.text
        try:
            j = r.json()
        except Exception:
            st = {"ok": False, "http": r.status_code, "error": txt[:300]}
            LAST[tag] = {"path": path, "params": params, **st}
            return [], st
        if not isinstance(j, dict):
            j = {}
        resp = j.get("response", j)
        head = resp.get("header", {})
        code = str(head.get("resultCode", ""))
        body = resp.get("body", {}) or {}
        items = body.get("items") or {}
        if isinstance(items, dict):
            items = items.get("item") or []
        if isinstance(items, dict):
            items = [items]
        st = {"ok": code in ("0000", "00", "0") or bool(items), "code": code, "msg": head.get("resultMsg", ""),
              "total": body.get("totalCount"), "n": len(items)}
        LAST[tag] = {"path": path, "params": params, **st, "sample": items[:2], **({} if items else {"raw": txt[:400]})}
        return items, st
    except Exception as e:
        st = {"ok": False, "error": str(e)[:200]}
        LAST[tag] = {"path": path, "params": params, **st}
        return [], st


def _try(cands: list[tuple[str, dict]], tag: str) -> list[dict]:
    """후보 (경로, 파라미터) 를 차례로 시도해 처음으로 결과가 나온 것을 쓴다."""
    for path, params in cands:
        items, st = _call(path, params, tag)
        if items:
            LAST[tag]["used"] = path
            return items
    return []


def _dist(a, b, c, d) -> int:
    p = math.radians
    x = math.sin(p(c - a) / 2) ** 2 + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2
    return int(12742000 * math.asin(math.sqrt(x)))


def _f(v):
    try:
        return float(v)
    except Exception:
        return None


def norm(s: str) -> str:
    return "".join(ch for ch in (s or "") if ch.isalnum()).lower()


# ---------------- 1. 이동약자 여행 정보 ----------------
BF_TYPES = {"sight": "12", "culture": "14", "stay": "32", "food": "39", "shop": "38", "leports": "28", "event": "15"}
BF_LABEL = {   # 화면에 보여 줄 항목 (값이 비어 있으면 숨김)
    "parking": "주차", "route": "접근로", "publictransport": "대중교통", "ticketoffice": "매표소", "wheelchair": "휠체어",
    "exit": "출입통로", "elevator": "엘리베이터", "restroom": "화장실", "room": "객실", "handicapetc": "지체장애 기타",
    "braileblock": "점자블록", "helpdog": "보조견", "guidehuman": "안내요원", "audioguide": "오디오가이드",
    "bigprint": "큰활자 홍보물", "brailepromotion": "점자 홍보물", "guidesystem": "유도안내설비", "blindhandicapetc": "시각장애 기타",
    "signguide": "수어 안내", "videoguide": "자막 비디오", "hearingroom": "객실(청각)", "hearinghandicapetc": "청각장애 기타",
    "stroller": "유모차", "lactationroom": "수유실", "babysparechair": "유아용 의자", "infantsfamilyetc": "영유아 기타",
}


def _bf_list(ctype: str) -> list[dict]:
    lat, lon = CENTER
    cands = [("KorWithService2/locationBasedList2", {"mapX": lon, "mapY": lat, "radius": 20000, "contentTypeId": ctype,
                                                       "numOfRows": 200, "pageNo": 1, "arrange": "E"})]
    for a, s in AREA:
        cands.append(("KorWithService2/areaBasedList2", {"lDongRegnCd": a, "lDongSignguCd": s[-3:], "contentTypeId": ctype, "numOfRows": 200, "pageNo": 1}))
        cands.append(("KorWithService2/areaBasedList2", {"areaCode": a, "sigunguCode": s, "contentTypeId": ctype, "numOfRows": 200, "pageNo": 1}))
    # 후보마다 결과가 조금씩 달라서 모두 불러 합친다(같은 장소는 한 번만).
    seen, out = set(), []
    for path, params in cands:
        items, _ = _call(path, params, f"bf_list_{ctype}")
        for it in items:
            cid = str(it.get("contentid"))
            if cid not in seen and "동해시" in (it.get("addr1") or ""):
                seen.add(cid)
                out.append(it)
    return out


def _bf_detail(cid: str) -> dict:
    items, _ = _call("KorWithService2/detailWithTour2", {"contentId": cid}, "bf_detail")
    return items[0] if items else {}


def barrier_free(kind: str = "food", limit: int = 60) -> dict:
    ctype = BF_TYPES.get(kind, "39")
    name = f"bf_{kind}"
    hit = _cache_get(name, 86400)
    if hit is not None:
        return hit
    base = _bf_list(ctype)[:limit]
    with ThreadPoolExecutor(max_workers=6) as ex:
        details = list(ex.map(lambda it: _bf_detail(str(it.get("contentid"))), base))
    out = []
    for it, d in zip(base, details):
        facts = {k: str(d.get(k) or "").strip() for k in BF_LABEL if str(d.get(k) or "").strip()}
        lat, lon = _f(it.get("mapy")), _f(it.get("mapx"))
        out.append({"id": str(it.get("contentid")), "type": kind, "name": it.get("title", ""), "addr": it.get("addr1", ""),
                    "tel": it.get("tel", ""), "lat": lat, "lon": lon, "image": it.get("firstimage") or it.get("firstimage2") or "",
                    "facts": facts, "wheel": _wheel_level(facts)})
    res = {"items": out, "count": len(out), "source": "한국관광공사 이동약자 여행 정보", "updated": dt.datetime.now(KST).strftime("%Y-%m-%d"),
           "ok": bool(out)}
    if out or KEY:
        _cache_put(name, res)
    return res


def _wheel_level(f: dict) -> str:
    """이동약자 항목 문구로 휠체어 접근을 세 단계로 나눈다. (공식 판정이 아니라 문구 요약)"""
    txt = " ".join(f.get(k, "") for k in ("wheelchair", "exit", "route", "restroom", "elevator"))
    if not txt.strip():
        return "unknown"
    bad = any(w in txt for w in ("불가", "어려", "계단 있", "턱 있", "없음"))
    good = any(w in txt for w in ("가능", "있음", "턱 없", "경사로", "대여"))
    return "good" if good and not bad else "partial" if good else "hard"


def bf_near(lat, lon, kind="food", radius=2000, limit=3) -> list[dict]:
    if lat is None:
        return []
    rows = [dict(r, dist_m=_dist(lat, lon, r["lat"], r["lon"])) for r in barrier_free(kind)["items"] if r.get("lat")]
    rows = [r for r in rows if r["dist_m"] <= radius]
    return sorted(rows, key=lambda r: (r["wheel"] != "good", r["dist_m"]))[:limit]


# ---------------- 2. 관광지 집중률 예측 ----------------
def crowd() -> dict:
    hit = _cache_get("crowd", 6 * 3600)
    if hit is not None:
        return hit
    cands = []
    for a, s in AREA[:2]:
        cands.append(("TatsCnctrRateService/tatsCnctrRatedList", {"areaCd": a, "signguCd": s, "numOfRows": 3000, "pageNo": 1}))
    items = _try(cands, "crowd")
    by: dict[str, list] = {}
    for it in items:
        nm = it.get("tAtsNm") or it.get("tatsNm") or ""
        by.setdefault(nm, []).append({"date": str(it.get("baseYmd", "")), "rate": _f(it.get("cnctrRate"))})
    for v in by.values():
        v.sort(key=lambda x: x["date"])
    res = {"places": by, "count": len(by), "source": "한국관광공사 관광지 집중률 방문자 추이 예측", "ok": bool(by)}
    if by:
        _cache_put("crowd", res)
    return res


def same_place(a: str, b: str) -> bool:
    """이름이 같은 곳인지: 띄어쓰기·기호를 빼고 같거나, 한쪽이 다른 쪽을 품되 길이가 비슷할 때만."""
    x, y = norm(a), norm(b)
    if not x or not y:
        return False
    if x == y:
        return True
    s, l = (x, y) if len(x) <= len(y) else (y, x)
    return len(s) >= 3 and s in l and len(s) / len(l) >= 0.6


def _parts(name: str) -> list[str]:
    """'추암해변·촛대바위' 처럼 가운뎃점으로 묶인 이름은 나눠서도 찾는다."""
    out = [name]
    for sep in ("·", "/", ","):
        if sep in name:
            out += [p.strip() for p in name.split(sep) if p.strip()]
    return out


def crowd_for(name: str, aliases: list[str] | None = None) -> list[dict]:
    """우리 장소 이름으로 집중률 목록을 찾는다."""
    c = crowd()["places"]
    keys = [k for n in [name, *(aliases or [])] if n for k in _parts(n)]
    for nm, rows in c.items():
        if any(same_place(nm, q) for q in keys):
            return rows
    return []


# ---------------- 3. 연관 관광지 ----------------
def related() -> dict:
    hit = _cache_get("related", 7 * 86400)
    if hit is not None:
        return hit
    now = dt.datetime.now(KST)
    items = []
    for back in range(1, 7):
        y, m = now.year, now.month - back
        while m <= 0:
            y, m = y - 1, m + 12
        ym = f"{y}{m:02d}"
        cands = []
        for a, s in AREA[:2]:
            for svc in ("TarRlteTarService1/areaBasedList1", "TarRlteTarService/areaBasedList"):
                cands.append((svc, {"baseYm": ym, "areaCd": a, "signguCd": s, "numOfRows": 1000, "pageNo": 1}))
        items = _try(cands, "related")
        if items:
            break
    by: dict[str, list] = {}
    for it in items:
        by.setdefault(it.get("tAtsNm", ""), []).append({"name": it.get("rlteTatsNm", ""), "rank": int(_f(it.get("rlteRank")) or 99),
                                                       "region": it.get("rlteSignguNm", ""), "cat": it.get("rlteCtgryMclsNm") or it.get("rlteCtgryLclsNm") or ""})
    for v in by.values():
        v.sort(key=lambda x: x["rank"])
    res = {"places": by, "base_ym": items[0].get("baseYm") if items else "", "source": "한국관광공사 관광지별 연관 관광지", "ok": bool(by)}
    if by:
        _cache_put("related", res)
    return res


def related_for(name: str) -> list[dict]:
    keys = _parts(name)
    for nm, rows in related()["places"].items():
        if any(same_place(nm, q) for q in keys):
            return rows[:8]
    return []


# ---------------- 4. 동해시 방문자수 ----------------
def visitors(days: int = 60) -> dict:
    hit = _cache_get("visitors", 86400)
    if hit is not None:
        return hit
    now = dt.datetime.now(KST)
    items: list[dict] = []
    # 전국 기초지자체가 한꺼번에 오므로 짧은 기간을 여러 쪽으로 나눠 받는다(데이터는 며칠 늦게 올라온다).
    for lag in (3, 10, 20, 40):
        end, start = now - dt.timedelta(days=lag), now - dt.timedelta(days=lag + days)
        page = 1
        while page <= 12:
            got, st = _call("DataLabService/locgoRegnVisitrDDList", {"startYmd": start.strftime("%Y%m%d"), "endYmd": end.strftime("%Y%m%d"),
                                                                     "numOfRows": 10000, "pageNo": page}, "visitors")
            items += got
            if len(got) < 10000:
                break
            page += 1
        if items:
            break
    rows = [it for it in items if "동해" in str(it.get("signguNm", "")) or str(it.get("signguCode", "")) in ("51170", "42170")]
    days_: dict[str, dict] = {}
    for it in rows:
        d = str(it.get("baseYmd", ""))
        kind = it.get("touDivNm") or str(it.get("touDivCd"))
        days_.setdefault(d, {})[kind] = round(_f(it.get("touNum")) or 0)
    series = [{"date": d, **v} for d, v in sorted(days_.items())]
    res = {"series": series, "source": "한국관광공사 빅데이터 지역별 방문자수 (이동통신 데이터)", "ok": bool(series)}
    if series:
        _cache_put("visitors", res)
    return res


# ---------------- 5. 오디오 가이드 ----------------
def audio(lat, lon, radius: int = 1500, lang: str = "ko") -> list[dict]:
    if lat is None:
        return []
    name = "audio_" + _key(round(lat, 3), round(lon, 3), radius, lang)
    hit = _cache_get(name, 7 * 86400)
    if hit is not None:
        return hit
    items = _try([("Odii/storyLocationBasedList", {"mapX": lon, "mapY": lat, "radius": radius, "langCode": lang, "numOfRows": 20, "pageNo": 1}),
                  ("Odii/themeLocationBasedList", {"mapX": lon, "mapY": lat, "radius": radius, "langCode": lang, "numOfRows": 20, "pageNo": 1})], "audio")
    out = [{"title": it.get("title") or it.get("audioTitle", ""), "audio": it.get("audioUrl", ""), "script": (it.get("script") or "")[:1200],
            "secs": int(_f(it.get("playTime")) or 0), "image": it.get("imageUrl", "")}
           for it in items if it.get("audioUrl")]
    _cache_put(name, out)
    return out


# ---------------- 6. 관광사진 ----------------
def photos(keyword: str, n: int = 6) -> list[dict]:
    name = "photo_" + _key(keyword)
    hit = _cache_get(name, 7 * 86400)
    if hit is not None:
        return hit
    items = _try([("PhotoGalleryService1/gallerySearchList1", {"keyword": keyword, "numOfRows": 20, "pageNo": 1, "arrange": "A"})], "photo")
    out = [{"url": it.get("galWebImageUrl", ""), "title": it.get("galTitle", ""), "by": it.get("galPhotographer", ""),
            "where": it.get("galPhotographyLocation", ""), "month": it.get("galPhotographyMonth", "")}
           for it in items if it.get("galWebImageUrl") and "동해" in (it.get("galPhotographyLocation") or "") + (it.get("galTitle") or "")][:n]
    _cache_put(name, out)
    return out


# ---------------- 관리자 점검 ----------------
def probe() -> dict:
    """모든 서비스를 한 번씩 불러 응답 상태를 돌려준다(키 값은 넣지 않는다)."""
    for f in CACHE.glob("*.json") if CACHE.exists() else []:
        try:
            f.unlink()
        except Exception:
            pass
    lat, lon = CENTER
    out = {"key": bool(KEY)}
    out["bf_food"] = barrier_free("food")["count"]
    out["bf_stay"] = barrier_free("stay")["count"]
    out["bf_sight"] = barrier_free("sight")["count"]
    out["crowd"] = crowd()["count"]
    out["related"] = len(related()["places"])
    out["visitors"] = len(visitors()["series"])
    out["audio"] = len(audio(37.5480, 129.1170, 3000))
    out["photo"] = len(photos("추암"))
    out["crowd_names"] = sorted(crowd()["places"])
    out["related_names"] = sorted(related()["places"])
    out["calls"] = {k: {kk: (str(vv)[:600] if kk == "sample" else vv) for kk, vv in v.items()} for k, v in LAST.items()}
    return out
