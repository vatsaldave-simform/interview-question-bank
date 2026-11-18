-- The Reader role is gone, so every Reader becomes an Author. No Change Event: a
-- migration is not a Viewer (ADR-0055).
UPDATE "viewers"
SET role = 'author'
WHERE role = 'reader';

-- An open request to become a Reader can no longer be granted. Decided ones keep their
-- role, so history still says what was asked for (ADR-0055).
UPDATE "role_requests"
SET state = 'denied', "decidedAt" = now(), reason = 'The Reader role no longer exists.'
WHERE role = 'reader' AND state = 'open';
