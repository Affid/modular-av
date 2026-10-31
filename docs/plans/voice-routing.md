# Plan: voice channel routing

Builds the design in `docs/voice-routing.md`, agreed with the owner on
2026-10-31 after a review by a fresh agent. It closes issue #1 and goes
further: the issue moved `post` after the gate, and the design gives the
microphone a mixer's shape.

No release. The branch is `feat/voice-channel-routing`, and each phase ends
with `pnpm verify` and at least one commit.

## Decisions

- Sends are always pre-fader, with one Send on/off ahead of all of them.
- Each `send` effect gets its own FX channel. Stacking effects in one
  stays unbuilt until someone wants it.
- Channel level may go to 0. If no FX channel is running with a Return
  level above 0, it acts as full.
- Mute is a fixed core part right after the gate, not an effect.
- `send` joins the API before the freeze, after the real-time spike.
- The stage names below are the ones of phases 0 to 7: phase 8 replaced them
  with places.
- An effect's `mix` is one number, 0 to 1: dry:wet for an insert, the
  Return level for a send.
- Tails ring out on mute, deafen and push to talk release, at most 3 s,
  only while a tail effect runs, and never on a GM block. A setting cuts
  them.
- A hosted effect has a worklet node of its own. One node for all of them
  saved 1.8 ms/s in the spike with four reverbs, and costs a fixed number
  of inputs or a rebuild on every change. The API hides the choice, so it
  can change later.

## Phases

### 0. Design, plan and the real-time spike

- `docs/voice-routing.md`, this plan, the diagram page updated.
- Spike outside the repo: the whole routing in real time in Chromium and
  Firefox, with a busy main thread. Gate control outputs driving k-rate
  gains, wake on the same block, native nodes asleep behind them, a probe
  on a sleeping node, NaN through an analyser.

Results, 2026-10-31 (Chromium 156, Firefox 157, gate plus one 3 s
convolver, real time; main thread busy for 0, 80 or 200 ms at a time, with
20 ms between; extra ms/s over the gate alone, 10 = 1% of a core):

| Measure                                 | Chromium     | Firefox              |
| --------------------------------------- | ------------ | -------------------- |
| Lost at 8 speech starts, audio thread   | 0 blocks     | 0 blocks             |
| Lost at worst, main thread, not busy    | 4 blocks     | 7 blocks             |
| Lost at worst, main thread, busy 200 ms | 78 blocks    | 82 blocks            |
| Convolver connected, silent             | +34.0        | +42.5                |
| Behind a gain following the gate        | +2.1         | +42.8 (never sleeps) |
| The same, with a probe on its output    | +0.6         | +44.3                |
| Behind a plain gain at 0                |              | about 0              |
| NaN through an analyser                 | reads as NaN | reads as NaN         |

A block is 2.7 ms, so 78 blocks is about 0.2 s of a speech start lost.
Firefox's whole browser was measured, Chromium's renderer.

What this decides:

- The gate drives the post feed and Send on/off on the audio thread where
  the browser has k-rate gains.
- Firefox has no k-rate. There the post feed stays open, so native `post`
  effects don't sleep, because a late wake would clip speech. Send on/off
  follows the gate's message: it sleeps, and a busy page can start the
  reverb late. With Channel level at 0, that lateness reaches the voice.
- A probe doesn't keep a native node awake.
- `peak()` already reports NaN, and the checks must treat it as a failure.

### 1. `post` after the gate, and Mute

- `CaptureContext` gains `createLevel`, the core's own gains, so chain
  logic stays testable without a browser.
- The chain becomes source → `denoise`, `voice` → gate → Mute → `post` →
  destination.
- `Microphone.setEnabled` closes Mute and the output together.
- Comments and docs that state the order. A changeset calling out `post`.
- Done when issue #1's "Done when" items hold: `post` after the gate,
  `voice` before it, works with no gate and in `detect` mode, new path
  connected before the old one is cut.

### 2. Sends

- `send` in `AudioStage`, refused stages fail plainly.
- Channel level, Send on/off, FX channels, Return levels.
- Gate control outputs on the audio thread: post feed and send.
- Removing a `send` effect fades its Return, then disposes it. A failure
  cuts at once.
- Channel level acts as full without a live FX channel.

### 3. Effect health

- `stall-watchdog` learns several sources: post feed for `post`, Send
  on/off for `send`, with the stall time extended by the effect's `tail`.
- Runaway level and non-numbers count as failures, for `post` and `send`.

### 4. Dry:wet and levels

- `latency`, `tail` and `defaultMix` on `AudioEffectDefinition`.
- Inserts with a declared `latency` get dry delay, dry level, wet level.
  100% wet stays a plain link.
- Client settings, `commands.setChannelLevel`, `commands.setEffectMix`,
  `LocalState.channelLevel`, `LocalState.effectMix`.
- The dock's Voice tab: Channel level and a slider per mixable effect.

### 5. Hosted effects

- `public/worklets/effect-host.js`: the host processor, a `registerKernel`
  global for kernels, the skip on silence, a thrown or non-finite render
  reported as a failure and silenced.
- `AudioEffectContext.host(...)`: gives a normal `AudioEffect`.
- Docs for effect authors.

### 6. Tail hold

- What the player would send and what the service gets become separate:
  Mute follows the first, the output bus and the service follow the
  second.
- Sender hold, at most 3 s, for the player's own release only.
- Receivers need nothing: playback doesn't act on a sender's mute (their
  `muted` in `canHear` is the listener's own choice). The design discussion
  had this wrong.
- The "cut sound tails" setting, command, state and dock switch.
- `packages/api/README.md`: the mute guarantee reworded.

### 7. The effect contract

- Idle cost, honest tail and no dry signal on a send, for `post` and
  `send` effects.
- Test effects covering them, including one that must fail.
- Final pass over `docs/HANDOFF.md`, READMEs and the diagram page.

### 8. Places

Added on 2026-10-31, after the owner pointed out that `denoise` and `voice`
are one place and that a slot belongs to the mixer, not to the effect. `voice`
was reserved for voice changers from the first effects commit, and nothing
ever shipped in it.

- `AudioPlace`: `pre-gate`, `post-gate`, `send`. It replaces `AudioStage`, and
  `defaultPlace` replaces `stage`: the effect suggests, the core places. The
  two pre-gate stages merge, so a breaking rename, cheap only before the
  freeze.
- Order inside a place: the player's, and noise suppression first by default.

### 9. The core owns placement

- `commands.setEffectPlace`, `commands.setEffectOrder`, saved per device,
  `LocalState.effectPlaces`, `LocalState.effectOrder`. No dock controls: a
  module such as advanced-audio builds that UI on the commands.
- A running effect moves without restarting, the new path connected first.
- An effect runs in one place at a time. Two copies stay out of scope.
- What depended on the declared stage reads the current place: the mix, the
  tail hold (a tail ahead of Mute can't ring out), the watchdogs.
- All of pre-gate is watched. An effect behind one that `silencesNoise` isn't,
  as it may hear exact zeros, and one stall is blamed on the first silent
  effect of the chain, not on everything behind it.
- Nothing is refused for sounding bad. A reverb ahead of the gate holds the
  gate open, and a UI should warn; the core doesn't stop it.

### 10. One rule for every effect

- An effect outputs only its processed signal, and the core adds the dry.
- The contract's dry check runs on anything with a `tail` as well as on what
  defaults to `send`, as those are the effects a player will put on a send.
- Final pass over the docs and the diagram page.

## Testing

Each phase starts with failing unit tests. Routing is tested on the fake
graph (`packages/testing`), real sound in the browser tier
(`packages/core/test/browser`). The offline measurements from the design
discussion move into browser specs where they guard a claim: the tail
passes the gate, muted speech doesn't reach `post`, a sleeping effect wakes
in time.

## Risks

- Firefox has no k-rate `automationRate`: see the spike results above.
- Safari can't be run here. Hosted effects and control outputs are plain
  Web Audio, but untested there.
- No `post` or `send` effect ships yet, so all of this runs only with test
  effects until one does.
- `pnpm test:foundry` needs a running Foundry and isn't part of verify; run
  it before the PR.
- Moving a running effect isn't smoothed, so it can click. No UI moves effects
  during speech yet.
