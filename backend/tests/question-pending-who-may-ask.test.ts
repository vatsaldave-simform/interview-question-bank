import { questionListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  idsListed,
  seedTheBank,
  seededQuestionIds,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** The seeded Questions these lists hand back, all written by the seeded Author. */
const {
  aboutDisagreeing: pendingAndUnrestricted,
  aboutTwoPlusTwo: rejectedAndUnrestricted,
  aboutTheClientsRendering: pendingForTheFirstClient,
  aboutTheOtherClientsIntake: pendingForTheSecondClient,
} = seededQuestionIds;

type List = "pending" | "own";

function getList(
  api: TestApi,
  list: List,
  params: Record<string, string | number>,
  token: string,
): Promise<Response> {
  const search = new URLSearchParams(
    Object.entries(params).map(([name, value]): [string, string] => [name, String(value)]),
  );
  return api.request(`/api/questions/${list}?${search.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/** What each list holds is tested against the query functions; what exists only here is
 * the role check and the response. */
describe("who may ask for the Pending queue and for an Author's own list", () => {
  let api: TestApi;
  let readerToken: string;
  let authorToken: string;
  let reviewerToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    readerToken = await logIn(api, seededViewer("reader"));
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
  });
  afterAll(async () => {
    await api.stop();
  });

  it("refuses the queue to a Reader", async () => {
    const response = await getList(api, "pending", {}, readerToken);

    expect(response.status).toBe(403);
  });

  it("refuses the queue to an Author", async () => {
    const response = await getList(api, "pending", {}, authorToken);

    expect(response.status).toBe(403);
  });

  it("hands a Reviewer the Pending Questions Visible to them", async () => {
    const response = await getList(api, "pending", {}, reviewerToken);

    expect(await idsListed(response)).toEqual([pendingAndUnrestricted, pendingForTheSecondClient]);
  });

  it("refuses an Author's own list to a Reader, who can have added nothing", async () => {
    const response = await getList(api, "own", {}, readerToken);

    expect(response.status).toBe(403);
  });

  it("hands an Author their own Pending and Rejected Questions", async () => {
    const response = await getList(api, "own", {}, authorToken);

    expect(await idsListed(response)).toEqual([
      pendingForTheFirstClient,
      rejectedAndUnrestricted,
      pendingAndUnrestricted,
    ]);
  });

  it("hands an Author their own Pending Question and not another Author's", async () => {
    const otherAuthorToken = await logInHoldingNoGrant(api, "author");
    const theirs = await addAQuestion(
      api,
      { text: "Which of your own past designs would you now argue against, and why?" },
      otherAuthorToken,
    );

    const forTheSeededAuthor = await getList(api, "own", {}, authorToken);
    const forTheOtherAuthor = await getList(api, "own", {}, otherAuthorToken);

    expect(await idsListed(forTheSeededAuthor)).not.toContain(theirs);
    expect(await idsListed(forTheOtherAuthor)).toEqual([theirs]);
  });

  it("hands a Reviewer an empty own list when they have added nothing", async () => {
    const response = await getList(api, "own", {}, reviewerToken);

    expect(await idsListed(response)).toEqual([]);
  });

  it("hands back the page asked for, and says which page it is", async () => {
    const response = await getList(api, "own", { limit: 1, offset: 1 }, authorToken);

    expect(response.status).toBe(200);
    const body = questionListResponseSchema.parse(await response.json());
    expect(body.questions.map((question) => question.id)).toEqual([rejectedAndUnrestricted]);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(1);
  });

  it("refuses a Tag on the queue, which it cannot be narrowed by", async () => {
    const response = await getList(api, "pending", { technology: "typescript" }, reviewerToken);

    expect(response.status).toBe(400);
  });

  it("refuses keywords on an Author's own list, which it cannot be searched by", async () => {
    const response = await getList(api, "own", { keywords: "disagreed" }, authorToken);

    expect(response.status).toBe(400);
  });
});
