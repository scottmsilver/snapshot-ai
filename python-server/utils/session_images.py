"""Private, opt-in image archives for reproducing agentic editing sessions."""

import base64
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger(__name__)


class SessionImageLog:
    def __init__(self, root: Path | None = None):
        self.session_id = uuid4().hex
        self.path: Path | None = None
        configured_root = root or os.getenv("AI_SESSION_LOG_DIR")
        if not configured_root:
            return
        try:
            self.path = Path(configured_root) / self.session_id
            self.path.mkdir(parents=True, mode=0o700)
            logger.info("AI session %s: image archive %s", self.session_id, self.path)
        except OSError:
            self.path = None
            logger.warning("AI session %s: capture failed during setup", self.session_id)

    def _images_to_files(self, value, field: str):
        if isinstance(value, str) and value.startswith("data:image/"):
            header, encoded = value.split(",", 1)
            mime_type = header.split(";", 1)[0][5:]
            content = base64.b64decode(encoded, validate=True)
            digest = hashlib.sha256(content).hexdigest()
            extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime_type, "img")
            name = f"{digest}.{extension}"
            target = self.path / name
            if not target.exists():
                with target.open("xb") as output:
                    os.chmod(target, 0o600)
                    output.write(content)
            logger.info("AI session %s: %s image=%s bytes=%d", self.session_id, field, name, len(content))
            return {"image": name, "mimeType": mime_type, "bytes": len(content)}
        if isinstance(value, dict):
            return {key: self._images_to_files(item, f"{field}.{key}") for key, item in value.items()}
        if isinstance(value, list):
            return [self._images_to_files(item, f"{field}[{index}]") for index, item in enumerate(value)]
        return value

    def record(self, stage: str, data) -> None:
        if self.path is None:
            return
        try:
            record = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "stage": stage,
                "data": self._images_to_files(data, stage),
            }
            with (self.path / "events.jsonl").open("a") as events:
                events.write(json.dumps(record) + "\n")
        except Exception as exc:
            # Diagnostics must not interrupt a user's editing stream.
            logger.warning("AI session %s: capture failed (%s)", self.session_id, type(exc).__name__)
