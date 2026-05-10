# PackGuardian

**PackGuardian** is an AI-powered safety and compliance protection system for pet care operations, designed to monitor risk, track incidents, and automate corrective actions.

---

## System Compliance

This project follows the **JBFastMVP** platform standard. All system components must run within these constraints.

### Ports

| Service | Port |
|---------|------|
| API (FastAPI) | `8100` |
| Web (Next.js) | `3000` |

### Database Requirement

PackGuardian requires **PostgreSQL**. SQLite is not supported.

Connection string format:
```
DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/packguardian
```

Set `ENV=dev` in `api/.env` to have the database created automatically on first run.  
Set `ENV=prod` (default) to fail immediately if the database is unreachable.

### Cloudflare Requirement

PackGuardian uses a named Cloudflare tunnel. The tunnel must be created before `./start.sh` will run:

```bash
cloudflared tunnel create packguardian
```

Domains:
- Web: `packguardian.jesseboudreau.com`
- API: `packguardian-api.jesseboudreau.com`

### How to Run

```bash
# 1. Copy and configure the env file
cp api/.env.example api/.env
# Edit api/.env with your database credentials

# 2. Start everything
./start.sh

# 3. Stop everything
./stop.sh
```

`./start.sh` will:
- Validate `api/.env` exists
- Verify Cloudflare tunnel is configured
- Create Python venv at `api/.venv` if absent
- Kill existing processes on ports 8100 and 3000
- Start API, run health check, build and start web, start tunnel
- Print service URLs and log file locations

Logs are written to:
```
.logs/api.log
.logs/web.log
.logs/tunnel.log
```

---

## Modules

| Module | Status | Description |
|--------|--------|-------------|
| OSHA | Active | Incident tracking, inspections, corrective actions |
| Fire Safety | Planned | — |
| Animal Safety | Planned | — |
| Training | Planned | — |

---

## Tech Stack

| Layer | Framework |
|-------|-----------|
| Web | Next.js 15 + React 19 + TailwindCSS |
| API | FastAPI (Python 3.12) |
| Database | PostgreSQL + SQLAlchemy 2.0 |
| Tunnel | Cloudflare |
| Auth | TBD |

---

## Project Structure

```
packguardian/
  api/                        ← FastAPI backend
    app/
      core/
        config.py             ← Settings (pydantic-settings, reads .env)
        database.py           ← SQLAlchemy engine, session, Base
      modules/
        osha/                 ← OSHA module (active)
        fire/                 ← Fire Safety (planned)
        animal_safety/        ← Animal Safety (planned)
        training/             ← Training (planned)
    main.py                   ← App init, DB validation, CORS, /health
    requirements.txt
    .env.example
  web/                        ← Next.js frontend
    app/
      lib/api.ts              ← Strict API_URL (throws if env var missing)
      components/
      types/
    .env.production           ← NEXT_PUBLIC_API_URL for production
    .env.local.example        ← Local dev template
  start.sh                    ← Start all services
  stop.sh                     ← Stop all services
  .logs/                      ← Runtime logs (gitignored)
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info |
| GET | `/health` | Health check |
| POST | `/incidents` | Create an incident |
| GET | `/incidents` | List all incidents |

Interactive docs: `http://localhost:8100/docs`
