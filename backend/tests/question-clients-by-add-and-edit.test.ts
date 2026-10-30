import {
  apiErrorSchema,
  questionResponseSchema,
  type ChangeEvent,
  type Question,
} from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { insertClient } from "../src/features/clients/clients.repository.ts";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  aQuestion,
  clientIdNamed,
  getQuestion,
  historyOf,
  patchQuestion,
  postQuestion,
  resetTheQuestions,
  seedTheBank,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/**
 * A Question's Clients are named when it is added and changed by an edit, which sends the
 * whole list. Each Client added or removed is one event in the history (ADR-0050).
 */
describe("naming a Question's Clients when adding or editing it", () => {
  let api: TestApi;
  let authorToken: string;
  let reviewerToken: string;
  let readerToken: string;
  let northwind: string;
  let kingsbridge: string;
  /** A third Client, so an edit can add one and remove another at once. */
  let contoso: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    readerToken = await logIn(api, seededViewer("reader"));
    northwind = await clientIdNamed(api.database, seedClient.name);
    kingsbridge = await clientIdNamed(api.database, seedOtherClient.name);
    contoso = (await insertClient(api.database, "Contoso Pharmaceuticals")).id;
  });
  // Every test here writes, so each one starts from the seeded bank again.
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  async function added(clientIds?: string[]): Promise<Question> {
    const body = aQuestion(clientIds === undefined ? {} : { clientIds });
    const response = await postQuestion(api, body, authorToken);
    if (response.status !== 201) throw new Error(`Answered ${await statusAndBody(response)}.`);
    return questionResponseSchema.parse(await response.json()).question;
  }

  async function edited(id: string, body: unknown, token = authorToken): Promise<Question> {
    const response = await patchQuestion(api, id, body, token);
    if (response.status !== 200) throw new Error(`Answered ${await statusAndBody(response)}.`);
    return questionResponseSchema.parse(await response.json()).question;
  }

  async function clientIdsOf(id: string): Promise<string[]> {
    const response = await getQuestion(api, id, authorToken);
    const { question } = questionResponseSchema.parse(await response.json());
    return question.clients.map((client) => client.id).sort();
  }

  /** The Client events only, as the Clients each one names, sorted so order within one
   * write does not matter. */
  async function clientEventsOf(id: string) {
    const events = await historyOf(api, id, authorToken);
    const naming = (type: ChangeEvent["type"]) =>
      events
        .flatMap((event) =>
          event.type === type && "clientId" in event.payload ? [event.payload.clientId] : [],
        )
        .sort();
    return { added: naming("question_client_added"), removed: naming("question_client_removed") };
  }

  const sorted = (...ids: string[]) => [...ids].sort();

  describe("on add", () => {
    it("stores every Client named, with one event per Client", async () => {
      const question = await added([northwind, kingsbridge]);

      expect(question.clients.map(({ id }) => id).sort()).toEqual(sorted(northwind, kingsbridge));
      expect(await clientIdsOf(question.id)).toEqual(sorted(northwind, kingsbridge));
      const events = await historyOf(api, question.id, authorToken);
      // Sorted, because events from one write can share a millisecond and then sort by id.
      expect(events.map(({ type }) => type).sort()).toEqual([
        "question_added",
        "question_client_added",
        "question_client_added",
      ]);
      expect(await clientEventsOf(question.id)).toEqual({
        added: sorted(northwind, kingsbridge),
        removed: [],
      });
    });

    it("names no Client and writes no Client event when none is named", async () => {
      const question = await added();

      expect(question.clients).toEqual([]);
      const events = await historyOf(api, question.id, authorToken);
      expect(events.map(({ type }) => type)).toEqual(["question_added"]);
    });

    it("counts a Client named twice once", async () => {
      const question = await added([northwind, northwind]);

      expect(question.clients.map(({ id }) => id)).toEqual([northwind]);
      expect(await clientEventsOf(question.id)).toEqual({ added: [northwind], removed: [] });
    });

    it("refuses a Client that does not exist, and stores nothing", async () => {
      const text = "Which question should never have been stored at all?";

      const response = await postQuestion(
        api,
        aQuestion({ text, clientIds: [northwind, crypto.randomUUID()] }),
        authorToken,
      );

      expect(response.status).toBe(400);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("invalid_request");
      expect(body.error.message).toBe("No such Client.");
      expect(await api.database.question.count({ where: { text } })).toBe(0);
    });

    it("refuses a Client id that is not a uuid at the edge", async () => {
      const response = await postQuestion(
        api,
        aQuestion({ clientIds: ["northwind"] }),
        authorToken,
      );

      expect(response.status).toBe(400);
    });

    it("no longer writes the old Client column", async () => {
      const question = await added([northwind]);

      const stored = await api.database.question.findUniqueOrThrow({
        where: { id: question.id },
        select: { clientId: true },
      });
      expect(stored.clientId).toBeNull();
    });
  });

  describe("on edit", () => {
    it("adds and removes exactly the difference, one event per Client changed", async () => {
      const question = await added([northwind, kingsbridge]);

      const changed = await edited(question.id, { clientIds: [kingsbridge, contoso] });

      expect(changed.clients.map(({ id }) => id).sort()).toEqual(sorted(kingsbridge, contoso));
      expect(await clientEventsOf(question.id)).toEqual({
        added: sorted(northwind, kingsbridge, contoso),
        removed: [northwind],
      });
    });

    it("writes nothing and records nothing when the list is the same", async () => {
      const question = await added([northwind, kingsbridge]);
      const before = await historyOf(api, question.id, authorToken);

      const unchanged = await edited(question.id, { clientIds: [kingsbridge, northwind] });

      expect(unchanged.clients.map(({ id }) => id).sort()).toEqual(sorted(northwind, kingsbridge));
      expect(await historyOf(api, question.id, authorToken)).toEqual(before);
    });

    it("leaves the Clients alone when the edit does not name them", async () => {
      const question = await added([northwind]);
      const text = "How would you introduce a cache, and who owns its staleness?";

      const changed = await edited(question.id, { text });

      expect(changed.text).toBe(text);
      expect(await clientIdsOf(question.id)).toEqual([northwind]);
      const events = await historyOf(api, question.id, authorToken);
      expect(events.map(({ type }) => type).sort()).toEqual([
        "question_added",
        "question_client_added",
        "question_edited",
      ]);
    });

    it("removes every Client when the list is empty", async () => {
      const question = await added([northwind, kingsbridge]);

      const changed = await edited(question.id, { clientIds: [] });

      expect(changed.clients).toEqual([]);
      expect((await clientEventsOf(question.id)).removed).toEqual(sorted(northwind, kingsbridge));
    });

    it("changes the text and the Clients in one edit", async () => {
      const question = await added([northwind]);
      const text = "How would you add a cache without hiding its staleness?";

      const changed = await edited(question.id, { text, clientIds: [kingsbridge] });

      expect(changed.text).toBe(text);
      expect(changed.clients.map(({ id }) => id)).toEqual([kingsbridge]);
      const events = await historyOf(api, question.id, authorToken);
      expect(events.filter(({ type }) => type === "question_edited")).toHaveLength(1);
      expect(await clientEventsOf(question.id)).toEqual({
        added: sorted(northwind, kingsbridge),
        removed: [northwind],
      });
    });

    it("counts a Client named twice once", async () => {
      const question = await added([]);

      const changed = await edited(question.id, { clientIds: [contoso, contoso] });

      expect(changed.clients.map(({ id }) => id)).toEqual([contoso]);
      expect(await clientEventsOf(question.id)).toEqual({ added: [contoso], removed: [] });
    });

    it("refuses a Client that does not exist, and changes nothing", async () => {
      const question = await added([northwind]);
      const before = await historyOf(api, question.id, authorToken);

      const response = await patchQuestion(
        api,
        question.id,
        { text: "This text must not be stored.", clientIds: [kingsbridge, crypto.randomUUID()] },
        authorToken,
      );

      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(await response.json()).error.message).toBe("No such Client.");
      const fetched = await getQuestion(api, question.id, authorToken);
      const { question: after } = questionResponseSchema.parse(await fetched.json());
      expect(after.text).toBe(question.text);
      expect(after.clients.map(({ id }) => id)).toEqual([northwind]);
      expect(await historyOf(api, question.id, authorToken)).toEqual(before);
    });

    it("lets a Reviewer change the Clients of a Question they did not write", async () => {
      const question = await added([northwind]);

      const changed = await edited(question.id, { clientIds: [kingsbridge] }, reviewerToken);

      expect(changed.clients.map(({ id }) => id)).toEqual([kingsbridge]);
    });

    it("refuses a Reader, as for any other edit, and changes nothing", async () => {
      const question = await added([northwind]);
      // Published, so the Reader can see it and the refusal is by role, not a 404.
      await api.database.question.update({
        where: { id: question.id },
        data: { publicationState: "published" },
      });

      const response = await patchQuestion(
        api,
        question.id,
        { clientIds: [kingsbridge] },
        readerToken,
      );

      expect(response.status).toBe(403);
      expect(await clientIdsOf(question.id)).toEqual([northwind]);
    });

    it("refuses another Author, as for any other edit, and changes nothing", async () => {
      const question = await added([northwind]);
      await api.database.question.update({
        where: { id: question.id },
        data: { publicationState: "published" },
      });
      const otherAuthorToken = await logInHoldingNoGrant(api, "author");

      const response = await patchQuestion(
        api,
        question.id,
        { clientIds: [kingsbridge] },
        otherAuthorToken,
      );

      expect(response.status).toBe(403);
      expect(await clientIdsOf(question.id)).toEqual([northwind]);
      expect(await clientEventsOf(question.id)).toEqual({ added: [northwind], removed: [] });
    });
  });
});
