"""한국관광공사 '열린관광 모두의 여행' 이동약자 관광정보(동해시 관광지·명소 28곳)를 장소에 붙인다.
원본: data/public/raw/kto_access_a.json, kto_access_b.json (access.visitkorea.or.kr 상세 페이지의 기본정보·이동약자 편의정보, 2026-11 수집).
- access_kto: 분류(지체장애·시각장애·영유아가족·고령자)별 항목. '없음'은 빼고, 남은 항목이 하나라도 있는 분류만 아이콘으로 보인다.
- 편의시설 이름(장애인 화장실·주차·휠체어 대여 등)을 더한다.
- 구간 정보가 없는 곳에만 '출입구' 구간을 더한다 (직접 확인한 구간은 덮어쓰지 않는다).
- 운영시간이 비어 있는 곳에만 '상시 개방' 같은 값을 채운다 (팀이 전화로 확인한 값은 그대로 둔다)."""
import json
import re
from pathlib import Path

from .schemas import Place, Segment

RAW = Path(__file__).resolve().parents[2] / "data" / "public" / "raw"
SRC = "한국관광공사 열린관광 모두의 여행 이동약자 관광정보"
URL = "https://access.visitkorea.or.kr/ms/detail.do?cotId="

# 열린관광 이름 → 길동무 장소 id (한 장소에 두 항목이 붙기도 한다: 묵호항 + 활·선어판매센터, 추암해변 + 추암 촛대바위)
MAP = {"천곡천연동굴 자연학습체험공원": "nature_park", "연필뮤지엄": "pencil_museum", "묵호항수변공원": "mukho_park", "무릉계곡": "valley",
       "삼화사": "samhwasa", "동해무릉건강숲": "forest", "추암조각공원": "chuam_sculpture", "한섬해변&한섬감성바닷길": "hanseom",
       "묵호항": "mukho_port", "묵호항 활·선어판매센터": "mukho_port", "동쪽바다중앙시장": "central_market", "북평민속오일장": "bukpyeong_market",
       "무릉별유천지": "mureung", "추암해변": "chotdae", "추암 촛대바위": "chotdae", "천곡황금박쥐동굴": "cave", "도째비골스카이밸리": "dokkaebi",
       "노봉해변": "nobong", "망상해변": "mangsang", "묵호등대": "mukho_lighthouse", "동해 논골담길": "nongol", "어달해변": "eodal",
       "동해약천온천실버타운": "yakcheon", "가원습지 생태자연공원": "gawon", "묵호시장": "mukho_market", "북평성당": "bukpyeong_church",
       "동해문화원": "culture_center", "봉정연꽃마을": "bongjeong_lotus"}
VISION = re.compile(r"점자|보조견|시각장애|음성 ?안내|큰활자")
CATS = ["지체장애", "영유아가족", "고령자"]   # 시각장애 편의는 다루지 않음 (팀장 요청 2026-11-20)

# 열린관광에만 있고 길동무에 없던 6곳 (좌표: 주소 → 카카오 지도 주소 검색, 2026-11-20)
NEW = [
    {"id": "yakcheon", "name_ko": "동해약천온천실버타운", "name_en": "Donghae Yakcheon Hot Spring", "zone": "mangsang", "type": "관광지", "lat": 37.59418, "lon": 129.06696,
     "stay_min": 90, "styles": ["체험"], "indoor": True, "address": "강원특별자치도 동해시 석두골길 145", "phone": "033-534-6502",
     "intro_ko": "망운산 자락의 온천이에요. 26.5℃ 중탄산나트륨천으로, 묵호역에서 차로 12분·망상역에서 5분 걸려요.",
     "intro_en": "A hot spring at the foot of Mangunsan (26.5°C sodium bicarbonate water), 12 minutes by car from Mukho Station and 5 from Mangsang Station.",
     "about": [{"t": ["온천", "Baths"], "i": [["온탕·열탕·냉탕에 동해 바닷물을 끌어온 심층해수탕, 황토탕, 수중 안마탕까지 여섯 가지 탕이 있어요.", "Six baths including deep-sea-water, red-clay and massage baths."],
                                       ["옥·자수정·소금·황토 사우나 네 곳이 있고, 여름에는 야외 온천풀장을 열어요.", "Four saunas, plus an outdoor hot-spring pool in summer."]]},
               {"t": ["가기 전에", "Before you go"], "i": [["설·추석 당일만 쉬고, 계절마다 여는 시간이 달라 전화로 확인해 주세요.", "Closed only on Seollal and Chuseok; hours vary by season, so call ahead."],
                                                  ["출입구 경사로·자동문·엘리베이터·장애인 화장실이 있어요.", "Ramp, automatic doors, elevator and accessible toilet."]]}],
     "intro_source": "팀 정리 (한국관광공사 대한민국구석구석·열린관광 소개와 이동약자 편의정보, 팀장 제공 자료 참고)", "tip_ko": "온천이에요. 계절마다 운영시간이 달라 가기 전에 전화로 확인하세요.", "tip_en": "Hot spring; hours vary by season, so call ahead."},
    {"id": "gawon", "name_ko": "가원습지 생태자연공원", "name_en": "Gawon Wetland Eco Park", "zone": "chuam", "type": "관광지", "lat": 37.47360, "lon": 129.10703,
     "stay_min": 40, "styles": ["자연·산책"], "indoor": False, "address": "강원특별자치도 동해시 지가동 77-6", "phone": "033-530-2261",
     "intro_ko": "1970년대 시멘트 원료(점토)를 캘 때 흙탕물을 모아 두던 웅덩이가 오랜 세월 동식물이 사는 습지가 된 곳이에요. 습지를 지키며 쉬고 자연을 관찰하는 공원으로 꾸몄어요.",
     "intro_en": "A pond once used to settle muddy water from 1970s clay quarrying, now a natural wetland park for rest and nature watching.",
     "about": [{"t": ["가기 전에", "Before you go"], "i": [["늘 열려 있고 쉬는 날이 없어요.", "Always open, every day."],
                                                  ["출입구까지 턱이 없어 휠체어로 들어갈 수 있어요.", "Step-free entrance for wheelchairs."]]}],
     "intro_source": "팀 정리 (한국관광공사 대한민국구석구석·열린관광 소개와 이동약자 편의정보, 팀장 제공 자료 참고)", "tip_ko": "출입구까지 턱이 없어 휠체어로 들어갈 수 있는 습지 공원이에요.", "tip_en": "Wetland park with a step-free entrance."},
    {"id": "mukho_market", "name_ko": "묵호시장", "name_en": "Mukho Market", "zone": "mukho", "type": "관광지", "lat": 37.55235, "lon": 129.11488,
     "stay_min": 40, "styles": ["맛집", "역사·문화"], "indoor": False, "address": "강원특별자치도 동해시 일출로 67", "phone": "033-533-8118",
     "intro_ko": "묵호항 여객터미널 맞은편의 재래시장이에요. 옆 동쪽바다중앙시장보다 작지만 옛 시장 분위기가 더 짙고, 자연산 횟감과 건어물 가게가 많아요.",
     "intro_en": "A traditional market opposite the Mukho ferry terminal, smaller and older-feeling than the next-door central market, known for raw fish and dried seafood.",
     "about": [{"t": ["둘러보기", "Look around"], "i": [["시장 앞쪽은 건어물·먹거리 가게, 골목 안쪽은 횟집 20여 곳이 마주 보고 있어요.", "Dried seafood and snacks at the front; about 20 raw-fish restaurants down the alley."],
                                                ["논골담길·도째비골 스카이밸리에서 걸어서 갈 수 있어 함께 묶어 다니기 좋아요.", "Walkable from Nongol-dam-gil and Dokkaebi-gol Sky Valley."]]},
               {"t": ["가기 전에", "Before you go"], "i": [["가게마다 쉬는 날·여는 시간이 달라요.", "Each shop has its own hours."],
                                                  ["통로가 좁고 수산시장이라 바닥이 젖어 있어요. 장애인 주차는 묵호항 공영주차장(5면, 입구까지 약 150m).", "Narrow, wet aisles. Accessible parking at Mukho Port car park (5 spaces, ~150 m)."]]}],
     "intro_source": "팀 정리 (한국관광공사 대한민국구석구석·열린관광 소개와 이동약자 편의정보, 팀장 제공 자료 참고)", "tip_ko": "통로가 좁고 수산시장이라 바닥이 젖어 있어요. 장애인 주차구역은 묵호항 공영주차장 쪽이에요.", "tip_en": "Narrow aisles and wet floors (fish market). Accessible parking at the Mukho Port public car park."},
    {"id": "bukpyeong_church", "name_ko": "북평성당", "name_en": "Bukpyeong Catholic Church", "zone": "chuam", "type": "관광지", "lat": 37.48104, "lon": 129.12590,
     "stay_min": 30, "styles": ["역사·문화"], "indoor": True, "address": "강원특별자치도 동해시 오일장2길 16", "phone": "033-521-1784",
     "wheelchair": "가능",
     "intro_ko": "1958년에 세운 천주교 성당이에요. 6·25전쟁 직후의 시멘트 블록 건물로, 시대 모습과 근대 건축의 특징이 남아 있어 국가등록문화유산이 됐어요.",
     "intro_en": "A Catholic church built in 1958 of cement blocks right after the Korean War; a registered national heritage building.",
     "about": [{"t": ["성당의 역사", "History"], "i": [["1958년 4월 본당이 세워지고 구미리에 성당과 사제관을 지었어요. 그해 9월 첫 주임 신부가 왔어요.", "The parish was set up in April 1958; the church and rectory were built that year."],
                                                ["영동 지역 천주교가 자라 온 모습을 보여 주는 곳이에요.", "It shows how Catholicism grew in the Yeongdong region."]]},
               {"t": ["가기 전에", "Before you go"], "i": [["휠체어로 갈 수 있어요. 출입구까지 경사로가 있어요.", "Wheelchair accessible, with a ramp to the entrance."],
                                                  ["미사 중에는 조용히 둘러봐 주세요. 미사 시간: 평일 오전·저녁, 토요일 저녁, 일요일 오전·오후.", "Please be quiet during Mass (weekday mornings/evenings, Sat evening, Sun)."]]}],
     "intro_source": "팀 정리 (한국관광공사 대한민국구석구석·열린관광 소개와 이동약자 편의정보, 팀장 제공 자료 참고)", "tip_ko": "출입구까지 경사로가 있어요. 미사 시간에는 조용히 둘러봐 주세요.", "tip_en": "Ramp to the entrance. Please be quiet during Mass."},
    {"id": "culture_center", "name_ko": "동해문화원", "name_en": "Donghae Cultural Center", "zone": "cheongok", "type": "관광지", "lat": 37.52692, "lon": 129.11450,
     "stay_min": 40, "styles": ["역사·문화"], "indoor": True, "address": "강원특별자치도 동해시 평원로 17", "phone": "033-531-3298", "fee": "무료",
     "wheelchair": "일부",
     "segments": [{"name": "입구 계단 → 장애인 리프트", "grade": "G", "note": "입구 계단 옆 장애인 리프트로 오를 수 있어요", "source": "한국관광공사 열린관광 이동약자 관광정보"}],
     "intro_ko": "동해시의 지역 문화원이에요. 향토 자료를 모아 보여 주고 문화 행사를 열며, 시민 누구나 들을 수 있는 문화학교 강좌가 있어요.",
     "intro_en": "Donghae's local cultural center, with local-history materials, events and open classes for residents.",
     "about": [{"t": ["문화학교", "Culture school"], "i": [["한글서예, 대금, 민화, 사군자, 고전무용, 가야금 강좌가 열려요.", "Classes in calligraphy, daegeum, folk painting, classical dance and gayageum."],
                                                     ["누리집: donghaecc.co.kr", "Website: donghaecc.co.kr"]]},
               {"t": ["가기 전에", "Before you go"], "i": [["평일 9~18시, 주말·공휴일은 쉬어요. 이용료는 없어요.", "Weekdays 9-18; closed weekends and holidays. Free."],
                                                  ["입구 계단 옆에 장애인 리프트가 있고, 주차장·화장실이 있어요.", "Wheelchair lift by the entrance steps; parking and toilets available."]]}],
     "intro_source": "팀 정리 (한국관광공사 대한민국구석구석·열린관광 소개와 이동약자 편의정보, 팀장 제공 자료 참고)", "tip_ko": "장애인 리프트가 있어요. 주말·공휴일은 쉬어요.", "tip_en": "Has a wheelchair lift. Closed weekends and holidays."},
    {"id": "bongjeong_lotus", "name_ko": "봉정연꽃마을", "name_en": "Bongjeong Lotus Village", "zone": "chuam", "type": "관광지", "lat": 37.47309, "lon": 129.12444,
     "stay_min": 40, "styles": ["자연·산책", "체험"], "indoor": False, "address": "강원특별자치도 동해시 봉정1길 19-7", "phone": "033-521-8559",
     "intro_ko": "단봉동의 연꽃 체험 마을이에요. 약 3,600㎡ 연꽃 단지 '봉정연당'에 여름이면 홍련과 백련이 함께 피어요.",
     "intro_en": "A lotus-farm village in Danbong-dong. In summer red and white lotuses bloom across the 3,600 m² Bongjeong lotus pond.",
     "about": [{"t": ["마을 이야기", "The village"], "i": [["하늘에서 내려다본 모습이 봉황을 닮아 '봉황새마을'이라고도 불러요.", "Also called Phoenix Village, as it looks like a phoenix from above."],
                                                    ["주민들이 강원도 아리랑에 맞춰 추는 '봉황춤'이 마을의 자랑이에요.", "Villagers' Phoenix Dance to Gangwon Arirang is the local pride."]]},
               {"t": ["체험", "Activities"], "i": [["딸기 따기, 옥수수·감자·고구마 캐기, 연잎 수제비 만들기 같은 먹거리 체험이 많아요.", "Strawberry picking, harvesting corn and potatoes, and making lotus-leaf sujebi."],
                                               ["300여 년 된 한옥 고택 둘러보기와 스카프 천연염색 체험도 있어요.", "Visit a 300-year-old hanok and try natural dyeing."],
                                               ["연잎차·연잎가루·연잎밥을 팔아요. 체험은 평일, 단체는 예약하면 돼요.", "Lotus-leaf tea, powder and rice are sold. Weekdays; groups can book."]]},
               {"t": ["축제", "Festival"], "i": [["연꽃이 한창인 7월 말에 연꽃·천연염색 축제가 열려요.", "A lotus and natural-dye festival is held in late July."]]}],
     "intro_source": "팀 정리 (한국관광공사 대한민국구석구석·열린관광 소개와 이동약자 편의정보, 팀장 제공 자료 참고)", "tip_ko": "연꽃 체험 마을이에요. 주말·공휴일은 쉬고 단체 예약만 받아요.", "tip_en": "Lotus farm village; closed weekends and holidays (group bookings only)."},
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
            # 원본 문구 끝의 '_무장애 편의시설' 꼬리표는 화면에 보이지 않게 뺀다 (팀장 요청: '무장애' 표현 안 씀)
            out += json.loads(p.read_text(encoding="utf-8").replace("_무장애 편의시설", "").replace("무장애", "이동약자"))
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
            places[r["id"]] = Place(**{"intro_source": f"{SRC} (기본정보)", **r, "facilities": [], "segments": [Segment(**x) for x in r.get("segments", [])], "sample": False,
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


def drop_vision(places: dict[str, Place]) -> dict[str, Place]:
    """시각장애 편의는 다루지 않는다 (팀장 요청 2026-11-20). 저장된 자료·관리자 값에 남은 분류·항목·편의시설 이름도 뺀다."""
    # 시각장애 편의는 다루지 않는다 (팀장 요청 2026-11-20): 저장된 자료에 남은 분류·항목·편의시설 이름도 뺀다
    for p in places.values():
        a = p.access_kto or {}
        if "시각장애" in (a.get("cats") or []) or "시각장애" in (a.get("items") or {}):
            a["cats"] = [c for c in a.get("cats", []) if c != "시각장애"]
            a["items"] = {c: v for c, v in (a.get("items") or {}).items() if c != "시각장애"}
            p.access_kto = a
        if p.facilities:
            p.facilities = [f for f in p.facilities if not VISION.search(f)]
    return places
