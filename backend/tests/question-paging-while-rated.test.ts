import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveRating } from "../src/features/ratings/ratings.repository.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  aViewer,
  getQuestions,
  idsListed,
  inMuchOfTheBulkBank,
  seedTheBulkBank,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const bulk = { count: 300, seed: "a-test-of-paging-while-rated" };
const pageSize = 25;

/** Over HTTP, because the Ratings are added to the response there and a Rating that reached
 * the order would show up there first (ADR-0043). */
describe("paging through the bank while Ratings are written", () => {
  let api: TestApi;
  let readerToken: string;
  let raters: Viewer[];

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBulkBank(api.database, bulk);
    readerToken = await logIn(api, seededViewer("reader"));
    raters = [await aViewer(api.database, "reader"), await aViewer(api.database, "author")];
  });
  afterAll(async () => {
    await api.stop();
  });

  /** The lowest Rating for the first page and the highest for Questions well past the second,
   * so an order by the average or by the count would each pull a different set onto page two. */
  async function rateBetweenPages(firstPage: string[], farLater: string[]): Promise<void> {
    for (const rater of raters) {
      for (const id of firstPage) await saveRating(api.database, rater, id, 1);
      for (const id of farLater) await saveRating(api.database, rater, id, 5);
    }
  }

  async function pagesWithRatingsBetween(params: Record<string, string>): Promise<void> {
    const page = (offset: number) =>
      getQuestions(api, { ...params, limit: pageSize, offset }, readerToken);
    const expected = await idsListed(
      await getQuestions(api, { ...params, limit: pageSize * 4, offset: 0 }, readerToken),
    );
    expect(expected).toHaveLength(pageSize * 4);

    const first = await idsListed(await page(0));
    await rateBetweenPages(first, expected.slice(pageSize * 3));
    const second = await idsListed(await page(pageSize));

    const walked = [...first, ...second];
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked).toEqual(expected.slice(0, pageSize * 2));
  }

  it("drops no Question and repeats none across two pages of the list", async () => {
    await pagesWithRatingsBetween({});
  });

  it("drops no Question and repeats none across two pages of a keyword search", async () => {
    await pagesWithRatingsBetween({ keywords: inMuchOfTheBulkBank });
  });
});
