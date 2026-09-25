# Password reset answers before it looks the address up

ADR-0016 says a reset request answers the same whether or not the address has an account, and
whether or not its Viewer is Deactivated. The same status and the same body are not enough on
their own. The time the answer takes can give the address away too.

For an address with an account, the API issues a token and sends a mail over SMTP. That can take
hundreds of milliseconds, or seconds if the mail server is slow. For an address with no account
it does nothing. If the answer waited for that work, a caller could time it and learn which
addresses have accounts. `/login` closes the same gap by hashing a password it then throws away.
Nothing like that works here, because nobody can fake the time a real mail takes to send.

**So `POST /api/auth/password-reset` checks the body, answers `202` with no body, and only then
looks the address up.** Everything that differs between one address and another happens after
the response has gone. The only thing a caller can learn from the answer is whether the body was
well formed, and that says nothing about any account.

**The work after the response catches its own errors.** Nothing is waiting on it. An error it
let go would be an unhandled rejection, and `index.ts` ends the process on one. So it logs a
failed send as an error and stops there.

**Who is sent a link:** a Viewer who exists and is not Deactivated, whether or not they have set a
password yet. #26 left resending a new Viewer's first link to this endpoint.

**The link is the set-password link.** It opens the same page, and `POST /api/auth/set-password`
spends it. One page and one endpoint serve both a new Viewer and one who forgot. A reset link
lasts an hour (`PASSWORD_RESET_LINK_LIFETIME_SECONDS`), not the three days a new Viewer's link
does. Whoever asked for it is at the screen now, and the mail stays in an inbox after they are
done.

## What we did not do

**Wait for the work, and pad the answer to a fixed time.** The pad would have to be longer than
the slowest send, and a mail server that is slow for a while would push some answers past it.
Every caller would also wait for the pad, even though none of them learns anything from it.

**Hand the work to a queue.** It would do the same thing, and it would also survive a restart.
But it needs a table and a worker process that the bank does not have. ADR-0009 keeps the
infrastructure thin, and a reset that a restart loses can simply be asked for again.

## Consequences

A caller is never told that a send failed. The only record of it is the error in our logs. From
the caller's side, a lost mail and an address with no account look the same, and they have to.
The Viewer asks again.

A send still in progress when the process stops is lost. The Viewer asks again.

The suite cannot wait on the response to know the work is done. The service writes a
`password reset request handled` line when it finishes, however it went, and the tests wait on
that line.

The rate limit is per caller address (ADR-0021). So a caller can have one real Viewer mailed as
often as that limit lets them, and each mail counts against the mail provider's 300 a day
(ADR-0037). A cap on how often one address is mailed would stop that without changing the answer.
It is not built yet.
