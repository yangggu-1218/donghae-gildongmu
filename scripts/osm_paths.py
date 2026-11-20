"""관광지 주변 250m 보행로의 노면·폭을 OpenStreetMap(Overpass)에서 받아 data/public/osm_paths.json 으로 만든다.
돌리는 법: py scripts/osm_paths.py   (키 필요 없음, Overpass 한 번 호출)
경사(incline) 태그는 2026-11 기준 동해 관광지 주변에 없어 노면·폭만 쓴다. 판정에는 쓰지 않고 장소 상세에 참고로만 보인다.
© OpenStreetMap contributors (ODbL) — 화면에 출처를 밝힌다."""
import datetime as dt
import json
import math
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.main import PLACES  # noqa: E402

BBOX = (37.43, 129.0, 37.60, 129.20)   # 동해시 (남, 서, 북, 동)
WALK = {"footway", "path", "pedestrian", "steps", "track", "cycleway", "living_street"}
KO = {"asphalt": "포장(아스팔트)", "concrete": "포장(콘크리트)", "paving_stones": "보도블록", "wood": "나무 데크", "earth": "흙길", "dirt": "흙길",
      "ground": "흙길", "gravel": "자갈", "fine_gravel": "자갈", "sand": "모래", "unpaved": "비포장", "compacted": "다진 흙"}


def dist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


q = f"[out:json][timeout:60];way[highway~\"^({'|'.join(sorted(WALK))})$\"]({','.join(map(str, BBOX))});out tags geom;"
r = httpx.post("https://overpass-api.de/api/interpreter", data={"data": q}, headers={"User-Agent": "gildongmu-osm-paths"}, timeout=90)
r.raise_for_status()
ways = r.json()["elements"]
out = {}
for p in PLACES.values():
    if p.type in ("식당", "카페", "숙박") or p.lat is None:
        continue
    near = [w for w in ways if any(dist((p.lat, p.lon), (g["lat"], g["lon"])) <= 250 for g in w.get("geometry", []))]
    surf, widths = {}, []
    for w in near:
        t = w.get("tags", {})
        g = w.get("geometry", [])
        length = sum(dist((a["lat"], a["lon"]), (b["lat"], b["lon"])) for a, b in zip(g, g[1:]))
        if t.get("surface"):
            k = KO.get(t["surface"], t["surface"])
            surf[k] = surf.get(k, 0) + round(length)
        try:
            if t.get("width"):
                widths.append(float(t["width"].replace("m", "").strip()))
        except ValueError:
            pass
    if near and (surf or widths):
        out[p.id] = {"walk_ways": len(near), "surface_m": dict(sorted(surf.items(), key=lambda x: -x[1])), "min_width_m": min(widths) if widths else None}
doc = {"_note": "OpenStreetMap 보행로(footway·path·pedestrian·steps·track·cycleway) 250m 안 — 노면(길이 m)·가장 좁은 폭. 경사(incline) 태그는 동해 관광지 주변에 없음. © OpenStreetMap contributors, ODbL.",
       "checked": dt.date.today().isoformat(), "places": out}
(ROOT / "data" / "public" / "osm_paths.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("장소", len(out))
