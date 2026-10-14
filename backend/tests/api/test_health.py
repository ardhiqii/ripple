from uuid import UUID

from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient

client = TestClient(create_app(Settings(environment="test")))


def test_liveness_returns_ok_and_request_id() -> None:
    response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "Ripple API"}
    UUID(response.headers["X-Request-ID"])


def test_readiness_preserves_valid_request_id() -> None:
    request_id = "9a6f3f7e-8b7b-4b17-9f8a-2e2a8ed4dd17"

    response = client.get("/api/v1/health/ready", headers={"X-Request-ID": request_id})

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "service": "Ripple API"}
    assert response.headers["X-Request-ID"] == request_id


def test_staging_cors_allows_only_configured_preview_origin() -> None:
    app = create_app(
        Settings(
            environment="staging",
            database_url=None,
            cors_origins=["https://ripple-demo.vercel.app"],
            cors_origin_regex=r"^https://ripple-[a-z0-9-]+\.vercel\.app$",
        )
    )

    with TestClient(app) as preview_client:
        allowed = preview_client.get(
            "/api/v1/health/live",
            headers={"Origin": "https://ripple-demo.vercel.app"},
        )
        denied = preview_client.get(
            "/api/v1/health/live",
            headers={"Origin": "https://unrelated.vercel.app"},
        )

    assert allowed.headers["access-control-allow-origin"] == (
        "https://ripple-demo.vercel.app"
    )
    assert "access-control-allow-origin" not in denied.headers
