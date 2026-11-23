# Backend Roadmap

The backend half of the [project roadmap](../ROADMAP.md): 8 backend days, plus a shared
docs day. Run every command from `backend/`.

**Stack:** FastAPI, SQLAlchemy 2 (async), PostgreSQL + PostGIS (on the host, not in Docker), Alembic, Redis (Docker),
pytest, ruff, uv.

## The architecture stays a modular monolith

There is one deployable API and one worker process, both built from the same code.
Packages are reorganized by domain as each one grows, not all at once on Day 1:

```
app/
├── api/v1/            Routers (HTTP only: parse, authorize, call a service, serialize)
├── core/              Config, logging, security, errors
├── domains/
│   ├── identity/      Users, organizations, memberships, tokens
│   ├── delivery/      Delivery, state machine, events, pricing, idempotency
│   ├── dispatch/      Assignments, candidate matching
│   ├── tracking/      Locations, realtime fan-out
│   └── notifications/ Outbox handlers, notification records
├── infrastructure/    Database session, Redis client, outbox relay
├── workers/           Worker entrypoint (outbox relay, timeout scan)
└── main.py
```

Rule: **services own the transaction.** A service method opens the unit of work, takes
any locks, writes domain rows, event rows and outbox rows, and commits once. Routers
never call `commit()`.

## Target data model

```
Organization ─< Membership >─ User
     │                          │
     ├─< CourierProfile ────────┘ (user_id)
     │       └─< TrackingPoint
     ├─< Delivery ─< DeliveryAssignment >─ CourierProfile
     │       ├─< DeliveryEvent        (append-only)
     │       └── IdempotencyRecord    (per user + key)
     └─< OutboxEvent ─> Notification
```

Invariants the **database** enforces, so a bug in a service cannot break them:

| Invariant | How it is enforced |
| --- | --- |
| A courier has at most one active assignment | Partial unique index on `delivery_assignments(courier_id) WHERE status IN ('offered','accepted')` |
| A delivery has at most one active assignment | Partial unique index on `delivery_assignments(delivery_id) WHERE status IN ('offered','accepted')` |
| Delivery history is immutable | A trigger rejects `UPDATE` and `DELETE` on `delivery_events` |
| An idempotency key is used once per user | Unique `(user_id, key)` on `idempotency_records` |
| A notification is sent once per event and recipient | Unique `(outbox_event_id, recipient_id, channel)` on `notifications` |
| A user has one role per organization | Unique `(organization_id, user_id)` on `memberships` |
| A delivery belongs to exactly one tenant | `deliveries.organization_id NOT NULL` with a foreign key |

---

## Day 1: Foundation ✅

**Must**
- [x] `docker-compose.yml` at the repo root with `redis:7` on port 6380, a named volume and a health check. PostgreSQL stays on the host.
- [x] Move every router under the `/api/v1` prefix. Update the tests and the static UI's base URL.
- [x] `GET /health/live` always returns 200. `GET /health/ready` runs `SELECT 1` and a Redis `PING`, each with a short timeout, and returns 503 with the failing component named.
- [x] JSON logging. Middleware assigns an `X-Request-ID` (or reuses the incoming one), puts it on every log line and returns it in the response.
- [x] One error shape: `{"error": {"code": "...", "message": "...", "request_id": "..."}}` for 4xx, 5xx and validation errors.
- [x] Fix the existing ruff errors in `migrations/versions/9d3d02af73d3_*.py`, and add `ruff format --check`.
- [x] `.github/workflows/ci.yml`: ruff, `alembic upgrade head` + `alembic check`, a downgrade-to-base round trip, then pytest. CI uses a throwaway PostGIS service container, because GitHub's runners have no host database. Set `working-directory: backend`.

**Stretch**
- [ ] Pyright in basic mode, added to CI.

**Tests:** readiness returns 503 when the database URL points at a closed port; the request ID appears in the response header.

**ADR-001:** Modular monolith over microservices.

## Day 2: Identity, tenancy and isolation

**Must**
- [ ] `Organization` and `Membership(user_id, organization_id, role, status)` models. The roles are `admin`, `dispatcher`, `courier` and `customer`.
- [ ] A migration that creates a `default` organization and moves every user's current `users.role` into a membership, then drops `users.role`. Test it with downgrade and upgrade on a copy of the dev database.
- [ ] Add `organization_id` to `couriers` and `deliveries`. Backfill it with the default organization, then make it `NOT NULL`.
- [ ] Put an `org` claim in the access token. Login takes an optional `organization_id`; when the user has exactly one membership, it is chosen automatically.
- [ ] A `CurrentMember` dependency that resolves the user, the organization and the role. Every query in every service filters by `organization_id`.
- [ ] `POST /api/v1/organizations`, `GET` and `POST /api/v1/organizations/{id}/members`.
- [ ] Return the refresh token as an `HttpOnly; SameSite=Strict; Path=/api/v1/auth` cookie as well as in the body, and have `/auth/refresh` accept either. The SPA uses the cookie.

**Stretch**
- [ ] Rate limiting on `/auth/login` (Redis `INCR` with an expiry).

**Tests (invariants):**
- A member of organization A gets 404 for organization B's delivery, courier and member list, even with the exact ID.
- A customer cannot see another customer's delivery in the same organization.
- A token issued for organization A cannot be used against organization B's endpoints.

**ADR-002:** Tenancy model (shared schema with an `organization_id` column, versus schema-per-tenant).
**ADR-003:** Refresh tokens (rotation, reuse detection, why an httpOnly cookie for the browser).

## Day 3: Delivery lifecycle

**Must**
- [ ] The state machine lives in a pure module, `domains/delivery/state_machine.py`:

  ```
  pending ──assign──> assigned ──accept──> accepted ──pickup──> picked_up ──start──> in_transit ──complete──> delivered
     ▲                   │                    │                    │                     │
     └──reject/expire────┘                    │                    └───────fail──────────┴──> failed
  pending, assigned ──cancel (customer)──> cancelled
  pending, assigned, accepted ──cancel (dispatcher)──> cancelled
  ```
  A table of `(from_state, action, actor_role) -> to_state`. Anything not in the table raises `InvalidTransition` (409).
- [ ] Add the `accepted` and `failed` enum values in their own migration. PostgreSQL does not allow a new enum value to be used in the same transaction that adds it.
- [ ] `DeliveryEvent(delivery_id, from_status, to_status, action, actor_user_id, reason, created_at)`, written by the same service call that changes the status. Add the immutability trigger.
- [ ] Pickup and dropoff get `lat` and `lng` (keep the JSON address fields). Add `package_weight_kg` and `service_level` (`standard`, `express`).
- [ ] `domains/delivery/pricing.py`: base fare + per-km rate × haversine distance + weight surcharge, multiplied by the service level. Store money as integer minor units. `POST /api/v1/deliveries/estimate`.
- [ ] `Idempotency-Key` header on `POST /deliveries`. Store the key, a hash of the request and the response. The same key with the same body returns the stored response; the same key with a different body returns 422.
- [ ] `GET /deliveries` filters by `status`, `created_from` and `created_to`, sorts by `created_at` or `price`, and pages with `limit` and `cursor` (keyset pagination).
- [ ] `GET /deliveries/{id}/events`.
- [ ] Delivery responses include `allowed_actions` for the current user, so the frontend never duplicates the state machine.

**Tests (invariants):**
- Every pair of `(state, action)` is tested: the allowed ones succeed and every other one returns 409. Generate the cases from the table.
- A delivery cannot be completed before pickup. A cancelled delivery cannot be completed.
- If a status change fails, it writes neither the event nor the status (force a failure after the event insert).
- 20 concurrent requests with the same idempotency key create exactly one delivery.

**ADR-004:** Explicit delivery state machine. **ADR-005:** Idempotency strategy.

## Day 4: Dispatch and concurrency

**Must**
- [ ] `DeliveryAssignment(delivery_id, courier_id, assigned_by, status, offered_at, responded_at, ended_at)`. The statuses are `offered`, `accepted`, `rejected`, `expired`, `revoked` and `completed`. Add both partial unique indexes.
- [ ] Courier availability becomes `on_shift` (set by the courier) plus "busy", which is derived from having an active assignment. The old `available` flag goes away, so it can no longer drift out of sync.
- [ ] `POST /dispatch/{delivery_id}/assign` and `/reassign` (dispatcher). `POST /assignments/{id}/accept` and `/reject` (only the courier who was offered it).
- [ ] `POST /deliveries/{id}/pickup`, `/start`, `/complete` and `/fail` (the assigned courier only).
- [ ] `PATCH /couriers/me/availability`, `GET /couriers/me/assignments`.
- [ ] Lock order everywhere: the delivery row, then the courier row (`SELECT ... FOR UPDATE`). Keep the unique index as the backstop: map an `IntegrityError` on it to 409 `courier_unavailable`.
- [ ] Retry once on deadlock (`40P01`) and serialization failure (`40001`), and log it when that happens.

**Tests (invariants):**
- Two dispatchers assign the same courier to two deliveries at the same moment: exactly one succeeds.
- Two dispatchers assign two couriers to the same delivery at the same moment: exactly one succeeds.
- A courier cannot accept, reject or act on another courier's assignment (404).
- Reject returns the delivery to `pending` and keeps the rejected assignment in the history.
- Customer cancel racing courier accept: the result is one consistent outcome, never both.

**Experiment 001:** a script fires N = 10, 50 and 200 concurrent assignments for one courier
and records successes, conflicts and invariant violations (expected: 1, N−1, 0).
Write it up in `docs/experiments/001-concurrent-assignment.md`.

**ADR-006:** Locking and constraints for dispatch (pessimistic locks with a unique-index backstop, versus optimistic versioning).

## Day 7: Geospatial matching

**Must**
- [ ] Install PostGIS into the host PostgreSQL (for example, Stack Builder on Windows; the package must match the server's major version), then run `CREATE EXTENSION postgis` in a migration. CI already has it. Add `couriers.last_location geography(Point,4326)`, `last_location_at`, and a GiST index. Add `deliveries.pickup_point geography(Point,4326)`.
- [ ] `TrackingPoint(courier_id, delivery_id, location, recorded_at, received_at)` with an index on `(delivery_id, recorded_at)`.
- [ ] `POST /couriers/me/location` with `{lat, lng, recorded_at}`. It updates `last_location` **only if** the new `recorded_at` is later than the stored one (a conditional `UPDATE ... WHERE last_location_at < :recorded_at`), so late points never overwrite newer ones. It appends a tracking point while a delivery is active.
- [ ] `GET /dispatch/{delivery_id}/candidates?radius_km=5&limit=10`. It filters by `ST_DWithin` (which uses the index), on shift, not busy, location fresher than 5 minutes, and vehicle capacity at least the package weight. It ranks by distance and returns `distance_m`, `location_age_s` and a `reasons` list ("2.1 km away", "location 40 s old").
- [ ] A `Vehicle` type and capacity on the courier profile (a simple enum and a number; no separate table yet).
- [ ] `scripts/seed.py --couriers N` scatters couriers around a city's center point.

**Tests:** a stale location is excluded; a busy courier is excluded; capacity filtering works; a late point does not overwrite the location; candidates never include another organization's couriers.

**Experiment 002:** run `EXPLAIN (ANALYZE, BUFFERS)` on the candidates query with 1k, 10k and 100k couriers, with and without the GiST index. Record the plan type and the latency. Note the hardware.

**ADR-007:** PostGIS for matching. Straight-line distance, versus a route engine.

## Day 8: Outbox, worker and notifications

**Must**
- [ ] `OutboxEvent(id, type, aggregate_id, organization_id, payload jsonb, created_at, attempts, next_attempt_at, processed_at, dead_at, last_error)`, written in the **same transaction** as the state change. Every delivery and assignment transition emits one.
- [ ] `app/workers/main.py` (`uv run python -m app.workers.main`). It loops: `SELECT ... WHERE processed_at IS NULL AND dead_at IS NULL AND next_attempt_at <= now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 50`, dispatches each event to its handlers, and marks it processed.
- [ ] Handlers: publish to Redis channel `org:{org_id}:delivery:{id}`, and create `Notification` rows for the customer and courier (the channel is `log` for now). The unique constraint makes a retry harmless.
- [ ] Retries back off exponentially with jitter (1 s, 2 s, 4 s … capped at 5 min). After 8 attempts the event is set `dead_at` and logged at ERROR.
- [ ] Timeout scan in the same worker: an `offered` assignment older than `ASSIGNMENT_OFFER_TIMEOUT` (default 2 minutes) becomes `expired`, and the delivery returns to `pending` with an event and an outbox row.
- [ ] Graceful shutdown on SIGINT and SIGTERM (finish the current batch, then exit).

**Tests (failure scenarios):**
- With Redis stopped, a delivery is still created and its outbox row stays unprocessed. Once Redis is back, the worker publishes it once.
- A handler that raises increments `attempts` and pushes `next_attempt_at` forward. After the maximum it is marked dead.
- Processing the same outbox event twice creates one notification.
- Two workers running at once never process the same event (`SKIP LOCKED`).
- An expired offer frees the courier, and the delivery can be assigned again.

**ADR-008:** Transactional outbox, versus publishing after commit or a task queue such as Celery or Arq.

## Day 9: Realtime tracking

**Must**
- [ ] `/ws/v1/deliveries/{id}/tracking` for the customer who owns the delivery, the assigned courier, and dispatchers in the same organization. `/ws/v1/dispatch/monitor` for dispatchers.
- [ ] Authentication: the client must send `{"type":"auth","token":"<access token>"}` within 5 seconds or the server closes with code 4401. Access is then checked exactly like REST (4403 or 4404). Tokens are not put in the query string, so they stay out of access logs.
- [ ] Each API instance runs one Redis subscriber task that fans messages out to its local connections. Location updates publish directly to Redis, because they are ephemeral and a missed point is replaced by the next one. Status changes come through the outbox.
- [ ] A server ping every 20 seconds closes connections that stop answering. Each connection has a bounded send queue (100 messages); when it fills, the oldest location messages are dropped and status messages are kept.
- [ ] On connect, send a snapshot (the current status and the last location), so a client that reconnects is never stale.
- [ ] `scripts/simulate_courier.py` logs in as a courier and walks a path between pickup and dropoff, posting locations every 2 seconds.

**Stretch**
- [ ] A two-instance demo: run the API on ports 8000 and 8001, connect the customer to one and post locations to the other, and record it in the docs.

**Tests:** an unauthenticated socket is closed; another organization's delivery is closed with 4404; a published message reaches the subscribed client; a disconnect cleans up the connection registry.

## Day 11 (backend half): Observability and performance

**Must**
- [ ] `/metrics` with `prometheus-fastapi-instrumentator`, which provides request count and latency histograms per route.
- [ ] Custom metrics: `outbox_pending`, `outbox_oldest_age_seconds`, `outbox_dead_total`, `ws_connections`, `assignment_conflicts_total`.
- [ ] Log SQL statements slower than 200 ms, with their request ID.
- [ ] `loadtest/locustfile.py` runs a mix of create delivery, list deliveries (as dispatcher), get delivery and post location.
- [ ] **Experiment 003 (delivery list):** seed 50k deliveries and record the baseline (p50, p95 and p99, query count per request, `EXPLAIN ANALYZE`). Then fix what you find: N+1 loading of customer and courier names (use `selectinload` or a join), a composite index on `(organization_id, status, created_at DESC)`, and keyset pagination. Measure again. Publish both runs.

**Stretch**
- [ ] A Compose profile `observability` with Prometheus and Grafana, plus one dashboard (latency, error rate, outbox lag).

## Day 12: Docs (shared)

- [ ] `README.md`: the problem, the architecture diagram, setup, environment variables, the API overview, how to run the tests, results and limitations.
- [ ] `docs/architecture.md`: the components, the request path, the event path and the realtime path.
- [ ] Clean up ADR-001 to ADR-008.
- [ ] Incident reports, each reproduced for real:
  1. *Courier assigned twice*: remove the lock and the unique index on a branch, show the concurrency test failing, then restore them.
  2. *Notification backlog*: stop the worker, create 5k deliveries, watch `outbox_oldest_age_seconds`, restart the worker and measure how long it takes to drain.
  3. *Slow delivery list*: this is Experiment 003, told as an incident.
- [ ] Delete `app/static/` and `tests/integration/test_ui.py` once the React app covers the same flows.

## Environment variables added by this plan

| Variable | Default | Used for |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379/0` | Pub/Sub, rate limiting, readiness |
| `ASSIGNMENT_OFFER_TIMEOUT_SECONDS` | `120` | Expiring unanswered offers |
| `LOCATION_STALE_AFTER_SECONDS` | `300` | Excluding couriers from matching |
| `OUTBOX_MAX_ATTEMPTS` | `8` | Dead-letter threshold |
| `CORS_ORIGINS` | empty | Unneeded in development (Vite proxies requests); kept for later deployment |
