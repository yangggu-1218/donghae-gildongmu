"""한국관광공사 '열린관광 모두의 여행' 무장애 관광정보(동해시 관광지·명소 28곳)를 장소에 붙인다.
원본: data/public/raw/kto_access_a.json, kto_access_b.json (access.visitkorea.or.kr 상세 페이지의 기본정보·무장애 편의정보, 2026-11 수집).
- access_kto: 분류(지체장애·시각장애·영유아가족·고령자)별 항목. '없음'은 빼고, 남은 항목이 하나라도 있는 분류만 아이콘으로 보인다.
- 편의시설 이름(장애인 화장실·주차·휠체어 대여 등)을 더한다.
- 구간 정보가 없는 곳에만 '출입구' 구간을 더한다 (직접 확인한 구간은 덮어쓰지 않는다).
- 운영시간이 비어 있는 곳에만 '상시 개방' 같은 값을 채운다 (팀이 전화로 확인한 값은 그대로 둔다)."""
import json
import re
from pathlib import Path

from .schemas import Place, Segment

RAW = Path(__file__).resolve().parents[2] / "data" / "public" / "raw"
SRC = "한국관광공사 열린관광 모두의 여행 무장애 관광정보"
URL = "https://access.visitkorea.or.kr/ms/detail.do?cotId="

# 열린관광 이름 → 길동무 장소 id (한 장소에 두 항목이 붙기도 한다: 묵호항 + 활·선어판매센터, 추암해변 + 추암 촛대바위)
MAP = {"천곡천연동굴 자연학습체험공원": "nature_park", "연필뮤지엄": "pencil_museum", "묵호항수변공원": "mukho_park", "무릉계곡": "valley",
       "삼화사": "samhwasa", "동해무릉건강숲": "forest", "추암조각공원": "chuam_sculpture", "한섬해변&한섬감성바닷길": "hanseom",
       "묵호항": "mukho_port", "묵호항 활·선어판매센터": "mukho_port", "동쪽바다중앙시장": "central_market", "북평민속오일장": "bukpyeong_market",
       "무릉별유천지": "mureung", "추암해변": "chotdae", "추암 촛대바위": "chotdae", "천곡황금박쥐동굴": "cave", "도째비골스카이밸리": "dokkaebi",
       "노봉해변": "nobong", "망상해변": "mangsang", "묵호등대": "mukho_lighthouse", "동해 논골담길": "nongol", "어달해변": "eodal",
       "동해약천온천실버타운": "yakcheon", "가원습지 생태자연공원": "gawon", "묵호시장": "mukho_market", "북평성당": "bukpyeong_church",
       "동해문화원": "culture_center", "봉정연꽃마을": "bongjeong_lotus"}
CATS = ["지체장애", "시각장애", "영유아가족", "고령자"]

# 열린관광에만 있고 길동무에 없던 6곳 (좌표: 주소 → 카카오 지도 주소 검색, 2026-11-20)
NEW = [
    {"id": "yakcheon", "name_ko": "동해약천온천실버타운", "name_en": "Donghae Yakcheon Hot Spring", "zone": "mangsang", "type": "관광지", "lat": 37.59418, "lon": 129.06696,
     "stay_min": 90, "styles": ["체험"], "indoor": True, "address": "강원특별자치도 동해시 석두골길 145", "phone": "033-534-6502",
     "tip_ko": "온천이에요. 계절마다 운영시간이 달라 가기 전에 전화로 확인하세요.", "tip_en": "Hot spring; hours vary by season, so call ahead."},
    {"id": "gawon", "name_ko": "가원습지 생태자연공원", "name_en": "Gawon Wetland Eco Park", "zone": "chuam", "type": "관광지", "lat": 37.47360, "lon": 129.10703,
     "stay_min": 40, "styles": ["자연·산책"], "indoor": False, "address": "강원특별자치도 동해시 지가동 77-6", "phone": "033-530-2261",
     "tip_ko": "출입구까지 턱이 없어 휠체어로 들어갈 수 있는 습지 공원이에요.", "tip_en": "Wetland park with a step-free entrance."},
    {"id": "mukho_market", "name_ko": "묵호시장", "name_en": "Mukho Market", "zone": "mukho", "type": "관광지", "lat": 37.55235, "lon": 129.11488,
     "stay_min": 40, "styles": ["맛집", "역사·문화"], "indoor": False, "address": "강원특별자치도 동해시 일출로 67", "phone": "033-533-8118",
     "tip_ko": "통로가 좁고 수산시장이라 바닥이 젖어 있어요. 장애인 주차구역은 묵호항 공영주차장 쪽이에요.", "tip_en": "Narrow aisles and wet floors (fish market). Accessible parking at the Mukho Port public car park."},
    {"id": "bukpyeong_church", "name_ko": "북평성당", "name_en": "Bukpyeong Catholic Church", "zone": "chuam", "type": "관광지", "lat": 37.48104, "lon": 129.12590,
     "stay_min": 30, "styles": ["역사·문화"], "indoor": True, "address": "강원특별자치도 동해시 오일장2길 16", "phone": "033-521-1784",
     "tip_ko": "출입구까지 경사로가 있어요. 미사 시간에는 조용히 둘러봐 주세요.", "tip_en": "Ramp to the entrance. Please be quiet during Mass."},
    {"id": "culture_center", "name_ko": "동해문화원", "name_en": "Donghae Cultural Center", "zone": "cheongok", "type": "관광지", "lat": 37.52692, "lon": 129.11450,
     "stay_min": 40, "styles": ["역사·문화"], "indoor": True, "address": "강원특별자치도 동해시 평원로 17", "phone": "033-531-3298", "fee": "무료",
     "tip_ko": "장애인 리프트가 있어요. 주말·공휴일은 쉬어요.", "tip_en": "Has a wheelchair lift. Closed weekends and holidays."},
    {"id": "bongjeong_lotus", "name_ko": "봉정연꽃마을", "name_en": "Bongjeong Lotus Village", "zone": "chuam", "type": "관광지", "lat": 37.47309, "lon": 129.12444,
     "stay_min": 40, "styles": ["자연·산책", "체험"], "indoor": False, "address": "강원특별자치도 동해시 봉정1길 19-7", "phone": "033-521-8559",
     "tip_ko": "연꽃 체험 마을이에요. 주말·공휴일은 쉬고 단체 예약만 받아요.", "tip_en": "Lotus farm village; closed weekends and holidays (group bookings only)."},
]
# 운영시간 (열린관광 기본정보, 동절기 기준). 비어 있는 값만 채운다
HOURS = {"nature_park": ("00:00", "24:00", [], None), "samhwasa": ("00:00", "24:00", [], None), "chuam_sculpture": ("00:00", "24:00", [], None),
         "gawon": ("00:00", "24:00", [], None), "culture_center": ("09:00", "18:00", [0, 6], None), "bongjeong_lotus": ("10:00", "17:00", [0, 6], None)}

_NO = re.compile(r"^\s*없음\s*$")


def _load() -> list[dict]:
    out = []
    for f in ("kto_access_a.json", "kto_access_b.json"):
        p = RAW / f
        if p.exists():
            out += json.loads(p.read_text(encoding="utf-8"))
    return out


def _facilities(items: dict) -> list[str]:
    """열린관광 항목 → 길동무 편의시설 이름 (화면 고르기·지도에 쓰는 이름)."""
    f = []
    body = items.get("지체장애", [])
    val = {k: v for k, v in body}
    if "화장실" in val: f.append("장애인 화장실")
    if "주차여부" in val: f.append("장애인 주차")
    if "휠체어대여" in val or any(k == "휠체어 대여" for k, _ in items.get("고령자", [])): f.append("휠체어 대여")
    if "엘리베이터" in val: f.append("엘리베이터")
    door = val.get("주 출입 접근로", "") + val.get("출입통로", "")
    if "경사로" in door: f.append("경사로")
    elif "턱이 없" in door: f.append("출입구 턱 없음")
    if "리프트" in val.get("지체장애 기타 상세", ""): f.append("장애인 리프트")
    if "샤워" in val.get("지체장애 기타 상세", ""): f.append("장애인 공용 샤워실")
    vis = " ".join(v for _, v in items.get("시각장애", [])) + " ".join(k for k, _ in items.get("시각장애", []))
    if "점자" in vis: f.append("점자 안내")
    if "보조견" in vis: f.append("보조견 동반 가능")
    kid = " ".join(f"{k} {v}" for k, v in items.get("영유아가족", []))
    if "수유실" in kid: f.append("수유실")
    if "기저귀" in kid: f.append("기저귀 교환대")
    return f


def _entrance(items: dict) -> list[Segment]:
    val = {k: v for k, v in items.get("지체장애", [])}
    door, extra = val.get("주 출입 접근로", ""), val.get("지체장애 기타 상세", "") + " " + val.get("출입통로", "")
    segs = []
    if door:
        segs.append(Segment(name="출입구까지", grade="G", note=door.split(" / ")[0].replace("접근 경로 : ", "")[:60], source=SRC))
    if re.search(r"어려|불가|좁", extra):
        segs.append(Segment(name="안쪽 관람", grade="Y" if "좁" in extra and "불가" not in extra else "R", note=" ".join(extra.split())[:80], source=SRC))
    return segs


def apply(places: dict[str, Place]) -> dict[str, Place]:
    rows = _load()
    if not rows:
        return places
    for r in NEW:
        if r["id"] not in places:
            places[r["id"]] = Place(**{**r, "facilities": [], "segments": [], "sample": False, "intro_source": f"{SRC} (기본정보)",
                                       "coord_source": "주소 → 카카오 지도 주소 검색"})
    for r in rows:
        pid = MAP.get(r["name"])
        p = places.get(pid) if pid else None
        if not p:
            continue
        items = {c: [[k, v] for k, v in r.get("acc", {}).get(c, []) if not _NO.match(v or "")] for c in CATS}
        items = {c: v for c, v in items.items() if v}
        prev = p.access_kto or {}
        merged = {c: (prev.get("items", {}).get(c, []) + [x for x in items.get(c, []) if x not in prev.get("items", {}).get(c, [])])
                  for c in CATS if prev.get("items", {}).get(c) or items.get(c)}
        p.access_kto = {"cats": [c for c in CATS if merged.get(c)], "items": merged,
                        "links": prev.get("links", []) + [{"name": r["name"], "url": URL + r["id"], "updated": r.get("mod", "")}]}
        for f in _facilities(items):
            if not any(x.startswith(f) for x in p.facilities):
                p.facilities.append(f)
        if not p.segments:
            p.segments = _entrance(items)
            if p.segments and p.wheelchair == "확인 전":
                p.wheelchair = "불가" if any(s.grade == "R" for s in p.segments) else "일부"
            if p.segments and not p.access_source:
                p.access_source = SRC
        b = r.get("basic", {})
        if not p.phone and b.get("문의"):
            m = re.search(r"0\d{1,2}-\d{3,4}-\d{4}", b["문의"])
            if m: p.phone = m.group(0)
        if pid in HOURS and not p.open:
            o, c, closed, last = HOURS[pid]
            p.open, p.close, p.last_entry = o, c, last
            p.closed_day_nums = closed
            p.hours_source = f"{SRC} 기본정보 (2026-11 확인)"
            p.hours = "상시 개방" if (o, c) == ("00:00", "24:00") else f"{o}~{c}"
            if closed:
                p.closed_days = "·".join("일월화수목금토"[i] for i in closed) + "요일"
    return places
