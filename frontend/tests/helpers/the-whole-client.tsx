import { render } from "@testing-library/react";
import { App } from "@/App";

/** Puts the browser at `at` first. Vitest runs a file's tests in one jsdom, so a test that
 * ended up on the login screen would otherwise start the next one there. */
export function renderTheWholeClient(at = "/"): ReturnType<typeof render> {
  window.history.replaceState({}, "", at);
  return render(<App />);
}
