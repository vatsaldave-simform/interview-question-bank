import type { LoginRequest, ViewerRole } from "@iqb/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

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
    <Card>
      <CardHeader>
        <CardTitle>Accounts to try</CardTitle>
        <CardDescription>
          One per role, so you can see what each of them is shown. They are demonstration
          data, and the bank holds nothing private.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3 text-sm">
          {demoViewers.map((viewer) => (
            <li key={viewer.email} className="flex flex-col gap-0.5">
              <span className="font-medium capitalize">{viewer.role}</span>
              <span className="text-muted-foreground">
                <code>{viewer.email}</code> · <code>{viewer.password}</code>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
