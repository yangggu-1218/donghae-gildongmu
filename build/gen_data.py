# 데모(정적 페이지)용 data.json 만들기: 백엔드와 같은 값을 미리 묶는다.
import json, sys, copy
sys.path.insert(0, "../backend")
from app.main import PLACES
from app import public_data, details, pages
pub = copy.deepcopy(public_data.PUB)
for ct in pub.get("city_tour", []): ct["stops"] = public_data.city_tour([])["stops"]
d = {"places": [{**p.model_dump(), "verified": p.verified} for p in PLACES.values()], "pub": pub, "med": details.MED,
     "toilets": pages.TOILETS, "static": {"transport": pages.transport("ko"), "facilities": pages.facilities(), "sources": pages.sources(), "lodging": public_data.lodging("", 0),
     "events_all": {"events": public_data.events("0000-00-00")["upcoming"], "as_of": public_data.events()["as_of"]}}}
json.dump(d, open("data.json", "w"), ensure_ascii=False)
print("ok", len(d["places"]), len(d["toilets"]))
