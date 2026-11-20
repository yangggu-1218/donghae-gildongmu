"""국토지리정보원 수치표고모델(DEM) 90m(한반도, GRS80 TM .img)에서 동해시 부분만 잘라 data/public/dem_donghae.json 으로 만든다.
서버·데모는 이 작은 격자(위도·경도 0.001° 간격, 높이 0.1m 단위 정수)만 읽고, 원본(550MB)은 저장소에 넣지 않는다.

돌리는 법 (rasterio·pyproj 가 있는 파이썬에서, 한 번만):
    pip install rasterio pyproj numpy
    python scripts/ingest_dem.py <한반도90m_GRS80.img 경로>

주의: 90m 격자는 한 칸이 90m×90m 평균이라 짧은 경사로·계단·턱은 보이지 않고, 언덕 꼭대기는 실제보다 낮게 나온다.
그래서 이 자료는 '언덕 위인지·걸어서 오르막이 있는지' 같은 참고 안내에만 쓰고, 휠체어 판정(등급)에는 쓰지 않는다."""
import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
LAT0, LAT1, LON0, LON1, STEP = 37.38, 37.64, 128.96, 129.20, 0.001   # 동해시 전체 + 여백


def main(img: str):
    ds = rasterio.open(img)
    band = ds.read(1, masked=True).filled(np.nan).astype("float64")
    band[band < -100] = np.nan
    tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
    lats = np.round(np.arange(LAT0, LAT1 + 1e-9, STEP), 6)
    lons = np.round(np.arange(LON0, LON1 + 1e-9, STEP), 6)
    LO, LA = np.meshgrid(lons, lats)
    X, Y = tr.transform(LO, LA)
    inv = ~ds.transform
    col, row = inv * (X, Y)
    c0, r0 = np.floor(col - .5).astype(int), np.floor(row - .5).astype(int)
    fx, fy = col - .5 - c0, row - .5 - r0

    def at(r, c):
        return band[np.clip(r, 0, ds.height - 1), np.clip(c, 0, ds.width - 1)]
    z = (at(r0, c0) * (1 - fx) * (1 - fy) + at(r0, c0 + 1) * fx * (1 - fy) + at(r0 + 1, c0) * (1 - fx) * fy + at(r0 + 1, c0 + 1) * fx * fy)
    z = np.where(np.isnan(z), 0, np.maximum(z, 0))    # 바다·자료 없음은 0m
    dm = np.round(z * 10).astype(int)                 # 0.1m 단위
    doc = {"source": "국토지리정보원 수치표고모델(DEM) 90m 한반도 (GRS80 TM)", "res_m": 90, "checked": date.today().isoformat(),
           "note": "위도·경도 0.001° 격자로 다시 뽑은 높이(0.1m 단위). 참고 안내용, 휠체어 판정에는 쓰지 않음.",
           "lat0": LAT0, "lon0": LON0, "step": STEP, "rows": len(lats), "cols": len(lons),
           "dm": dm.tolist()}
    out = ROOT / "data" / "public" / "dem_donghae.json"
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("ok", out, f"{len(lats)}x{len(lons)}", f"{out.stat().st_size // 1024}KB", "max", float(z.max()))


if __name__ == "__main__":
    main(sys.argv[1])
