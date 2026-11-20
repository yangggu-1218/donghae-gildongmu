"""이동 난이도 5단계 점검 (docs/22_ACCESS_GRADING.md): 기준값마다 단계가 맞는지, 서버(engine.py)와 데모(build/api.js)가 같은지.
돌리는 법: py tests/test_grading.py   → 마지막 줄 "판정 기준 점검 실패 0건"  (build/data.json 이 있어야 함: cd build && py gen_data.py)"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("PYTHONUTF8", "1")
from app import engine  # noqa: E402
from app.schemas import Segment  # noqa: E402

fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


# (구간, 모드, 기대 단계)
CASES = [
    ({"slope_deg": 3.0}, "wheel", 1),                      # 1/18 이하 — 법
    ({"slope_deg": 4.7}, "wheel", 2),                      # 1/12 이하 — 법
    ({"slope_deg": 5.5}, "wheel", 3),                      # 1/10 이하 — 김충식 외
    ({"slope_deg": 6.5, "rise_m": 0.12}, "wheel", 3),      # 1/8 이하·높이 15cm 이하 — 완화
    ({"slope_deg": 6.5}, "wheel", 4),                      # 1/8 이하, 높이 모름 — 보조 필요
    ({"slope_deg": 8.5}, "wheel", 4),                      # 1/6 미만
    ({"slope_deg": 10}, "wheel", 5),                       # 1/6 이상 — 통행 불가
    ({"slope_deg": 4.5, "rise_m": 0.9}, "wheel", 3),       # 1/12 이하라도 높이 0.75m 넘으면 한 단계 위
    ({"curb_cm": 2}, "wheel", 1), ({"curb_cm": 4}, "wheel", 3), ({"curb_cm": 7}, "wheel", 4), ({"curb_cm": 12}, "wheel", 5),
    ({"width_m": 1.2}, "wheel", 1), ({"width_m": 1.0}, "wheel", 3), ({"width_m": 0.8}, "wheel", 4), ({"width_m": 0.6}, "wheel", 5),
    ({"steps": 5, "alt_route": "승강기"}, "wheel", 4), ({"steps": 5}, "wheel", 5),
    ({"steps": 5}, "walk", 3), ({"steps": 14}, "walk", 5),
    ({"surface": "흙길"}, "wheel", 5), ({"surface": "흙길"}, "walk", 3), ({"surface": "자갈"}, "stroller", 3),
    ({"slope_deg": 6.0}, "walk", 3), ({"slope_deg": 8.0}, "walk", 4),
    ({"grade": "R"}, "walk", 5), ({"grade": "G"}, "wheel", 2),   # 측정값 없음 → 자료 등급 그대로 (어르신도 불가 유지)
]
for seg, mode, want in CASES:
    lv, why = engine.assess(Segment(name="t", **seg), mode)
    check(f"{mode} {seg} → {want}단계", lv == want, f"{lv}단계 {why}")
    check(f"{mode} {seg} 등급 일치", engine.grade_segment(Segment(name="t", **seg), mode) == engine.LEVEL_GRADE[want] or not any(k in seg for k in ("steps", "curb_cm", "slope_deg", "width_m", "surface")))

# 3단계 이상이면 까닭(근거)이 붙는다
lv, why = engine.assess(Segment(name="t", slope_deg=6.5), "wheel")
check("까닭에 근거 이름", why and "김충식 외 2010" in why[0], str(why))

# 서버·데모가 같은 단계를 내는지
segs = [c[0] for c in CASES]
py = [[m, engine.assess(Segment(name="t", **s), m)[0], engine.grade_segment(Segment(name="t", **s), m)] for s in segs for m in ("wheel", "stroller", "walk")]
with tempfile.TemporaryDirectory() as d:
    f = Path(d) / "segs.json"
    f.write_text(json.dumps(segs, ensure_ascii=False), encoding="utf-8")
    js = ("const fs=require('fs');import('./build/api.js').then(m=>{const api=m.makeApi(JSON.parse(fs.readFileSync('build/data.json','utf8')));"
          "const S=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const o=[];for(const s of S)for(const mo of ['wheel','stroller','walk'])"
          "o.push([mo,api.assess(s,mo)[0],api.gradeSegment(s,mo)]);process.stdout.write(JSON.stringify(o));});")
    out = subprocess.run(["node", "-e", js, str(f)], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    try:
        check("서버·데모 판정 같음", json.loads(out.stdout) == py, out.stderr[-200:])
    except json.JSONDecodeError:
        check("서버·데모 판정 같음", False, (out.stderr or out.stdout)[-300:])

print(f"판정 기준 점검 실패 {len(fails)}건")
sys.exit(1 if fails else 0)
