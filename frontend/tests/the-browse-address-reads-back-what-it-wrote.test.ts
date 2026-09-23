import { maxKeywordsLength } from "@iqb/shared";
import { describe, expect, it } from "vitest";
import { browseSearchSchema } from "@/features/questions/browse.schema";
import { parseSearch, stringifySearch } from "@/platform/search-params";

function filtersIn(address: string) {
  return browseSearchSchema.parse(parseSearch(address));
}

describe("the browse address", () => {
  it("reads a Category named twice as two Tags, the way the API does", () => {
    expect(
      filtersIn("?technology=react&technology=node&seniority=senior&keywords=cache&offset=20"),
    ).toEqual({
      technology: ["react", "node"],
      seniority: ["senior"],
      keywords: "cache",
      offset: 20,
    });
  });

  it("writes the filters in the shape the API reads, not as JSON", () => {
    const written = stringifySearch({
      technology: ["react", "node"],
      "question-type": ["system-design"],
      keywords: "cache miss",
      offset: 40,
    });

    expect(written).toBe(
      "?technology=react&technology=node&question-type=system-design&keywords=cache+miss&offset=40",
    );
  });

  it("reads back the same filters it wrote", () => {
    const filters = {
      technology: ["react"],
      seniority: ["junior", "mid"],
      keywords: "what & why?",
      offset: 60,
    };

    expect(filtersIn(stringifySearch(filters))).toEqual(filters);
  });

  it("writes nothing at all when nothing is filtered", () => {
    expect(stringifySearch({ technology: [], keywords: undefined })).toBe("");
    expect(filtersIn("")).toEqual({});
  });

  it("drops what is not a filter, which can never widen the results", () => {
    expect(filtersIn("?vibes=good&offset=soon&technology=react")).toEqual({
      technology: ["react"],
    });
    expect(filtersIn("?offset=-50")).toEqual({});
  });

  it("drops a blank search or a blank Tag, which is a box nobody filled in", () => {
    expect(filtersIn("?keywords=%20%20&technology=&seniority=senior")).toEqual({
      seniority: ["senior"],
    });
  });

  // Dropping either would quietly show the whole bank. Kept, the API refuses them and
  // the screen can say so.
  it("keeps an unknown Tag and an over-long search for the API to refuse", () => {
    const tooLong = "a".repeat(maxKeywordsLength + 1);

    expect(filtersIn(`?technology=cobol&keywords=${tooLong}`)).toEqual({
      technology: ["cobol"],
      keywords: tooLong,
    });
  });
});
