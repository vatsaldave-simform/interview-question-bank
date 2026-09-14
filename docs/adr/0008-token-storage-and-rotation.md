# Access token in memory, refresh token in a rotating httpOnly cookie

The access token is short-lived (~15 minutes) and held only in a JavaScript variable in the
React app, so it does not survive a page reload and is not readable from storage. The refresh
token is issued as an httpOnly, Secure, SameSite cookie, is rotated on every use, and reuse of
an already-spent token revokes the entire token family.

Chosen over keeping either token in `localStorage`, where any XSS in the application yields a
usable credential.

## Consequences

The API needs CORS configured for credentialed requests, and the client needs a silent
re-authentication on load to recover an access token from the refresh cookie. Refresh tokens
live in Postgres rather than a cache, because revocation and family-based reuse detection are
relational and must survive a restart.
