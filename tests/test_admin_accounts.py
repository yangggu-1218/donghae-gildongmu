"""관리자 계정·권한 점검 (임시 파일에 저장하므로 실제 관리자 데이터는 건드리지 않는다).
돌리는 법: py tests/test_admin_accounts.py   → 마지막 줄 "관리자 점검 실패 0건"
"""
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ["CMS_FILE"] = str(tmp / "cms.json")
os.environ["ADMIN_ID"] = "owner"
os.environ["ADMIN_PASSWORD"] = "test-owner-pw-1"   # 점검용 임시 값 (실제 비밀번호 아님)
os.environ.setdefault("PYTHONUTF8", "1")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import cms  # noqa: E402

c = TestClient(app)
fails = []


def check(name, ok, detail=""):
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


def login(uid, pw):
    return c.post("/api/admin/login", json={"id": uid, "password": pw})


H = lambda t: {"x-admin-token": t}

r = login("owner", "test-owner-pw-1")
check("총괄 관리자 로그인", r.status_code == 200 and r.json()["user"]["role"] == "owner", r.text)
own = r.json()["token"]

r = c.post("/api/admin/accounts", json={"id": "kim", "name": "김편집", "role": "editor", "password": "short"}, headers=H(own))
check("약한 비밀번호 거절", r.status_code == 400, r.text)
r = c.post("/api/admin/accounts", json={"id": "kim", "name": "김편집", "role": "editor", "password": "editpass12"}, headers=H(own))
check("편집자 계정 만들기", r.status_code == 200 and r.json()["role"] == "editor" and "hash" not in r.json(), r.text)
r = c.post("/api/admin/accounts", json={"id": "lee", "name": "이조사", "role": "surveyor", "password": "survey123"}, headers=H(own))
check("현장 조사원 계정 만들기", r.status_code == 200, r.text)
r = c.post("/api/admin/accounts", json={"id": "kim", "name": "또김", "role": "editor", "password": "editpass12"}, headers=H(own))
check("같은 아이디 거절", r.status_code == 400, r.text)

raw = Path(os.environ["CMS_FILE"]).read_text(encoding="utf-8")
check("비밀번호를 그대로 저장하지 않음", "editpass12" not in raw and "survey123" not in raw)

ed = login("kim", "editpass12").json()["token"]
check("편집자: 첫 로그인 때 비밀번호 바꾸라고 표시", c.get("/api/admin/me", headers=H(ed)).json()["must_change"] is True)
check("편집자: 계정 관리 못 함 (403)", c.get("/api/admin/accounts", headers=H(ed)).status_code == 403)
check("편집자: 백업 못 함 (403)", c.get("/api/admin/backup", headers=H(ed)).status_code == 403)
r = c.post("/api/admin/notices", json={"level": "info", "title": "점검 알림"}, headers=H(ed))
check("편집자: 알림 올리기", r.status_code == 200, r.text)
hist = c.get("/api/admin/cms", headers=H(own)).json()["history"]
check("변경 이력에 '누가' 남음", hist and hist[0]["who"] == "김편집 (kim)", hist[0]["who"] if hist else "")
check("화면용 데이터에 계정 정보 없음", "accounts" not in c.get("/api/admin/cms", headers=H(own)).json())

sv = login("lee", "survey123").json()["token"]
check("현장 조사원: 알림 못 올림 (403)", c.post("/api/admin/notices", json={"level": "info", "title": "x"}, headers=H(sv)).status_code == 403)
check("현장 조사원: 제보 목록은 봄", c.get("/api/admin/reports", headers=H(sv)).status_code == 200)
check("현장 조사원: 한눈에 봄", c.get("/api/admin/dashboard", headers=H(sv)).status_code == 200)

r = c.post("/api/admin/password", json={"old": "editpass12", "new": "newedit345"}, headers=H(ed))
check("본인 비밀번호 바꾸기", r.status_code == 200, r.text)
check("바꾼 뒤 옛 비밀번호로는 못 들어감", login("kim", "editpass12").status_code == 401)
check("새 비밀번호로 들어감", login("kim", "newedit345").status_code == 200)

r = c.post("/api/admin/accounts/lee", json={"active": False}, headers=H(own))
check("계정 사용 멈춤", r.status_code == 200 and r.json()["active"] is False, r.text)
check("멈춘 계정은 바로 로그아웃됨", c.get("/api/admin/me", headers=H(sv)).status_code == 401)
check("멈춘 계정은 로그인 못 함", login("lee", "survey123").status_code == 401)
check("총괄 관리자 계정은 화면에서 못 바꿈", c.post("/api/admin/accounts/owner", json={"active": False}, headers=H(own)).status_code == 400)

for _ in range(5):
    login("kim", "wrong-pw-0")
r = login("kim", "newedit345")
check("5번 틀리면 잠김", r.status_code == 401 and "잠겼" in r.json().get("detail", ""), r.text)
cms.FAILS.clear()

b = c.get("/api/admin/backup", headers=H(own)).json()
check("백업 파일에 계정·비밀번호 없음", "accounts" not in b)
c.post("/api/admin/reset", json={"reason": "점검"}, headers=H(own))
check("초기화해도 계정은 남음", any(a["id"] == "kim" for a in c.get("/api/admin/accounts", headers=H(own)).json()["accounts"]))

print(f"관리자 점검 실패 {len(fails)}건")
sys.exit(1 if fails else 0)
