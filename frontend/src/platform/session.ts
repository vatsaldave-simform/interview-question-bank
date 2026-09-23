import type { Viewer } from "@iqb/shared";
import { useSyncExternalStore } from "react";

/**
 * Three states and not a boolean. "unknown" is the moment before the silent sign-in has
 * answered, and telling it apart from "signed-out" is what stops the sign-in check
 * throwing a Viewer back to the login screen a beat before their session comes back.
 */
export type Session =
  | { status: "unknown" }
  | { status: "signed-in"; accessToken: string; viewer: Viewer }
  | { status: "signed-out" };

/**
 * The access token lives in this variable and nowhere else: no localStorage, no
 * sessionStorage, no cookie this client can read (ADR-0008). A reload empties it, which
 * is exactly what the silent sign-in exists to undo.
 */
let session: Session = { status: "unknown" };

const watchers = new Set<() => void>();

export function currentSession(): Session {
  return session;
}

export function replaceSession(next: Session): void {
  session = next;
  for (const watcher of watchers) watcher();
}

function watch(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

/** Re-renders whoever reads it when the session changes. */
export function useSession(): Session {
  return useSyncExternalStore(watch, currentSession, currentSession);
}

/** What the API client puts in the authorization header, and null when there is nothing
 * to put there. */
export function accessToken(): string | null {
  return session.status === "signed-in" ? session.accessToken : null;
}
