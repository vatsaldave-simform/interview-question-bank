import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logInHoldingGrantsFor } from "./helpers/auth.ts";
import {
  addAQuestion,
  clientIdNamed,
  postReviewAct,
  questionAnswered,
  resetTheQuestions,
  seedTheBank,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/**
 * Until reads move to the join table, the old column is what the app uses, so every
 * write that changes it has to change the table too (ADR-0050). Each Question here is
 * added over HTTP, never seeded, so its table row can only have come from the write itself.
 */
describe("the join table following the old Client column", () => {
  let api: TestApi;
  let firstClientId: string;
  let secondClientId: string;
  /** Hold both Grants, so no act is refused for want of one. */
  let authorToken: string;
  let reviewerToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    firstClientId = await clientIdNamed(api.database, seedClient.name);
    secondClientId = await clientIdNamed(api.database, seedOtherClient.name);
    authorToken = await logInHoldingGrantsFor(api, "author", [firstClientId, secondClientId]);
    reviewerToken = await logInHoldingGrantsFor(api, "reviewer", [firstClientId, secondClientId]);
  });
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  const restrict = (id: string, clientId: string, token: string) =>
    api.request(`/api/questions/${id}/restrict`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientId }),
    });

  const removeRestriction = (id: string, token: string) =>
    api.request(`/api/questions/${id}/remove-restriction`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

  /** The Clients a Question names, read from both places, so a test can say they agree. */
  const clientsOf = async (id: string) => {
    const { clientId } = await api.database.question.findUniqueOrThrow({
      where: { id },
      select: { clientId: true },
    });
    const rows = await api.database.questionClient.findMany({
      where: { questionId: id },
      select: { clientId: true },
    });
    return { inTheColumn: clientId, inTheTable: rows.map((row) => row.clientId) };
  };

  it("holds a row for a Question added with a Client", async () => {
    const id = await addAQuestion(
      api,
      { text: "How do you know a retry will not make things worse?", clientId: firstClientId },
      authorToken,
    );

    expect(await clientsOf(id)).toEqual({ inTheColumn: firstClientId, inTheTable: [firstClientId] });
  });

  it("holds no row for a Question added with no Client", async () => {
    const id = await addAQuestion(
      api,
      { text: "What makes a code review comment easy to act on?" },
      authorToken,
    );

    expect(await clientsOf(id)).toEqual({ inTheColumn: null, inTheTable: [] });
  });

  it("gains a row when a Question is restricted", async () => {
    const id = await addAQuestion(
      api,
      { text: "When would you choose a queue over a direct call?" },
      authorToken,
    );

    await questionAnswered(await restrict(id, firstClientId, authorToken));

    expect(await clientsOf(id)).toEqual({ inTheColumn: firstClientId, inTheTable: [firstClientId] });
  });

  it("swaps its row when a Question moves to another Client", async () => {
    const id = await addAQuestion(
      api,
      { text: "How would you shrink a slow test suite?", clientId: firstClientId },
      authorToken,
    );

    await questionAnswered(await restrict(id, secondClientId, authorToken));

    // The old row goes as well: a move is not a second Client.
    expect(await clientsOf(id)).toEqual({
      inTheColumn: secondClientId,
      inTheTable: [secondClientId],
    });
  });

  it("loses its row when the restriction is removed", async () => {
    const id = await addAQuestion(
      api,
      { text: "How do you hand over a service you built?", clientId: firstClientId },
      authorToken,
    );

    await questionAnswered(await removeRestriction(id, reviewerToken));

    expect(await clientsOf(id)).toEqual({ inTheColumn: null, inTheTable: [] });
  });

  it("is left alone by a move that is refused", async () => {
    const id = await addAQuestion(
      api,
      { text: "What would you log on a failed payment?", clientId: firstClientId },
      authorToken,
    );
    await questionAnswered(await postReviewAct(api, id, "publish", reviewerToken));

    // An Author may not move their own Published Question (ADR-0018).
    expect((await restrict(id, secondClientId, authorToken)).status).toBe(403);

    expect(await clientsOf(id)).toEqual({ inTheColumn: firstClientId, inTheTable: [firstClientId] });
  });

  it("is left alone by restricting a Question to the Client it already has", async () => {
    const id = await addAQuestion(
      api,
      { text: "How do you test code that reads the clock?", clientId: firstClientId },
      authorToken,
    );

    await questionAnswered(await restrict(id, firstClientId, authorToken));

    expect(await clientsOf(id)).toEqual({ inTheColumn: firstClientId, inTheTable: [firstClientId] });
  });
});
