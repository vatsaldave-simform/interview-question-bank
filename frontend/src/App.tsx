import { readinessResponseSchema, type ReadinessResponse } from "@iqb/shared";
import { useEffect, useState } from "react";

/**
 * The client end of the walking skeleton: it reads the API's readiness through the
 * same shared schema the API answers with, which is the whole point of the shared
 * package (ADR-0010). Login and the real shell arrive with the client shell ticket.
 */
export function App() {
  const [readiness, setReadiness] = useState<ReadinessResponse | "unreachable" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ready")
      .then(async (response) => readinessResponseSchema.parse(await response.json()))
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
    </main>
  );
}
