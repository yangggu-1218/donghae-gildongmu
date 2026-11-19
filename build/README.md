# 화면 빌드

`frontend/` (React 화면)를 파일 하나로 묶는다. 저장소 맨 위에서:

```
cd build && npm install && python3 gen_data.py
KAKAO_JS_KEY=<카카오 JS 키> node build.mjs && cd .. && python3 build/make_pages.py          # docs/ — GitHub Pages 정적 데모 (브라우저 안 계산, api.js)
cd build && MODE=server KAKAO_JS_KEY=<키> node build.mjs && cd .. && python3 build/make_pages.py server   # web/ — 서버 배포용 (진짜 API)
```

- `api.js` 는 백엔드(engine·edits·pages·cms)를 브라우저용으로 옮긴 것. `python3 py_run.py > py.json; node js_run.mjs > js.json; python3 cmp.py` 로 결과가 같은지 확인한다.
- `data.json` 은 `gen_data.py` 가 만든다 (저장소에는 안 올림).
