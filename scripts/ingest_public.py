"""공공데이터 CSV 한꺼번에 넣기.
사용: data/public/raw/ 에 공공데이터포털에서 받은 CSV를 (파일 이름 상관없이) 넣고
      python scripts/ingest_public.py
- 인코딩(UTF-8 / CP949)을 스스로 판별한다.
- 열 이름을 보고 어떤 데이터인지 알아낸다 (아래 SCHEMAS). 모르는 데이터는 리포트에 열 이름을 남긴다.
- 결과: data/public/public_data.json (서버가 읽음), data/public/report.md (건수·기준일·이상값)
새 데이터 종류를 추가하려면 SCHEMAS에 한 줄, FIELDS에 열 이름 대응을 넣는다."""
import csv, io, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/public/raw"
OUT = ROOT / "data/public"

# 종류: (꼭 있어야 하는 열, 설명)
SCHEMAS = {
    "attractions":  ({"관광명소명", "위도", "경도"}, "동해시_관광명소"),
    "tourist_zones": ({"관광지명", "공공편익시설정보"}, "동해시_관광지 (관광진흥법 지정)"),
    "info_centers": ({"관광안내소명", "영어안내가능여부"}, "동해시_관광안내소"),
    "events":       ({"행사명", "행사시작일자"}, "동해시_문화행사"),
    "heritage":     ({"향토유산명", "향토유산소개"}, "동해시_향토문화유산"),
    "trails":       ({"길명", "총길이", "경로정보"}, "동해시_걷기길"),
    "lodging":      ({"업종명", "업소명", "영업소 주소(도로명)"}, "동해시_숙박업소"),
    "restaurants":  ({"업종명", "업소명", "업태명"}, "동해시_일반음식점"),
    "signals":      ({"신호등관리번호", "잔여시간표시기유무"}, "동해시_신호등"),
    "city_tour":    ({"시티투어코스명", "시티투어코스정보"}, "동해시_시티투어"),
    "taxi_stands":  ({"택시전용정차면수", "상세위치"}, "동해시_택시승차대"),
    "wheelchair_chargers": ({"동시사용가능대수", "공기주입가능여부"}, "동해시_전동휠체어 급속충전기"),
    "parking":      ({"주차장관리번호", "주차구획수"}, "동해시_공영주차장"),
    "bike_roads":   ({"자전거도로종류", "총길이(km)"}, "동해시_자전거도로"),
    "tourist_lodging": ({"업소명", "영업소도로명주소", "업태명"}, "동해시_관광숙박업"),
    "mobility_center": ({"교통약자이동지원센터명"}, "동해시_교통약자이동지원센터"),
    "parks":        ({"공원명", "공원구분"}, "동해시_도시공원"),
    "rentals":      ({"업체명", "자동차총보유대수"}, "동해시_자동차대여업"),
    "festivals":    ({"축제명", "축제시작일자"}, "동해시_축제"),
    "museums":      ({"박물관미술관구분", "휴관정보"}, "동해시_박물관·미술관"),
}
# 다른 종류에 합쳐 넣는 데이터 (축제 → 행사, 관광숙박업 → 숙박)
MERGE_INTO = {"festivals": "events", "tourist_lodging": "lodging"}
# 받았지만 서비스에 쓰지 않는 데이터 (이유를 리포트에 남긴다)
IGNORE = {
    frozenset({"포장연장", "미포장연장"}): "도로 포장 현황 — 노선별 총연장만 있고 위치가 없어 보행 경로 판정에 쓸 수 없음",
    frozenset({"보호구역도로폭", "관할경찰서명"}): "노인보호구역 — 복지관·경로당 앞 차량 속도 제한 구역이라 관광 동선과 겹치지 않음",
    frozenset({"운반용차량보유여부", "저장시설보유여부"}): "고압가스·의약품 도매 시설 — 여행자용 약국이 아니라서 쓰지 않음 (약국은 국립중앙의료원 API 사용)",
}

# 표준 이름 ← 원본 열 이름
FIELDS = {
    "attractions": {"name": "관광명소명", "road": "도로명주소", "jibun": "지번주소", "tel": "전화번호", "lat": "위도", "lon": "경도", "as_of": "기준일자"},
    "tourist_zones": {"name": "관광지명", "road": "소재지도로명주소", "jibun": "소재지지번주소", "lat": "위도", "lon": "경도",
                      "public_facilities": "공공편익시설정보", "lodging": "숙박시설정보", "culture": "휴양및문화시설정보",
                      "capacity": "수용인원수", "parking": "주차가능수", "intro": "관광지소개", "tel": "관리기관전화번호", "as_of": "데이터기준일자"},
    "info_centers": {"name": "관광안내소명", "spot": "안내소위치명", "intro": "안내소소개", "service": "부가서비스정보", "closed": "휴무일",
                     "open_summer": "운영시작시각(하절기)", "close_summer": "운영종료시각(하절기)",
                     "open_winter": "운영시작시각(동절기)", "close_winter": "운영종료시각(동절기)",
                     "en": "영어안내가능여부", "ja": "일본어안내가능여부", "zh": "중국어안내가능여부", "other_lang": "안내가능외국어",
                     "tel": "안내소전화번호", "road": "소재지도로명주소", "jibun": "소재지지번주소", "operator": "운영기관명",
                     "url": "홈페이지주소", "lat": "위도", "lon": "경도", "as_of": "데이터기준일자"},
    "events": {"name": "행사명", "venue": "장소", "kind": "행사내용", "start": "행사시작일자", "end": "행사종료일자",
               "start_time": "행사시작시각", "end_time": "행사종료시각", "fee_type": "요금정보", "fee": "관람요금", "age": "입장연령",
               "tel": "전화번호", "seats": "객석수", "url": "홈페이지주소", "ticket": "예매정보", "road": "소재지도로명주소",
               "lat": "위도", "lon": "경도", "as_of": "데이터기준일자"},
    "heritage": {"name": "향토유산명", "category": "향토유산구분", "kind": "향토유산종류", "road": "소재지도로명주소", "jibun": "소재지지번주소",
                 "lat": "위도", "lon": "경도", "era": "조성시대", "intro": "향토유산소개", "tel": "관리기관전화번호", "as_of": "데이터기준일자"},
    "trails": {"name": "길명", "intro": "길소개", "length_km": "총길이", "duration": "총소요시간", "start": "시작지점명",
               "start_road": "시작지점도로명주소", "end": "종료지점명", "route": "경로정보", "tel": "관리기관전화번호", "as_of": "데이터기준일자"},
    "restaurants": {"kind": "업태명", "name": "업소명", "road": "도로명주소", "jibun": "지번주소", "tel": "전화번호", "licensed": "인허가일자", "as_of": "데이터기준일자"},
    "signals": {"name": "신호등관리번호", "road_name": "도로노선명", "jibun": "소재지지번주소", "lat": "위도", "lon": "경도", "type": "신호등구분",
                "countdown": "잔여시간표시기유무", "audio": "시각장애인용음향신호기유무", "push": "보행자작동신호기유무", "as_of": "데이터기준일자"},
    "city_tour": {"name": "시티투어코스명", "contact": "시티투어문의처", "days": "운행정보", "mode": "시티투어운행방식", "board": "시티투어탑승장소명",
                  "route": "시티투어코스정보", "nearby": "경유지주변관광정보", "first": "운행시작시각", "last": "운행종료시각",
                  "interval_min": "배차시간", "fare": "이용요금", "url": "홈페이지주소", "tel": "관리기관전화번호", "as_of": "데이터기준일자"},
    "taxi_stands": {"name": "상세위치", "road": "소재지도로명주소", "jibun": "소재지지번주소", "spaces": "택시전용정차면수", "as_of": "데이터기준일자"},
    "wheelchair_chargers": {"name": "시설명", "road": "소재지도로명주소", "jibun": "소재지지번주소", "lat": "위도", "lon": "경도", "spot": "설치장소설명",
                            "wk_open": "평일운영시작시각", "wk_close": "평일운영종료시각", "sat_open": "토요일운영시작시각", "sat_close": "토요일운영종료시각",
                            "hol_open": "공휴일운영시작시각", "hol_close": "공휴일운영종료시각", "slots": "동시사용가능대수",
                            "air": "공기주입가능여부", "phone_charge": "휴대전화충전가능여부", "tel": "관리기관전화번호", "as_of": "데이터기준일자"},
    "parking": {"name": "주차장명", "road": "소재지도로명주소", "jibun": "소재지지번주소", "spaces": "주차구획수", "fee_type": "요금정보",
                "base_min": "주차기본시간", "base_fee": "주차기본요금", "days": "운영요일", "wk_open": "평일운영시작시각", "wk_close": "평일운영종료시각",
                "note": "특기사항", "disabled_zone": "장애인전용주차구역보유여부", "tel": "전화번호", "lat": "위도", "lon": "경도", "as_of": "데이터기준일자"},
    "bike_roads": {"name": "노선명", "jibun": "기점지번주소", "lat": "기점위도", "lon": "기점경도", "length_km": "총길이(km)", "as_of": "데이터기준일자"},
    "tourist_lodging": {"name": "업소명", "road": "영업소도로명주소", "tel": "영업소전화번호", "kind": "업태명", "as_of": "데이터기준일자"},
    "mobility_center": {"name": "교통약자이동지원센터명", "road": "소재지도로명주소", "lat": "위도", "lon": "경도", "vehicles": "보유차량대수",
                        "slope": "슬로프형휠체어차량대수", "lift": "리프트형휠체어차량대수", "tel": "예약접수전화번호", "web": "예약접수인터넷주소",
                        "app": "앱서비스명", "book_open": "평일예약접수운영시작시각", "book_close": "평일예약접수운영종료시각",
                        "run_open": "차량평일운행시작시각", "run_close": "차량평일운행종료시각", "advance": "사전예약신청기간",
                        "area_in": "차량관내운행지역", "area_out": "차량관외운행지역", "who": "차량이용대상", "fare": "차량이용요금",
                        "office_tel": "관리기관전화번호", "as_of": "데이터기준일자"},
    "parks": {"name": "공원명", "kind": "공원구분", "jibun": "소재지지번주소", "lat": "위도", "lon": "경도", "area": "공원면적", "tel": "전화번호", "as_of": "데이터기준일자"},
    "rentals": {"name": "업체명", "road": "소재지도로명주소", "lat": "위도", "lon": "경도", "cars": "자동차총보유대수", "vans": "승합차보유대수",
                "wk_open": "평일운영시작시각", "wk_close": "평일운영종료시각", "we_open": "주말운영시작시각", "we_close": "주말운영종료시각",
                "tel": "전화번호", "as_of": "데이터기준일자"},
    "festivals": {"name": "축제명", "venue": "개최장소", "start": "축제시작일자", "end": "축제종료일자", "kind": "축제내용", "tel": "전화번호",
                  "url": "홈페이지주소", "road": "소재지도로명주소", "jibun": "소재지지번주소", "lat": "위도", "lon": "경도", "as_of": "데이터기준일자"},
    "museums": {"name": "시설명", "kind": "박물관미술관구분", "road": "소재지도로명주소", "jibun": "소재지지번주소", "lat": "위도", "lon": "경도",
                "tel": "운영기관전화번호", "url": "운영홈페이지", "amenities": "편의시설정보", "open": "평일관람시작시각", "close": "평일관람종료시각",
                "closed": "휴관정보", "fee_adult": "어른관람료", "fee_youth": "청소년관람료", "fee_child": "어린이관람료", "fee_note": "관람료기타정보",
                "intro": "박물관미술관소개", "as_of": "데이터기준일자"},
    "lodging": {"kind": "업종명", "name": "업소명", "road": "영업소 주소(도로명)", "jibun": "영업소 주소(지번)", "tel": "소재지전화", "as_of": "데이터기준일"},
}

# 동해시 대략 경계 (이 밖의 좌표는 이상값)
BBOX = (37.40, 37.66, 128.95, 129.20)
# 법정동 → 길동무 권역 (동해시 관광 누리집 5대 권역 기준, 시내는 station)
DONG_ZONE = {"망상동": "mangsang", "심곡동": "mangsang", "대진동": "mukho", "어달동": "mukho", "묵호진동": "mukho", "발한동": "mukho",
             "부곡동": "mukho", "망상": "mangsang", "천곡동": "cheongok", "용정동": "cheongok", "평릉동": "cheongok",
             "삼화동": "mureung", "이로동": "mureung", "추암동": "chuam", "구미동": "chuam", "구호동": "chuam", "북평동": "station",
             "송정동": "station", "효가동": "station", "동회동": "station", "나안동": "station", "북삼동": "station", "대구동": "station",
             "사문동": "station", "이도동": "station", "용정동 ": "cheongok", "동호동": "mukho", "묵호동": "mukho", "초구동": "mangsang",
             "괴란동": "mureung", "만우동": "mureung", "신흥동": "mureung", "비천동": "mureung", "달방동": "mureung", "삼화": "mureung", "단봉동": "station", "지가동": "station", "쇄운동": "station", "지흥동": "station"}

ZONE_CENTER = {"mangsang": {"lat": 37.592, "lon": 129.089}, "chuam": {"lat": 37.477, "lon": 129.159},
               "mukho": {"lat": 37.552, "lon": 129.117}, "mureung": {"lat": 37.463, "lon": 129.020},
               "cheongok": {"lat": 37.518, "lon": 129.110}, "station": {"lat": 37.490, "lon": 129.120}}


def read_csv(path: Path) -> tuple[list[dict], str]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            text = raw.decode(enc); break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError("인코딩을 알 수 없음")
    rows = list(csv.DictReader(io.StringIO(text)))
    return [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in rows], enc


def detect(headers: set[str]):
    for kind, (need, _) in SCHEMAS.items():
        if need <= headers:
            return kind
    return None


def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None


def dong_of(*addrs: str) -> str:
    for a in addrs:
        m = re.search(r"\(([가-힣0-9]+동)", a or "") or re.search(r"동해시\s+([가-힣0-9]+동)\b", a or "")
        if m:
            return m.group(1)
    return ""


def norm_record(kind: str, r: dict) -> dict:
    o = {k: r.get(src, "") for k, src in FIELDS[kind].items()}
    for k in ("lat", "lon", "length_km", "capacity", "parking", "seats", "fee", "spaces", "slots", "interval_min", "base_min", "base_fee",
              "vehicles", "slope", "lift", "area", "cars", "vans", "fee_adult", "fee_youth", "fee_child"):
        if k in o:
            o[k] = num(o[k])
    for k in ("en", "ja", "zh", "countdown", "audio", "push", "air", "phone_charge"):
        if k in o:
            o[k] = o[k].upper() == "Y"
    if o.get("tel") in ("000-0000-0000", ""):
        o["tel"] = ""
    d = dong_of(o.get("road", ""), o.get("jibun", ""), o.get("start_road", ""))
    o["dong"] = d
    o["zone"] = DONG_ZONE.get(d, "")
    if not o["zone"]:   # 도로명 주소에 동이 없으면 이름·도로명으로 권역 추정
        for key, z in (("망상", "mangsang"), ("무릉", "mureung"), ("삼화로", "mureung"), ("추암", "chuam"), ("묵호", "mukho"),
                       ("일출로", "mukho"), ("해안로 5", "mukho"), ("동해역", "station"), ("천곡로", "cheongok"), ("중앙로", "cheongok"),
                       ("평원로", "cheongok"), ("동굴로", "cheongok"), ("송정", "station"), ("효가", "station"), ("청운", "station"), ("이원길", "station"),
                       ("터미널", "cheongok"), ("샘실", "cheongok"), ("대동로", "station")):
            if key in (o.get("name", "") + " " + o.get("road", "")):
                o["zone"] = z; break
    return o


def dist_m(a: dict, b: dict) -> float:
    return ((a["lat"] - b["lat"]) ** 2 + ((a["lon"] - b["lon"]) * 0.79) ** 2) ** 0.5 * 111000   # 위도 37.5도 근사


def check(kind: str, recs: list[dict]) -> list[str]:
    """이상값 찾기: 동해 밖 좌표, 같은 좌표를 쓰는 서로 다른 동네의 장소, 시작이 끝보다 늦은 운영시간."""
    warn = []
    for o in recs:
        if o.get("lat") is not None and o.get("lon") is not None:
            if not (BBOX[0] <= o["lat"] <= BBOX[1] and BBOX[2] <= o["lon"] <= BBOX[3]):
                o["bad_coords"] = True
                warn.append(f"{o['name']}: 좌표가 동해시 밖 ({o['lat']}, {o['lon']})")
    for o in recs:
        if not o.get("lat"):
            continue
        same = [x for x in recs if x is not o and x.get("lat") and dist_m(o, x) < 50]
        other = [x for x in same if x["zone"] and o["zone"] and x["zone"] != o["zone"]]
        # 같은 좌표를 쓰는 두 장소 중, 좌표가 자기 권역 중심에서 먼 쪽을 오류로 본다
        if other and o["zone"] in ZONE_CENTER and dist_m(o, ZONE_CENTER[o["zone"]]) > 3000:
            o["bad_coords"] = True
            warn.append(f"{o['name']}: 좌표가 {other[0]['name']}와 같고 주소({o['dong']})와 3km 넘게 떨어짐 → 좌표 오류로 보고 쓰지 않음")
    if kind == "info_centers":
        for o in recs:
            if o["open_summer"] and o["close_summer"] and o["open_summer"] > o["close_summer"]:
                o["hours_suspect"] = True
                warn.append(f"{o['name']}: 운영 {o['open_summer']}~{o['close_summer']} → 입실·퇴실 시각으로 보여 '운영시간 확인 필요'로 표시")
    if kind == "lodging":
        n = sum(1 for o in recs if not o.get("lat"))
        if n:
            warn.append(f"좌표 없음 {n}곳 → 주소의 동으로 권역만 연결 (지도 표시는 카카오 주소 검색 필요)")
    return warn


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    data, report, unknown, ignored = {}, [], [], []
    files = sorted(RAW.glob("*.csv"))
    if not files:
        sys.exit(f"{RAW} 에 CSV가 없습니다")
    for f in files:
        rows, enc = read_csv(f)
        kind = detect(set(rows[0].keys()) if rows else set())
        hs = set(rows[0].keys()) if rows else set()
        why = next((w for need, w in IGNORE.items() if need <= hs), None)
        if why:
            ignored.append((f.name, why))
            continue
        if not kind:
            unknown.append((f.name, list(rows[0].keys()) if rows else []))
            continue
        recs = [norm_record(kind, r) for r in rows if any(r.values())]
        recs = [o for o in recs if o.get("name")]
        if kind == "lodging":   # 이 파일은 '공중위생업소' 전체(미용·세탁 포함) → 숙박업만 남긴다
            recs = [o for o in recs if o["kind"].startswith("숙박업")]
        for o in recs:
            o["source"] = SCHEMAS[kind][1]
            if kind == "festivals":
                o["festival"] = True
            if kind == "tourist_lodging":
                o["tourist"] = True
        data.setdefault(MERGE_INTO.get(kind, kind), []).extend(recs)
        report.append((kind, f.name, enc, len(recs), max((o.get("as_of", "") for o in recs), default="")))
    warns = {k: check(k, v) for k, v in data.items()}
    SCHEMAS.setdefault("events", ({}, "동해시_문화행사·축제"))

    (OUT / "public_data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = ["# 공공데이터 반영 리포트", "", "| 종류 | 파일 | 인코딩 | 건수 | 기준일 |", "|---|---|---|---|---|"]
    lines += [f"| {SCHEMAS[k][1]} | {fn} | {enc} | {n} | {d} |" for k, fn, enc, n, d in report]
    lines += ["", "## 확인이 필요한 값"]
    for k, ws in warns.items():
        lines += [f"- [{SCHEMAS[k][1]}] {w}" for w in ws]
    if "signals" in data:
        sg = data["signals"]
        lines += ["", "## 신호등 접근성 (발표용 수치)",
                  f"- 신호등 {len(sg)}개 중 시각장애인용 음향신호기 {sum(x['audio'] for x in sg)}개, 잔여시간 표시기 {sum(x['countdown'] for x in sg)}개, 보행자 작동 신호기 {sum(x['push'] for x in sg)}개"]
    if ignored:
        lines += ["", "## 받았지만 쓰지 않는 데이터"] + [f"- {fn}: {w}" for fn, w in ignored]
    if unknown:
        lines += ["", "## 아직 모르는 데이터 (SCHEMAS에 추가 필요)"]
        lines += [f"- {fn}: {', '.join(h)}" for fn, h in unknown]
    (OUT / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
