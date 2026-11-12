# Roadmap

What is left before 1.0, and what is known to be open. Nothing here is
scheduled unless it is picked up explicitly.

## The road to 1.0

1.0 is a promise: the core's API (`@modular-av/api`, versioned as the
core) and the dock's theme API ([dock-theming.md](dock-theming.md))
change only with a new major version, and modules stop releasing in
lockstep ([RELEASING.md](RELEASING.md), "Versions from 1.0"). 1.0 is
released when every item below is checked or dropped by the owner.

**Used by real tables**

- [ ] Two or three real sessions per service (LiveKit, P2P, Jitsi) with
      real players, cameras and microphones, over ordinary home
      connections: joining, speaking, muting, reconnecting after a drop,
      a GM's block, the dock in every placement. Findings fixed or listed.
- [ ] CPU and memory on a modest laptop with effects on (noise
      cancellation, camera background) during a real session.
- [ ] P2P renegotiates a link each time a hidden video is paused (after a
      3 s grace): measured with a real table and tuned if needed.

**Browsers**

- [ ] A smoke pass in Firefox and Safari (join, hear, see, mute, the
      dock, the settings window) and in Foundry's desktop app; what
      degrades is said in the READMEs.
  - Done in Firefox: joining, media and video both ways, mute, the dock
    and the settings window over P2P (`tests/foundry/firefox.spec.ts`),
    and sound over LiveKit Cloud in an installed Firefox
    (`tests/foundry/firefox-installed.spec.ts`, opt-in).
  - Left in Firefox: P2P with sound, and Firefox's own device prompt (the
    tests grant devices by preference).
  - Not started: Safari and Foundry's desktop app.

**Process**

- [ ] CI runs the unit and browser tiers on every push (once the GitHub
      Actions quota allows), and releases don't depend on one machine.

**Already done**: the API and the dock's theme API reviewed and their
promises written down, the open-mic decision, minimum versions in each
module's requirements, stable manifest URLs, finding the whole family
from inside Foundry, the foundryvtt.com listing of the core, and the
release steps for independent versions.

**Not blocking 1.0**: the Krisp module, the long functions and the flaky
test below, Jitsi as a Service, cameras on tokens and an
external call mode.

## Waiting on someone else

- **Krisp.** We asked LiveKit (support@livekit.io, 2026-10-26) whether a
  Foundry module that loads `@livekit/krisp-noise-filter` from npm for
  each table's own Cloud project fits their terms.
  `modular-av-livekit-krisp` stays held (`modularAV.releaseHold` in its
  `package.json`) until they answer in writing.
- **The other modules on foundryvtt.com.** The core is listed; the rest
  are submitted one at a time.

## Open items

### The core

- **The entry is nearly full**: 130.3 KB of a 130,500 byte budget
  (`pnpm size:check`), raised from 124,500 for screen sharing. The next
  core feature needs lazy loading or a budget decision.
- **Functions over 50 lines**, mostly factories from the first
  milestones: `createLocalMedia`, `createSession`, `createEffectRunner`,
  `createRemoteMedia`, `createMicrophone`, `createCamera`, and helpers in
  `packages/testing`. ESLint's `max-lines-per-function` at 50 lists them.
- **State refreshes aren't coalesced**: several changes in one task each
  refresh the state.
- **`MountedSurface.unmount` is never called** by the core; the API says
  a minor version may.
- **Push to mute** (the push to talk key in "always" and voice activity
  modes) is ignored.
- **Rooms are named after the world id**: two installs sharing one
  LiveKit project with the same world id would share a room.
- **No token server and no insecure dev mode**: a GM must be online for
  players to join LiveKit or Jitsi.
- **No server-side moderation**: a modified client keeps its publish
  rights until it reconnects, though every receiver refuses its media.
- **LiveKit AVClient settings older than its own world setting** (kept in
  Foundry's `rtcWorldSettings`) aren't imported.

### Plan your modules

- **Another GM applying meanwhile isn't seen** until the window is opened
  again.
- **Surfaces by convention**: Apply makes a UI module's `<id>.cameras`
  and `<id>.settings` the world's choices; a UI module that names its
  surfaces otherwise keeps the old choice until the GM picks it.
- **Two services or two UI modules enabled at once** both show in the one
  slot; the board doesn't pick one, and adding another swaps them all out.

### Tests

- **A flaky browser test**: "two players who join at the same moment link
  once and hear each other" (`packages/p2p/test/browser/mesh.spec.ts`)
  failed twice inside `pnpm verify`, with level 0 at the listener, and
  never in over 300 runs alone or under load. The cause is unknown.
- **The scattered layout and themes are tested in Chromium only.**
- **Only Foundry v14's controls are measured** for the scattered layout,
  by their v14 ids and structure.

### Browsers other than Chromium

- **No camera background in Firefox and Safari**: video effects need
  `MediaStreamTrackProcessor`.
- **A 48 kHz capture context fed by a 44.1 kHz microphone** may fail in
  Firefox (mixed sample rates); unchecked.
- **The noise models and Krisp** aren't tried in Firefox, Safari or
  Foundry's desktop app.
- **Picture-in-Picture per tile** isn't built; the window always on top
  is Chrome and Edge only.

### P2P

- **`maxQuality` is ignored.**
- **No GM-signed TURN credentials.**
- **The event emitter is copied** in the mock service, LiveKit and P2P: a
  shared runtime helper would break "`api` is types only".
- **Accepted for now**: a malicious player's candidates can make others
  probe any address (inherent to WebRTC), hello and bye tell every user
  in the world who joins, and a player past the cap may show briefly
  before leaving.

### Jitsi

- **Jitsi as a Service** (8x8): tokens signed with the app's private key
  would work from the GM's browser, but its terms for a module where each
  table brings its own account weren't reachable.
- **A shared screen's sound isn't carried**: Jitsi sends one sound track
  per participant, and mixing the share into the microphone would mute
  it with the player.
- **No servers without tokens.**
- **Only Jitsi stable 11248 is tested**; Jitsi publishes no rule for
  which client and server versions work together.
- **A participant without an identity from the server is ignored**, not
  ended on. On a server without `presence_identity` a modified client
  could claim another player's identity (the README makes the module a
  requirement).
- **Two tabs of one player joining at the same moment** can both stay.
- **Plain `ws://` is accepted for `*.local` names**, as for LiveKit.

### Noise cancellation and Krisp

- **GTCRN on a slow machine isn't measured**, and nothing switches to a
  lighter model by itself when one can't keep up.
- **Krisp gets no LiveKit `LocalAudioTrack`**, so it can't pause its
  usage reports while the player is muted, and LiveKit isn't told the
  track has enhanced noise cancellation. Its quality setting applies the
  next time it starts.

### Camera background

- **Swapping blur and replace starts a second worker** beside the first;
  in software WebGL that holds the camera about 2.5 s. One worker shared
  by both would make it seamless. Not measured with a GPU.
- **High quality is checked only for running and cost.**
- **Where WebGL runs in software, High silently runs as Standard**; only
  the setting's hint says so.
- **Closing Foundry's file browser without picking** leaves "Choose an
  image…" waiting until the next pick.

### The dock

- **No compact tile layout** (avatars and names only).
- **`dock.layouts.register` isn't public**, until a module needs to add a
  layout.
- **Scattered tiles keep clear of Foundry's controls, not of each
  other.** Tiles that were never placed take the free corners in the
  dock's order, so one can change corner when someone joins.
- **The chat log counts as one of Foundry's controls**: tiles near the
  bottom right move away while new messages show there, and back.
- **A player's arrangements for scenes are never pruned**; the newest 200
  are kept.
- **A theme's `preview` is checked but not shown** anywhere yet.
