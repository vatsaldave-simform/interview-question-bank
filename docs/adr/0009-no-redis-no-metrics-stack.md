# No Redis, no metrics stack

Deliberate omissions, recorded so they are not mistaken for oversights.

**Redis.** Refresh tokens need referential integrity, revocation and restart durability, so they
belong in Postgres (ADR-0008). Rate limiting is in-process because the service runs as a single
instance. And caching search results is actively unsafe here: a cache keyed on the query but not
the Viewer would serve one Viewer's client-restricted results to another, defeating the query-level
enforcement from above it (ADR-0003). Keying by Viewer would make the cache almost useless.

**OpenTelemetry / Prometheus / Grafana.** The "structured trace of who and when" this project
requires is a domain audit log (ADR-0006), not distributed tracing — a distinction worth keeping
straight. Performance evidence here means a query plan, so we rely on `EXPLAIN ANALYZE` plus
`pg_stat_statements`, which needs no application instrumentation.
