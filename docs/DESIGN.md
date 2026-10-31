---
version: alpha
name: "{{Project name}}"
description: "{{One sentence: what this interface is and who uses it}}"
colors:
  primary: "{{#RRGGBB: the one interaction color}}"
  primary-hover: "{{#RRGGBB}}"
  on-primary: "{{#RRGGBB}}"
  surface: "{{#RRGGBB}}"
  on-surface: "{{#RRGGBB}}"
  on-surface-muted: "{{#RRGGBB}}"
  outline: "{{#RRGGBB}}"
  error: "{{#RRGGBB}}"
  on-error: "{{#RRGGBB}}"
  surface-dark: "{{#RRGGBB}}"
  on-surface-dark: "{{#RRGGBB}}"
  on-surface-muted-dark: "{{#RRGGBB}}"
typography:
  display:
    fontFamily: "{{Display family}}"
    fontSize: "{{px}}"
    fontWeight: "{{weight}}"
    lineHeight: 1.1
  headline:
    fontFamily: "{{Display family}}"
    fontSize: "{{px}}"
    fontWeight: "{{weight}}"
    lineHeight: 1.2
  title:
    fontFamily: "{{Text family}}"
    fontSize: "{{px}}"
    fontWeight: "{{weight}}"
    lineHeight: 1.3
  body:
    fontFamily: "{{Text family}}"
    fontSize: "{{px}}"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "{{Text family}}"
    fontSize: "{{px}}"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "{{Text family}}"
    fontSize: "{{px}}"
    fontWeight: "{{weight}}"
    lineHeight: 1.2
rounded:
  none: 0px
  sm: "{{px}}"
  md: "{{px}}"
  full: 9999px
spacing:
  xs: "{{px}}"
  sm: "{{px}}"
  md: "{{px}}"
  lg: "{{px}}"
  xl: "{{px}}"
  section: "{{px}}"
components:
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
  page-muted-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
  page-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-dark}"
  page-dark-muted-text:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-muted-dark}"
  divider:
    backgroundColor: "{colors.outline}"
    height: 1px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
---

<!-- TEMPLATE. Format: Google's DESIGN.md spec (alpha),
     https://github.com/google-labs-code/design.md

     Fill every {{TOKEN}}, delete these guidance comments, then run
       npx @google/design.md lint DESIGN.md
     It exits 1 on broken token references and warns on contrast below WCAG AA.
     An unfilled template fails lint on purpose.

     The front matter holds exact values. The prose is where the design lives:
     it tells the agent why, and covers what tokens cannot (states, motion, copy).

     Never put a concrete font, color, radius, spacing step, or duration into
     the template itself.
     A value in the template becomes the default of every project, and a
     default shared by every project is what slop is.

     Keep it true. A deliberate UI change updates this file in the same commit. -->

## Overview

<!-- Name a specific reference, not adjectives. "Modern, clean, premium"
     describes a region, and the agent builds the average of it. "A regional
     train timetable" or "a 1970s lab notebook" describes a point, and brings
     its restrictions with it: a timetable does not glow. -->

**Reference:** {{The concrete object, place, or tradition this interface resembles.}}

**Audience:** {{Who uses it, and in what situation.}}

**Primary job:** {{The one thing a user must be able to do on first visit.}}

**Density:** {{dense | balanced | spacious}}, because {{reason tied to the audience}}.

**The one bold thing:** {{The single memorable element. Everything around it stays quiet.}}

## Colors

<!-- Name each color by role, point at its token, and say where it is NOT
     allowed. An accent means something only because it is scarce. -->

- **Primary** {colors.primary}: {{name}}. The only color that says "you can act here". Never decoration.
- **Surface** {colors.surface} and **On surface** {colors.on-surface}: page ground and all body text.
- **Muted** {colors.on-surface-muted}: metadata and helper text only. Still passes 4.5:1 on surface.
- **Outline** {colors.outline}: dividers and input borders. Not a card accent.
- **Error** {colors.error}: validation and destructive states only.
- **Dark mode:** {{yes | no}}. If yes, dark pairs meet the same floor as light; a dark surface is not a reason for gray on gray. If no, delete every `-dark` token and component.
- **Gradients:** none, unless one encodes data (a heat scale). Name it here if so.

Contrast floor: 4.5:1 for text, 3:1 for text at 24px and up (or 19px bold), focus rings, and input borders. The `page-*` components exist so the linter's `contrast-ratio` rule checks your text colors, not just your buttons.

## Typography

<!-- Choose faces for this subject and write the reason. If the reason would
     fit any project ("clean and readable"), it is not a reason. -->

- **Display** ({{family}}): {{why it fits the reference}}.
- **Text** ({{family}}): {{why}}.
- One family or two. If two, they differ clearly in role and form.
- At most {{2}} weights on a screen.
- Line length at most 70ch for running text.
- Sentence case for headings, buttons, and labels.
- A headline has one color, one style. No single word set in italic, bold, or an accent color.
- Tables and changing numbers use tabular figures (`font-variant-numeric: tabular-nums`).

## Layout

- Every margin, padding, and gap comes from `spacing`. No one-off values (`mt-[13px]`, `padding: 18px`). If the scale lacks a step you need, add it here first.
- Space between groups is larger than space inside a group. Sections are {spacing.section} apart.
- Grid: {{columns, max content width, gutter}}.
- Alignment: {{left-aligned by default}}. Centered text only for {{cases, or "never"}}.
- Works at 360px wide with no horizontal scroll.

## Elevation & Depth

{{The one primary method for hierarchy: tonal layers, hairline borders, or shadow.}}

- Shadow: {{none | one definition: offset, blur, color}}. Not the same soft gray shadow under every card.
- Surfaces are opaque.

## Shapes

- Radius follows hierarchy: controls {rounded.sm}, containers {rounded.md}. Not one radius on everything.
- Icons: {{set, stroke width, size}}. An icon appears only when it adds meaning the text does not carry, or stands in for a label in a tight control that has an accessible name.

## Components

<!-- Tokens cover resting appearance. Write what they cannot: hover, focus,
     pressed, disabled, loading, empty, error. -->

- **Reference code:** {{path to the page or component that best shows this system}}. Agents copy nearby code more than they follow this file, so point at the best example and keep it current.
- **Library:** {{none | shadcn/ui | Radix | other}}. Library defaults are raw material. Every component takes this file's colors, radius, type, and spacing before it ships. A screen that looks like the library's docs site is unfinished.
- **Buttons:** hover moves to {colors.primary-hover}. Focus shows a {{2px}} ring with offset, independent of hover. Pressed, disabled, and loading states are designed, not defaulted.
- **Inputs:** visible label above the field. Placeholder is never the label. Error text says what is wrong and how to fix it.
- **Cards:** only for discrete, repeatable objects (a file, an order, a person). Never the default wrapper for a section.
- **Empty states:** say what belongs here and offer the action that creates it.
- {{Project component}}: {{states and rules}}.

## Motion

- Motion answers an action (open, expand, confirm, reorder) and shows what changed. Feedback (hover, press, toggle) takes {{ms}}, content transitions (panel, modal, page) {{ms}}, both on {{easing curve}}. Nothing runs longer than {{ms}}.
- Content is already visible when it scrolls into view. Nothing animates because the page scrolled.
- At most one orchestrated moment per page: {{none | what and where}}.
- Nothing tracks the pointer.
- `prefers-reduced-motion: reduce` sets every duration to 0.

## Copy

- Voice: {{e.g. plain and direct, second person}}.
- Name things the way the user thinks of them. A user manages notifications, not webhook config.
- Buttons state the action: "Save changes", not "Submit". The verb carries through: a "Publish" button produces a "Published" toast.
- Errors say what happened and what to do next. No apologies, no jokes.
- No em dashes in UI copy. Use a period, comma, colon, or parentheses.
- No emojis in headings, buttons, or labels.
- Banned words: seamless, effortless, unlock, supercharge, elevate, empower, revolutionize, next-gen, cutting-edge, game-changing, all-in-one, "built for the modern team". If a sentence still works with a competitor's name swapped in, rewrite it.

## Do's and Don'ts

### This project

- {{Do or Don't, with the reason in the same line.}}

### Every project

<!-- These hold in every project. A brief that explicitly asks for one of
     these wins: lift the ban in "This project" with a reason, and record it in
     DECISIONS.md. Never lift one silently.
     enforced by: a `slop/...` id is checked by checks/design/slop-check.mjs
     (the check's output names the id); `design.md lint` covers contrast. A ban
     with no id is caught only by screenshot and review. -->

**Color and surface**

- **Don't** use a purple-to-blue gradient, or any gradient as decoration. Use a flat surface. `slop/purple-blue-gradient` `slop/gradient`
- **Don't** fill text with a gradient (`background-clip: text`). Text takes one solid color. `slop/gradient-text`
- **Don't** lay grain or noise over a gradient. Surfaces are flat. `slop/grain-overlay`
- **Don't** use glassmorphism: translucent cards over a backdrop blur. Surfaces are opaque. `slop/glassmorphism`
- **Don't** give cards a colored border (top, left, or all around) as an accent. Separate with space or tone. `slop/colored-border-card`
- **Don't** ship a low-contrast dark mode. Dark pairs meet the same AA floor as light. `design.md lint: contrast-ratio`

**Type**

- **Don't** reach for Inter by default. Choose for the subject and write the reason in Typography. `slop/font-inter`
- **Don't** pair Space Grotesk with Instrument Serif. `slop/font-pair`
- **Don't** drop serif italic accent words into headlines. A headline has one color, one style.
- **Don't** put emojis in headings. Let the words carry it. `slop/emoji-heading`

**Layout and components**

- **Don't** build a row of three icon boxes (icon, title, one-line blurb). Show the product, a real example, or a list with substance.
- **Don't** put a badge or pill above the headline ("New", "Now in beta"). If news matters, it is the headline.
- **Don't** put a Lucide icon (or any icon) on every label, bullet, and button. An icon earns its place with meaning. `slop/icon-everywhere`
- **Don't** ship shadcn/ui, or any component library, in its default theme. Apply this file's tokens first.
- **Don't** use a spacing value that is not in `spacing`. Add the step here first. `slop/off-scale-spacing` (checked once `spacing` is filled)

**Motion and interaction**

- **Don't** fade or slide content in on scroll. Content is visible when it arrives. `slop/scroll-reveal`
- **Don't** add cursor-following beams, spotlights, or glows. `slop/cursor-follow`
- **Don't** make hover an opacity fade. Hover changes color, underline, or elevation. `slop/opacity-hover`

**Copy**

- **Don't** use em dashes in UI copy. Use a period, comma, colon, or parentheses. `slop/em-dash-copy`
- **Don't** write generic buzzword copy. Say what the product does. `slop/buzzword`

**Same failure, other forms**

- **Don't** put a tracked-out ALL-CAPS eyebrow label above every heading.
- **Don't** number content 01 / 02 / 03 unless it really is a sequence.
- **Don't** chop every section into identical rounded cards with the same shadow.
- **Don't** append an arrow to every link and button.
- **Don't** open with a big number, a small label, and a gradient accent by default.

**Always**

- **Do** run the slop test on the plan before writing code: would a similar prompt for a different product produce the same plan? Revise the parts that would, and say what changed.
- **Do** spend boldness in one place (the one bold thing in Overview) and keep the rest quiet.
- **Do** screenshot the result at 360px and at desktop width and check it against this file before calling it done.
- **Do** meet the quality floor without announcing it: visible keyboard focus, reduced motion respected, AA contrast, no horizontal scroll.
