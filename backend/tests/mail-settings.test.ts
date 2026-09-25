import { describe, expect, it } from "vitest";
import { readEnv } from "../src/platform/env.ts";

// Read directly, like the token settings in auth.test.ts: no HTTP test can see whether
// the connection to the mail server was required to be encrypted.
describe("the mail settings the environment supplies", () => {
  const environment = {
    DATABASE_URL: "postgresql://iqb:iqb@localhost:5432/iqb",
    ACCESS_TOKEN_SECRET: "a-secret-long-enough-to-be-worth-having",
    MAIL_URL: "smtp://login:smtp-key@smtp-relay.example.test:2525",
    MAIL_FROM: "bank@iqb.test",
    APP_URL: "http://localhost:5173",
  };

  it("refuses to start with nowhere to send mail", () => {
    const { MAIL_URL: _, ...withoutMailUrl } = environment;

    expect(() => readEnv(withoutMailUrl)).toThrow(/MAIL_URL/);
  });

  it("refuses to start with no sender to name", () => {
    const { MAIL_FROM: _, ...withoutMailFrom } = environment;

    expect(() => readEnv(withoutMailFrom)).toThrow(/MAIL_FROM/);
  });

  it("refuses a mail URL that is not SMTP", () => {
    expect(() => readEnv({ ...environment, MAIL_URL: "https://api.example.test/send" })).toThrow(
      /MAIL_URL/,
    );
  });

  it("takes an SMTP URL with its credentials and port", () => {
    expect(readEnv(environment).MAIL_URL).toBe(environment.MAIL_URL);
    expect(readEnv({ ...environment, MAIL_URL: "smtps://smtp.example.test" }).MAIL_URL).toBe(
      "smtps://smtp.example.test",
    );
  });

  it("requires the connection to be encrypted unless told otherwise", () => {
    expect(readEnv(environment).MAIL_REQUIRE_TLS).toBe(true);
    expect(readEnv({ ...environment, MAIL_REQUIRE_TLS: "false" }).MAIL_REQUIRE_TLS).toBe(false);
  });

  it("refuses a TLS setting that is neither true nor false", () => {
    expect(() => readEnv({ ...environment, MAIL_REQUIRE_TLS: "no" })).toThrow(/MAIL_REQUIRE_TLS/);
  });

  it("refuses to start with nowhere for a mailed link to point", () => {
    const { APP_URL: _, ...withoutAppUrl } = environment;

    expect(() => readEnv(withoutAppUrl)).toThrow(/APP_URL/);
    expect(() => readEnv({ ...environment, APP_URL: "javascript:alert(1)" })).toThrow(/APP_URL/);
  });

  it("gives a set-password link three days unless told otherwise", () => {
    expect(readEnv(environment).SET_PASSWORD_LINK_LIFETIME_SECONDS).toBe(259_200);
    expect(
      readEnv({ ...environment, SET_PASSWORD_LINK_LIFETIME_SECONDS: "1" })
        .SET_PASSWORD_LINK_LIFETIME_SECONDS,
    ).toBe(1);
  });

  it("gives a reset link one hour unless told otherwise", () => {
    expect(readEnv(environment).PASSWORD_RESET_LINK_LIFETIME_SECONDS).toBe(3_600);
    expect(
      readEnv({ ...environment, PASSWORD_RESET_LINK_LIFETIME_SECONDS: "1" })
        .PASSWORD_RESET_LINK_LIFETIME_SECONDS,
    ).toBe(1);
  });

  it("holds back a second reset mail for five minutes unless told otherwise", () => {
    expect(readEnv(environment).PASSWORD_RESET_MAIL_WINDOW_SECONDS).toBe(300);
    expect(
      readEnv({ ...environment, PASSWORD_RESET_MAIL_WINDOW_SECONDS: "1" })
        .PASSWORD_RESET_MAIL_WINDOW_SECONDS,
    ).toBe(1);
  });

  it("refuses a reset mail window of nothing", () => {
    expect(() => readEnv({ ...environment, PASSWORD_RESET_MAIL_WINDOW_SECONDS: "0" })).toThrow(
      /PASSWORD_RESET_MAIL_WINDOW_SECONDS/,
    );
  });
});
