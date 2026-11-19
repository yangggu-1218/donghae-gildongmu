"""한국관광공사 TourAPI에서 동해시 장소와 무장애 정보를 모은다. (팀 컴퓨터에서 실행)
사용: python scripts/collect_tourapi.py            # 전체
     python scripts/collect_tourapi.py --limit 5  # 5곳만 시험
결과: data/raw/tour_list.json, data/raw/tour_with_detail.json, data/raw/tour_eng_list.json
개발 계정은 API마다 하루 1,000회. 이 스크립트는 장소 수 x 2회 정도를 쓴다.
※ 오퍼레이션 이름(…2)은 2025년 개편 기준. 오류가 나면 data/raw/_last_error.txt 를 보고 활용매뉴얼(zip)과 비교할 것."""
import argparse, json, os, sys, time
from pathlib import Path
import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
KEY = os.getenv("DATA_GO_KR_KEY")
RAW = ROOT / "data" / "raw"; RAW.mkdir(parents=True, exist_ok=True)
WITH = "https://apis.data.go.kr/B551011/KorWithService2"
ENG = "https://apis.data.go.kr/B551011/EngService2"


def call(base: str, ops: list[str], **params) -> list[dict]:
    """ops를 차례로 시도해 처음 성공한 응답의 item 목록을 돌려준다."""
    p = {"serviceKey": KEY, "MobileOS": "ETC", "MobileApp": "gildongmu", "_type": "json", "numOfRows": 500, "pageNo": 1, **params}
    last = ""
    for op in ops:
        try:
            r = httpx.get(f"{base}/{op}", params=p, timeout=15)
            body = r.json()["response"]["body"]
            items = body.get("items") or {}
            items = items.get("item", []) if isinstance(items, dict) else []
            return items if isinstance(items, list) else [items]
        except Exception as e:
            last = f"{op}: {e}\n{r.text[:500] if 'r' in locals() else ''}"
    (RAW / "_last_error.txt").write_text(last, encoding="utf-8")
    print("  ! 실패 (data/raw/_last_error.txt 확인):", last[:200])
    return []


def find_code(items: list[dict], word: str) -> str | None:
    for it in items:
        if word in str(it.get("name", "")):
            return str(it.get("code"))
    return None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=0); a = ap.parse_args()
    if not KEY:
        sys.exit(".env 에 DATA_GO_KR_KEY 를 넣어 주세요 (공공데이터포털 일반 인증키, Decoding 값).")

    print("1) 지역 코드 찾기")
    area = find_code(call(WITH, ["areaCode2", "areaCode1"]), "강원")
    sigungu = find_code(call(WITH, ["areaCode2", "areaCode1"], areaCode=area), "동해") if area else None
    print("   강원 =", area, "/ 동해시 =", sigungu)
    if not (area and sigungu):
        sys.exit("지역 코드를 찾지 못했어요. 활용매뉴얼의 법정동 코드(lDongRegnCd, lDongSignguCd) 방식으로 바꿔야 할 수 있어요.")

    print("2) 동해시 무장애 장소 목록")
    places = call(WITH, ["areaBasedList2", "areaBasedList1"], areaCode=area, sigunguCode=sigungu, arrange="A")
    if a.limit: places = places[: a.limit]
    (RAW / "tour_list.json").write_text(json.dumps(places, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"   {len(places)}곳")

    print("3) 장소별 무장애 상세")
    detail = {}
    for i, p in enumerate(places, 1):
        cid = p.get("contentid")
        w = call(WITH, ["detailWithTour2", "detailWithTour1"], contentId=cid)
        c = call(WITH, ["detailCommon2", "detailCommon1"], contentId=cid, overviewYN="Y", defaultYN="Y")
        detail[cid] = {"title": p.get("title"), "with": w[0] if w else {}, "common": c[0] if c else {}}
        print(f"   [{i}/{len(places)}] {p.get('title')}")
        time.sleep(0.15)
    (RAW / "tour_with_detail.json").write_text(json.dumps(detail, ensure_ascii=False, indent=1), encoding="utf-8")

    print("4) 영문 관광정보 (영어 이름)")
    eng_area = find_code(call(ENG, ["areaCode2", "areaCode1"]), "Gangwon")
    eng_sig = find_code(call(ENG, ["areaCode2", "areaCode1"], areaCode=eng_area), "Donghae") if eng_area else None
    eng = call(ENG, ["areaBasedList2", "areaBasedList1"], areaCode=eng_area, sigunguCode=eng_sig) if eng_sig else []
    (RAW / "tour_eng_list.json").write_text(json.dumps(eng, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"   영문 {len(eng)}곳. 끝! 다음: python scripts/build_places.py")


if __name__ == "__main__":
    main()
