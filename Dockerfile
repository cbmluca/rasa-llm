# syntax=docker/dockerfile:1
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV WEB_UI_HOST=0.0.0.0 \
    WEB_UI_PORT=8080

CMD ["python", "-m", "app.web_api"]
