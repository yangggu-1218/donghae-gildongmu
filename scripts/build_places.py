"""장소 데이터 합치기: 장소 목록(places_meta.csv) + TourAPI + 검수한 AI 정리 + 현장 답사 입력표 → data/places.json
사용: python scripts/build_places.py
- 답사 입력표는 '데이터·답사 시트' 문서의 표를 CSV로 내려받아 data/survey.csv 로 저장 (열 이름은 survey_template.csv 와 같게)
- TourAPI 장소와는 이름으로 맞춘다. 못 맞춘 장소는 화면에 경고를 출력한다."""
import csv, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data"
GRADE = {"✓ 가능": "G", "! 주의": "Y", "✕ 불가": "R", "G": "G", "Y": "Y", "R": "R"}
# 답사 구간 코드 → 장소 id (데이터·답사 시트의 골든 코스 표 기준)
SEG_PLACE = {"A1": "mureung", "A2": "mureung", "A3": "mureung", "A4": "valley", "A5": "valley", "A6": "forest", "A7": "forest",
             "B2": "dokkaebi", "B3": "dokkaebi", "B4": "haerang", "B5": "mukho_port", "B6": "mukho_lighthouse", "B7": "nongol",
             "C1": "chotdae", "C2": "chotdae", "C3": "haeamjeong", "C4": "chotdae", "C5": "chuam_bridge", "C6": "chuam_sculpture", "C7": "chotdae"}


def norm(s: str) -> str:
    return re.sub(r"[\s·()'\"]", "", s or "")


def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None


def main():
    meta = list(csv.DictReader((D / "places_meta.csv").open(encoding="utf-8-sig")))
    seed = {p["id"]: p for p in json.loads((D / "places_seed.json").read_text(encoding="utf-8"))}
    tour = json.loads((D / "raw/tour_list.json").read_text(encoding="utf-8")) if (D / "raw/tour_list.json").exists() else []
    detail = json.loads((D / "raw/tour_with_detail.json").read_text(encoding="utf-8")) if (D / "raw/tour_with_detail.json").exists() else {}

    out = []
    for m in meta:
        p = dict(seed.get(m["id"], {}))
        p.update({"id": m["id"], "name_ko": m["name_ko"], "zone": m["zone"], "type": m["type"],
                  "indoor": m.get("indoor") == "Y", "styles": [s for s in m.get("styles", "").split("|") if s]})
        p.setdefault("segments", [])
        hit = next((t for t in tour if norm(m["name_ko"])[:4] in norm(t.get("title", ""))), None)
        if hit:
            p["lat"], p["lon"] = float(hit["mapy"]), float(hit["mapx"])
            d = detail.get(str(hit.get("contentid")), {})
            p["intro_ko"] = re.sub("<[^>]+>", "", d.get("common", {}).get("overview", ""))[:200] or p.get("intro_ko", "")
            p["contentid"] = hit.get("contentid")
            p["sample"] = False
        else:
            print("  ! TourAPI에서 못 찾음:", m["name_ko"])
        out.append(p)

    # 영어 이름: 영문 관광정보에서 좌표가 150m 안인 장소의 이름을 쓴다 (없으면 data/place_names_en.csv 초안)
    eng = json.loads((D / "raw/tour_eng_list.json").read_text(encoding="utf-8")) if (D / "raw/tour_eng_list.json").exists() else []
    draft = {r["id"]: r["영문(초안)"] for r in csv.DictReader((D / "place_names_en.csv").open(encoding="utf-8-sig"))}
    for p in out:
        best = None
        if p.get("lat"):
            for e in eng:
                try:
                    d = ((float(e["mapy"]) - p["lat"]) ** 2 + (float(e["mapx"]) - p["lon"]) ** 2) ** 0.5 * 111000
                except (KeyError, ValueError):
                    continue
                if d < 150 and (best is None or d < best[0]):
                    best = (d, e.get("title"))
        p["name_en"] = best[1] if best else (p.get("name_en") or draft.get(p["id"], ""))

    by_id = {p["id"]: p for p in out}
    sv = D / "survey.csv"
    if sv.exists():
        for r in csv.DictReader(sv.open(encoding="utf-8-sig")):
            code = (r.get("구간") or "")[:2]
            pid = SEG_PLACE.get(code)
            if not pid or pid not in by_id:
                continue
            seg = {"name": (r.get("구간") or "")[3:].strip(), "grade": GRADE.get((r.get("판정") or "").strip()),
                   "distance_m": num(r.get("거리(m)")), "steps": int(num(r.get("계단(개)")) or 0) if r.get("계단(개)") else None,
                   "curb_cm": num(r.get("최대 턱(cm)")), "slope_deg": num(r.get("최대 기울기(°)")), "width_m": num(r.get("최소 폭(m)")),
                   "surface": r.get("바닥") or None, "note": r.get("메모", ""), "source": "현장 답사", "checked_at": r.get("확인일") or None}
            p = by_id[pid]
            p["segments"] = [s for s in p["segments"] if s.get("source") == "현장 답사"] + [seg]
    (D / "places.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)}곳 → data/places.json")


if __name__ == "__main__":
    main()
