"""Small object-storage port; local disk is the demo implementation."""
from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

from app.core.config import settings


class LocalObjectStorage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or settings.storage_dir / "objects"
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, content: bytes, *, namespace: str, filename: str) -> str:
        safe_name = Path(filename or "blob.bin").name.replace(" ", "_")
        digest = hashlib.sha256(content).hexdigest()[:16]
        key = f"{namespace}/{uuid4().hex}_{digest}_{safe_name}"
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return key

    def read(self, key: str) -> bytes:
        return (self.root / key).read_bytes()

    def exists(self, key: str) -> bool:
        return (self.root / key).exists()


object_storage = LocalObjectStorage()
