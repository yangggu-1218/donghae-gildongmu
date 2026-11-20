"""전국공중화장실표준데이터(동해시 CSV)로 data/public/toilets.json 을 보강한다.

돌리는 법: py scripts/ingest_toilets.py <공중화장실정보_강원동해시.csv>
- 장애인용 변기(남·여 대변기, 남 소변기)가 1개 이상인 곳만 (기존 기준 그대로)
- 이미 있는 곳은 좌표(카카오 주소 검색으로 만든 값)를 그대로 두고, 표준데이터의 칸 수·기저귀 교환대·비상벨·개방시간 상세를 더한다
- 새로 생긴 곳은 같은 도로명주소의 좌표가 있으면 쓰고, 없으면 좌표 없이 넣는다(편의시설 지도의 '위치를 아직 못 정한 곳' 목록에 보임)
- 원본은 data/public/raw/동해시_공중화장실.csv 로 UTF-8 사본을 남긴다
"""
import csv
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "public" / "toilets.json"
RAW = ROOT / "data" / "public" / "raw" / "동해시_공중화장실.csv"


def read(p: Path) -> list[dict]:
    b = p.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            return list(csv.DictReader(io.StringIO(b.decode(enc))))
        except UnicodeDecodeError:
            continue
    raise SystemExit("CSV 글자 인코딩을 읽지 못했어요")


def n(r: dict, k: str) -> int:
    try:
        return int(float(r.get(k) or 0))
    except ValueError:
        return 0


def short(road: str) -> str:
    return road.replace("강원특별자치도 ", "").strip()


def main(src: str) -> None:
    rows = read(Path(src))
    RAW.write_text(Path(src).read_bytes().decode("cp949", errors="strict") if Path(src).read_bytes()[:3] != b"\xef\xbb\xbf" else Path(src).read_text(encoding="utf-8-sig"), encoding="utf-8")
    t = json.loads(OUT.read_text(encoding="utf-8"))
    by_name = {i["name"]: i for i in t["items"]}
    coord_by_road = {i["road"]: (i["lat"], i["lon"]) for i in t["items"] if i.get("lat")}
    added, enriched = [], 0
    for r in rows:
        dis = n(r, "남성용-장애인용대변기수") + n(r, "남성용-장애인용소변기수") + n(r, "여성용-장애인용대변기수")
        if dis <= 0:
            continue
        name = (r.get("화장실명") or "").replace("강원특별자치도 동해시 ", "").strip()
        extra = {
            "dis_stalls": dis,
            "diaper": (r.get("기저귀교환대유무") == "Y"),
            "diaper_at": (r.get("기저귀교환대장소") or "").strip() or None,
            "bell": (r.get("비상벨설치여부") == "Y"),
            "hours_detail": (r.get("개방시간상세") or "").strip() or None,
            "data_as_of": r.get("데이터기준일자") or None,
        }
        item = by_name.get(name) or by_name.get(r.get("화장실명") or "")
        if item:
            item.update(extra)
            enriched += 1
            continue
        road = short(r.get("소재지도로명주소") or r.get("소재지지번주소") or "")
        hours = "24시간" if r.get("개방시간") == "상시" else (r.get("개방시간상세") or r.get("개방시간") or "")
        new = {"name": name, "road": road, "kind": r.get("구분명") or "", "hours": hours, "accessible": True, **extra}
        if road in coord_by_road:
            new["lat"], new["lon"] = coord_by_road[road]
            new["coord_from"] = "같은 도로명주소의 기존 좌표"
        else:
            new["lat"] = new["lon"] = None
            new["coord_from"] = None
        t["items"].append(new)
        added.append(name)
    t["source"] = "전국공중화장실표준데이터(공공데이터포털) — 동해시 중 장애인용 변기가 있는 곳 (칸 수·기저귀 교환대·비상벨은 2026-11-21 팀 제공 CSV)"
    OUT.write_text(json.dumps(t, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"보강 {enriched}곳, 새로 추가 {len(added)}곳: {', '.join(added) or '-'}")
    print(f"전체 {len(t['items'])}곳 · 기저귀 교환대 {sum(1 for i in t['items'] if i.get('diaper'))}곳 · 좌표 없음 {sum(1 for i in t['items'] if not i.get('lat'))}곳")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
