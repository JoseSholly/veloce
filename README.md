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
and a running PostgreSQL.

```bash
# 1. Install dependencies
uv sync

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

### Environment variables

| Variable            | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`      | Development database, e.g. `postgresql+asyncpg://user:pass@localhost:5432/delivery_db` |
| `TEST_DATABASE_URL` | Test database. Its tables are dropped and recreated, and its name must contain `test`. |
| `SECRET_KEY`        | Signs JWTs. Generate a long random value and keep it secret.         |

Optional: `ALGORITHM` (default `HS256`) and `ACCESS_TOKEN_EXPIRE_MINUTES` (default `15`).

### Creating the first admin
Registration always creates a customer; nobody can choose their own role. Register
through `POST /auth/register`, then promote that account in `psql`:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

## Project layout

```
app/
├── main.py              App setup, exception handlers, courier routes
├── core/
│   ├── config.py        Settings read from .env
│   ├── database.py      Engine, session factory, get_db dependency
│   ├── security.py      Password hashing and JWT creation/verification
│   └── dependencies.py  get_current_user, CurrentUser, require_roles
├── models/              SQLAlchemy models: User, Courier, Delivery
├── schemas/             Pydantic request and response models
├── services/            Business rules (DeliveryService, AuthService)
└── routers/             auth.py, deliveries.py
migrations/              Alembic environment and versions
tests/                   unit/, integration/, concurrency/
```

Responsibilities are split deliberately: routers deal with HTTP, services own the
business rules and the transaction, and the database is the final authority on
uniqueness and locking. Services raise their own exceptions
(`ResourceNotFoundError`, `BusinessRuleViolationError`), and `main.py` turns them
into 404 and 409 responses.

## API

| Method | Path                          | Who                    | Purpose                                  |
| ------ | ----------------------------- | ---------------------- | ---------------------------------------- |
| POST   | `/auth/register`              | anyone                 | Create a customer account                |
| POST   | `/auth/login`                 | anyone                 | OAuth2 form login (the email goes in `username`) |
| POST   | `/auth/login/json`            | anyone                 | Login with a JSON `email` and `password` |
| GET    | `/auth/me`                    | any logged-in user     | The current user                         |
| POST   | `/deliveries`                 | customer, admin        | Request a delivery (starts `pending`)    |
| GET    | `/deliveries`                 | any logged-in user     | List the deliveries you may see (paginated) |
| GET    | `/deliveries/{id}`            | any logged-in user     | One delivery, if you may see it          |
| POST   | `/deliveries/{id}/assign`     | admin                  | Assign an available courier              |
| POST   | `/deliveries/{id}/cancel`     | customer, admin        | Cancel a `pending` or `assigned` delivery |
| POST   | `/couriers`                   | admin                  | Create a courier                         |
| GET    | `/couriers`, `/couriers/{id}` | admin                  | List or read couriers                    |
| PATCH  | `/couriers/{id}`              | admin                  | Update a courier's name or phone         |

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
- Access tokens last 15 minutes by default. There are no refresh tokens yet.
- Emails are stored in lowercase, so `A@x.com` and `a@x.com` are the same account.
