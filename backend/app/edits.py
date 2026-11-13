"""작업3: AI 없이도 되는 코스 고치기 (규칙 기반).

말 한마디나 버튼 하나를 '조건 바꾸기'로 옮긴 뒤 엔진(plan)이 처음부터 다시 계산한다.
그래서 고친 뒤에도 이동 시간·체류 시간·요일 휴무·브레이크타임이 늘 다시 검사된다.

  빼기   : "도째비골 빼줘" / "2번 코스 빼줘" / "오르막 있는 곳 빼줘" / "여유롭게 한 군데 빼줘"
  바꾸기 : "점심 다른 곳으로" / "비 오는데 실내로" / "덜 걷는 평지로" / "중간에 쉴 카페 넣어줘" / "3번 다른 곳으로"
  넣기   : "논골담길 넣어줘"
  날짜   : "토요일로 바꿔줘" / "내일 오후 2시 출발" / "11월 21일" / "9시 반에 출발"
  보기   : "근처 충전기·주차장 보여줘" (코스는 그대로)
"""
import datetime as _dt
import re
from typing import Optional

from . import engine
from .schemas import Conditions, Place

WD = {"일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6}
WD_EN = {"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}
REMOVE = r"빼|제외|지워|없애|말고|안\s*갈|안\s*가|skip|remove|drop"
REPLACE = r"다른\s*(곳|데|집|식당|데로)|바꿔|바꾸|교체|대신|change|swap|another"
ADD = r"넣어|추가|넣자|가고\s*싶|들러|add|include"
UPHILL = r"오르막|경사|언덕|계단|가파|힘든\s*길|hill|slope|stairs"
INDOOR = r"실내|비\s*(가|와|오|온|올)|우천|indoor|rain"
FLAT = r"덜\s*걷|평지|평평|적게\s*걷|걷기\s*(힘|어려)|less\s*walk|flat"
RELAX = r"여유|느긋|천천히|한\s*(군데|곳)\s*(만)?\s*(빼|줄)|하나\s*(빼|줄)|줄여|fewer|relax"
CAFE = r"카페|쉬(어|었|는|다|ㄹ|면|고)|쉴|휴식|커피|rest|cafe|coffee"
LUNCH = r"점심|식당|밥|저녁|음식|lunch|dinner|restaurant"
NEARBY = r"충전기|충전|주차|charger|parking"


def josa(word: str, pair: str) -> str:
    """받침에 맞춰 조사를 붙인다. pair: "을를" / "은는" / "이가" / "으로" """
    w = re.sub(r"\s*\(예시\)$", "", word)
    ch = w[-1] if w else "가"
    has = "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 != 0
    if pair == "에서":
        return word + "에서"
    if pair == "으로":
        return word + ("으로" if has and (ord(ch) - 0xAC00) % 28 != 8 else "로")
    return word + (pair[0] if has else pair[1])


def today() -> _dt.date:
    return engine.trip_date(Conditions())


def _norm(s: str) -> str:
    return re.sub(r"\s|\(예시\)|\(.*?\)", "", s or "")


def find_place(text: str, places: dict[str, Place], ids: Optional[list[str]] = None) -> Optional[str]:
    """문장 속 장소 이름 (긴 이름부터, 코스 안에 있는 곳을 먼저)."""
    t = _norm(text)
    cands = []
    for p in places.values():
        names = {_norm(p.name_ko), _norm(p.name_en).lower()}
        names |= {_norm(w) for w in re.split(r"[\s·]", p.name_ko) if len(_norm(w)) >= 3}   # "도째비골 스카이밸리" → "도째비골"
        names |= {re.sub(r"(해변|해수욕장)$", "", n) for n in names if re.search(r"(해변|해수욕장)$", n)}   # "망상해변" → "망상"
        for n in names:
            if len(n) >= 2 and (n in t or n in t.lower()):
                cands.append((p.id in (ids or []), len(n), p.id))
    return max(cands)[2] if cands else None


def find_index(text: str, n: int) -> Optional[int]:
    m = re.search(r"(\d)\s*번|(첫|두|세|네|다섯)\s*번째|(\d)(st|nd|rd|th)", text)
    if not m:
        return None
    k = int(m.group(1) or m.group(3)) if (m.group(1) or m.group(3)) else {"첫": 1, "두": 2, "세": 3, "네": 4, "다섯": 5}[m.group(2)]
    return k - 1 if 1 <= k <= n else None


def parse_date(text: str, base: Optional[_dt.date] = None) -> Optional[str]:
    """'내일', '모레', '토요일', '다음 주 월요일', '11월 21일', '21일', '2026-11-21'."""
    base = base or today()
    text = re.sub(r"\d\s*박\s*\d\s*일|당일", "", text)
    if m := re.search(r"(20\d\d)[-./](\d{1,2})[-./](\d{1,2})", text):
        return _safe(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    if m := re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일", text) or re.search(r"(\d{1,2})/(\d{1,2})", text):
        y = base.year + (1 if (int(m.group(1)), int(m.group(2))) < (base.month, base.day) else 0)
        return _safe(y, int(m.group(1)), int(m.group(2)))
    if re.search(r"오늘|today", text): return base.isoformat()
    if re.search(r"모레", text): return (base + _dt.timedelta(2)).isoformat()
    if re.search(r"내일|tomorrow", text): return (base + _dt.timedelta(1)).isoformat()
    m = re.search(r"([일월화수목금토])요일", text) or re.search(r"\b(sun|mon|tue|wed|thu|fri|sat)", text.lower())
    if m:
        wd = WD.get(m.group(1), WD_EN.get(m.group(1)))
        cur = base.isoweekday() % 7
        ahead = (wd - cur) % 7
        if re.search(r"다음\s*주|next\s*week", text):   # 다음 주(월~일)의 그 요일
            ahead = (8 - base.isoweekday()) + (wd - 1) % 7
        return (base + _dt.timedelta(ahead)).isoformat()
    if m := re.search(r"(?<![\d월])(\d{1,2})\s*일(?!\s*(정|간|째))", text):
        d = int(m.group(1))
        y, mo = base.year, base.month
        if d < base.day:
            mo += 1
            if mo > 12: y, mo = y + 1, 1
        return _safe(y, mo, d)
    return None


def _safe(y, m, d):
    try:
        return _dt.date(y, m, d).isoformat()
    except ValueError:
        return None


def parse_time(text: str) -> Optional[str]:
    """'오후 2시', '9시 반', '10:30', '14시 출발'. 오전·오후가 없고 1~7시면 오후로 본다."""
    m = re.search(r"(\d{1,2}):(\d{2})", text)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
    else:
        m = re.search(r"(오전|오후|아침|낮|저녁)?\s*(\d{1,2})\s*시(?!간|청|장|내)\s*(반|(\d{1,2})\s*분)?", text)
        if not m:
            m2 = re.search(r"(\d{1,2})\s*(am|pm)", text.lower())
            if not m2:
                return None
            h, mi = int(m2.group(1)) % 12 + (12 if m2.group(2) == "pm" else 0), 0
        else:
            h = int(m.group(2))
            mi = 30 if m.group(3) == "반" else int(m.group(4) or 0)
            if m.group(1) in ("오후", "저녁", "낮") and h < 12: h += 12
            elif not m.group(1) and 1 <= h <= 7: h += 12
    if not (0 <= h <= 23 and 0 <= mi < 60):
        return None
    return f"{h:02d}:{mi:02d}"


# ---------------------------------------------------------------- 실행
def kinds(ids: list[str], places: dict[str, Place]) -> dict[str, str]:
    return {i: ("lunch" if places[i].type == "식당" else "cafe" if places[i].type == "카페" else "sight") for i in ids if i in places}


def _keep(c: Conditions, ids: list[str], places, drop: set[str]):
    """남는 관광지는 그대로 두고(must), 점심은 이어서 쓴다."""
    k = kinds(ids, places)
    c.must = [i for i in ids if k.get(i) == "sight" and i not in drop]
    lunch = next((i for i in ids if k.get(i) == "lunch"), None)
    c.lunch = lunch if lunch and lunch not in drop else None
    if c.cap is None:
        c.cap = len(ids) or None


def apply(places: dict[str, Place], c: Conditions, ids: list[str], text: str = "", action: str = "", target: Optional[str] = None) -> dict:
    """text(말) 또는 action(버튼)을 조건 변경으로 바꾼다.
    돌려주는 값: {action, conditions, reply, target, changed(bool)}"""
    c = c.model_copy(deep=True)
    ko = c.lang == "ko"
    nm = lambda pid: (places[pid].name_ko if ko else places[pid].name_en or places[pid].name_ko) if pid in places else ""
    low = text.lower()
    k = kinds(ids, places)
    act = action
    if not act and text:
        idx = find_index(text, len(ids))
        pid = target or (ids[idx] if idx is not None else None) or find_place(text, places, ids)
        has_time, has_date = parse_time(text), parse_date(text)
        if re.search(NEARBY, low) and re.search(r"보여|어디|알려|근처|찾|show|where|near", low) and not re.search(REMOVE, low):
            act = "nearby"
        elif (has_date or has_time) and re.search(r"바꿔|로\b|으로|출발|시작|가요|갈래|갈게|변경|옮겨|미뤄|당겨|에\s|start|leave|move|change|$", text):
            act, target = "set_when", None
        elif re.search(UPHILL, low) and re.search(REMOVE + "|" + REPLACE + "|없는|피해|avoid", low):
            act = "remove_uphill"
        elif re.search(RELAX, low) and not (pid and pid in ids):
            act = "relax"
        elif re.search(LUNCH, low) and re.search(REPLACE + "|" + REMOVE, low) and not (pid and pid in ids and k.get(pid) != "lunch"):
            act = "replace_lunch"
        elif re.search(INDOOR, low):
            act = "indoor"
        elif re.search(FLAT, low):
            act = "flat"
        elif re.search(CAFE, low) and re.search(ADD + r"|중간|쉬", low) and not (pid and k.get(pid) != "cafe" and re.search(REMOVE, low)):
            act = "add_cafe"
        elif pid and re.search(REPLACE, low) and pid in ids:
            act, target = "replace", pid
        elif pid and re.search(REMOVE, low):
            act, target = "remove", pid
        elif pid and re.search(ADD, low):
            act, target = "add", pid
        elif has_date or has_time:
            act = "set_when"
        else:
            act = "none"
    reply, changed = "", True

    if act == "remove" and target in ids:
        kind = k.get(target)
        _keep(c, ids, places, {target})
        c.exclude = list(dict.fromkeys([*c.exclude, target]))
        c.cap = max(2, (c.cap or len(ids)) - 1)
        if kind == "lunch":
            c.skip_lunch = True
        if kind == "cafe":
            c.rest = False
        reply = f"{josa(nm(target), "을를")} 뺐어요. 남은 곳의 시간을 다시 맞췄어요." if ko else f"Removed {nm(target)} and re-timed the rest."
    elif act == "remove" and target:
        changed = False
        reply = f"{josa(nm(target), "은는")} 지금 코스에 없어요." if ko else f"{nm(target)} isn't in the course."
    elif act == "replace" and target in ids:
        _keep(c, ids, places, {target})
        c.exclude = list(dict.fromkeys([*c.exclude, target]))
        if k.get(target) == "cafe":
            c.rest = True
        reply = f"{nm(target)} 대신 다른 곳을 넣었어요." if ko else f"Swapped {nm(target)} for another stop."
    elif act == "replace_lunch":
        cur = next((i for i in ids if k.get(i) == "lunch"), None)
        _keep(c, ids, places, {cur} if cur else set())
        if cur:
            c.exclude = list(dict.fromkeys([*c.exclude, cur]))
        c.skip_lunch = False
        reply = (f"점심을 {nm(cur)} 말고 다른 식당으로 바꿨어요." if cur else "점심 식당을 넣었어요.") if ko else "Changed the lunch spot."
    elif act == "remove_uphill":
        hilly = {i for i in ids if places[i].walk_load in ("완만한경사", "급경사") or places[i].type not in ("식당", "카페") and places[i].walk_load == "확인 전"}
        _keep(c, ids, places, hilly)
        c.exclude = list(dict.fromkeys([*c.exclude, *hilly]))
        c.flat_only = True
        reply = ((f"오르막이 있는 {josa(', '.join(nm(i) for i in hilly), "을를")} 빼고 평지 위주로 다시 짰어요." if hilly
                  else "지금 코스에는 오르막 있는 곳이 없어요. 평지만 쓰도록 맞춰 뒀어요.") if ko
                 else (f"Removed uphill stops ({', '.join(nm(i) for i in hilly)})." if hilly else "No uphill stops in this course."))
    elif act == "flat":
        hilly = {i for i in ids if places[i].walk_load not in ("평지",) and k.get(i) == "sight"}
        _keep(c, ids, places, hilly)
        c.flat_only = True
        c.move = sorted(set(c.move) | {"오래 걷기 어려움"})
        reply = (("덜 걷도록 평지 코스로 바꿨어요." if hilly else "지금 코스는 이미 평지 위주예요. 앞으로도 평지만 고를게요.") if ko
                 else "Switched to flat, shorter walks.")
    elif act == "indoor":
        out = {i for i in ids if k.get(i) == "sight" and not places[i].indoor}
        _keep(c, ids, places, out)
        c.rain = True
        reply = "비가 와도 괜찮게 실내 위주로 바꿨어요." if ko else "Switched to indoor stops for the rain."
    elif act == "relax":
        sights = [i for i in ids if k.get(i) == "sight"]
        if len(sights) <= 1:
            changed = False
            reply = "이미 한 곳만 남아 있어서 더 뺄 곳이 없어요." if ko else "Only one stop left."
        else:   # 가장 힘든 곳(경사 > 오래 머묾)을 뺀다
            order = {"급경사": 3, "완만한경사": 2, "확인 전": 1, "평지": 0}
            drop = max(sights, key=lambda i: (order.get(places[i].walk_load, 1), places[i].stay_min))
            _keep(c, ids, places, {drop})
            c.exclude = list(dict.fromkeys([*c.exclude, drop]))
            c.cap = max(2, (c.cap or len(ids)) - 1)
            reply = f"여유 있게 {josa(nm(drop), "을를")} 빼고 시간을 다시 맞췄어요." if ko else f"Dropped {nm(drop)} for a slower pace."
    elif act == "add_cafe":
        _keep(c, ids, places, set())
        c.rest = True
        if not any(k.get(i) == "cafe" for i in ids):
            c.cap = (c.cap or len(ids)) + 1
        has = any(k.get(i) == "cafe" for i in ids)
        reply = ("이미 쉬어 갈 카페가 들어 있어요. 다른 카페가 좋으면 '카페 다른 곳으로'라고 해 주세요." if has else "중간에 쉬어 갈 카페를 넣었어요.") if ko else "Added a café break."
        changed = not has
    elif act == "add" and target in ids:
        changed = False
        reply = f"{josa(nm(target), '은는')} 이미 코스에 들어 있어요." if ko else f"{nm(target)} is already in the course."
    elif act == "add" and target in places:
        _keep(c, ids, places, set())
        c.must = list(dict.fromkeys([*c.must, target]))
        c.exclude = [i for i in c.exclude if i != target]
        c.cap = (c.cap or len(ids)) + 1
        reply = f"{josa(nm(target), "을를")} 넣었어요." if ko else f"Added {nm(target)}."
    elif act == "set_when":
        d, t = parse_date(text) if text else None, parse_time(text) if text else None
        if action == "set_when" and target:   # 버튼: target = "YYYY-MM-DD HH:MM"
            parts = target.split()
            d = next((x for x in parts if "-" in x), d)
            t = next((x for x in parts if ":" in x), t)
        _keep(c, ids, places, set())
        if d: c.date = d
        if t: c.start_time = t
        if not (d or t):
            changed = False
            reply = "날짜나 시간을 알아듣지 못했어요. 예: '토요일 오전 10시'" if ko else "I couldn't read the date or time."
        else:
            day = _dt.date.fromisoformat(c.date) if c.date else today()
            wd = "일월화수목금토"[day.isoweekday() % 7]
            reply = (f"{day.month}월 {day.day}일({wd}) {c.start_time} 출발로 바꿨어요. 쉬는 날·브레이크타임을 다시 확인했어요."
                     if ko else f"Moved to {day.isoformat()} {c.start_time}. Closed spots were replaced.")
    elif act == "nearby":
        changed = False
        reply = "코스 카드마다 가장 가까운 공영주차장·전동휠체어 충전기를 펼쳐 놨어요." if ko else "I opened the nearest parking and chargers on each card."
    else:
        act, changed = "none", False
        reply = ("이렇게 말해 보세요: '2번 빼줘', '점심 다른 곳으로', '비 오는데 실내로', '덜 걷는 평지로', '토요일 오후 1시로'"
                 if ko else "Try: 'remove stop 2', 'change lunch', 'indoor for rain', 'flatter route', 'Saturday 1pm'.")
    return {"action": act, "target": target, "conditions": c, "reply": reply, "changed": changed}


def diff_reply(before: list[str], after_ids: list[str], places, skipped: list[dict], ko: bool = True) -> str:
    """다시 계산한 뒤 무엇이 바뀌었는지 짧게 덧붙인다."""
    new = [i for i in after_ids if i not in before]
    s = ""
    if new:
        names = ", ".join(places[i].name_ko if ko else places[i].name_en or places[i].name_ko for i in new)
        s += f" 새로 들어간 곳: {names}." if ko else f" New: {names}."
    if skipped:
        s += " " + " ".join(f"{josa(x['name'], '은는')} {x['reason']}라서 뺐어요." for x in skipped) if ko else ""
    return s


def run(places: dict[str, Place], c: Conditions, ids: list[str], text: str = "", action: str = "", target: Optional[str] = None):
    """apply → plan 다시 계산 → 넣기 실패·바뀐 곳 설명까지. /api/edit 와 대화(talk)가 같이 쓴다.
    돌려주는 값: (conditions, course, reply, action, target, changed)"""
    ids = [i for i in ids if i in places]
    r = apply(places, c, ids, text, action, target)
    c2 = r["conditions"]
    if not r["changed"] and ids:
        _keep(c2, ids, places, set())          # 코스는 그대로 (안내만)
    res = engine.plan(places, c2, bool(c2.rain))
    reply, changed = r["reply"], r["changed"]
    if r["action"] == "add" and changed and r["target"] not in [s.id for s in res.stops]:   # 넣지 못했으면 그대로 두고 이유를 말한다
        p = places[r["target"]]
        c2 = c.model_copy(deep=True)
        _keep(c2, ids, places, set())
        res, changed = engine.plan(places, c2, bool(c2.rain)), False
        hard = "계단·경사가 있어" if p.walk_load in ("급경사", "완만한경사") or any((sg.steps or 0) > 0 for sg in p.segments) else "길이 험해"
        reply = (f"{josa(p.name_ko, '은는')} {hard} 지금 이동 조건({', '.join(c.move) or '없음'})으로는 넣지 못했어요. 코스는 그대로 뒀어요."
                 if c.lang == "ko" else f"I couldn't add {p.name_en or p.name_ko} with your mobility needs. The course is unchanged.")
    elif changed:
        reply += diff_reply(ids, [s.id for s in res.stops], places, res.skipped, c.lang == "ko")
        if c.lang == "ko":
            reply += "".join(" " + n for n in res.notes if n.startswith(("점심 전까지", "점심때까지")))
    return c2, res, reply, r["action"], r["target"], changed
