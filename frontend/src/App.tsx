import { readinessResponseSchema, type ReadinessResponse } from "@iqb/shared";
import { useEffect, useState } from "react";

/**
 * The client end of the thinnest version that runs end to end: it reads readiness through the
 * same shared schema the API answers with, which is the whole point of the shared
 * package (ADR-0010). Login and the real shell arrive with the client shell ticket.
 *
 * The request is same-origin in the deployed image and proxied in development, so the
 * path is written once and means the same thing in both (ADR-0012).
 */
export function App() {
  const [readiness, setReadiness] = useState<
    ReadinessResponse | "unreachable" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/ready")
      .then(async (response) =>
        readinessResponseSchema.parse(await response.json()),
      )
      .then((parsed) => {
        if (!cancelled) setReadiness(parsed);
      })
      .catch(() => {
        if (!cancelled) setReadiness("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Interview Question Bank</h1>
      <p>
        API:{" "}
        {readiness === null
          ? "checking"
          : readiness === "unreachable"
            ? "unreachable"
            : `${readiness.status} (database ${readiness.checks.database})`}
      </p>
      {/*
        The deployed service sleeps after fifteen minutes and takes about a minute to
        wake (ADR-0012). Saying so is the difference between a visitor reading the wait
        as slow and reading it as broken. This belongs on the login screen once there
        is one — issue #13.
      */}
      <p>
        <small>
          Hosted on a free tier that sleeps when idle. The first visit after a
          quiet spell takes about a minute to wake; later ones are immediate.
        </small>
      </p>
    </main>
  );
}
