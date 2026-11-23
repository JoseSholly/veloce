# ADR-001: Modular monolith over microservices

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Veloce has several domains (identity, deliveries, dispatch, tracking, notifications)
with different rates of change and different load profiles. Tracking writes are frequent
and small; dispatch writes are rare but must be strictly consistent.

The most important correctness rules cross domains in a single transaction. Assigning a
courier must lock the delivery and the courier, write the assignment, append a delivery
event and record an outbox message, all or nothing.

There is one developer, a 12-day schedule, and one local machine.

## Options considered

1. **Microservices** (for example deliveries, dispatch and tracking as separate services
   with their own databases).
   - Independent scaling and deployment.
   - Cross-domain invariants need distributed coordination (sagas or two-phase commit)
     instead of one database transaction. The courier-assignment invariant becomes
     eventually consistent, which is exactly the property this project sets out to prove.
   - Each service needs its own CI, configuration, health checks and observability, which
     multiplies the operations work far beyond the time available.
2. **An unstructured monolith** (routers that talk to the database directly).
   - The fastest start, but domain rules leak into HTTP handlers and nothing stops one area
     from reaching into another's tables.
3. **A modular monolith.** One deployable API and one worker, from one codebase and one
   PostgreSQL database, with code organized by domain and a strict layering: routers, then
   services, then models and infrastructure.

## Decision

Option 3. Routers handle HTTP only. Services own business rules and the transaction
boundary. The database enforces the invariants that matter, through constraints, locks and
unique indexes.

Domain packages are introduced as each domain grows, not created empty in advance.
Asynchronous work (notifications, timeouts) runs in a separate worker process from the
same codebase, fed by a transactional outbox (see ADR-008).

## Consequences

- Cross-domain invariants are enforced with ordinary ACID transactions and row locks, and
  can be tested deterministically.
- One deployable, one migration history, one CI pipeline.
- The API and the worker scale as whole processes, not per domain. Tracking writes are the
  first likely hotspot. If that becomes real, tracking is the first candidate to extract,
  because it already talks to the other domains mostly through events.
- Boundaries are enforced by convention and review, not by the network. A careless import
  can couple domains, so services should call each other's public functions rather than
  query each other's tables.

## Trade-offs accepted

The design gives up independent scaling and per-domain deployment in exchange for
transactional correctness and a much smaller operational surface. That is the right trade
at this scale. Extraction stays possible because communication between domains is
designed around events.
