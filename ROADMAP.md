# Veloce Roadmap: 12 days to a portfolio-ready dispatch platform

Veloce is a multi-tenant delivery and dispatch platform. Customers request deliveries,
dispatchers assign couriers, couriers carry the deliveries out, and customers track
them live.

This is the plan for building it in **12 working days**, on a local machine. It is a
cut-down version of a much larger vision. Everything here was picked because it either
proves a hard backend property (correctness under concurrency, tenant isolation,
reliable events) or because the demo needs it to work end to end.

The detailed plans are:

- [backend/ROADMAP.md](backend/ROADMAP.md): FastAPI, PostgreSQL + PostGIS, Redis, worker
- [frontend/ROADMAP.md](frontend/ROADMAP.md): React, TypeScript, Vite, Tailwind, shadcn/ui

## Starting point

Already built, in `backend/`:

- Register and login, Argon2 hashing, JWT access tokens
- Refresh-token rotation with reuse detection, logout and logout-all
- Customer, courier and admin roles, with ownership checks (someone else's delivery returns 404)
- Deliveries with `pending`, `assigned` and `cancelled` states
- Courier assignment locked with `SELECT ... FOR UPDATE`, with concurrency tests
- 148 passing tests (unit, integration and concurrency)

## What is in scope

| Area | In this plan |
| --- | --- |
| Foundation | `/api/v1`, health and readiness checks, JSON logs with request IDs, Docker Compose for Redis (PostgreSQL stays on the host), CI |
| Tenancy | Organizations, memberships with per-organization roles, isolation tests |
| Delivery lifecycle | An explicit state machine, an immutable event history, a pricing estimate, idempotent creation |
| Dispatch | A separate assignment entity, accept/reject/reassign, invariants enforced by the database, concurrency tests |
| Geospatial | PostGIS courier locations, ranked nearby candidates, a benchmark |
| Reliability | A transactional outbox, a worker with retries and a dead-letter state, assignment timeouts |
| Realtime | WebSocket tracking, with Redis Pub/Sub carrying messages between API instances |
| Observability | Prometheus `/metrics`, one load-tested performance investigation |
| Frontend | Customer, courier, dispatcher and minimal admin screens, plus a live map |
| Docs | README, architecture diagram, ADRs, incident reports, experiment write-ups |

## What is deliberately left out (and why)

| Deferred | Reason |
| --- | --- |
| Payments and webhooks | A full subsystem on its own. The idempotency and outbox work here is the foundation it would build on. |
| VPS deployment, TLS, backups, runbook | Local only for now. Docker Compose keeps the deployment step small later. |
| OpenTelemetry tracing, Grafana dashboards | Request IDs and metrics cover diagnosis locally. Grafana is a stretch goal on Day 11. |
| Proof-of-delivery uploads | Needs object storage. Not on the critical path. |
| Real email and push providers | The worker writes notifications to the database and logs. Adding a provider is just another handler. |
| Route distance (OSRM or Google) | Matching uses straight-line distance and says so. Route distance is a documented future improvement. |

## Calendar

**BE** = backend day, **FE** = frontend day. The backend goes first so that the
frontend is built against real endpoints, not mocks.

| Day | Track | Outcome by the end of the day |
| --- | --- | --- |
| 1 | BE | Foundation: Compose, `/api/v1`, health and readiness, logging, error format, CI |
| 2 | BE | Organizations, memberships, tenant scoping, isolation tests, refresh-token cookie |
| 3 | BE | Delivery state machine, event history, pricing estimate, idempotent create, filtered list |
| 4 | BE | Assignments: assign, accept, reject, reassign, pickup, start, complete, fail. Database invariants, concurrency tests |
| 5 | FE | Scaffold, typed API client, auth flow, role-based app shell |
| 6 | FE | Customer screens (create, list, detail and timeline) and courier screens (assignments, actions) |
| 7 | BE | PostGIS: courier location, ranked candidates, seed script, geo benchmark |
| 8 | BE | Outbox, worker, notifications, retries and dead-letter, assignment timeout |
| 9 | BE | WebSockets with Redis Pub/Sub, a two-instance test, a courier movement simulator |
| 10 | FE | Dispatcher dashboard, candidate ranking, live map, customer live tracking |
| 11 | BE + FE | Metrics, Locust load test, a performance investigation. Admin screens and polish |
| 12 | Docs | README, diagram, ADRs, incident reports, seeded demo, retiring the old static UI, buffer |

Days 13 and 14 are not in the plan. They are slack for whatever runs over.

## Rules for staying on schedule

1. **Each day has Must and Stretch items.** Finish every Must before you start any Stretch.
   If a day runs over, move its Stretch items to the backlog, not to tomorrow.
2. **Write tests with the feature, not after it.** The invariant tests listed in the backend
   plan are part of the Must items.
3. **Write an ADR the day you make the decision.** Spend 20 minutes on it while the
   alternatives are still fresh. Day 12 only tidies them up.
4. **Never invent measurements.** Every number in `docs/` comes from a command you ran,
   with the machine described next to it.
5. **Commit at the end of every day**, with the day's tests passing.

### Cut line

If you are more than a day behind after Day 6, drop these, in this order:

1. The two-instance WebSocket demo (keep a single instance with Redis Pub/Sub)
2. The admin screens (use the API docs instead)
3. The geo benchmark at 100k couriers (keep 1k and 10k)
4. Assignment timeout jobs (keep the outbox and notifications)

Never cut the state machine, the assignment invariants, tenant isolation or the outbox.
They are the point of the project.

## The finished demo

At the end of Day 12 this should run start to finish on a fresh clone:

1. `docker compose up -d` starts Redis. PostgreSQL (with PostGIS) runs on the host.
2. `uv run alembic upgrade head` and `uv run python -m scripts.seed` build an organization
   with a dispatcher, couriers spread around a city, and customers.
3. The API, the worker and the frontend start with one command each.
4. A customer creates a delivery. Pressing submit twice still creates only one.
5. The dispatcher sees it, opens the ranked list of nearby couriers and assigns one.
   A second dispatcher racing for the same courier gets a clean conflict.
6. The courier accepts, picks up and starts the delivery. The simulator moves them along a path.
7. The customer watches the courier move on a map, and the status timeline updates live.
8. A customer from another organization cannot see any of it, even by guessing IDs.
9. Stopping Redis does not lose the notification: it is sent once Redis is back.
10. `docs/` explains why each of these works.

## Documentation produced along the way

```
docs/
├── architecture.md            System overview and diagram
├── decisions/                 ADR-001 … ADR-008 (see backend plan)
├── experiments/
│   ├── 001-concurrent-assignment.md
│   ├── 002-geospatial-matching.md
│   └── 003-delivery-list-performance.md
└── incidents/
    ├── 001-courier-assigned-twice.md
    ├── 002-notification-backlog.md
    └── 003-slow-delivery-list.md
```
