import { questionListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { seedTheBank } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** The seeded Questions these lists hand back. All of them have the seeded Author. */
const pendingAndUnrestricted = "a0000000-0000-4000-8000-000000000003";
const rejectedAndUnrestricted = "a0000000-0000-4000-8000-000000000004";
const pendingForTheFirstClient = "a0000000-0000-4000-8000-000000000005";
const pendingForTheSecondClient = "a0000000-0000-4000-8000-000000000007";

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

async function idsListed(response: Response): Promise<string[]> {
  expect(response.status).toBe(200);
  const body = questionListResponseSchema.parse(await response.json());
  return body.questions.map((question) => question.id);
}

/**
 * Who may ask for each list over HTTP. What each list holds is tested against the query
 * functions themselves; what exists only here is the role check and the response.
 */
describe("the Pending queue and an Author's own list over HTTP", () => {
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

  it("refuses the own list to a Reader, who can have added nothing", async () => {
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

  it("hands a Reviewer their own list too, empty when they have added nothing", async () => {
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

  it("refuses a Tag, which neither list can narrow by", async () => {
    for (const list of ["pending", "own"] as const) {
      const token = list === "pending" ? reviewerToken : authorToken;

      const response = await getList(api, list, { technology: "typescript" }, token);

      expect(response.status).toBe(400);
    }
  });
});
