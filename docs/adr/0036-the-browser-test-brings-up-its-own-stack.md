# The browser test brings up its own stack

#16 adds one browser test. It logs in, filters the bank and adds a Question, to show that the
client and the API are connected. It needs a running API, a database with the seed in it, and the
built client. `docker compose up` already gives all three.

**The test starts its own copy of the stack, under the compose project name `iqb-browser-test`,
and removes it, database and all, when the run ends.** Playwright's global setup runs
`docker compose -p iqb-browser-test up --build --wait api`, and its teardown runs `down -v`. The API
is on port 3100 and the database on 5436, so it runs beside a stack you already have up.

## Why not the stack you already run

**It writes.** Every run adds a Question. Against the development stack, those would pile up in
the bank you work in, and nothing would clear them out.

**It should start from the same place every time.** A fresh database holds the seed and nothing
else. So the test cannot pass or fail because of something someone did by hand the day before.

**The ports are taken.** A developer often has `docker compose up` or `pnpm dev` running on 3000
and 5434. A copy with its own ports does not have to stop them first.

## What it costs

A run is slower. The image build is cached, but every run creates a database, applies every
migration and runs the seed. That is why the test is kept out of `pnpm test`, which has to stay
quick. It runs only through `pnpm test:browser`.

## What we did not do

**Point Playwright at whatever is on port 3000.** It is quicker, but it writes to the development
bank, and its result depends on what that bank holds.

**Start the API and Vite on the host with Playwright's `webServer`.** That skips the Docker build,
but it tests a different setup from the one that is deployed. The deployed image serves the built
client from the API (ADR-0012), and compose builds the same image.

**Run it in CI.** The ticket asks for a command. A CI job would need Docker Compose and a Chromium
install on every push, which adds minutes. It can be added later without changing the test.
