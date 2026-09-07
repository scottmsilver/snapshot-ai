"""Session archives preserve exact images without putting base64 in text logs."""

import base64
import json
import logging

from utils.session_images import SessionImageLog


def test_records_all_image_roles_and_deduplicates_bytes(tmp_path, caplog):
    caplog.set_level(logging.INFO)
    original = b"original image bytes"
    marked = b"marked image bytes"
    result = b"generated image bytes"
    url = lambda data: "data:image/png;base64," + base64.b64encode(data).decode()
    session = SessionImageLog(tmp_path)
    session.record("request", {"sourceImage": url(original), "annotatedImage": url(marked), "maskImage": url(original), "referencePoints": [{"label": "A", "x": 12, "y": 34}]})
    session.record("progress", {"inputImages": [{"label": "Annotated", "dataUrl": url(marked)}], "iterationImage": url(result)})
    session.record("complete", {"imageData": url(result)})
    records = [json.loads(line) for line in (session.path / "events.jsonl").read_text().splitlines()]
    assert len(records) == 3
    assert records[0]["data"]["referencePoints"][0]["x"] == 12
    for record, key, expected in [(records[0], "sourceImage", original), (records[0], "annotatedImage", marked), (records[1], "iterationImage", result), (records[2], "imageData", result)]:
        assert (session.path / record["data"][key]["image"]).read_bytes() == expected
    assert len(list(session.path.glob("*.png"))) == 3
    assert "data:image" not in caplog.text
    assert str(session.path) in caplog.text


def test_disabled_without_configuration(monkeypatch):
    monkeypatch.delenv("AI_SESSION_LOG_DIR", raising=False)
    session = SessionImageLog()
    session.record("request", {"sourceImage": "data:image/png;base64,YQ=="})
    assert session.path is None


def test_recording_failure_does_not_break_edit(tmp_path, caplog):
    session = SessionImageLog(tmp_path)
    session.record("request", {"sourceImage": "data:image/png;base64,invalid"})
    assert "capture failed" in caplog.text


def test_streaming_endpoint_archives_inputs_progress_and_final_image(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import main

    monkeypatch.setenv("AI_SESSION_LOG_DIR", str(tmp_path))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    original = "data:image/png;base64,b3JpZ2luYWw="
    annotated = "data:image/png;base64,bWFya2Vk"
    result = "data:image/png;base64,cmVzdWx0"

    async def stream(*args, **kwargs):
        yield "custom", {"step": "calling_api", "inputImages": [{"label": "Annotated", "dataUrl": annotated}], "iterationImage": result}
        yield "values", {"current_result": result, "refined_prompt": "Move A to B", "current_iteration": 1}

    monkeypatch.setattr(main.agentic_edit_graph, "astream", stream)
    with TestClient(main.app) as client:
        response = client.post("/api/agentic/edit", json={"sourceImage": original, "annotatedImage": annotated, "prompt": "Move A to B"})
    assert response.status_code == 200
    assert "event: complete" in response.text
    session = next(tmp_path.iterdir())
    records = [json.loads(line) for line in (session / "events.jsonl").read_text().splitlines()]
    assert [record["stage"] for record in records] == ["request", "progress", "state", "complete", "closed"]
    assert len(list(session.glob("*.png"))) == 3
    assert (session / records[3]["data"]["imageData"]["image"]).read_bytes() == b"result"
