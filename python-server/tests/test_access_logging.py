"""Proxy authentication must not write credentials to application logs."""

import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient

import main


def test_authenticated_request_does_not_log_proxy_secret(monkeypatch, caplog):
    marker = "test-proxy-secret-do-not-log"
    monkeypatch.setattr(main, "_cf_access_secret", marker)
    app = FastAPI()
    app.add_middleware(main.CloudflareAccessMiddleware)

    @app.get("/")
    def home():
        return {"ok": True}

    with caplog.at_level(logging.INFO, logger="main"):
        response = TestClient(app).get("/", headers={"X-Proxy-Secret": marker})
    assert response.status_code == 200
    assert marker not in caplog.text
