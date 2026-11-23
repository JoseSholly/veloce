# Veloce

A multi-tenant delivery and dispatch platform. Customers request deliveries,
dispatchers assign couriers, couriers carry them out, and customers track them live.

| Directory | What it is |
| --- | --- |
| [backend/](backend/) | FastAPI, async SQLAlchemy 2 and PostgreSQL API ([README](backend/README.md), [roadmap](backend/ROADMAP.md)) |
| [frontend/](frontend/) | React, TypeScript and Vite: landing page and dashboard ([README](frontend/README.md), [roadmap](frontend/ROADMAP.md)) |

The build plan is in [ROADMAP.md](ROADMAP.md).

## Running the backend

PostgreSQL runs on your machine. Redis runs in Docker.

```bash
docker compose up -d          # Redis on port 6380
cd backend
uv sync
cp .env.example .env          # then edit the values
uv run alembic upgrade head
uv run fastapi dev app/main.py
```

The API docs are at <http://127.0.0.1:8000/docs>. See [backend/README.md](backend/README.md)
for the full setup, the API and the tests.

## Running the frontend

In a second terminal, with the backend running:

```bash
cd frontend
npm install
npm run dev                   # open http://localhost:5173
```

Vite forwards API calls to the backend, so open only `localhost:5173`. See
[frontend/README.md](frontend/README.md).
