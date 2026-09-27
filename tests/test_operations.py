"""Regression coverage for the deterministic Operations Inbox demo."""
from __future__ import annotations


def test_demo_replay_creates_shipment_and_evidence(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'operations.db'}")
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))

    # Import only after test-specific settings are in the environment.
    from fastapi.testclient import TestClient
    from app.main import create_app

    client = TestClient(create_app())
    assert client.post("/api/operations/demo/replay").status_code == 200

    inbox = client.get("/api/operations/inbox").json()["items"]
    shipments = client.get("/api/operations/shipments").json()["items"]
    exceptions = client.get("/api/operations/exceptions").json()["items"]

    assert len(inbox) == 5
    assert len(shipments) == 1
    assert any(item["status"] == "needs_review" for item in inbox)
    assert {item["type"] for item in exceptions} == {"CONSIGNEE_MISMATCH", "SCHEDULE_CHANGE"}

    # Replaying the same raw emails is idempotent.
    replay = client.post("/api/operations/demo/replay").json()["items"]
    assert all(item["created"] is False for item in replay)
