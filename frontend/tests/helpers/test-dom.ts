import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs a file's tests in one jsdom, so a component left mounted by one test is
// still in the document for the next one.
afterEach(cleanup);
