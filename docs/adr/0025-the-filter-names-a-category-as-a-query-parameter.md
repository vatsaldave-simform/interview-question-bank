# The filter names a Category as a query parameter

Filtering the bank means naming Tag values under several Categories at once. There are two ways to
write that in a URL. They differ in what the API can refuse before any of its own code runs.

**Categories as parameters** is what we ship:

```
GET /api/questions?technology=typescript&technology=react&seniority=senior&limit=50&offset=0
```

Repeats within one parameter are the OR, separate parameters are the AND. The URL says what the
rule is, so nobody has to read the handler to find out how two Tags combine.

The reason it is worth having is ADR-0024. The Category names are a closed list in `@iqb/shared`,
so the request schema is a strict object over exactly those keys plus `limit` and `offset`. A
request naming `?vibes=good` is refused by that schema, in the process, before anything asks the
database a question. An unknown Tag **value** is still refused inside the handler, because only
the database knows which values exist — the same split the add-Question endpoint already has.

**The alternative** puts the Category inside the value:

```
GET /api/questions?tag=technology:typescript&tag=technology:react
```

It has one real advantage. A Category never becomes a parameter name, so no Category can collide
with `limit` or `offset`.

We are not taking it. The collision it avoids would have to be introduced by a release, the list
of Categories has three names in it, and one test asserts that none of them is `limit` or
`offset`. The cost is larger. `technology:typescript` arrives as one string, so the schema can
only check that it looks like a pair. Whether `technology` is a Category becomes a lookup inside
the handler, which is the thing ADR-0024 was written to avoid.

`limit` defaults to 50 and is capped at 100. A request above the cap is **refused**, not quietly
shrunk. A caller who asks for 500 and is handed 100 has no way to tell. That bug surfaces much
later, in someone else's pagination.

## Consequences

- Adding a Category adds a query parameter. If it were ever named `limit`, `offset` or `keywords`
  it would eat that parameter silently, so the test naming the reserved words has to keep up with
  the list.
- The response carries the `limit` and `offset` it used. A caller that named neither cannot
  otherwise know which page it got, since the default lives on the server.
- No total count. It is a second query over the same condition, ADR-0011 measured only the page
  query, and nothing needs one yet. Worth adding — and measuring — when a client renders "of 400".
- Pagination stays `limit` and `offset`. ADR-0011 records the 12x cost of a deep `OFFSET` and that
  keyset paging would remove it by changing this shape; at this bank size it is not worth paying.
