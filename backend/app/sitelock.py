"""사이트 잠금: SITE_PASSWORD 환경 변수가 있으면 비밀번호를 아는 사람만 들어온다.

- 공개 전(심사·팀 확인용)에는 Render 환경 변수에 SITE_PASSWORD 를 넣고,
- 공개할 때는 그 변수를 지우면 끝 (코드 수정 없음).
- 통과하면 30일짜리 쿠키를 준다. 비밀번호를 바꾸면 예전 쿠키는 모두 무효.
"""
import hashlib
import hmac
import html
import os
import time
from urllib.parse import parse_qs

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

COOKIE = "gd_site"
OPEN = ("/api/health", "/lock", "/dongi/")   # 잠금 화면에 필요한 것만 열어 둔다


def password() -> str:
    return os.getenv("SITE_PASSWORD", "")


def token(pw: str) -> str:
    return hashlib.sha256(f"gildongmu-site:{pw}".encode()).hexdigest()


def ok(request: Request) -> bool:
    pw = password()
    return not pw or hmac.compare_digest(request.cookies.get(COOKIE, ""), token(pw))


def page(msg: str = "") -> HTMLResponse:
    m = f'<p class="err" role="alert">{html.escape(msg)}</p>' if msg else ""
    return HTMLResponse(f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>동해 길동무</title>
<style>
:root{{--sea:#2462B4;--ink:#12355E;--bg:#F3F7FC;--line:#D5E0EE}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:18px/1.6 "IBM Plex Sans KR",system-ui,sans-serif}}
form{{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px 24px;width:min(360px,calc(100vw - 32px));box-sizing:border-box;text-align:center}}
img{{height:72px}} h1{{margin:6px 0 4px;font-size:1.4em}} p{{margin:0 0 16px;font-size:.9em;color:#4A5A70}}
input{{width:100%;box-sizing:border-box;min-height:52px;font:inherit;padding:8px 14px;border:1.5px solid var(--line);border-radius:12px}}
button{{margin-top:12px;width:100%;min-height:52px;border:0;border-radius:12px;background:var(--sea);color:#fff;font:inherit;font-weight:700;cursor:pointer}}
.err{{color:#B42318;font-weight:600;margin:10px 0 0}}
</style></head><body>
<form method="post" action="/lock">
<img src="/dongi/wave.webp" alt="">
<h1>동해 길동무</h1>
<p>지금은 공개 전이에요. 받은 비밀번호를 넣어 주세요.</p>
<label for="pw" style="position:absolute;left:-9999px">비밀번호</label>
<input id="pw" name="pw" type="password" autocomplete="current-password" autofocus required>
<button>들어가기</button>{m}
</form></body></html>""", status_code=401 if msg else 200)


async def middleware(request: Request, call_next):
    if not password() or request.url.path.startswith(OPEN) or ok(request):
        if request.url.path == "/lock" and request.method == "POST":
            return await submit(request)
        if request.url.path == "/lock":
            return page() if password() else RedirectResponse("/", 303)
        return await call_next(request)
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "사이트가 잠겨 있어요. 비밀번호를 먼저 넣어 주세요."}, status_code=401)
    return page()


async def submit(request: Request):
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    pw = (form.get("pw") or [""])[0]
    if not password():
        return RedirectResponse("/", 303)
    if not hmac.compare_digest(pw, password()):
        time.sleep(1)   # 마구 넣어 보기 늦추기
        return page("비밀번호가 맞지 않아요.")
    res = RedirectResponse("/", 303)
    res.set_cookie(COOKIE, token(pw), max_age=30 * 24 * 3600, httponly=True, samesite="lax",
                   secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https")
    return res
