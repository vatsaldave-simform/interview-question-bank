import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginScreen } from "@/features/auth/login-screen";

/**
 * Two of #13's criteria are about what the screen says rather than what it does, and both
 * are there for a visitor who has nobody to ask. Someone who does not know the free tier
 * sleeps reads the first slow load as broken (ADR-0012), and someone with no credentials
 * cannot get in at all, because there is no registration endpoint (ADR-0016).
 */
describe("the login screen", () => {
  it("warns that the first visit after a quiet spell is slow", () => {
    render(<LoginScreen />);

    expect(screen.getByText(/takes about a minute to wake/)).toBeInTheDocument();
  });

  it("publishes an address and a password for every seeded role", () => {
    render(<LoginScreen />);

    for (const [role, email, password] of [
      ["reader", "reader@iqb.test", "reader-password"],
      ["author", "author@iqb.test", "author-password"],
      ["reviewer", "reviewer@iqb.test", "reviewer-password"],
    ]) {
      expect(screen.getByText(role!)).toBeInTheDocument();
      expect(screen.getByText(email!)).toBeInTheDocument();
      expect(screen.getByText(password!)).toBeInTheDocument();
    }
  });
});
