import type { LoginRequest, ViewerRole } from "@iqb/shared";

// Written out here rather than imported. `@iqb/shared` carries the request and response
// shapes both ends parse with (ADR-0010), and nothing in the client may reach into the
// backend, so these three have to match `backend/src/features/viewers/viewers.seed.ts`.
const demoViewers: readonly (LoginRequest & { role: ViewerRole })[] = [
  { email: "reader@iqb.test", password: "reader-password", role: "reader" },
  { email: "author@iqb.test", password: "author-password", role: "author" },
  { email: "reviewer@iqb.test", password: "reviewer-password", role: "reviewer" },
];

/** Published on purpose: an Administrator creates every Viewer and there is no
 * registration endpoint (ADR-0016), so without these nobody evaluating the bank can see
 * what a Reader, an Author and a Reviewer are each shown (ADR-0012). */
export function DemoCredentials() {
  return (
    // Folded, so the form comes first. A closed `<details>` still holds them, where a
    // closed Collapsible would remove them from the page.
    <details className="rounded-xl border px-4 text-sm">
      <summary className="focus-visible:ring-ring cursor-pointer rounded-md py-3 font-semibold outline-none focus-visible:ring-2">
        Accounts to try
      </summary>
      <p className="text-muted-foreground mb-3">
        One per role, so you can see what each of them is shown. They are demonstration data,
        and the bank holds nothing private.
      </p>
      <ul className="mb-4 flex flex-col gap-3">
        {demoViewers.map((viewer) => (
          <li key={viewer.email} className="flex flex-col gap-0.5">
            <span className="font-medium capitalize">{viewer.role}</span>
            <span className="text-muted-foreground">
              <code>{viewer.email}</code> · <code>{viewer.password}</code>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
