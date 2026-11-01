# Plan: audio mixer

Builds the design in `docs/audio-mixer.md`, agreed with the owner on
2026-11-01.

No release. The branch is `feat/audio-mixer`. Each phase writes tests first,
runs `pnpm verify`, reads its exit code in its own step, then commits. Nothing
is pushed without asking.

## Decisions

- The mixer ships no effects, and neither requires nor recommends any.
- One module per effect, named `audio-`: these effects work on any sound that
  reaches them, such as recordings mixed in later. `mic-denoise` keeps its name.
- The dock has no mixer. For audio it shows only noise suppression.
- The mixer's kind is `effect`. `ui` is the single `core.cameras` board socket,
  so it would swap the dock out, and the catalog refuses unknown kinds.
- A GM layer applies at once, with a notice, and the player can refuse it after.
- A layer that uses an effect the player runs replaces it, and restores it after.
- The entry budget stays at 116,000 bytes: `setEnabled` moves to the lazy
  `setting-writes.ts` and pays for the additions.

## Phases

| Phase        | Delivers                                                                                                                                         | Real Foundry                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 0. Core      | `setAudioPipeline`, `chosenEffects`, `preview.voice()`, this plan and the design doc, handoff rule 3                                             | media, av, denoise                                                           |
| 1. Effects   | `audio-reverb`, `audio-echo`, `audio-eq`, one commit each. Stop for the owner's listening test: the last use of the dock's effect list for these | denoise, modules, new audio-effects spec: an effect on a send reaches a peer |
| 2. Mixer     | The `audio-mixer` package: lanes, order, places, levels, effect settings, warnings, Test my voice, Cut tails. The dock's Mix section and list go | settings-window, dock, new audio-mixer spec, with and without effect modules |
| 3. Presets   | Save, apply, resolve, quick switch, keybindings, macro API                                                                                       | audio-mixer: a preset across a reload and out of a call                      |
| 4. GM view   | Reports and the GM's read-only table                                                                                                             | audio-mixer: two users                                                       |
| 5. GM layers | Table and personal layers, undo record, refusing, notices                                                                                        | audio-mixer: cave on, reload, cave off, exact restore, refusal, late joiner  |
| 6. Finish    | README, handoff, a link from `docs/voice-routing.md`, code and security reviews                                                                  | Full `test:foundry`, and `firefox.spec`                                      |

The Foundry server needs a restart and `pnpm foundry:link` and `pnpm
foundry:setup` to see a new module. `docs/voice-routing.md` says Cut tails is in
the voice settings, so phase 2 corrects that. The wiki follows releases, so it
isn't in these phases.

## Measured for phase 0

In a throwaway worktree, baseline 115,680 of 116,000 bytes: `setAudioPipeline`
+91, `chosenEffects` +101, `preview.voice()` +100, moving `setEnabled` -605.

## Not tested

Safari (WebKit won't launch here), Foundry's desktop app, a real table of
several people on laptops, and sound judged by anyone but the owner. Firefox is
limited to what `firefox.spec` and the offline contracts cover.
