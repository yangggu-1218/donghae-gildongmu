"""운영 캐시와 독립적으로 공공 API의 실제 응답을 확인한다."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Lock
from time import monotonic
from . import bigdata

_lock = Lock()
_until = 0
_snapshot = None


def snapshot(place_count):
    global _until, _snapshot
    with _lock:
        if _snapshot and monotonic() < _until:
            return _snapshot
        now = datetime.now(bigdata.KST)
        area = {"areaCd":"51","signguCd":"51170"}
        coords = {"mapX":bigdata.CENTER[1],"mapY":bigdata.CENTER[0],"radius":20000}
        queries = [(label, "KorWithService2/locationBasedList2", dict(coords, contentTypeId=kind))
                   for label, kind in [("무장애 음식점","39"),("무장애 숙소","32"),("무장애 관광지","12")]]
        day = (now - timedelta(days=10)).strftime("%Y%m%d")
        queries.extend([
            ("관광지 집중률","TatsCnctrRateService/tatsCnctrRatedList",area),
            ("연관 관광지","TarRlteTarService1/areaBasedList1",dict(area, baseYm=(now.replace(day=1)-timedelta(days=1)).strftime("%Y%m"))),
            ("방문자 수","DataLabService/locgoRegnVisitrDDList",{"startYmd":day,"endYmd":day}),
            ("오디오 가이드","Odii/storyLocationBasedList",dict(coords,langCode="ko")),
            ("관광사진","PhotoGalleryService1/gallerySearchList1",{"keyword":"동해"})])

        def check(query):
            label, path, params = query
            if not bigdata.KEY:
                return [label, "warn", "공공데이터 인증키 설정 필요"]
            items, status = bigdata._call(path, dict(params, numOfRows=1, pageNo=1), "health_"+label)
            if not status["ok"]:
                return [label, "bad", "응답 오류 · 연결과 활용 승인을 확인하세요"]
            return [label, "ok", "자료 응답 확인"] if items else [label, "warn", "응답 성공 · 제공 자료 없음"]

        with ThreadPoolExecutor(max_workers=4) as pool:
            rows = list(pool.map(check, queries))
        _snapshot = {"checked_at": now.isoformat(), "rows":[["길동무 서버","ok","관리자 요청 처리 완료"],
                     ["장소 데이터", "ok" if place_count else "bad", "장소 목록 사용 가능" if place_count else "장소 목록이 비어 있어요"], *rows]}
        _until = monotonic() + 55
        return _snapshot
