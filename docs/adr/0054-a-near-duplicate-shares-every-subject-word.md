# A Near-Duplicate shares every subject word

Near-duplicate detection compared only the letters two Questions share (`pg_trgm`, cut-off 0.45,
ADR-0004). That works for long Questions. It fails for short ones, because words like "What is"
make up most of their letters. "What is CSR in React?" scored 0.70 against "What is React?" and
was refused, though it asks something else. Raising the cut-off does not help: counting shared
letters cannot tell a narrower question from a reworded one.

**A Near-Duplicate is now the same question in other words.** A Question that adds, drops or
changes a subject is a different Question (CONTEXT.md). **The check keeps the letter score as its
first step and adds a second: the two Questions must have exactly the same subject words.**

- Postgres splits each text into words, reduces each word to its root and drops common English
  filler, with the `english` setting keyword search already uses. A short list of our own also
  drops the words people use to *ask* a question, such as "explain", "describe" and "difference".
- If either Question has a subject word the other lacks, they are different Questions, whatever
  the letter score.
- A Question with no subject words left, such as "What is it?", is never a Near-Duplicate. There is
  nothing to compare.
- The letters still pick the candidates, since the GiST index can answer that. The closest 20 are
  taken, both checks are run on them, and at most 3 are named. Taking only 3 would let the word
  check throw them all out and hide a real match in 4th place.

## Considered options

- **A higher cut-off.** No single number separates "CSR in React" from a rewording, and a higher
  one would miss real duplicates among long Questions too.
- **Embeddings.** They compare meaning, but they score a narrower question as close to the
  broader one, since both share a topic. That is the very case that failed. They also need an
  outside service and a key, which ADR-0009 keeps out.
- **A language model judging the closest few.** It fits the definition best. But every write would
  wait on an outside API, which needs a plan for when it is down. And the text of Client-restricted
  Questions would leave the system, a new kind of exposure that ADR-0007 exists to prevent.

## Consequences

The check now misses more, on purpose. When unsure, a miss is the cheaper mistake: a Reviewer
can still catch it in the queue, while a wrong refusal makes the Author override it on the
record. Some real Near-Duplicates now get through:

- **A Question that names its setting.** "What is a closure in JavaScript?" is a Near-Duplicate of
  "What is a closure?" by the definition. But the check sees "javascript" as a new subject word.
- **A swapped word or an added clause.** "migrate" in place of "move", or "…and when would you use
  each?" added on the end, brings in a word the other Question lacks.

The rule is strict at every length. Letting long Questions carry an extra word or two would need a
"how different is too different" number, which ADR-0014 already refused to defend for edits.
