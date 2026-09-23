import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs a file's tests in one jsdom, so a component left mounted by one test is
// still in the document for the next one.
afterEach(cleanup);

// jsdom has no layout, so it cannot scroll. The router restores the scroll position on
// every navigation, and without this each routed test prints a "Not implemented" warning.
window.scrollTo = () => {};
