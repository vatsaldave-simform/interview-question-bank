import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveUpvote } from "../src/features/upvotes/upvotes.repository.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  aViewer,
  getQuestions,
  idsListed,
  inMuchOfTheBulkBank,
  seedTheBulkBank,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const bulk = { count: 300, seed: "a-test-of-paging-while-upvoted" };
const pageSize = 25;

/** Over HTTP, because the Upvotes are added to the response there and an Upvote that reached
 * the order would show up there first (ADR-0043, ADR-0053). */
describe("paging through the bank while Upvotes are given", () => {
  let api: TestApi;
  let readerToken: string;
  let upvoters: Viewer[];

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBulkBank(api.database, bulk);
    readerToken = await logIn(api, seededViewer("reader"));
    upvoters = [await aViewer(api.database, "reader"), await aViewer(api.database, "author")];
  });
  afterAll(async () => {
    await api.stop();
  });

  /** Upvotes only for Questions well past the second page, so an order by the count would
   * pull them onto page two. */
  async function upvoteBetweenPages(farLater: string[]): Promise<void> {
    for (const upvoter of upvoters) {
      for (const id of farLater) await saveUpvote(api.database, upvoter, id);
    }
  }

  async function pagesWithUpvotesBetween(params: Record<string, string>): Promise<void> {
    const page = (offset: number) =>
      getQuestions(api, { ...params, limit: pageSize, offset }, readerToken);
    const expected = await idsListed(
      await getQuestions(api, { ...params, limit: pageSize * 4, offset: 0 }, readerToken),
    );
    expect(expected).toHaveLength(pageSize * 4);

    const first = await idsListed(await page(0));
    await upvoteBetweenPages(expected.slice(pageSize * 3));
    const second = await idsListed(await page(pageSize));

    const walked = [...first, ...second];
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked).toEqual(expected.slice(0, pageSize * 2));
  }

  it("drops no Question and repeats none across two pages of the list", async () => {
    await pagesWithUpvotesBetween({});
  });

  it("drops no Question and repeats none across two pages of a keyword search", async () => {
    await pagesWithUpvotesBetween({ keywords: inMuchOfTheBulkBank });
  });
});
