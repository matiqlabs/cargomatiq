# Cargomatiq

Cargomatiq is a shipment-centric freight operations workspace with a retained Finance reconciliation module. It makes operational emails and documents usable alongside finance workflows; it does not replace reconciliation.

The current release is a demo-ready MVP: multi-mode in its data model, with a complete replayable Ocean Export FCL workflow.

## What is included

### Operations

- Operations Inbox for `.eml` replay and IMAP-ingested messages
- Raw MIME and attachment preservation in local object storage
- Idempotent email ingestion using mailbox UIDVALIDITY/UID, Message-ID, and raw-content hashes
- Document classification for Commercial Invoice, Packing List, Ocean Booking Confirmation, Bill of Lading, and Draft Bill of Lading
- Provider-neutral extraction contract with deterministic fixture extraction for the MVP
- Shipment resolution from booking, BL, container, PO, invoice, and related references
- Shipment Workspace with canonical facts, evidence, documents, communication, timeline, exceptions, and tasks
- Operational exceptions for consignee mismatch, gross-weight mismatch, schedule change, and missing required documents

### Finance

- Logisys and BT snapshot uploads
- Vendor and master-data management
- Reconciliation job creation, extraction review, matching, reruns, and SOA handling
- Finance exception workbench, reconciliation history, reports, and exports
- Synchronization of finance reconciliation exceptions into the generic operational exception model

## Technology

| Layer | Technology |
| --- | --- |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL (Supabase supported) |
| PostgreSQL driver | Psycopg 3 |
| Frontend | Next.js 14, React 18, Tailwind CSS |
| File storage | Local object storage interface (`backend/storage`) |
| Email | IMAP plus replayable `.eml` files |

## Prerequisites

- Python with `venv`
- Node.js and npm
- PostgreSQL, either local or hosted through Supabase

Use a Supabase **Session Pooler** connection if the direct database endpoint is unreachable from your network.

## First-time setup on Windows

All commands below use Windows Command Prompt (`cmd`).

### 1. Install backend dependencies

```cmd
cd D:\Projects\cargomatiq\cargomatiq\backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

If the virtual environment already exists, skip `py -m venv .venv`.

### 2. Configure PostgreSQL or Supabase

Edit `backend\.env`. For local PostgreSQL:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/cargomatiq
STORAGE_DIR=./storage
```

For Supabase, use its Session Pooler host and append `sslmode=require`:

```env
DATABASE_URL=postgresql+psycopg://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-YOUR_REGION.pooler.supabase.com:5432/postgres?sslmode=require
STORAGE_DIR=./storage
```

Replace all placeholders, remove square brackets, and never commit `.env` to Git.

### 3. Create or update the schema

```cmd
cd D:\Projects\cargomatiq\cargomatiq\backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

### 4. Start the frontend

In a second terminal:

```cmd
cd D:\Projects\cargomatiq\cargomatiq\frontend
npm ci
npm run dev
```

### 5. Start the backend

In the backend terminal:

```cmd
cd D:\Projects\cargomatiq\cargomatiq\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open <http://localhost:3000>. The API is at <http://127.0.0.1:8000>; interactive API documentation is at <http://127.0.0.1:8000/docs>.

## Navigation and workflows

The sidebar is split by domain.

| Area | Pages | Purpose |
| --- | --- | --- |
| Operations | Operations dashboard, Inbox, Shipments, Exceptions, Tasks | Process shipment communications and operational work |
| Finance | Reconciliation, New Reconciliation, Reconciliation History, Finance Exceptions, Finance Reports | Keep the accounting reconciliation workflow intact |
| Settings | Finance Data Uploads, Master Data | Upload source exports and manage vendors/master data |

Original Finance routes remain available for compatibility:

| Route | Feature |
| --- | --- |
| `/jobs` | Reconciliation jobs |
| `/jobs/new` | New reconciliation workflow |
| `/history` | Completed reconciliation history |
| `/exceptions` | Finance exception workbench |
| `/snapshots` | Logisys and BT source-data uploads |
| `/master` | Master-data uploads and management |
| `/reports` | Finance reports and exports |

## Demo: replay the Ocean Export FCL workflow

This is the fastest way to populate a new database without an email account.

1. Start the backend and frontend.
2. Open **Operations → Inbox**.
3. Select **Replay demo**.

Five checked-in `.eml` files pass through the same ingestion pipeline used for manual replay and IMAP. The result is one Ocean Export FCL shipment; invoice and packing-list evidence; booking confirmation and draft BL documents; a consignee mismatch exception; a schedule-change exception; and one unresolved email requiring review.

Replay is idempotent: running it again does not create duplicate emails or shipments. You can also upload an individual `.eml` from the Inbox page.

## IMAP email ingestion

### Configure the mailbox

Add this to `backend\.env`, then restart the backend. Startup creates the configured mailbox record for the demo organization; the password is never stored in the database.

```env
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USERNAME=ops@example.com
IMAP_PASSWORD=replace-with-a-new-app-password
IMAP_FOLDER=INBOX
IMAP_POLL_SECONDS=60
```

For Gmail, enable two-step verification and create a Gmail **App Password**. Do not use a normal account password. If an app password was pasted in chat, a terminal recording, screenshot, or Git history, revoke it and generate a new one.

### Run the worker

One polling cycle:

```cmd
cd D:\Projects\cargomatiq\cargomatiq\backend
.\.venv\Scripts\python.exe -m app.operations.worker --imap
```

Continuous polling while the terminal remains open:

```cmd
.\.venv\Scripts\python.exe -m app.operations.worker --imap --watch
```

Use a custom interval if needed:

```cmd
.\.venv\Scripts\python.exe -m app.operations.worker --imap --watch --interval 120
```

The first live poll records the current highest UID and deliberately imports no old mail. This prevents an unexpected historical import. Send or forward a new email after that first poll; the next cycle ingests it. The worker advances the mailbox cursor only after raw email persistence succeeds. If IMAP UIDVALIDITY changes, polling stops for review rather than risking an incorrect cursor.

## How an email becomes a shipment update

```text
IMAP / .eml replay
        |
        v
Raw MIME + attachments stored and hashed
        |
        v
Document classification + fixture extraction
        |
        v
Immutable field observations with evidence and confidence
        |
        v
Reference-based shipment resolution
        |
        +--> auto matched   -> link to existing shipment
        +--> new job        -> create shipment workspace
        +--> needs review   -> leave in Operations Inbox
        |
        v
Canonical facts, timeline, exceptions, and tasks
```

The extraction implementation is intentionally deterministic for this MVP. `DocumentExtractionProvider` is the extension point for a future structured document-model provider; no external AI extraction provider is configured yet.

## Migrating existing Finance data from SQLite

The previous Finance application used `backend\recon.db`. The migration utility copies finance records to PostgreSQL while preserving primary keys and existing relationships. It has been validated against the included legacy database and handles vendors, snapshots, line items, reconciliation jobs, SOAs, results, and vendor mapping cache.

Before running it:

1. Confirm `backend\.env` points to the intended Supabase Session Pooler or local PostgreSQL database.
2. Run `alembic upgrade head` first.
3. Ensure the target does not already contain finance data. The script stops safely if it does, preventing duplicate records.
4. Keep a backup of `recon.db`.

Then run:

```cmd
cd D:\Projects\cargomatiq\cargomatiq\backend
.\.venv\Scripts\python.exe scripts\migrate_sqlite_to_postgres.py recon.db
```

The utility reports copied row counts. Restart the backend and refresh the browser when it completes.

Historical upload paths are retained as legacy references. Files no longer present at their original paths cannot be reconstructed automatically; re-upload them if they are needed in new local object storage.

## Core API endpoints

The frontend uses these endpoints; all are documented at `/docs`.

| Endpoint | Description |
| --- | --- |
| `GET /api/operations/inbox` | List received and processed operational emails |
| `POST /api/operations/inbox/replay` | Upload and replay one `.eml` file |
| `POST /api/operations/demo/replay` | Run the five-message Ocean Export demo |
| `GET /api/operations/shipments` | List shipment workspaces |
| `GET /api/operations/shipments/{id}` | Shipment facts, evidence, events, and work items |
| `POST /api/operations/shipments/{id}/emails` | Manually link an inbox email to a shipment |
| `GET/PATCH /api/operations/exceptions` | List or update operational exceptions |
| `GET/PATCH /api/operations/tasks` | List or update operational tasks |
| `GET/POST /api/jobs` | List or create Finance reconciliation jobs |
| `POST /api/snapshots/logisys` | Upload Logisys source data |
| `POST /api/snapshots/bt` | Upload BT source data |

## Development checks

Build the frontend:

```cmd
cd D:\Projects\cargomatiq\cargomatiq\frontend
npm run build
```

Check Python syntax:

```cmd
cd D:\Projects\cargomatiq\cargomatiq\backend
.\.venv\Scripts\python.exe -m compileall -q app scripts
```

The operational replay test is `tests\test_operations.py`. Install pytest in the backend virtual environment if needed, then run it from the repository root:

```cmd
cd D:\Projects\cargomatiq\cargomatiq
.\backend\.venv\Scripts\python.exe -m pip install pytest
set PYTHONPATH=%CD%\backend
.\backend\.venv\Scripts\python.exe -m pytest tests -q
```

## Project structure

```text
backend/
  alembic/                 Database migrations
  app/api/                 Finance and Operations API routes
  app/db/                  SQLAlchemy models and database session
  app/operations/          Ingestion, IMAP, extraction, rules, and worker
  app/operations/demo_emails/
                           Replay fixtures for the Ocean Export demo
  scripts/                 SQLite-to-PostgreSQL migration utility
  storage/                 Local raw email and attachment object storage
frontend/
  src/app/                 Next.js pages
  src/components/          Application shell and navigation
tests/                     Automated Operations replay coverage
```

## MVP boundaries

This is a demo-ready MVP, not a production-hardened multi-tenant deployment.

- The schema is organization-ready, but authentication and user provisioning are not implemented.
- The app starts with one `demo` organization.
- Ocean Export FCL is the deep demo workflow. Ocean, air, and road are supported by the core model, but air and road do not yet have full workflows.
- IMAP is the only live connector. Gmail OAuth and Microsoft 365 are future work.
- Processing is PostgreSQL-backed and retryable without Redis, Kafka, or microservices.
- A live extraction-model provider is deliberately deferred.
- There is no autonomous outbound email, tracking-platform integration, customs workflow, or chatbot in this MVP.

## Troubleshooting

### The application starts but pages are empty

A new Supabase database contains schema only. Use **Replay demo** to create Operations data, upload Finance source files for new reconciliation work, or run the SQLite migration to restore existing finance records.

### Supabase connection fails or shows `Permission denied`

Use the Supabase Session Pooler URL rather than the direct `db.<project>.supabase.co` endpoint, use the `postgresql+psycopg://` scheme, and include `?sslmode=require`.

### `ModuleNotFoundError: No module named 'psycopg2'`

Install the current backend requirements and use the documented `postgresql+psycopg://` URL:

```cmd
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### IMAP worker reports zero messages

That is expected on the first poll. It establishes a safe cursor at the newest existing message. Send a new email and wait for the next worker cycle.

### IMAP worker cannot log in

Confirm the host, port, folder, username, and fresh app password in `.env`, then restart the backend before rerunning the worker.

## Security notes

- Keep `backend\.env` private and excluded from Git.
- Rotate any database or email credential that has been exposed.
- Use separate Supabase credentials for development and production.
- Back up `recon.db` before migration and verify the reported migration counts.
