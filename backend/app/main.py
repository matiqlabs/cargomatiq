"""FastAPI entrypoint — wires up routers, CORS, and a global JSON error handler.

The error handler is the one we learned to never skip: without it, unhandled
exceptions bypass CORS and the browser shows the useless "Failed to fetch"
instead of the real error.
"""
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.session import Base, SessionLocal, engine
from app.db import models  # noqa: F401 — ensure models are registered before create_all

from app.api import exceptions, jobs, master, operations, reports, snapshots, vendors
from app.operations.service import ensure_configured_mailbox, ensure_default_organization


log = logging.getLogger("recon")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def _run_migrations() -> None:
    """Add new columns to existing tables without a full migration framework."""
    from sqlalchemy import text
    new_cols = [
        ("uploaded_soas", "reviewed_rows", "TEXT"),
        ("uploaded_soas", "review_status", "TEXT"),
        ("uploaded_soas", "reviewed_at", "TEXT"),
        ("recon_line_results", "vendor_currency", "TEXT"),
        ("recon_line_results", "exception_state", "TEXT"),
        ("recon_line_results", "exception_owner", "TEXT"),
        ("recon_line_results", "exception_priority", "TEXT"),
        ("recon_line_results", "exception_due_date", "TEXT"),
        ("recon_line_results", "exception_note", "TEXT"),
        ("recon_line_results", "exception_resolution", "TEXT"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass  # Column already exists


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    # Demo mode has one organization. The schema is tenant-ready, while auth
    # and tenant provisioning remain intentionally outside this MVP.
    with SessionLocal() as db:
        organization = ensure_default_organization(db)
        ensure_configured_mailbox(db, organization)
        db.commit()
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def all_exception_handler(request: Request, exc: Exception):
        log.exception("Unhandled exception")
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc),
                "type": exc.__class__.__name__,
                "trace": traceback.format_exc().splitlines()[-6:],
            },
        )

    app.include_router(master.router)
    app.include_router(vendors.router)
    app.include_router(snapshots.router)
    app.include_router(jobs.router)
    app.include_router(exceptions.router)
    app.include_router(reports.router)
    app.include_router(operations.router)

    @app.get("/")
    def root():
        return {"app": settings.app_name, "ok": True}

    return app


app = create_app()
