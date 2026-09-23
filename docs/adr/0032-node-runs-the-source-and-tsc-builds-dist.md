# Node runs the backend's source, and `tsc` still builds `dist/`

Until now the backend's TypeScript ran through `tsx`: `pnpm dev`, the seed commands, the query-plan
measurement, the Prisma seed and the compose `seed` service. Node 24 can run a `.ts` file itself. It
removes the types and runs what is left. So `tsx` was a dependency doing a job Node already does,
and it is gone. Every place that ran `tsx` now runs `node`, and `pnpm dev` is `node --watch`.

**The build does not change.** `tsc` still writes `dist/`, and the image still runs
`node dist/index.js` (ADR-0012). Node only removes types. It does not check them, so `tsc` is still
what catches a type error. And the image stays as it is: it holds JavaScript, and no TypeScript
source. Vitest stays too. It runs TypeScript on its own and has nothing to do with this.

Node's way of running TypeScript is stricter than `tsx`. It brings three rules.

**Relative imports end in `.ts`.** Node loads the file the import names. It does not turn `.js`
into `.ts` the way `tsc` and `tsx` do. So `import { x } from "./y.ts"` names the real file.
`rewriteRelativeImportExtensions` makes `tsc` write `.js` into `dist/`, so the built code still
imports files that exist there. The generated Prisma client follows the same rule, through
`importFileExtension = "ts"` in the schema.

**Only syntax Node can remove.** Node deletes the types and changes nothing else. So the backend
has no `enum`, no namespace that exists at run time, and no parameter properties
(`constructor(private x: X)`). Each of these makes JavaScript that is not in the source.
`erasableSyntaxOnly` makes `tsc` reject them. A namespace that holds only types is fine, like the
`declare global { namespace Express }` in `authenticated-viewer.ts`. Use a union of strings or a
zod enum in place of an `enum`.

**Types are imported as types.** Node removes an `import type` whole. An ordinary import of
something that is only a type would fail at run time. `verbatimModuleSyntax` already asked for this,
so nothing changes. It now matters for one more reason.

## Consequences

The backend and `shared` now write imports differently. `shared` still ends them in `.js`, because
Node never runs its source: the backend loads its built `dist/`. The frontend writes `@/` imports
with no extension (ADR-0030). So each package has one rule, and the three are not the same.

The `.d.ts` files in `dist/` still import `.ts`, because `tsc` does not rewrite imports in them.
Nothing loads those files at run time, and no other package reads the backend's types, so it is
left alone.

Node does not read `tsconfig.json`. A setting that changes how code runs, such as path aliases,
would work under `tsc` and fail under `node`. The backend uses none today. Adding one means adding
the same thing to Node as well, and that is a reason to avoid it.

Going back to `tsx` would be easy: it runs code written under these rules without any change. The
rules cost little to keep, so they stay even if the runner ever changes.
