# Express API over Next.js

Almost everything this POC is graded on is a property of the API boundary: edits must be
rejected by the API rather than hidden by the UI, and a filtered query must not leak that a
client-restricted Question exists. Next.js server components would let reads reach the database
without crossing HTTP, so those properties would become harder to demonstrate and to test
end-to-end. We run Express as a standalone API with a separate Vite React client, accepting an
extra `docker compose` service in exchange for a trust boundary that every test crosses.
