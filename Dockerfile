# 동해 길동무 — 백엔드(API)와 웹 화면(web/)을 서버 하나로 배포
FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY data data
COPY web web
WORKDIR /srv/backend
ENV PORT=8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
