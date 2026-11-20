"""제보 저장소 — 읽기·쓰기를 이 파일 한 곳에 모은다 (docs/19_CITY_REPORTS.md 5장).

- 지금은 JSONL 파일: 실제 제보 `reports.jsonl`, 가상 제보 `sample_reports.jsonl`(따로, 한 번에 지울 수 있게), 연락처 `contacts.jsonl`(따로).
- 나중에 시 서버·DB로 옮길 때는 이 파일의 함수만 바꾸면 된다.
- 예전 상태 이름도 읽는다: '확인 중' → '확인', '반영' → '완료'.
"""
from __future__ import annotations

import datetime as dt
import io
import json
import os
import shutil
import threading
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
SAMPLE_SEED = DATA / "sample_reports" / "reports.jsonl"     # 저장소에 들어 있는 가상 제보 원본 (읽기만)
STATUSES = ["접수", "확인", "처리 중", "완료", "반려", "중복"]
OLD = {"확인 중": "확인", "반영": "완료"}
_lock = threading.RLock()


def root() -> Path:
    p = Path(os.getenv("REPORTS_DIR") or DATA / "reports")
    p.mkdir(parents=True, exist_ok=True)
    return p


def persistent() -> bool:
    """재배포해도 남는 저장소인지. 운영자가 STORAGE_PERSISTENT=1 로 알려 준다(디스크를 붙였을 때)."""
    return os.getenv("STORAGE_PERSISTENT", "") == "1"


def now() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def _read(name: str) -> list[dict]:
    f = root() / name
    if not f.exists():
        return []
    return [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]


def _write(name: str, rows: list[dict]):
    f = root() / name
    tmp = f.with_suffix(".tmp")
    tmp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    os.replace(tmp, f)


def norm(r: dict) -> dict:
    r["status"] = OLD.get(r.get("status") or "접수", r.get("status") or "접수")
    if r["status"] not in STATUSES:
        r["status"] = "접수"
    return r


# ---------------- 실제 제보 ----------------
def real() -> list[dict]:
    with _lock:
        return [norm(r) for r in _read("reports.jsonl")]


def append(rec: dict):
    with _lock:
        f = root() / "reports.jsonl"
        with f.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def save_real(rows: list[dict]):
    with _lock:
        _write("reports.jsonl", [r for r in rows if not r.get("sample")])


# ---------------- 가상 제보 ----------------
def samples() -> list[dict]:
    with _lock:
        return [norm({**r, "sample": True}) for r in _read("sample_reports.jsonl")]


def sample_loaded() -> bool:
    return (root() / "sample_reports.jsonl").exists()


def samples_cleared() -> bool:
    """관리자가 [가상 데이터 모두 지우기]를 했으면, 서버를 다시 켜도 가상 데이터를 다시 넣지 않는다."""
    return (root() / "samples_cleared").exists()


def load_samples() -> int:
    """저장소의 가상 제보 원본을 작업용 파일로 복사 (날짜는 오늘 기준으로 옮긴다: days_ago 칸)."""
    rows = [json.loads(l) for l in SAMPLE_SEED.read_text(encoding="utf-8").splitlines() if l.strip()]
    today = dt.datetime.now().replace(microsecond=0)
    out = []
    for r in rows:
        d = today - dt.timedelta(days=float(r.pop("days_ago", 0)))
        r["created_at"] = d.isoformat()
        for h in r.get("history", []):
            h["at"] = (d + dt.timedelta(days=float(h.pop("after_days", 0)))).isoformat(timespec="seconds")
        out.append({**r, "sample": True})
    with _lock:
        _write("sample_reports.jsonl", out)
        (root() / "samples_cleared").unlink(missing_ok=True)
    return len(out)


def clear_samples() -> int:
    with _lock:
        n = len(_read("sample_reports.jsonl"))
        (root() / "sample_reports.jsonl").unlink(missing_ok=True)
        (root() / "samples_cleared").write_text(now(), encoding="utf-8")
        return n


def save_samples(rows: list[dict]):
    with _lock:
        _write("sample_reports.jsonl", [r for r in rows if r.get("sample")])


# ---------------- 함께 ----------------
def all_rows(include_sample: bool) -> list[dict]:
    return real() + (samples() if include_sample else [])


def update(ids: set[str], fn) -> int:
    """id 들에 fn(rec) 를 적용하고 저장 (실제·가상 각자 파일에)."""
    n = 0
    with _lock:
        for loader, saver in ((real, save_real), (samples, save_samples)):
            rows = loader()
            hit = False
            for r in rows:
                if r["id"] in ids:
                    fn(r); n += 1; hit = True
            if hit:
                saver(rows)
    return n


# ---------------- 연락처 (따로 저장, 완료 90일 뒤 삭제) ----------------
def add_contact(rid: str, contact: str):
    with _lock:
        rows = _read("contacts.jsonl")
        rows.append({"id": rid, "contact": contact[:80], "at": now()})
        _write("contacts.jsonl", rows)


def contact_of(rid: str) -> str:
    return next((c["contact"] for c in _read("contacts.jsonl") if c["id"] == rid), "")


def purge_contacts(done_before: str) -> int:
    """완료·반려된 지 90일 지난 제보의 연락처를 지운다."""
    with _lock:
        closed = {r["id"]: max((h.get("at") or "" for h in r.get("history", []) if h.get("status") in ("완료", "반려")), default="")
                  for r in real()}
        rows = _read("contacts.jsonl")
        keep = [c for c in rows if not (closed.get(c["id"]) and closed[c["id"]] < done_before)]
        if len(keep) != len(rows):
            _write("contacts.jsonl", keep)
        return len(rows) - len(keep)


# ---------------- 백업 ----------------
def backup_zip() -> bytes:
    buf = io.BytesIO()
    with _lock, zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(root().iterdir()):
            if f.is_file() and f.suffix in (".jsonl", ".jpg"):
                z.write(f, f.name)
        z.writestr("README.txt", f"동해 길동무 제보 백업 {now()}\nreports.jsonl = 제보, contacts.jsonl = 연락처(개인정보), *.jpg = 제보 사진(위치 정보 지움)\n")
    return buf.getvalue()


def restore_zip(data: bytes) -> int:
    """백업 zip 을 되살린다 (같은 이름 파일은 덮어씀). 되살린 파일 수."""
    n = 0
    with _lock, zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            base = Path(name).name
            if base != name or not (base.endswith(".jsonl") or base.endswith(".jpg")):
                continue   # 폴더가 있는 이름·다른 종류는 무시 (경로 넘어가기 방지)
            with z.open(name) as src, (root() / base).open("wb") as dst:
                shutil.copyfileobj(src, dst)
            n += 1
    return n
