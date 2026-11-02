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

## Measured

Phase 0, in a throwaway worktree, baseline 115,680 of 116,000 bytes:
`setAudioPipeline` +91, `chosenEffects` +101, `preview.voice()` +100, moving
`setEnabled` -605. Built for real, the entry is 115,225 bytes.

Phase 1, on a fake microphone that talks for 1.5 s and is silent for 1.5 s, with
the real voice gate, threshold -50 dBFS (`routing.spec.ts` in `audio-reverb`):

| Reverb at decay 3 s | Gate open |
| ------------------- | --------- |
| Off                 | 75%       |
| On a send           | 75%       |
| Pre-gate            | 100%      |

The three runs agreed to within a point, so a send doesn't hold the gate, and
the warning about a `tail` ahead of it is true. After the gate closes a send's
tail falls by about 8 dB per 400 ms, as a 3 s decay should.

On a steady tone exactly on a comb's resonance the reverb peaks at about 10
times what comes in, and speech-like sound at about 1.8 times. So the kernel keeps a
fixed gain and bends what passes 0.8 towards 1.

Later phases, built, against budgets of 116,000 for the core and 10,000 for the
mixer: the core's entry stayed at 115,225 bytes and the mixer's is 5,828, as
presets, reports and layers load on first use.

A held note at -32 dBFS over a quiet room, 30 s long, in voice activity mode in
real Foundry: cut after about 9 s on P2P and LiveKit alike before the gate fix,
whole after it. Typical level after: RNNoise -32 dB, GTCRN -35, browser noise
suppression -46, Speex -47.

## After the owner's first test

On 2026-11-02 the owner sang through it, found a loop in Chrome only, asked for
Test my voice to work while muted, and for a window that looks like a sound
engine. The design went through four drafts and an outside designer's review
before approval.

| Phase                | Delivers                                                                                     | Real Foundry                                             |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 7. Echo in Chrome    | Capture again only after letting the microphone go                                           | denoise: what each capture got                           |
| 8. Test through Mute | `preview.voice()` hears through Mute and push to talk while live; the output bus still obeys | audio-mixer: a muted test is heard, the GM hears silence |
| 9. CPU wording       | "Light on CPU" in the dock, "CPU: light" in the mixer                                        |                                                          |
| 10. The signal path  | The chain model, routing and levels, pop-ups, the effect browser, the GM's read-only view    | audio-mixer: drag, browser, axe with pop-ups open        |

Measured in Chrome with a fake microphone: an overlapping second capture of the
same device with other processing came back with echo cancellation, gain control
and noise suppression all off, at 44.1 kHz stereo; after the fix, echo
cancellation stays on. A 30 s held note at -32 dBFS, per second: without a model
the browser's gain control lifts it to about -20 for 8 s, then its noise
suppression pulls it to -47; RNNoise with the browser's gain control on lifts it
to -20 for 10 s, then -32; with it off, a flat -32. Gain control went off with a
model for that, and the owner's next test found every noise model much
quieter: with a quiet microphone, the browser's gain control is most of the
level. It is on again. The core's entry went from 115,225 to 115,722 bytes of
116,000; the mixer's stayed at 5,921.

## Not tested

Safari (WebKit won't launch here), Foundry's desktop app, a real table of
several people on laptops, and sound judged by anyone but the owner. Firefox is
limited to what `firefox.spec` and the offline contracts cover.
