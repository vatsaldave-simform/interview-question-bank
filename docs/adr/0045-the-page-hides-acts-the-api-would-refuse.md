# The page hides the acts the API would refuse

#40 put the Publish, Reject, Return and Resubmit buttons on the Question page by its
Publication State alone. Whether this Viewer may act was left to the API, which answers 403, as
Edit already did. The cost was named at the time: a Reader saw "Return to its Author" on every
Published Question, and an Author saw Publish on their own Pending one. They learned no only by
pressing it.

**The Question page now shows a button only when the API would let this Viewer do that act.** It
asks the same rules the API asks. Those rules moved from `backend/src/features/questions/` into
`shared/src/question-acts.ts`, so the backend and the frontend call the same functions.

## Why this does not undo ADR-0002

ADR-0002 is about the API: a Question you may not see is answered exactly like one that does not
exist. That is unchanged. The page only hides a button for a Question it was already sent, so it
shows nothing the Viewer could not already see.

**The API still decides.** Every act still goes through its checks, and a refusal is still shown in
its words. The page may be wrong for a moment, for example after an Administrator changes the
Viewer's role. Then the button shows or hides wrongly until the Viewer is fetched again, and the
API's answer is still the right one.

## What we did not do

**Write the rules again in the frontend.** Two copies of who may act would drift apart, which is
the failure ADR-0010 exists to prevent.

**Have the API send the acts this Viewer may do with each Question.** That keeps every rule on the
server, but it adds a field to every Question response for something the page can work out from
what it already has: the Viewer's role and id, and the Question's Author.

## Consequences

- A Reader sees no buttons on a Question. An Author sees them only on their own.
- The edit screen still reports the API's refusal to anyone who opens its address directly.
- The rule for removing a Client restriction (`may-classify.ts`) stays in the backend, and the edit
  screen still offers that to everyone who reaches it. It can move the same way when it is needed.
