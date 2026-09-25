# Mail goes out over SMTP, through nodemailer

ADR-0016 gave the project an outbound mail dependency. A Viewer created by an Administrator is
sent a link to set their own password, and password reset will send one too. This records how
that mail leaves the API.

**All mail goes through one `Mailer`, in `platform/mail.ts`.** It has one method, `send`, which
takes an address, a subject and a plain-text body. The application is handed a `Mailer` the way it
is handed a database. The running API gets one that speaks SMTP. The suite gets one that keeps
each message in memory and sends nothing, so a test can read a link out of a mail and follow it
over HTTP.

**The SMTP one is built on nodemailer.** `MAIL_URL` is an `smtp://` or `smtps://` URL with the
login in it. Deployed, it points at Brevo. Locally, it points at Mailpit, a compose service that
keeps every message and shows them on a web page. Moving between the two is a change to the
environment, not to the code, which is what the spec asks for (#20, story 53).

## Why Brevo, and why port 2525

The bank is deployed on Render's free tier (ADR-0012), which blocks outbound traffic on ports 25,
465 and 587. Those are the usual SMTP ports. Brevo's relay also listens on 2525, and its free plan
sends 300 mails a day. Mail is sent only when a Viewer is created or asks for a reset, so that is
far more than the bank needs.

Render documents which ports it blocks, not which ones it allows. So the first deploy has to be
checked by creating a Viewer and seeing the mail arrive. If 2525 turns out to be blocked too, the
fallback is Brevo's HTTP API, which goes out on port 443. That is one new `Mailer` beside the SMTP
one. Nothing that sends mail would change.

## The connection must be encrypted

On port 2525 the connection starts in plain text, and the server offers to upgrade it to TLS.
Left to its default, nodemailer upgrades only if that offer arrives. Someone in the middle could
remove the offer, and the SMTP key would then be sent in the clear. So `MAIL_REQUIRE_TLS` defaults
to true, and nodemailer refuses to send over a connection that did not upgrade. It is set to false
only for Mailpit, which offers no TLS at all. This follows `REFRESH_COOKIE_SECURE`: safe by
default, and turned off on a laptop by name.

The connection timeouts are five seconds, not nodemailer's minutes. An Administrator is waiting on
the send.

## What we did not do

**One provider's HTTP API, with `fetch`.** It needs no new dependency and is not affected by
blocked ports. But it ties the code to that one provider, and there is no local server that stands
in for a provider's API. Local development would need a second, log-only `Mailer`, and the code
path it runs would not be the deployed one.

**Writing SMTP by hand.** SMTP is small, but the TLS upgrade, authentication and line encoding
are where mistakes hide. That is the same reason ADR-0019 took libraries for the crypto.

**Templates, or HTML bodies.** The spec rules them out. A message is a few lines of text around a
link.

## Consequences

`MAIL_URL` and `MAIL_FROM` are required. An environment that lacks them fails at startup, not at
the first created Viewer. Every command that reads the whole environment needs them too, as it
already needs `ACCESS_TOKEN_SECRET`.

`MAIL_URL` holds the SMTP key, so it is a secret. Render keeps it out of git with `sync: false`,
like `DATABASE_URL`.

Brevo sends only from an address it has verified. `MAIL_FROM` has to be one of those.
