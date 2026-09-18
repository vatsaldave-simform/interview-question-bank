# Plain Language

Write everything a person reads — comments, names, docs, ADRs, issue titles, branch names, commit
messages, PR descriptions — in words a new joiner understands on the first read.

## The rule

**Write it the way you would say it out loud to someone who does not know this codebase.**

Two halves, and both matter:

1. **Plain words.** If a reader has to look a word up, or hold a metaphor in their head to place it,
   pick the ordinary word instead.
2. **Plain sentences.** Short. Subject, verb, object. One idea per sentence. A sentence made only of
   ordinary words can still be unreadable if it is built cleverly, and that counts as a failure of
   this rule.

The `backend-structure.md` comment rules still apply on top of this: a comment says *why*, not
*what*; one sentence; delete it if removing it could not let anyone break anything. This rule is
about how that sentence is written, and does not loosen any of it.

## Prefer

Not a closed list. It is examples of the shape, and picking a synonym that is not on it does not
pass — `predicate` → `clause` is the same failure with a different spelling.

| Instead of | Write |
|---|---|
| seam | the one place / the only way in |
| scoped query builder | the function every Question query goes through |
| wiring, wired, wire up | setup, connects |
| plumbing | Express setup |
| gate (outer gate, inner gate) | check (first check, second check) |
| predicate | condition |
| disjunct | one OR branch |
| idempotent | safe to run twice |
| invariant | a rule that must always hold |
| drift, drift apart | get out of sync |
| canonical | standard |
| resolve (a token, an id) | look up |
| on the wire | in the API response |
| request-scoped | one per request |
| walking skeleton | the thinnest version that runs end to end |
| existence oracle | a way to find out something exists |

## What this does not touch

Three things stay as they are, deliberately.

**The glossary in `CONTEXT.md`.** Question, Viewer, Author, Reviewer, Provenance, Publication State,
Permission Grant, Near-Duplicate and the rest are the shared business language, each with an
`_Avoid_` list explaining what it is keeping out. They are chosen, not accidental. Use them exactly
as written, and do not simplify them here — change them in `CONTEXT.md` or not at all.

**The filename suffixes.** `.routes.ts`, `.middleware.ts`, `.repository.ts`, `.service.ts`,
`.schema.ts`, `.seed.ts` are a closed list, industry-standard, and already defined in plain words in
`backend-structure.md`. They stay.

**Another tool's own vocabulary.** PostgreSQL's `LEAKPROOF` and query predicates, Prisma's schema
*drift*, HTTP's *idempotent* methods — where the word is the tool's own term and you are writing
about that tool, use the tool's word. Swapping it breaks the reader's ability to search for it.

## Naming

Same rule for symbols. A name has to say what the thing is without a second name to compare it
against. `StoredQuestion` beside `Question` does not — `QuestionFromDb` does.

Rename when the name actively misleads or asks the reader to guess. Do not rename a name that is
already plain just to make it plainer; every rename costs an import churn, and a sweep of those
buries the renames that mattered.
