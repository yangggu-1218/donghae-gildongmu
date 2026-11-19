import json,sys
sys.path.insert(0,"../backend")
from app.main import course, talk, edit
from app.schemas import Conditions
C=json.load(open("cases.json")); out={"course":[],"talk":[],"edit":[]}
def sm(r):
    cs=r["course"]; ex=r.get("extras") or {}
    return {"ids":[s["id"] for s in cs["stops"]],"arr":[s["arrive"]+"-"+s["depart"]+s["kind"]+s["open_state"]+str(s["wait_min"])+s["hours_text"] for s in cs["stops"]],
            "grades":[s["grade"] for s in cs["stops"]],"notes":cs["notes"],"back":cs["back_at"],"date":cs["date"]+str(cs["weekday"])+cs["start_time"],
            "skip":cs["skipped"],"stay":(r.get("stay") or {}).get("count"),"move":bool(r.get("move")),"ev":[e["name"] for e in r.get("events") or []],"onday":r.get("events_on_day"),
            "near":[[ (ex[i]["nearby"].get(k) or {}).get("name") for k in ("parking","charger","info_center")]+[(v or {}).get("name") for v in ex[i]["nearby"].get("medical",{}).values()] for i in ex],
            "acc":[[ex[i].get(k) for k in ("walk_load","table","wheelchair","carer_tip")] for i in ex]}
for c in C["course"]:
    out["course"].append(sm(course(Conditions(**c))))
for e in C["edit"]:
    r=course(Conditions(**e["base"])); log=[]
    for st in e["steps"]:
        ids=[s["id"] for s in r["course"]["stops"]]
        if st.startswith("@"):
            a,_,tg=st[1:].partition(":"); tg=ids[int(tg)] if tg.isdigit() else (tg or None)
            body={"conditions":r["conditions"],"course_ids":ids,"action":a,"target":tg}
        else: body={"conditions":r["conditions"],"course_ids":ids,"text":st}
        r=edit(body); log.append({**sm(r),"reply":r["reply"],"act":r["action"],"ch":r["changed"],"cond":{k:r["conditions"][k] for k in ("must","exclude","cap","rest","lunch","flat_only","date","start_time","skip_lunch","rain")}})
    out["edit"].append(log)
for seq,lang in [(s,"ko") for s in C["talk"]]+[(s,"en") for s in C["talk_en"]]:
    st={"conditions":{"lang":lang,"date":"2026-11-14"},"state":{},"course_ids":[]}; log=[]
    for m in seq:
        r=talk({**st,"message":m})
        st={"conditions":r["conditions"],"state":r["state"],"course_ids":[s["id"] for s in r["course"]["stops"]] if r["course"] else st["course_ids"]}
        log.append({"reply":r["reply"],"pose":r["pose"],"ids":st["course_ids"],"cards":[c["kind"] for c in r["cards"]],"move":r["conditions"]["move"],"who":r["conditions"]["who"],
                    "arr":[s["arrive"] for s in r["course"]["stops"]] if r["course"] else None})
    out["talk"].append(log)
print(json.dumps(out,ensure_ascii=False))
