# Check visibility first, on writes as well as reads

The brief grants a Reviewer the right to "edit any entry" while limiting their reading to
"everything they're permitted to see". Those two clash for a Question restricted to a Client the
Reviewer holds no Permission Grant for. We read it as: **"any entry" means "any Visible entry"**.
Visibility is checked first on every path that names a Question, writes included.

Taken the other way, an edit endpoint would answer "restricted Question you cannot see" differently
from "no such Question". That difference tells the caller the Question exists, and it leaks through
the write path exactly what the read path was built to protect.

## Consequences

Every endpoint that takes a Question id looks it up through the same visibility check, and answers
a non-Visible id exactly as it answers an unknown one. The Author and Reviewer edit rules run
*after* that check, never instead of it.
