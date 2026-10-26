"""장소 사이 차량 이동 시간표(분)를 만든다. 실시간 길찾기 API 없이 본선에서 쓰기 위함.
기본: 직선거리 x 1.4 / 시속 35km + 주차 5분 (추정)
선택: .env 에 ORS_API_KEY(OpenRouteService 무료 키)가 있으면 실제 도로 경로로 계산
사용: python scripts/travel_matrix.py  →  data/travel_matrix.json"""
import json, math, os
from pathlib import Path
import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
places = json.loads((ROOT / "data/places.json").read_text(encoding="utf-8")) if (ROOT / "data/places.json").exists() \
    else json.loads((ROOT / "data/places_seed.json").read_text(encoding="utf-8"))
pts = [(p["id"], p["lat"], p["lon"]) for p in places if p.get("lat")]
pts += [("동해역", 37.4995, 129.1240), ("묵호역", 37.5480, 129.1160)]


def est(a, b):
    r = 6371
    d = 2 * r * math.asin(math.sqrt(math.sin(math.radians(b[1] - a[1]) / 2) ** 2 + math.cos(math.radians(a[1])) *
                                    math.cos(math.radians(b[1])) * math.sin(math.radians(b[2] - a[2]) / 2) ** 2))
    return round(d * 1.4 / 35 * 60) + 5


key = os.getenv("ORS_API_KEY")
M = {a[0]: {b[0]: est(a, b) for b in pts} for a in pts}
if key:
    r = httpx.post("https://api.openrouteservice.org/v2/matrix/driving-car", headers={"Authorization": key},
                   json={"locations": [[p[2], p[1]] for p in pts], "metrics": ["duration"]}, timeout=30)
    if r.status_code == 200:
        dur = r.json()["durations"]
        M = {a[0]: {b[0]: round((dur[i][j] or 0) / 60) + 5 for j, b in enumerate(pts)} for i, a in enumerate(pts)}
        print("OpenRouteService 경로 시간 사용")
    else:
        print("ORS 실패, 추정값 사용:", r.text[:200])
(ROOT / "data/travel_matrix.json").write_text(json.dumps(M, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(pts)}개 지점 → data/travel_matrix.json")
