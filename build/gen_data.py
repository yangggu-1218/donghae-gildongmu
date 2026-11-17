# 데모(정적 페이지)용 data.json 만들기: 백엔드와 같은 값을 미리 묶는다.
import json, sys, copy
sys.path.insert(0, "../backend")
from app.main import PLACES
from app import public_data, details, pages
pub = copy.deepcopy(public_data.PUB)
pub.pop("restaurants", None)   # 좌표가 붙은 eat 목록으로 대신한다
for ct in pub.get("city_tour", []): ct["stops"] = public_data.city_tour([])["stops"]
d = {"places": [{**p.model_dump(), "verified": p.verified} for p in PLACES.values()], "pub": pub, "med": details.MED,
     "toilets": pages.TOILETS, "eat": public_data.EAT, "eat_link": {k: list(v) for k, v in public_data.EAT_LINK.items()}, "static": {"transport": pages.transport("ko"), "facilities": pages.facilities(), "sources": pages.sources(), "lodging": public_data.lodging("", 0),
     "events_all": {"events": public_data.events("0000-00-00")["upcoming"], "as_of": public_data.events()["as_of"]}}}
json.dump(d, open("data.json", "w"), ensure_ascii=False)
print("ok", len(d["places"]), len(d["toilets"]))
