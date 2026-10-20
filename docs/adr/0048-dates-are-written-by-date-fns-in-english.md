# Dates are written by date-fns, in English

Five screens showed a date, and each built its own `Intl.DateTimeFormat`. They passed no
language, so each date followed the browser's language. #160 asks for one place that writes
dates, and Home will soon need "Added 2 days ago" (#162).

**`date-fns` writes every date, and `src/platform/when-wording.ts` is the only file that calls
it.** It has three helpers: a date ("Sep 1, 2026"), a date with its time ("Sep 1, 2026,
2:30 PM"), and how long ago ("2 days ago"). The words are always English. The time zone is
still the device's own.

## Why date-fns

"How long ago" is the hard one. The browser can say "2 days ago", but only after we pick the
unit ourselves, and picking it is where the mistakes are. date-fns already picks it. It is
plain functions, so the build keeps only the few we call. We do not ship any other language's
words.

date-fns jumps from days straight to months, so the helper counts weeks itself from seven
days to thirty. Under a minute is "just now".

## Why English only

Every other word on the screen is English. A date in the browser's language does not fit in
an English sentence, as in "You asked for the Author role on 1 sept. 2026". Tests could only
check the `datetime` attribute, because the words changed from machine to machine. Now a test
can check the words too.

## What we did not do

**Keep `Intl` and add `Intl.RelativeTimeFormat` for "ago".** It would mean writing the choice
of unit ourselves, and a sixth formatter beside the five.

**Day.js or Luxon.** Day.js needs a plugin for "ago", and Luxon is much larger. date-fns gives
"ago" with nothing added.

**Follow the browser's language.** That would need every other word translated too. The bank
has no plan for that. When it does, `when-wording.ts` is the one file to change.

## Consequences

- A screen that shows a date calls `when-wording.ts`. No other file formats a date.
- A browser set to US English shows the same words as before. A browser set to another
  language now shows them in US English too.
- `when-wording.ts` is in `platform/`, because more than one feature shows a date.
