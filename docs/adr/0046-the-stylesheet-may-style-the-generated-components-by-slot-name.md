# The stylesheet may style the generated components by their slot name

This amends ADR-0030. ADR-0030 left `src/index.css` holding the Tailwind imports and the theme
variables, and nothing else. Every other style was a Tailwind class in the component.

#143 puts every signed-in screen on a gradient backdrop, and turns cards, dialogs, menus and
toasts into frosted glass over it (#146). A see-through colour can be a theme variable. A blur
cannot: it is a `backdrop-filter`, and no theme variable sets one. So each panel needs a style
that the theme alone cannot give it.

**`src/index.css` may now hold base rules keyed on the `data-slot` name each generated component
already carries,** such as `[data-slot="card"]`. The backdrop, the blur, the hover lift, the page
fade, and the fallbacks for reduced transparency and reduced motion all sit there, side by side.

## Why here

Every generated component already marks itself with a `data-slot` attribute. A rule keyed on it
reaches every card in the app at once. No generated file is edited, and no screen has to add
anything.

The fallbacks are the reason it has to be one place. A Viewer whose device asks for reduced
transparency must get solid panels everywhere, and one asking for reduced motion must get no
motion anywhere. Written once beside the glass, those two cannot miss a panel.

## What we did not do

**Edit the generated components.** `ui/shadcn/` is never edited (ADR-0030), so that a fresh
`shadcn add` can replace any file in it without losing work. A blur added there would be lost the
next time the file is regenerated.

**Wrap each one in a hand-written component.** A `GlassCard` beside `Card` would work until the
first screen used the plain `Card`. Then that panel would be solid, and nothing would say so.

**Add a class on every screen.** That is the same problem spread wider: each new screen has to
remember it.

## Consequences

- Rules are keyed on slot names, never on the generated components' own class names. Those
  change whenever the generator does.
- A Tailwind class in a component still wins over these base rules, because Tailwind puts its
  classes in a later layer. A screen can still set its own look where it must.
- Colours stay theme variables. A base rule may use only theme variables, as a component does.
- Toasts come from Sonner, not shadcn, and carry no slot name. The same rule keys on Sonner's own
  `data-sonner-toast` attribute. Sonner's own stylesheet still wins on the toast's border, so the
  toaster sets that border colour itself.
- Three more rules key on something other than a slot name, because no slot name reaches what they
  style. The backdrop sits on `body`. The page fade keys on each page inside `<main>`. The
  reduced-motion rule reaches every element, so a motion a generated component brings is stopped
  too.
- The rule is written in `docs/agents/frontend-structure.md`, under Styling.
