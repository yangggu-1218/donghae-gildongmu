"""지형 참고 안내 (국토지리정보원 DEM 90m → data/public/dem_donghae.json, scripts/ingest_dem.py 가 만든다).

- place_terrain: 장소의 해발 높이, 반경 300m 안 가장 낮은 곳보다 얼마나 높은지(언덕 위인지), 주변 지형 경사
- climb: 두 점 사이 직선을 따라 걸을 때 오르막·내리막 합계 (대중교통 내린 곳 → 장소 같은 걷는 구간)

90m 격자는 한 칸 평균이라 짧은 경사로·계단·턱은 보이지 않고 언덕 꼭대기는 실제보다 낮게 나온다.
그래서 화면에는 '지형 자료 추정'으로만 보여 주고, 휠체어·유모차 판정(등급)에는 쓰지 않는다."""
import json
import math
from pathlib import Path

_F = Path(__file__).resolve().parents[2] / "data" / "public" / "dem_donghae.json"
_D = json.loads(_F.read_text(encoding="utf-8")) if _F.exists() else None
SOURCE = (_D or {}).get("source", "")
CHECKED = (_D or {}).get("checked", "")


def available() -> bool:
    return _D is not None


def elev(lat: float, lon: float) -> float | None:
    """해발 높이(m), 격자 사이는 이중선형 보간. 격자 밖이면 None."""
    if not _D or lat is None or lon is None:
        return None
    r = (lat - _D["lat0"]) / _D["step"]
    c = (lon - _D["lon0"]) / _D["step"]
    r0, c0 = math.floor(r), math.floor(c)
    if r0 < 0 or c0 < 0 or r0 + 1 >= _D["rows"] or c0 + 1 >= _D["cols"]:
        return None
    fy, fx = r - r0, c - c0
    g = _D["dm"]
    z = (g[r0][c0] * (1 - fx) * (1 - fy) + g[r0][c0 + 1] * fx * (1 - fy) + g[r0 + 1][c0] * (1 - fx) * fy + g[r0 + 1][c0 + 1] * fx * fy)
    return z / 10


def _offset(lat, lon, dn_m, de_m):
    return lat + dn_m / 111320, lon + de_m / (111320 * math.cos(math.radians(lat)))


def _dist_m(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def place_terrain(lat: float, lon: float) -> dict:
    """{elev_m, rise_m(반경 300m 안 가장 낮은 곳보다 높은 정도), slope_deg(주변 약 100m 지형 경사), kind: flat|gentle|hill}."""
    z = elev(lat, lon)
    if z is None:
        return {}
    low = z
    for r in (100, 200, 300):
        for k in range(12):
            a = math.radians(k * 30)
            v = elev(*_offset(lat, lon, r * math.cos(a), r * math.sin(a)))
            if v is not None:
                low = min(low, v)
    d = 90
    n, s = elev(*_offset(lat, lon, d, 0)), elev(*_offset(lat, lon, -d, 0))
    e, w = elev(*_offset(lat, lon, 0, d)), elev(*_offset(lat, lon, 0, -d))
    slope = math.degrees(math.atan(math.hypot(((n or z) - (s or z)) / (2 * d), ((e or z) - (w or z)) / (2 * d))))
    rise = max(0.0, z - low)
    kind = "hill" if rise >= 25 or slope >= 8 else "flat" if rise < 8 and slope < 3 else "gentle"
    return {"elev_m": round(z), "rise_m": round(rise), "slope_deg": round(slope, 1), "kind": kind}


def climb(a, b, step_m: float = 30) -> dict | None:
    """(위도, 경도) a → b 직선을 따라 걸을 때 {up_m, down_m, dist_m, max_deg}. 격자 밖이면 None."""
    if not _D or not a or not b:
        return None
    dist = _dist_m(a, b)
    n = max(1, int(dist // step_m))
    zs = [elev(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]
    if any(z is None for z in zs):
        return None
    seg = dist / n if n else 0
    up = sum(max(0.0, zs[i + 1] - zs[i]) for i in range(n))
    down = sum(max(0.0, zs[i] - zs[i + 1]) for i in range(n))
    mx = max((abs(zs[i + 1] - zs[i]) / seg for i in range(n)), default=0) if seg else 0
    return {"up_m": round(up), "down_m": round(down), "dist_m": round(dist), "max_deg": round(math.degrees(math.atan(mx)), 1)}
