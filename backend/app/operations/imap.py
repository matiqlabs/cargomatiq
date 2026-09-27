"""Provider-independent IMAP polling backed by the mailbox database cursor."""
from __future__ import annotations

import imaplib
import re

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import models
from app.operations.service import ingest_raw_email


def _uids(data: list[object]) -> list[int]:
    values: list[int] = []
    for chunk in data:
        text = chunk.decode("ascii", errors="replace") if isinstance(chunk, bytes) else str(chunk)
        values.extend(int(value) for value in text.split() if value.isdigit())
    return values


def _uid_validity(connection: imaplib.IMAP4_SSL, folder: str) -> str:
    status, data = connection.response("UIDVALIDITY")
    if status == "UIDVALIDITY" and data and data[0]:
        return data[0].decode("ascii") if isinstance(data[0], bytes) else str(data[0])
    status, data = connection.status(folder, "(UIDVALIDITY)")
    if status == "OK" and data:
        match = re.search(r"UIDVALIDITY\s+(\d+)", str(data[0]))
        if match:
            return match.group(1)
    raise imaplib.IMAP4.error("Server did not return UIDVALIDITY")


def poll_mailbox(db: Session, mailbox: models.Mailbox, *, backfill: bool = False) -> int:
    """Poll once. Cursor advances only after database persistence succeeds."""
    credential_key = mailbox.credential_env_key or settings.imap_credential_env_key
    # Values loaded from .env by Pydantic are not copied into os.environ, so
    # use the typed settings value for the default credential key.
    password = settings.imap_password if credential_key == settings.imap_credential_env_key else None
    host = mailbox.host or settings.imap_host
    if not host or not password:
        raise RuntimeError("Mailbox host or password is not configured in environment variables")
    connection = imaplib.IMAP4_SSL(host, mailbox.port)
    try:
        connection.login(mailbox.address, password)
        status, _ = connection.select(mailbox.folder, readonly=True)
        if status != "OK":
            raise imaplib.IMAP4.error("Unable to select mailbox folder")
        uidvalidity = _uid_validity(connection, mailbox.folder)
        status, data = connection.uid("SEARCH", None, "ALL")
        if status != "OK":
            raise imaplib.IMAP4.error("UID search failed")
        all_uids = sorted(_uids(data))
        if mailbox.uid_validity is None:
            mailbox.uid_validity, mailbox.last_uid = uidvalidity, (0 if backfill else max(all_uids, default=0))
            db.commit()
            if not backfill:
                return 0
        if mailbox.uid_validity != uidvalidity:
            raise RuntimeError("Mailbox UIDVALIDITY changed; review cursor before continuing")
        todo = [uid for uid in all_uids if uid > (mailbox.last_uid or 0)]
        processed = 0
        for uid in todo:
            status, fetch_data = connection.uid("FETCH", str(uid), "(BODY.PEEK[])")
            raw = next((item[1] for item in fetch_data if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], bytes)), None)
            if status != "OK" or raw is None:
                raise imaplib.IMAP4.error(f"Could not fetch UID {uid}")
            ingest_raw_email(db, raw, organization=db.get(models.Organization, mailbox.organization_id), mailbox_id=mailbox.id, source_provider="imap", imap_uid=str(uid), imap_uidvalidity=uidvalidity)
            mailbox.last_uid = uid
            db.commit()
            processed += 1
        return processed
    finally:
        try:
            connection.logout()
        except Exception:
            pass
