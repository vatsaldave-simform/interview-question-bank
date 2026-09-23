import { ColdStartNotice } from "@/platform/cold-start-notice";

/** What is on screen while the silent sign-in runs. It carries the cold-start notice
 * because this is the wait that can last a minute, and a blank page for a minute is the
 * thing ADR-0012 asks us not to leave anyone looking at. */
export function CheckingTheSession() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <p className="text-center text-sm">Checking whether you are already signed in…</p>
        <ColdStartNotice />
      </div>
    </main>
  );
}
