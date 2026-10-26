"""키 확인: python scripts/check_keys.py  (.env 를 읽어 세 가지 연결을 시험한다. 키 값은 출력하지 않는다)"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
import httpx
from app import llm, public_apis

def ok(name, good, why=""):
    print(f"{'OK  ' if good else 'FAIL'} {name} {why}")

# 1) Anthropic
if not llm.API_KEY:
    ok("Anthropic", False, "ANTHROPIC_API_KEY 가 비어 있음")
else:
    r = httpx.post("https://api.anthropic.com/v1/messages", headers=llm.headers(), timeout=20,
                   json={"model": llm.MODEL, "max_tokens": 20, "messages": [{"role": "user", "content": "동해 한 단어"}]})
    ok("Anthropic", r.status_code == 200, f"HTTP {r.status_code} {'' if r.status_code == 200 else r.text[:200]}")

# 2) 공공데이터포털 (기상청 단기예보로 시험)
if not public_apis.KEY:
    ok("공공데이터포털", False, "DATA_GO_KR_KEY 가 비어 있음")
else:
    w = public_apis.rain_today()
    ok("공공데이터포털(기상청)", not w.get("sample"), "격자 " + str(w.get("grid")) if not w.get("sample") else "응답 실패: 활용신청 후 1~2시간 기다렸는지, Decoding 키인지 확인")

# 3) 카카오 (브라우저에서만 확인 가능 → 값만 확인)
kf = Path(__file__).resolve().parents[1] / "frontend/.env.local"
has = kf.exists() and "NEXT_PUBLIC_KAKAO_JS_KEY=" in kf.read_text() and kf.read_text().split("NEXT_PUBLIC_KAKAO_JS_KEY=")[1].strip() != ""
ok("카카오 키 파일", has, "frontend/.env.local 확인 → npm run dev 후 지도가 보이면 성공" if has else "frontend/.env.local 에 NEXT_PUBLIC_KAKAO_JS_KEY= 를 넣어 주세요")
