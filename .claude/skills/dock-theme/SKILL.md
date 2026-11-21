---
name: dock-theme
description: How to make or rework a theme for the Modular A/V dock in this repository. Use when asked for a new dock theme, a change to how a theme looks (frames, name plates, the dock's own decoration), or mockups of one. Covers the order of work (words, pictures in the harness, then code), what to show the user each round, and the checks before a pull request.
---

# Making or reworking a dock theme

Read `docs/dock-theming.md` (what a theme may style and must keep) and
`docs/making-a-theme.md` (technique and traps) before anything else. This
file is the order of work.

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
3. The stylesheet and the theme's registration, then browser tests that
   read computed styles: the theme contract in each layout, and the
   theme's own for every placement and state.
4. Look at the real theme in the harness in every placement, with one
   camera large, and collapsed, before running anything long.

## 4. Check, in this order

1. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm lang:check`
2. The unit tests and the browser tests you touched.
3. `pnpm build && pnpm size:check` (budgets fail last in verify: look
   early). Raising a budget is a decision to tell the user about.
4. `pnpm verify`, and read its exit code in a step of its own.
5. `pnpm theme:foundry <out> <id> [camera files]` with Foundry running
   (`pnpm foundry:start`, `pnpm foundry:setup`, `pnpm build`,
   `pnpm foundry:link`). Look at the pictures; stop the server after.
   Menus and the settings window are judged here, never in the harness,
   which has none of Foundry's styles for form fields. Show the user
   pictures from Foundry, with people in the cameras
   (`docs/images/README.md`), as soon as the theme runs there.
6. A code review and a security review by agents that did not write it,
   with the diff and no conclusions of yours. Fix what they find, tests
   first, and run verify again.
7. Retake the docs pictures the theme appears in
   (`scripts/docs/screenshots.ts`; keep only those, shrink them).

## 5. Hand over

Commit in focused pieces, push, and write the pull request: what the
theme shows, what the dock gained, what it costs (camera sizes, budgets),
what is not covered, and the checks that ran. Tell the user every decision
you made without asking.
