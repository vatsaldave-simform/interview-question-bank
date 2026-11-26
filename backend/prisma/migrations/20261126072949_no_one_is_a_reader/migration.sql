-- The API no longer accepts Reader, and this stops every other write too: a seed, raw SQL,
-- a future bug (ADR-0055).
ALTER TABLE "viewers" ADD CONSTRAINT "viewers_role_is_not_reader" CHECK (role <> 'reader');

-- Only an open request for Reader is refused, because granting it would make a Reader and
-- a decided one is history (ADR-0055).
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_reader_only_once_decided"
  CHECK (role <> 'reader' OR state <> 'open');
