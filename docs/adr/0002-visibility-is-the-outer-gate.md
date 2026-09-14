# Visibility is the outer gate, on writes as well as reads

The brief grants a Reviewer the right to "edit any entry" while limiting their reading to
"everything they're permitted to see" — a contradiction for a Question restricted to a Client
the Reviewer holds no Permission Grant for. We read it as: **"any entry" means "any Visible
entry"**. Visibility is evaluated first on every path that names a Question, writes included.

Taken the other way, an edit endpoint returning a different response for "restricted Question
you cannot see" than for "no such Question" would be an existence oracle, leaking through the
write path exactly what the read path was built to protect.

## Consequences

Every endpoint accepting a Question id resolves it through the same visibility-scoped lookup,
and answers a non-Visible id identically to an unknown id. The Author/Reviewer edit rules are
applied *inside* that gate, never instead of it.
