"""Run queued operation processing, optionally polling configured IMAP mailboxes."""
from __future__ import annotations

import argparse
import time

from app.core.config import settings
from app.db import models
from app.db.session import SessionLocal
from app.operations.imap import poll_mailbox
from app.operations.service import process_queued_tasks


def run_once(*, poll_imap: bool) -> None:
    """Run one durable worker cycle in a fresh database session."""
    with SessionLocal() as db:
        try:
            if poll_imap:
                for mailbox in db.query(models.Mailbox).filter_by(active=True, provider="imap").all():
                    print(f"{mailbox.address}: {poll_mailbox(db, mailbox)} messages")
            print(f"processed: {process_queued_tasks(db)}")
        except Exception:
            db.rollback()
            raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--imap", action="store_true", help="Poll active IMAP mailboxes before processing queued work")
    parser.add_argument("--watch", action="store_true", help="Repeat worker cycles until stopped")
    parser.add_argument("--interval", type=int, default=settings.imap_poll_seconds, help="Seconds between watch cycles")
    args = parser.parse_args()
    if args.interval < 1:
        parser.error("--interval must be at least 1")
    while True:
        try:
            run_once(poll_imap=args.imap)
        except Exception as exc:
            print(f"worker cycle failed: {exc}")
            if not args.watch:
                return 1
        if not args.watch:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
