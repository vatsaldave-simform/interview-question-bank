import { apiErrorSchema, questionResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  aQuestion,
  clientIdNamed,
  getQuestion,
  historyOf,
  postQuestion,
  seedTheBank,
  unknownQuestionId,
  whoDidWhat,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/**
 * A Question added already restricted to a Client. Restricted in the same request, because
 * adding first and restricting second would leave it open to every Reviewer in between.
 */
describe("adding a Question restricted to a Client", () => {
  let api: TestApi;
  /** Holds a Grant for the first Client and none for the second. */
  let authorToken: string;
  /** Holds a Grant for the second Client and none for the first. */
  let reviewerToken: string;
  let firstClientId: string;
  let secondClientId: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    firstClientId = await clientIdNamed(api.database, seedClient.name);
    secondClientId = await clientIdNamed(api.database, seedOtherClient.name);
  });
  afterAll(async () => {
    await api.stop();
  });

  const addedAs = async (token: string, clientId: string) => {
    const response = await postQuestion(api, aQuestion({ clientId }), token);
    if (response.status !== 201) throw new Error(`Answered ${await statusAndBody(response)}.`);
    return questionResponseSchema.parse(await response.json()).question;
  };

  it("stores the restriction the Author named", async () => {
    const question = await addedAs(authorToken, firstClientId);

    expect(question.client?.id).toBe(firstClientId);
    const fetched = questionResponseSchema.parse(
      await (await getQuestion(api, question.id, authorToken)).json(),
    );
    expect(fetched.question.client?.id).toBe(firstClientId);
  });

  it("lets a Reviewer add one restricted to a Client they hold a Grant for", async () => {
    const question = await addedAs(reviewerToken, secondClientId);

    expect(question.client?.id).toBe(secondClientId);
  });

  it("answers a Reviewer holding no Grant for it as if it did not exist", async () => {
    const question = await addedAs(authorToken, firstClientId);

    const restricted = await getQuestion(api, question.id, reviewerToken);
    const unknown = await getQuestion(api, unknownQuestionId, reviewerToken);

    expect(restricted.status).toBe(404);
    expect(await restricted.text()).toBe(await unknown.text());
  });

  it("records it added and then restricted, both by the Author", async () => {
    const question = await addedAs(authorToken, firstClientId);

    const events = await historyOf(api, question.id, authorToken);

    const author = seededViewer("author").email;
    expect(whoDidWhat(events)).toEqual([
      ["question_added", author],
      ["question_classified", author],
    ]);
    expect(events[1]).toMatchObject({
      payload: { clientId: { before: null, after: firstClientId } },
    });
  });

  it("writes no restriction event for a Question added unrestricted", async () => {
    const response = await postQuestion(api, aQuestion(), authorToken);
    const question = questionResponseSchema.parse(await response.json()).question;

    const events = await historyOf(api, question.id, authorToken);

    expect(question.client).toBeNull();
    expect(events.map(({ type }) => type)).toEqual(["question_added"]);
  });

  it("refuses a Client the Author holds no Grant for exactly as one that does not exist", async () => {
    const notHeld = await postQuestion(api, aQuestion({ clientId: secondClientId }), authorToken);
    const noSuchClient = await postQuestion(
      api,
      aQuestion({ clientId: crypto.randomUUID() }),
      authorToken,
    );

    expect(notHeld.status).toBe(400);
    expect(noSuchClient.status).toBe(400);
    const [notHeldBody, noSuchClientBody] = [
      apiErrorSchema.parse(await notHeld.json()),
      apiErrorSchema.parse(await noSuchClient.json()),
    ];
    // The request id differs between two requests, so only the rest is compared.
    expect(notHeldBody.error.code).toBe("invalid_request");
    expect(notHeldBody.error.message).toBe("No such Client.");
    expect(notHeldBody.error.message).toBe(noSuchClientBody.error.message);
    expect(notHeldBody.error.details).toEqual(noSuchClientBody.error.details);
  });

  it("stores nothing when the Client is refused", async () => {
    const text = "Which Client-specific question should never have been stored at all?";
    const countBefore = await api.database.question.count({ where: { text } });

    await postQuestion(api, aQuestion({ text, clientId: secondClientId }), authorToken);

    expect(await api.database.question.count({ where: { text } })).toBe(countBefore);
  });

  it("refuses a Viewer holding no Grant at all", async () => {
    const token = await logInHoldingNoGrant(api, "author");

    const response = await postQuestion(api, aQuestion({ clientId: firstClientId }), token);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.message).toBe("No such Client.");
  });

  it("refuses a Client id that is not a uuid at the edge", async () => {
    const response = await postQuestion(api, aQuestion({ clientId: "northwind" }), authorToken);

    expect(response.status).toBe(400);
  });
});
