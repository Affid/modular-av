---
name: dock-theme
description: How to make or rework a theme for the Modular A/V dock in this repository. Use when asked for a new dock theme, a change to how a theme looks (frames, name plates, the dock's own decoration), or mockups of one. Covers the order of work (words, pictures in the harness, then code), what to show the user each round, and the checks before a pull request.
---

# Making or reworking a dock theme

Read `docs/dock-theming.md` (what a theme may style and must keep) and
`docs/making-a-theme.md` (technique and traps) before anything else. This
file is the order of work.

Before starting, see who else is on the machine: the test harness has one
port (5174) and there is one local Foundry (30000). `ss -ltn` shows
whether either is in use, and another session may be using them. A
harness of your own runs beside it on another port (`pnpm exec vite
--config packages/testing/src/harness/vite.config.ts --port 5175`);
Foundry is agreed by message, never taken.

## 1. Words

Do not draw or build yet. Ask the user what the theme is made of and what
the dock becomes under it, in a handful of questions, and write their
answers down in their words. Restate your reading of each answer and mark
it as yours.

The theme's name is what it shows (vines, scrolls), never the character
class it is for: that goes in its label. Ask the user to pick the name
before any folder is made.

## 2. Pictures, in rounds

Nothing in the repository changes in this step. Keep trial stylesheets and
trial pictures in the scratchpad and shoot them with:

```bash
pnpm theme:shots <out> --modules dock,dock-<theme> --theme <id> \
  --css <trial.css> --art <trial pictures> \
  --players 2,8 --heights 900,1080 --placements left --layouts grid,focus
```

For each round:

- Show every option on a large camera and on a small one (about 240 and
  120 pixels wide), with few cameras and with many, and at least once with
  a full dock.
- Put the cost beside each option, in pixels of camera, measured (the
  script prints the tile's width). Compare with the dock's own look.
- Ask at most two questions, and ask them with pictures: two pictures side
  by side, not the names of parts.
- Say which option you would pick and why, in one or two sentences.
- Publish to one review page and rewrite it each round: only the round
  being asked about, with one sentence on what is already settled.
- If the user rejects every option, ask what they see in their own words
  before drawing more. Their idea is usually the better one.
- The harness has none of Foundry's fonts and no height limit. The script
  handles both; a hand-made shot must too.

Stop and wait for the user's choice at the end of each round. Build only
when the look is settled and the user has said so.

### What a settled look has shown

A look is settled for what the user has seen, and for nothing else. What
the pictures leave out, the build decides without them: the scrolls theme
was settled on the left dock alone, and eight decisions and two faults
came up only while building. Before asking whether to build, the rounds
together must have shown:

- **Every state of a camera:** speaking, muted, deafened and on a poor
  link (the three icons at once, on a large camera and a small one), out
  of the call, the camera off, the viewer's own camera with its level,
  another module's badge, and the menu button under the pointer.
- **Every placement once:** left, top or bottom, floating, scattered,
  collapsed at a side; one camera large; and a dock wider than 300
  pixels, where anything that repeats shows its seam.
- **The dock's own parts:** the header, the voice panel, a button with
  its menu arrow, and a pressed button.

Make the states happen, don't paint them: mute through the player's own
command, leave the call for an out-of-the-call tile (in the harness only
the viewer's own tile stays when its player leaves). A state set by
adding an attribute shows no icon, and the dock takes it back.

Keep the mock to what the dock can do: one gap between tiles, the reach
the theme will register, and nothing that needs a change to the dock
unless that change is part of the plan.

## 3. Build, tests first

1. The dock's part first, if the theme needs something the dock doesn't
   give: a test, then the change, then `docs/dock-theming.md` and a
   changeset. Commit it on its own.
2. The pictures: a seeded script under `tools/art/<theme>` (reuse
   `tools/art/vines/strands.ts`, `sprig.ts`, `svg.ts`, `random.ts`). One
   module and one test file per kind of picture. A test ties the
   stylesheet's numbers to the script's. Where a material can't be
   drawn (glass, stone), render it: `tools/art/scrolls` is the model
   (Blender scenes as scripts, one file of measures, a list that locks
   the rendered pictures).
3. The stylesheet and the theme's registration. Write it fresh from the
   mock's stylesheets, never ship them. As soon as it loads, run the
   theme contract in each layout (`themeContract`): it finds in a minute
   what otherwise comes out late (a grid that flips between two sizes,
   something faint over a face, an icon under the frame).
4. Browser tests of the theme's own, reading computed styles: every
   placement and state. A test's name is a claim: check that it would
   fail if the claim were false.
5. Look at the real theme in the harness in every placement, with one
   camera large, and collapsed, before running anything long.
6. Then take it to Foundry (step 4.5 below) and show the user those
   pictures: people in the cameras, a map behind. The first pictures the
   user sees of a built theme are from Foundry. Harness pictures are for
   counting pixels and for states that are hard to reach there; say so
   beside each one that is shown.

## 4. Check, in this order

1. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm lang:check`
2. The unit tests and the browser tests you touched.
3. `pnpm build && pnpm size:check` (budgets fail last in verify: look
   early). Raising a budget is a decision to tell the user about.
4. `pnpm verify`, and read its exit code in a step of its own. It takes
   about ten minutes: start the reviewers of step 6 while it runs, they
   only read.
5. `pnpm theme:foundry <out> <id> [camera files]` with Foundry running
   (`pnpm foundry:start`, `pnpm foundry:setup`, `pnpm build`,
   `pnpm foundry:link`). Look at the pictures; stop the server after.
   Menus and the settings window are judged here, never in the harness,
   which has none of Foundry's styles for form fields. Show the user
   pictures from Foundry, with people in the cameras
   (`docs/images/README.md`), as soon as the theme runs there.
6. A code review and a security review by agents that did not write it,
   with the diff and no conclusions of yours. Tell them what not to run
   while verify has the tree. Fix what they find, tests first, and run
   verify again.
7. Retake the docs pictures the theme appears in
   (`scripts/docs/screenshots.ts`; keep only those, shrink them).

## 5. Hand over

Commit in focused pieces, push, and write the pull request: what the
theme shows, what the dock gained, what it costs (camera sizes, budgets),
what is not covered, and the checks that ran. Tell the user every decision
you made without asking, on the review page, each with its reason.

## 6. Release, when the user asks

- A release is per module: `pnpm release:pending` says what has no tag
  for its current version. A new theme at the family's current version
  is published alone (`pnpm release:publish <id>`, a dry run without
  `--yes`); the other modules are not touched. Check this before saying
  which version it will be.
- Published that way, the module's `CHANGELOG.md` entry is written by
  hand, and its changeset keeps only what waits for other modules (the
  core's own words for it in the planner).
- Before publishing: `pnpm test:foundry` and `pnpm foundry:check` with
  the module linked and enabled. A test that fails is run again alone
  before it is called a flake, and the user is told.
- After: read the published manifest, the download and the catalog from
  their public addresses; push the wiki's section (`../modular-av.wiki`).
  The listing on foundryvtt.com is the user's to submit.
