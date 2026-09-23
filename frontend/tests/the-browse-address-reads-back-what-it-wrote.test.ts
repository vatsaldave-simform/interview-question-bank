import { maxKeywordsLength } from "@iqb/shared";
import { describe, expect, it } from "vitest";
import {
  browsePageSize,
  browseSearchSchema,
  listRequestFor,
} from "@/features/questions/browse.schema";
import { parseSearch, stringifySearch } from "@/platform/search-params";

function requestFor(address: string) {
  return listRequestFor(browseSearchSchema.parse(parseSearch(address)));
}

describe("the browse address", () => {
  it("reads a Category named twice as two Tags, the way the API does", () => {
    expect(
      requestFor("?technology=react&technology=node&seniority=senior&keywords=cache&offset=20"),
    ).toEqual({
      request: {
        technology: ["react", "node"],
        seniority: ["senior"],
        keywords: "cache",
        limit: browsePageSize,
        offset: 20,
      },
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

  it("reads back the same filter it wrote", () => {
    const search = { technology: ["react"], seniority: ["junior", "mid"], keywords: "what & why?" };

    expect(requestFor(stringifySearch(search))).toEqual({
      request: { ...search, limit: browsePageSize, offset: 0 },
    });
  });

  it("writes nothing at all when nothing is filtered", () => {
    expect(stringifySearch({ technology: [], keywords: undefined })).toBe("");
    expect(requestFor("")).toEqual({ request: { limit: browsePageSize, offset: 0 } });
  });

  it("treats a blank search as no search, as the API does", () => {
    expect(requestFor("?keywords=%20%20")).toEqual({
      request: { limit: browsePageSize, offset: 0 },
    });
  });

  it("keeps an unknown Tag for the API to refuse, since only the database knows the Tags", () => {
    expect(requestFor("?technology=cobol")).toEqual({
      request: { technology: ["cobol"], limit: browsePageSize, offset: 0 },
    });
  });
});

// Dropping any of these would quietly show more of the bank than the address asked for.
describe("a browse address the API would refuse", () => {
  it("is refused when it names a Category that does not exist", () => {
    expect(requestFor("?technolgy=react")).toEqual({
      problem: "The address names technolgy, which is not a filter.",
    });
  });

  it("is refused when it names the search twice", () => {
    expect(requestFor("?keywords=cache&keywords=miss")).toEqual({
      problem: "The address gives keywords a value the bank cannot use.",
    });
  });

  it("is refused when its page is not a page", () => {
    for (const offset of ["soon", "-20", "1.5"]) {
      expect(requestFor(`?offset=${offset}`)).toEqual({
        problem: "The address gives offset a value the bank cannot use.",
      });
    }
  });

  it("is refused when its search is longer than the API accepts", () => {
    expect(requestFor(`?keywords=${"a".repeat(maxKeywordsLength + 1)}`)).toEqual({
      problem: "The address gives keywords a value the bank cannot use.",
    });
  });

  it("is read without throwing, whatever it holds", () => {
    expect(() =>
      browseSearchSchema.parse(parseSearch("?offset=1&offset=2&keywords=a&keywords=b&x=")),
    ).not.toThrow();
  });
});
