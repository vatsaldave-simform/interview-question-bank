# pnpm workspace with a shared schema package

The repository is a pnpm workspace holding `backend`, `frontend`, and a small `shared` package
containing the zod schemas for every request and response shape. The API validates incoming
requests with them, the React forms validate against the same objects, and both ends infer their
TypeScript types from them, so a change to a shape cannot drift between client and server.

Chosen over hand-duplicating types in the client, and over generating client types from an
OpenAPI document — the latter is the right answer for a long-lived product and more machinery
than this warrants.

## Consequences

Both services build from the workspace root, so their Dockerfiles copy the workspace manifest
and the `shared` package rather than a single app directory.
