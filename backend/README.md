# Veloce

A delivery and dispatch API built with FastAPI, async SQLAlchemy 2 and PostgreSQL.

Customers request deliveries, admins assign couriers to them, and couriers see
the deliveries assigned to them. Access is enforced by role and by ownership.

## Stack

- **FastAPI** for the HTTP layer and dependency injection
- **SQLAlchemy 2 (async)** with **asyncpg** on **PostgreSQL**
- **Alembic** for schema migrations
- **JWT** (PyJWT) for login tokens, **Argon2** (pwdlib) for password hashing
- **pytest**, **pytest-asyncio** and **httpx** for tests
- **uv** for dependencies, **ruff** for linting and formatting

## Getting started

You need Python 3.12 (see `.python-version`), [uv](https://docs.astral.sh/uv/),
PostgreSQL running on your machine, and Docker (for Redis).

Run every command below from this `backend/` directory.

```bash
# 1. Install dependencies
uv sync

# 1b. Start Redis (from the repo root: docker compose up -d)
docker compose -f ../docker-compose.yml up -d

# 2. Create two databases (the second one is for tests)
#    CREATE DATABASE delivery_db;
#    CREATE DATABASE test_delivery_db;

# 3. Configure the environment
cp .env.example .env        # then edit the values

# 4. Create the tables
uv run alembic upgrade head

# 5. Run the API
uv run fastapi dev app/main.py
```

The interactive docs are at <http://127.0.0.1:8000/docs>. Use the **Authorize**
button there to log in.

A browser UI is at <http://127.0.0.1:8000/ui/>. It covers every endpoint: sign in and
register, list and create deliveries, assign couriers and cancel deliveries (admin),
manage couriers (admin), and sign out of one session or all of them. The pages change
with your role. It is plain HTML, CSS and JavaScript in `app/static/` with no build step.

### Environment variables

| Variable            | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`      | Development database, e.g. `postgresql+asyncpg://user:pass@localhost:5432/delivery_db` |
| `TEST_DATABASE_URL` | Test database. Its tables are dropped and recreated, and its name must contain `test`. |
| `SECRET_KEY`        | Signs JWTs. Generate a long random value and keep it secret.         |
| `REDIS_URL`         | Redis, default `redis://localhost:6380/0` (the Compose container).   |

Optional: `ALGORITHM` (default `HS256`), `ACCESS_TOKEN_EXPIRE_MINUTES` (default `15`),
`REFRESH_TOKEN_EXPIRE_DAYS` (default `7`), `LOG_LEVEL` (default `INFO`), `LOG_JSON`
(default `true`; `false` gives readable one-line logs), `SQL_ECHO` (default `false`)
and `HEALTH_CHECK_TIMEOUT_SECONDS` (default `2`).

### Creating the first admin
Registration always creates a customer; nobody can choose their own role. Register
through `POST /api/v1/auth/register`, then promote that account in `psql`:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

The account's code changes with the role (for example `VEL-CUS-0101` becomes
`VEL-ADM-0102`); a database trigger handles that, even for changes made in psql.

### Onboarding a courier

Couriers do not sign up. An admin adds them, and that creates their login too:

1. The admin creates the courier (name, email, phone) with `POST /api/v1/couriers`
   or the New courier page.
2. The response contains a **temporary password**, shown only this once. The admin
   passes it to the courier.
3. The courier signs in with it. Until they choose their own password with
   `POST /api/v1/auth/change-password`, every other endpoint answers
   `403 password_change_required` (only `/auth/me`, `/auth/change-password` and
   `/auth/logout-all` work).
4. Changing the password ends every other session and returns a fresh token pair.

Every courier must have an account: `couriers.user_id` is `NOT NULL`, and deleting a
user who has a courier profile is refused.

**Upgrading a database that already has couriers without accounts:** the
`c4d8e1a9b3f6` migration refuses to run until each one is linked. Run:

```bash
uv run alembic upgrade b7c1e9f2a4d0
uv run python -m scripts.link_orphan_couriers   # prints each new login once
uv run alembic upgrade head
```

The script gives each account a placeholder email (`first.last@couriers.example.com`)
and a temporary password.

### Public codes

Internal integer ids are used in addresses and API calls, but are never shown to people.
Every record also has a public code, and the UI shows only that:

| Record | Code | How it is made |
| --- | --- | --- |
| Customer, courier, admin | `VEL-CUS-0100`, `VEL-COU-0100`, `VEL-ADM-0100` | One counter per role, from 100. A trigger assigns it, and issues a new one when the role changes. Old codes are never reused. |
| Delivery | `VEL-DEL-20261123153012-K7Q2M9XA` | UTC creation time plus 8 random uppercase letters and digits |

## Project layout

```
app/
├── main.py              App setup: middleware, error handlers, /api/v1 routers, /ui mount
├── static/              Browser UI (index.html, app.css, app.js)
├── core/
│   ├── config.py        Settings read from .env
│   ├── database.py      Engine, session factory, get_db dependency
│   ├── security.py      Password hashing and JWT creation/verification
│   ├── dependencies.py  get_current_user, CurrentUser, require_roles
│   ├── logging.py       JSON log formatter, request-ID context variable
│   ├── middleware.py    Request IDs and access log
│   └── errors.py        The single error shape and its exception handlers
├── infrastructure/      Redis client
├── models/              SQLAlchemy models: User, Courier, Delivery, RefreshToken
├── schemas/             Pydantic request and response models
├── services/            Business rules (DeliveryService, AuthService)
└── routers/             auth.py, deliveries.py, couriers.py, health.py
migrations/              Alembic environment and versions
tests/                   unit/, integration/, concurrency/
```

Responsibilities are split deliberately: routers deal with HTTP, services own the
business rules and the transaction, and the database is the final authority on
uniqueness and locking. Services raise their own exceptions
(`ResourceNotFoundError`, `BusinessRuleViolationError`), and `core/errors.py` turns them
into 404 and 409 responses.

## API

Every business endpoint lives under `/api/v1`. Health checks are unversioned.

### Health checks

| Path            | Meaning |
| --------------- | ------- |
| `/health/live`  | The process is up. Checks nothing else, so a database outage never gets a healthy process restarted. |
| `/health/ready` | PostgreSQL and Redis both answer within 2 s. Returns 503 and names the failing dependency otherwise. |

### Errors

Every error has the same shape, so clients can switch on `code`:

```json
{"error": {"code": "not_found", "message": "Delivery not found", "request_id": "3f2a…"}}
```

Validation errors (422) add `"details": [{"field": "pickup.city", "message": "…"}]`.
Unexpected errors return 500 with a generic message; the full traceback is in the log.

### Request IDs and logs

Every response has an `X-Request-ID` header (a caller's own ID is reused if it is safe),
and every log line is a JSON object carrying that ID. To follow one request, search the
logs for its ID.

### Endpoints

| Method | Path                          | Who                    | Purpose                                  |
| ------ | ----------------------------- | ---------------------- | ---------------------------------------- |
| POST   | `/api/v1/auth/register`              | anyone                 | Create a customer account                |
| POST   | `/api/v1/auth/login`                 | anyone                 | OAuth2 form login (the email goes in `username`) |
| POST   | `/api/v1/auth/login/json`            | anyone                 | Login with a JSON `email` and `password` |
| POST   | `/api/v1/auth/refresh`               | anyone with a refresh token | Trade a refresh token for a new access and refresh token |
| POST   | `/api/v1/auth/logout`                | anyone with a refresh token | End one session                     |
| POST   | `/api/v1/auth/logout-all`            | any logged-in user     | End every session of the user            |
| GET    | `/api/v1/auth/me`                    | any logged-in user     | The current user                         |
| POST   | `/api/v1/auth/change-password`       | any logged-in user     | Set a new password; ends other sessions, returns new tokens |
| POST   | `/api/v1/deliveries`                 | customer, admin        | Request a delivery (starts `pending`)    |
| GET    | `/api/v1/deliveries`                 | any logged-in user     | List the deliveries you may see (paginated) |
| GET    | `/api/v1/deliveries/{id}`            | any logged-in user     | One delivery, if you may see it          |
| POST   | `/api/v1/deliveries/{id}/assign`     | admin                  | Assign an available courier              |
| POST   | `/api/v1/deliveries/{id}/cancel`     | customer, admin        | Cancel a `pending` or `assigned` delivery |
| POST   | `/api/v1/couriers`                   | admin                  | Onboard a courier: creates their login and returns a one-time temporary password |
| GET    | `/api/v1/couriers`, `/api/v1/couriers/{id}` | admin                  | List or read couriers                    |
| PATCH  | `/api/v1/couriers/{id}`              | admin                  | Update a courier's name or phone         |

### Sessions and refresh tokens

Logging in returns two tokens:

- an **access token** (a JWT, 15 minutes) that you send as `Authorization: Bearer ...`;
- a **refresh token** (an opaque random string, 7 days) that you keep safe and use only
  to get a new pair from `POST /auth/refresh`.

```bash
# log in
curl -X POST localhost:8000/api/v1/auth/login/json -H 'Content-Type: application/json' \
  -d '{"email": "you@example.com", "password": "password123"}'

# when the access token expires, trade the refresh token for a new pair
curl -X POST localhost:8000/api/v1/auth/refresh -H 'Content-Type: application/json' \
  -d '{"refresh_token": "<the refresh token>"}'
```

How it stays safe:

- **Rotation.** Every refresh retires the token you sent and returns a new one, so each
  refresh token works exactly once. Always store the newest one.
- **Reuse detection.** Each login starts a session ("family") of tokens. If a retired
  token is presented again, it was probably copied, so the whole session is revoked and
  the next refresh by anyone in it fails. The owner just logs in again.
- **Hashed at rest.** Only a SHA-256 hash is stored, so a leaked database cannot be used
  to log in. The raw token is shown once, at login or refresh.
- **Logout.** `POST /auth/logout` ends one session and `POST /auth/logout-all` ends all of
  them. Logout always answers 204, so it cannot be used to guess tokens.
- **Disabled users** cannot refresh.

Limits worth knowing: an already-issued **access token keeps working until it expires**
(15 minutes) even after logout, because access tokens are not checked against the
database for revocation. Two simultaneous refreshes with the same token look like a
replay, so one succeeds and the session is then ended. Expired and revoked rows are not
purged automatically yet.

### Who can see which delivery

| Role     | Sees                                         |
| -------- | -------------------------------------------- |
| customer | Only deliveries they created                 |
| courier  | Only deliveries assigned to their courier profile |
| admin    | Every delivery                               |

A delivery you may not see returns **404**, the same as one that doesn't exist, so
the API never confirms that someone else's delivery exists. Requests without a valid
token get **401**, and a valid user without the right role gets **403**.

### Delivery lifecycle

```
pending ──assign──> assigned ──> picked_up ──> in_transit ──> delivered
   │                    │
   └────────cancel──────┴──> cancelled
```

The API currently implements `pending`, `assigned` and `cancelled`. The later states
exist in the model, but no endpoint moves a delivery into them yet. Only `pending`
and `assigned` deliveries can be cancelled, and cancelling releases the courier. Assigning and cancelling lock the rows involved (`SELECT ... FOR UPDATE`,
always delivery first, then courier), so two simultaneous requests cannot assign the
same courier twice.

## Database migrations

```bash
uv run alembic upgrade head                              # apply all migrations
uv run alembic revision --autogenerate -m "describe it"  # draft a migration
uv run alembic check                                     # fail if models and database differ
uv run alembic downgrade -1                              # undo the last migration
```

- Always read an autogenerated migration before applying it.
- Every new model module must be imported in `migrations/env.py`, or Alembic will not see its table.
- Run `alembic upgrade head` first; autogenerate refuses to run when the database is behind.
- Never edit a migration that has been applied; write a new one.

## Tests

```bash
uv run pytest
```

Tests need `TEST_DATABASE_URL` to point at a real PostgreSQL database.

- **`tests/unit/`**: business rules, called through the service layer, plus password and JWT behaviour.
- **`tests/integration/`**: the HTTP routes, status codes and authorization.
- **`tests/concurrency/`**: simultaneous requests competing for one courier, on separate connections.

Each test runs inside a transaction that is rolled back afterwards, so tests do not
leave data behind. The concurrency tests commit for real and clean up with `TRUNCATE`.
If a test calls the service in a way that is meant to fail, commit your test setup
first: a failing service call rolls back to the last commit.

## Development

```bash
uv run ruff check .      # lint
uv run ruff format .     # format
```

## Security notes

- `.env` holds secrets and is ignored by git. Commit only `.env.example`.
- Passwords are stored as Argon2 hashes and never returned by the API.
- Access tokens last 15 minutes by default. Refresh tokens last 7 days, rotate on every use, and are stored only as hashes.
- Emails are stored in lowercase, so `A@x.com` and `a@x.com` are the same account.
