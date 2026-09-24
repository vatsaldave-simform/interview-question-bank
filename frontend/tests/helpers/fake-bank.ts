import type { Question, Viewer } from "@iqb/shared";
import { browsePageSize } from "@/features/questions/browse.schema";
import { replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi, theCategories, type FakeApi } from "./fake-api";

/** How a test answers the question list; `aPageOf` builds the usual answer. */
type AnswerTheList = (asked: URL) => Response | Promise<Response>;

export function aPageOf(questions: Question[], asked: URL): Response {
  return answersWith({
    questions,
    limit: Number(asked.searchParams.get("limit") ?? browsePageSize),
    offset: Number(asked.searchParams.get("offset") ?? 0),
  });
}

/** How a test answers any other path. `undefined` leaves it to the usual answer. */
type AnswerTheRest = (
  request: Request,
  asked: URL,
) => Response | undefined | Promise<Response | undefined>;

/**
 * A fake API for a signed-in test: the list answers as the test says, and every other
 * path answers the way the bank would, so a test names only the part it is about.
 */
export function fakeBank(
  answerTheList: AnswerTheList,
  answerTheRest: AnswerTheRest = () => undefined,
): FakeApi {
  return fakeApi(async (request) => {
    const asked = new URL(request.url);
    const answered = await answerTheRest(request, asked);
    if (answered !== undefined) return answered;
    if (asked.pathname === "/api/questions") return answerTheList(asked);
    if (asked.pathname === "/api/categories") return answersWith(theCategories);
    if (asked.pathname === "/api/auth/logout") return new Response(null, { status: 204 });
    return answersWith(aSignedInAuthor);
  });
}

/** The list requests the client sent, in order, as URLs a test can read. */
export function listRequests(api: FakeApi): URL[] {
  return api.sent
    .map((request) => new URL(request.url))
    .filter((asked) => asked.pathname === "/api/questions");
}

export function signInAs(viewer: Viewer = aSignedInAuthor.viewer): void {
  replaceSession({ status: "signed-in", accessToken: aSignedInAuthor.accessToken, viewer });
}
