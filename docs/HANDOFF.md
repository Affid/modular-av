# Handoff: Modular A/V

This is for a new Claude Code session that will build **Modular A/V**, a new
family of Foundry VTT voice and video modules, **in a new repository**, run
locally (WSL) with its own Foundry VTT and communication servers. It sums up
what we learnt building the Discord-style fork of the LiveKit AVClient module
(this repository, `Affid/fvtt-module-avclient-livekit`, up to release
`0.6.8-krisp.14`), the licensing rules for the new code, the module family,
naming rules, the credentials model, the contract with Foundry's own A/V
code, the plugin API, a proposed architecture, what to avoid, and milestones.
It already includes the findings of an independent design review. Read it
fully before writing code.

## 1. Goal

A Foundry VTT (v14+) voice and video system made of modules:

- **`modular-av`** ("Modular A/V — voice & video"), the core: a **headless
  foundation**, as small as it can be while doing everything that more than
  one module would otherwise have to write. It owns the Foundry integration
  (including the camera dock host, see §3), credentials and identity, the
  session (connecting, recovering from lost connections, who is who, the
  true mute/deafen state), the local media pipeline, audio playback, and the
  **extension points** every other module plugs into: a state store,
  commands, media attachment, and declared contributions. It has **no
  styled UI of its own**: with only the core and a service module
  installed, Foundry's own camera dock and settings work, plus a minimal
  plain status (notifications, a player-list badge) so the guarantees below
  still hold.
- **UI modules** that give it a face, built on the core's API rather than
  inside it: `modular-av-dock`, the Discord-like camera dock, voice panel
  and settings window (the recommended one, what the fork's UI becomes),
  and later others that show cameras in quite different ways, e.g.
  `modular-av-tokens` with cameras on the players' tokens.
- **Service modules**, one per communication service, each installed only if
  wanted and tested on its own: `modular-av-livekit` (self-hosted LiveKit and
  LiveKit Cloud), `modular-av-p2p` (plain WebRTC, no server, small tables),
  `modular-av-jitsi`. The GM picks the service per world, so the table isn't
  tied to LiveKit Cloud and can use what suits its players. Services are
  thin **media transports**; identity, permissions and shared state go over
  Foundry (see "Control plane over Foundry").
- **Effect modules** for the players' microphone and camera, added or removed
  as wanted: `modular-av-mic-denoise` (noise cancellation models),
  `modular-av-cam-background` (background blur and replacement), later
  voice effects and filters. They run on the local tracks before they are
  handed to the service, so they work with any service that accepts tracks.
  Service-specific extras are their own modules extending that service, e.g.
  `modular-av-livekit-krisp` (Krisp on LiveKit Cloud).
- **Theme modules** that change how a UI module looks, named after that UI:
  `modular-av-dock-scifi`, `modular-av-dock-fantasy`, `modular-av-dock-vines`
  (each camera in a frame of vine leaves in a corner of the screen),
  bringing the call into the game. The Discord-like look is the dock's
  default. Each player picks a theme, with a default set by the GM.
- An **external call** mode (`modular-av-embed`: a Jitsi Meet / Whereby /
  similar page in an iframe) is a shallow option for later. It is not a
  service: the core can't mute, process or identify media inside another
  site's iframe, so none of the guarantees apply, and the UI says so.

Table features to plan for (not all in the first release): a "you're
speaking while muted" warning (the core watches the raw mic while muted),
join/leave and mute sounds, showing the character's name or portrait
instead of the player's, a clear "no microphone/camera permission" state,
P2P reusing Foundry's own TURN settings, a one-click import of the old
module's server settings, and a spectator/streamer view.

And everything is **light and robust**: it recovers from lost connections by
itself, never shows a state it isn't in (muted, blurred), never exposes a
service's secret to players, and costs little CPU/GPU when features are off.

**First release, kept small on purpose** until the API settles: `modular-av`,
`modular-av-livekit` (+ `-krisp`), `modular-av-p2p`, `modular-av-dock`,
`modular-av-mic-denoise`, `modular-av-cam-background`. Jitsi, themes, the
scattered layout, `modular-av-tokens` and the external call mode come after.

## 2. Licensing: MIT, written clean

**Decision: the new repository and all its modules are licensed under MIT**,
with Affid as the copyright holder, and must contain **no code under the
Hippocratic License 2.1**.

Background: this repository is a fork of `bekriebel/fvtt-module-avclient-livekit`
(© 2021 Brint E. Kriebel / bekit, LLC), licensed under the Hippocratic License
2.1. That licence requires its notice on every copy of upstream code, keeps
upstream code under its terms (human-rights conditions, arbitration) even
inside modified versions, and isn't an OSI open-source licence. Writing the
new modules clean keeps them entirely free of it. Rules (this is not legal
advice):

1. **Never copy upstream code**, not even parts: every file that existed at
   upstream commit `258d14a` — `src/LiveKitClient.ts`, `LiveKitAVClient.ts`,
   `LiveKitAVConfig.ts`, `LiveKitBreakout.ts`, `avclient-livekit.ts`,
   `src/utils/*`, `types/avclient-livekit.d.ts`, `vite.config.ts`, the
   upstream parts of `public/css/avclient-livekit.css`,
   `templates/`, the README and images. Reading them to understand behaviour
   is fine (ideas and lessons aren't covered by copyright); write the new
   code from the design in this document.
2. **Never copy devnagui's code** (upstream PR #107):
   `src/NoiseSuppressorFilter.ts` and the first noise model menu were
   contributed under the Hippocratic License. Write the noise-model effect
   fresh on top of `@sapphi-red/web-noise-suppressor` (MIT), or ask devnagui
   to relicense.
3. **Code written in Affid's sessions may be carried over** and relicensed
   under MIT: the files that didn't exist upstream and aren't devnagui's —
   `src/ui/**` (including `src/ui/dock/**`), `src/VoiceActivityGate.ts`,
   `public/worklets/voice-activity-gate.js`, `src/KrispNoiseFilter.ts`,
   `src/UserAudioMixer.ts`, `src/VoiceControls.ts`, `src/VideoBackground.ts`,
   `src/MaskSmoother.ts`, and the reconnect logic inside `LiveKitClient.ts`
   (`reconnectLater`, `reconnectNow`, `cancelReconnect` — rewrite it in the
   new structure rather than lifting it out of an upstream file). Before
   carrying a file over, check it has no pasted upstream snippets
   (`LiveKitCameraViews.ts` and `CameraViewDecorator.ts` mirror upstream
   behaviour; rewrite anything doubtful). Carry over the `--lk-*` design
   tokens and our CSS rules, not the upstream CSS around them.
4. **New ids and names** (see "Naming"): never `avclient-livekit` or
   "LiveKit AVClient", and new README text and images.
5. **Third-party code keeps its notices** in a `THIRD-PARTY-NOTICES.md` per
   module, from day one. These licences only ask for attribution:
   `@sapphi-red/web-noise-suppressor` and its RNNoise/Speex/GTCRN builds
   (MIT, BSD-3-Clause; depend on the npm package and copy its files at build
   time rather than vendoring them), MediaPipe runtime and selfie models
   (Apache-2.0, per the model cards), `livekit-client` and
   `@livekit/track-processors` (Apache-2.0). `@livekit/krisp-noise-filter` is
   not open source (`"license": "SEE LICENSE IN
https://livekit.io/legal/terms-of-service"`): keep it in its own module,
   `modular-av-livekit-krisp`, so every other zip holds only MIT/Apache/BSD
   code, and check LiveKit's terms allow redistributing it before
   publishing that module.
6. Foundry's own licence for module developers applies to every module, as
   usual.

## 3. The module family and plugin API

### Naming

Rules:

1. **Family prefix**: every Foundry package id starts with `modular-av`; the
   core is bare `modular-av`. Titles: "Modular A/V — voice & video" for the
   core, "Modular A/V: LiveKit", "Modular A/V: Dock", … for the rest (as of
   this writing, neither `modular-av` on foundryvtt.com nor `modular-av` /
   `@modular-av` on npm is taken; register them early).
2. **An extension takes its parent's id as prefix**: themes of the dock are
   `modular-av-dock-<theme>`, the Krisp add-on of the LiveKit module is
   `modular-av-livekit-krisp`. No `ui-` or `fx-` kind tokens ("FX" reads as
   canvas visual effects to Foundry users).
3. **Player-facing words**: services by the service's name (`livekit`,
   `p2p`, `jitsi`), effects by the device they affect (`mic-…`, `cam-…`),
   UIs by what they show (`dock`, `tokens`). The kind is machine-readable in
   `module.json`: `flags["modular-av"].kind` is `service`, `effect`, `ui` or
   `theme`.
4. **No trademarks** in ids or titles (no "Discord"; "Discord-like" only in
   descriptions if at all).
5. **One word per concept**, the same in ids, code, UI and docs:
   **service** (not provider), **effect**, **surface**, **contribution**,
   **command**, **participant** in code and **player** in the UI.
6. **Packages**: workspace directory = module id without `modular-av-`
   (`core/` for the core); npm name `@modular-av/<dir>`. Libraries
   (`api`, `kit`, `testing`) have no Foundry id.
7. **Releases**: tag `<module-id>-v<semver>` (e.g.
   `modular-av-livekit-v1.2.0`; no `/` or `@`), asset `<module-id>.zip`,
   a stable manifest URL per module (see "Releases").
8. **JavaScript-facing names** use `modularAV`: hooks
   `modularAV.<lowerCamelEvent>` (`modularAV.register`, `modularAV.ready`);
   each module's API on `game.modules.get("<module-id>").api`.
9. **Foundry-facing namespaces** use the module id: settings
   `<module-id>.<lowerCamelKey>` (registered by that module), flags scope =
   module id, the core's multiplexed socket `module.modular-av`, and the
   language file's root key = the exact module id (`"modular-av-livekit":
{ … }`), which also avoids the string-vs-parent key clash that makes
   Foundry drop a whole language file.
10. **CSS**: semantic tokens shared by every UI (defined by the core's UI
    contract) are `--mav-<token>` (`--mav-speaking`, `--mav-muted`); a UI's
    own tokens and classes carry its short name (`--mav-dock-radius`,
    `.mav-dock`, `.mav-dock-tile`, `.mav-dock-panel`). States are boolean
    attributes (`data-speaking`, `data-muted`, `data-deafened`), so a tile
    can be speaking and muted at once; enums only for real enums
    (`data-video="on|off|blocked"`, `data-layout`, `data-anchor`).

| Old name (fork or earlier draft)              | Name                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| core                                          | `modular-av`, dir `core/`, `@modular-av/core`                                                 |
| `api/`, `kit/`, `testing/`                    | `@modular-av/api`, `@modular-av/kit`, `@modular-av/testing`                                   |
| `modular-av-ui-dock`                          | `modular-av-dock`                                                                             |
| `modular-av-ui-scifi` / `-ui-fantasy`         | `modular-av-dock-scifi` / `modular-av-dock-fantasy`                                           |
| `modular-av-ui-dis`                           | none: the dock's default look                                                                 |
| vine-leaf frames                              | `modular-av-dock-vines`                                                                       |
| cameras on tokens                             | `modular-av-tokens` (themes `modular-av-tokens-<theme>`)                                      |
| Krisp inside the LiveKit module               | `modular-av-livekit-krisp`                                                                    |
| `modular-av-fx-noise`                         | `modular-av-mic-denoise`                                                                      |
| `modular-av-fx-background`                    | `modular-av-cam-background`                                                                   |
| `modular-av-embed` (as a service)             | `modular-av-embed`, kind `ui` (external call)                                                 |
| tag `livekit-v1.2.0`                          | `modular-av-livekit-v1.2.0`                                                                   |
| provider, `registerProvider`                  | service, `api.services.register`                                                              |
| `registerAudioEffect` / `registerVideoEffect` | `api.effects.register({ kind: "audio" \| "video", … })`                                       |
| `registerSurface`, `contribute`               | `api.surfaces.register`, `api.contributions.add`                                              |
| `api.actions`                                 | `api.commands`                                                                                |
| `ProviderPlugin` / `Provider`                 | `ServiceDefinition` / `ServiceConnection`                                                     |
| `--lk-*`, `.livekit-*`                        | `--mav-*` (shared), `--mav-dock-*`, `.mav-dock-*`                                             |
| `[data-state="speaking"]`                     | `[data-speaking]`                                                                             |
| dock's `registerTheme` / `registerLayout`     | `dock.themes.register` / `dock.layouts.register` on `game.modules.get("modular-av-dock").api` |

### Repository layout

One repository, **`modular-av`**, as a pnpm workspace (monorepo):

```
modular-av/
  packages/
    api/              → @modular-av/api: types only, shared by all packages
    core/             → "modular-av" (headless, no styled UI)
    kit/              → @modular-av/kit: pure UI helpers UI modules bundle
    testing/          → @modular-av/testing: fake Foundry, mock service,
                        contract suites, Playwright harness
    livekit/          → "modular-av-livekit"
    livekit-krisp/    → "modular-av-livekit-krisp"
    p2p/              → "modular-av-p2p"
    dock/             → "modular-av-dock"
    mic-denoise/      → "modular-av-mic-denoise" (RNNoise/Speex/GTCRN; the gate stays in core)
    cam-background/   → "modular-av-cam-background" (blur/replace, MediaPipe)
    later: jitsi/, dock-scifi/, dock-fantasy/, dock-vines/, tokens/, embed/
  tools/              → token server template (see "Credentials")
  docs/
```

One repository keeps the API, its types and every module in step (a change to
the API and all its users in one commit) and shares tooling; each module
still has its own `module.json`, zip and manifest URL. Separate repositories
per module are possible later if others maintain them.

### Releases and versions

- **Stable manifest URL per module.** GitHub's `releases/latest/download/…`
  doesn't work in a monorepo (the "latest" release is whichever module
  released last). Publish each module's current `module.json` to a fixed
  URL, e.g. GitHub Pages `https://<owner>.github.io/modular-av/<module-id>/module.json`,
  updated by the release workflow; `download` points at that release's
  `<module-id>.zip`.
- **The API version is the core's module version** (no separate number), so
  Foundry's own dependency check (`relationships.requires[].compatibility`)
  is meaningful; an API break is a new major of the core. The same holds
  for the dock and its themes.
- **Release in lockstep until 1.0** (changesets "fixed" group: every module
  gets the same version), then independently. What 1.0 needs: §19.
- The core's `module.json` **recommends** `modular-av-dock` and
  `modular-av-livekit`, and **conflicts** with `avclient-livekit` and other
  A/V client modules. At `setup`, the core also checks that
  `CONFIG.WebRTC.clientClass` is still its own (Foundry doesn't stop another
  module from replacing it) and warns the GM if not.

### What goes where

The rule that keeps the core lean without anyone rewriting anything:

- **If it has a look, it goes in a UI module** (markup, styles, layout, UI
  wording). The one exception is the core's minimal plain status, needed so
  its guarantees hold with no UI module.
- **If two modules would need it and it has no look, it goes in the core**
  (state, rules, media, Foundry plumbing, and anything that must exist only
  once per page: the Picture-in-Picture window, the popover layer, the
  style mirror for the Picture-in-Picture document) **or in `kit`** (pure
  helpers with no shared state: `el()`, tile fitting, drag and resize,
  keeping things on screen, popover positioning, level meter drawing). UI
  modules bundle `kit` (only what they use), so it costs the core nothing
  and nobody writes the same helper twice.
- **If it is heavy, optional or service-specific, it is a plugin.**
- **Guarantees live in the core, not in a UI**: mute in every state,
  fail-closed camera effects, "open mic" when the gate can't run, the GM's
  blocks, reconnecting. UI modules can't get them wrong, because none of
  them implements them.

**Trust model**: every installed module is same-origin JavaScript with full
access to Foundry and the browser; the core can't defend against a hostile
module. The guarantees protect against bugs, races and misbehaving
services, not against malicious add-ons. The core freezes its API object
and records which module issued each command (for diagnostics).

So the core contains: the Foundry A/V client class (Foundry's single
plug-in point) and the camera dock host, credentials and identity, the
session state machine and reconnect policy, the local media pipeline
(devices, effect chain, voice gate, push to talk), **audio playback**
(per-player volume, deafen, output device — calls must be heard even with
no UI module), the control plane over Foundry's socket, settings, the plugin
registries and the extension points below. It contains no dock, panel or
settings window and no styles beyond its plain status.

### Credentials and identity

The fork (like upstream) keeps the LiveKit API key and secret in a **world
setting** (`liveKitConnectionSettings`), and every player's browser signs
its own access token with them (`src/utils/auth.ts`). Foundry sends world
settings to every client, so **any player can read the secret** from the
console and mint tokens for any room or identity in that LiveKit project
(admin rights, recording, impersonation, a LiveKit Cloud bill). The fork
also logs the signed token at debug level. Never repeat this.

The core provides one `auth` facility that services use:

1. **GM relay (default)**: the secret is stored only on the GM's device (a
   `client`-scope setting, i.e. that browser's local storage, entered in
   the GM's settings). A player's core asks for a join token over the
   core's socket; the GM's core checks who is asking (Foundry's server
   authenticates the sender's user id on socket messages), and the service
   module signs a short-lived token **for that user id only**, bound to the
   world's room, with publish rights from Foundry's `BROADCAST_AUDIO` /
   `BROADCAST_VIDEO` permissions and no admin rights. Tokens are refreshed
   before they expire and on every reconnect. Cost: a GM must be online for
   players to join or reconnect (normal for a session; with several GMs, any
   one may answer). Show "waiting for the GM" plainly.
2. **Token server**: for tables that want to join without a GM online, the
   service calls a URL that returns tokens after checking a per-world shared
   key or Foundry identity; `tools/` has a tiny template (Node, Cloudflare
   Worker).
3. **Insecure dev mode**: the secret in a world setting, labelled as
   insecure, only for local servers (`livekit-server --dev`).

Identity is always the Foundry **user id** (from the token, not
self-asserted metadata). "The same user in two tabs" is a core policy (the
newer tab wins; the older one shows "joined elsewhere" and stops
reconnecting). Display names shown in the UI come from Foundry's user (and
character), never from what a service reports, and are always set as text
(Foundry renders `data-tooltip` as HTML).

**GM authority**: "block audio/video" is Foundry's own
`permissions.BROADCAST_AUDIO/BROADCAST_VIDEO` on the user (server-stored,
only GMs can change it; Foundry's own dock writes it). The core enforces it
in three layers: the token grants no publish right, a service with a
`moderation` capability is told to mute/remove server-side (LiveKit's
server API, with the GM-held secret), and every receiving core refuses to
play or attach media from a blocked player (which is how P2P enforces it).

### Control plane over Foundry

Everything that isn't media goes over Foundry, the same for every service:
tokens, blocks, deafened, effect badges ("blur on"), "speaking while
muted", and later breakout membership — via the core's socket, User
documents and `user.broadcastActivity` (Foundry already broadcasts
`av.muted/hidden` this way). Services stay thin media transports, which
keeps LiveKit, P2P and Jitsi alike and their contract tests small. P2P
signalling also uses the core's socket. Deafened stays self-reported
(nothing else is possible); the UI must not present it as enforced.

### Contract with Foundry's own A/V code

Foundry already has an A/V system the core must fit into rather than
duplicate (checked against the v14 client source):

- **Lifecycle**: `init` → `setup` → `initializeRTC()` (creates `AVMaster`,
  which constructs the client class and calls its `connect()` without
  awaiting) → `initializeUI()` (instantiates `CONFIG.ui.webrtc`) → socket
  listeners → `ready`. So the client's `initialize()`/`connect()` run before
  socket listeners exist and before `ready`: a GM-relay token can't be
  fetched inside them.
- **`AVMaster`** runs voice-activity detection (through
  `client.getLevelsStreamForUser`), `broadcast()`, push to talk (the
  `core.pushToTalk` keybinding calls `game.webrtc._onPTTStart`, which does
  nothing unless `connect()` resolved `true`), its own reconnect loop
  (`reestablish()`, every 3 s), and honours `world.mode` (disabled, audio
  only, video only).
- **`AVSettings`** stores `users.<id>.muted/hidden/blocked/volume/popout`,
  `muteAll`, `voice.mode`, push-to-talk settings, `audioSrc`, `videoSrc`,
  `audioSink`, dock position; Foundry's dock buttons write it, and
  `AVMaster.onSettingsChanged` turns changes into `toggleAudio`/`toggleVideo`
  calls on the client.

The contract:

| Concern                                           | Rule                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store of record                                   | `AVSettings` for everything Foundry already models (mute, hide, block, volume up to 100%, devices, voice mode, push-to-talk key and delay, `muteAll`). The core's store derives from it and writes back through it. Only what Foundry lacks lives in core settings: deafen, gate sensitivity, effects, volume above 100%. |
| `connect()`                                       | Starts the session state machine and **resolves `true` at once**, so push to talk works and `reestablish()` never runs; the real join waits for `ready` and a token, then follows the core's own reconnect policy.                                                                                                        |
| `toggleAudio` / `toggleBroadcast` / `toggleVideo` | Become session commands (applied in every connection state).                                                                                                                                                                                                                                                              |
| `world.mode`                                      | The master switch: disabled → the core stays idle; audio-only / video-only → the matching tracks only. A `world.turn` change → reconnect.                                                                                                                                                                                 |
| Voice activity | One detector only: the core's gate (milestone 3). `getLevelsStreamForUser` returns null, so `AVMaster`'s detector stays idle and never calls `toggleBroadcast`. In "always" and voice activity modes the gate's transitions go through `AVMaster.broadcast` (Foundry's speaking flag, the activity others see, the dock), and Foundry's own calls are set back to what the gate hears; in push to talk mode Foundry's key decides. |
| Push to talk                                      | Reuse Foundry's `core.pushToTalk` keybinding; never register a second one.                                                                                                                                                                                                                                                |
| Foundry's dock                                    | It plays audio through its own `<video>` elements: give it **video-only** streams, since the core plays audio (otherwise everyone is heard twice), and apply its volume slider through the core.                                                                                                                          |

### Extension points ("plug-holes")

What UI modules build on and other modules plug into; all of it is the
core's public API (versioned with the core), tested with the fake Foundry
and the mock service:

- **Registries** (`api.services`, `api.effects`, `api.surfaces`,
  `api.contributions`): each has `register`/`add`, `list`, `get` and
  `onChange`. Registration is **synchronous inside the `modularAV.register`
  hook** (fired once during `setup`) and closed after it, with a clear error
  for late registration (a plugin that `await`s before registering would
  otherwise silently miss it). Definitions are small; heavy code loads in
  `create()`.
- **State**: one observable store with everything a UI shows — the session
  (status, "waiting for the GM", reconnect attempt and next try, final
  reason), participants (Foundry user, display name, avatar, colour, audio
  and video present, speaking, muted, deafened, blocked, volume, connection
  quality), the local player (input mode, gate open, permissions, each
  effect's state: off, starting, running, failed), devices, and the
  connected service's capabilities. Subscribe with a selector; changes are
  **batched in a microtask** (not per animation frame: hidden tabs pause
  those, and a mute must apply at once); UIs throttle their own rendering.
- **Meters**: mic and remote levels are **not** in the store:
  `api.meters.subscribe(participantId, listener)` runs only while someone
  listens, at a capped rate.
- **Commands** (`api.commands`): everything a UI can do — mute, deafen,
  set a player's volume, input mode and sensitivity, choose devices, turn
  effects on and off, leave, rejoin, reconnect now, GM actions. They return
  when done or throw `{ code, params }` with a default message (UIs may word
  it their own way). A UI never touches the service or tracks.
- **Media attachment**: `api.media.attach(participantId, "camera" |
"screen", element)` puts a participant's video in any element, in
  Foundry's window or the Picture-in-Picture window. The core watches
  visibility (one observer per document) and calls the service's
  `setSubscription`, so hidden videos stop downloading whatever the UI does.
  It returns a detach function but also **cleans up by itself** when the
  element leaves the document (Foundry's dock re-attaches on every render
  and never detaches). UIs never attach audio: the core plays it.
- **Windows and layers**: `api.windows.pip` (request, current owner,
  release, an event when the document changes) and a shared popover layer,
  because a page gets one Picture-in-Picture window at a time and two UI
  modules must not fight over it.
- **Surfaces**, of two kinds:
  - **Exclusive**: `cameras` (where videos are shown, including the
    controls Foundry puts on each camera) and `settings` (the settings
    window). The GM picks the module per world; a player may override
    `cameras` only. Chosen at `setup`, so changing it needs a reload. The
    core always installs **its own thin camera dock host** as
    `CONFIG.ui.webrtc` (a subclass of Foundry's `CameraViews`, because
    `AVMaster` calls `ui.webrtc.render()` and `setUserIsSpeaking()`): with
    no `cameras` surface it behaves like Foundry's dock; with one, it hides
    itself and the surface mounts its own element. So UI modules never
    subclass Foundry classes, and only the core tracks Foundry's UI changes.
    A cameras-on-tokens module therefore never shows cameras twice.
  - **Additive**: player-list badges and menu items, the voice panel and
    other controls; any number of modules may add them.
- **Contributions**: small declared items any module adds and every UI
  renders in its own style: settings sections, **quick controls** (e.g.
  cam-background's "Blur" toggle with a strength slider, mic-denoise's
  model picker), **participant actions** ("Mute for me", GM "Block
  video"), **indicators** (badges, e.g. "blur on", "Krisp"), **status
  rows** (e.g. the service's codec and server region). Each declares an id,
  a label (an i18n key or plain text, never HTML), an icon, where it
  applies, a state selector and a command. A custom render function is
  allowed for the rare case a declaration can't express, and discouraged.
- **Settings**: schemas are Foundry `DataField`s (which
  `game.settings.register` accepts and Foundry renders natively), registered
  by each module **under its own id**. Use `scope: "user"` (new in v14,
  follows the player across devices) for per-player choices such as theme,
  layout and surfaces; `client` for device ids and the GM's secret; `world`
  for the GM's table choices. UI modules render the same schemas in their
  own settings window.
- **Socket**: one multiplexed core socket, `api.socket(channel)`, so plugins
  don't each need `"socket": true`.
- **Assets**: `api.assetUrl(moduleId, path)` resolves worklets, WASM and
  models through Foundry's route prefix.
- **Plain status**: with no UI module filling them, the core shows
  reconnecting, "waiting for the GM", open mic, an effect that failed (camera
  kept off) and deafened through `ui.notifications` and a plain player-list
  badge. Foundry's dock can't show these itself.
- **A UI contract**: what every UI module must show (mute, deafen,
  speaking, blocked, connection state, "open mic", an effect that failed),
  checked by a shared suite in `@modular-av/testing` that every UI module
  runs.

```ts
interface ModularAV {
  version: string; // = the core's module version
  state: Store<AVState>; // get(), subscribe(selector, listener)
  meters: Meters; // subscribe(participantId, listener) while shown
  commands: AVCommands; // setMuted, setDeafened, setVolume, setEffect…
  media: {
    attach(
      id: ParticipantId,
      source: "camera" | "screen",
      el: HTMLVideoElement,
    ): () => void;
  };
  windows: { pip: PipWindowManager };
  services: Registry<ServiceDefinition>;
  effects: Registry<EffectDefinition>;
  surfaces: Registry<SurfaceDefinition>;
  contributions: Registry<Contribution>;
  socket(channel: string): Channel;
  assetUrl(moduleId: string, path: string): string;
}
```

### Plugin interfaces (sketch)

```ts
// As built in milestones 2 and 4 (packages/api/src/service.ts). Services
// register their own Foundry settings.
interface ServiceDefinition {
  id: string; // "livekit", "p2p"
  label: string;
  needsToken(): boolean; // false: no GM relay, connect() gets null (P2P)
  canSignTokens?(): boolean; // this device holds the GM's secret
  signToken?(request: TokenRequest): Promise<string>; // runs on the GM's client
  mediaOwnership: "core" | "service"; // "service": the service makes its own tracks
  create(context: ServiceContext): Promise<ServiceConnection>; // lazy: import() the SDK here
}

interface ServiceConnection {
  readonly capabilities: Observable<ServiceCapabilities>; // reported once connected (e.g. Krisp only on Cloud)
  connect(
    room: RoomSpec,
    token: string | null,
    signal: AbortSignal,
  ): Promise<void>;
  disconnect(reason: "user" | "switching" | "unload"): Promise<void>;
  publish(
    track: MediaStreamTrack,
    source: TrackSource,
  ): Promise<PublishedTrack>;
  replaceTrack(
    published: PublishedTrack,
    track: MediaStreamTrack,
  ): Promise<void>;
  setMuted(published: PublishedTrack, muted: boolean): Promise<void>; // signalling/bandwidth only
  setSubscription(
    participant: ParticipantId,
    source: TrackSource,
    options: { enabled: boolean; maxQuality?: "low" | "medium" | "high" },
  ): void;
  moderation?: {
    forceMute(p: ParticipantId, source: TrackSource): Promise<void>;
    remove(p: ParticipantId): Promise<void>;
  };
  on<E extends keyof ServiceEvents>(
    event: E,
    handler: ServiceEvents[E],
  ): () => void;
  getStats(): Promise<ConnectionStats>;
}

type TrackSource = "microphone" | "camera" | "screen" | "screen-audio";

interface RemoteTrack {
  participant: ParticipantId; // the Foundry user id from the token
  source: TrackSource;
  track: MediaStreamTrack;
}

// ServiceEvents: state ("connected" | "resuming" | "lost" | "failed", with a
// ServiceError), participant joined/left, track added/removed (RemoteTrack),
// speaking (if the service detects it), quality (per participant, shown as
// ParticipantState.quality), token expiring. participantJoined means a media
// path to them is up: entering the room on a server, the link in a mesh;
// trackAdded for someone comes after their participantJoined.

interface ServiceError {
  code:
    | "auth"
    | "token-expired"
    | "network"
    | "full"
    | "kicked"
    | "duplicate"
    | "room-closed"
    | "unsupported";
  final: boolean; // final reasons stop the core's reconnecting
}

// As built in milestone 3 (packages/api/src/effects.ts). Effect modules
// register their own Foundry settings, as services do: no `settings`, no
// `update()`.
type EffectDefinition = AudioEffectDefinition | VideoEffectDefinition;

interface AudioEffectDefinition {
  id: string; // "rnnoise"
  kind: "audio";
  label: string;
  stage: "denoise" | "voice" | "post"; // order: denoise → voice → post → gate
  exclusiveGroup?: string; // "noise-suppression": one running per group
  cost: "light" | "medium" | "heavy"; // shown to players
  isSupported(): boolean;
  create(context: AudioEffectContext): Promise<AudioEffect>; // lazy
}

interface VideoEffectDefinition {
  id: string; // "background"; one video effect runs at a time
  kind: "video";
  label: string;
  exclusiveGroup?: string;
  cost: "light" | "medium" | "heavy";
  isSupported(): boolean; // and the core needs MediaStreamTrackProcessor
  create(context: EffectContext): Promise<VideoEffect>; // lazy
}

interface EffectContext {
  readonly signal: AbortSignal; // turned off before create() resolved
  readonly fail: (error: unknown) => void; // broke later: the core takes it out
}

interface AudioEffectContext extends EffectContext {
  readonly audioContext: AudioContext; // the core's capture context, 48 kHz
}

interface AudioEffect {
  // An AudioNode chain in the core's capture AudioContext
  readonly input: AudioNode;
  readonly output: AudioNode;
  dispose(): void;
}

interface VideoEffect {
  // Resolves with the processed track once its first frame is out
  start(input: MediaStreamTrack): Promise<MediaStreamTrack>;
  replaceInput(input: MediaStreamTrack): Promise<void>; // camera restart: keep state
  dispose(): void;
}
```

Rules that come with these interfaces:

- **The core owns local tracks.** It acquires devices, runs the effects and
  hands the final track to the service; services must **never stop, clone or
  re-acquire** core tracks. Mute is `track.enabled = false` on the core's
  final track (WebRTC sends silence/black), applied in every connection
  state; `setMuted` only tells the service (signalling, bandwidth).
- **`mediaOwnership: "service"`** (for a service that can't take outside
  tracks) shows "this service controls your microphone" and disables the
  gate and effects for it. No service needs it so far (lib-jitsi-meet
  takes outside tracks, §16), and the core doesn't implement it yet.
- **Reconnect once**: a service reports `resuming` while its own transport
  recovers (LiveKit does for about a minute); the core starts its backoff
  only on `lost`, with a fresh token each attempt.
- **Fail closed, defined**: the camera is published only after
  `VideoEffect.start()` resolved; a core watchdog on frame timestamps
  unpublishes the camera if the effect stalls or throws, never falling back
  to raw video. (Output that runs but is wrong, e.g. a broken mask, can't be
  detected.)
- **Effect chain**: one active effect per `exclusiveGroup` (Krisp, RNNoise
  and the browser's own noise suppression fight each other: the core turns
  the browser's off while one runs). Service-specific effects (Krisp)
  register as normal effects in the core's chain, not on the published
  track after the gate. Video: one active video effect in the first
  release.
- **Speaking**: from the service when it reports it, otherwise computed by
  the core at a low rate.
- **Screen share and a second camera**: `source` covers them; UIs that show
  one video per player show the camera.
- **Breakout rooms** (the fork's `LiveKitBreakout.ts`): out of scope for the
  first release; later a core concept (rooms in state, GM `moveTo(user,
room)`, capability-gated).
- **Lazy services**: Foundry loads every enabled module's code at startup,
  so a service module registers only a small definition and imports its SDK
  in `create()`. A CI bundle-size check enforces this for every plugin.

### `modular-av-dock`: themes and layouts

The dock is the Discord-like UI: it fills the `cameras` and `settings`
surfaces and adds the voice panel and player-list decorations, built with
`kit`. Its themes and layouts are the dock's own API
(`game.modules.get("modular-av-dock").api`, versioned with the dock), not
the core's; another UI module may offer theming differently, or not at all.

Two things are kept apart, because players will want to mix them (a fantasy
look in a plain dock, or the default look in free-floating frames):

- **Layouts** decide where the cameras are: the dock layouts (left, right,
  top, bottom, floating, own window) and a **scattered** layout: every
  camera is its own element, anchored to a corner or edge of the screen (or
  dragged anywhere), with its position and size saved per player (`user`
  scope), and per scene when the GM wants (a portrait by each side of a
  tavern table). More via `dock.layouts.register` once a module needs it
  (§17); fitting, drag, resize and keeping tiles on screen stay in the
  dock and `kit`.
- **Themes** decide how everything looks: the dock, tiles, voice panel and
  popovers, in any layout. Themes restyle; they don't change behaviour.

What a theme can use, all part of the dock's public API:

- **Design tokens**: every colour, radius, spacing, font, shadow, the
  speaking ring and tile frame as CSS custom properties (`--mav-*` shared,
  `--mav-dock-*` the dock's own). A simple theme only sets tokens.
- **Stable hooks for structure**: documented classes and attributes
  (`.mav-dock`, `.mav-dock-tile`, `.mav-dock-tile-video`,
  `.mav-dock-tile-frame`, `.mav-dock-panel`, `[data-speaking]`,
  `[data-muted]`, `[data-placement="scattered"]`, `[data-anchor="top-left"]`,
  …). Changing these is a breaking change (a major version of the dock).
- **Tile frames**: a frame bigger than the video, e.g. vine leaves
  overflowing its edges, declared rather than scripted: artwork (SVG or a
  9-slice image for `border-image`, so it scales to any tile size), how far
  it reaches past the video on each side (so fitting and on-screen clamping
  allow for it), an optional video shape (oval, arch, shield, via
  `mask-image`/`clip-path`), and variants per anchor (leaves growing from
  the corner the tile sits in) or per state (glowing while speaking,
  greying while muted). Frames never take clicks (`pointer-events: none`)
  except where the dock puts its controls.
- **Optional slots** for anything more: extra elements per tile or in the
  panel that the dock creates on request, rather than themes reaching into
  the DOM.
- A theme registers with `dock.themes.register({ id, label, stylesheet,
frames, preview, suggestedLayout })`; the dock loads only the selected
  theme's stylesheet and assets, scopes them to its UI, and mirrors them
  into the Picture-in-Picture window through the core's style mirror.

Rules for themes (from the UI contract and the dock):

- **Mute, deafen, speaking, blocked and connection state**, and the
  player's name on hover, are always shown; a theme may restyle these
  indicators but not hide them.
- Faces stay visible: a frame may cover at most a set margin of the video,
  and video shapes keep the centre of the picture.
- Text contrast (WCAG AA) and visible focus rings; controls stay reachable
  by keyboard in the scattered layout too.
- Cheap to run: static artwork, animations only on `transform` and
  `opacity`, no per-frame scripts, everything off under
  `prefers-reduced-motion`.
- Scattered tiles never cover Foundry's own controls (sidebar, scene
  controls, hotbar, chat); the dock keeps them clear.

### Testing per module

Three tiers, because Foundry itself is licensed per user and can't be
downloaded in public CI:

1. **Unit tests** (Vitest) with a small **fake Foundry** (`game`, `Hooks`,
   `CONFIG`, settings, socket, users) and the **mock service** (in-memory
   participants, fake tracks, scripted drops, `resuming`/`lost`, token
   expiry) from `@modular-av/testing`. The core's tests need no UI: they
   drive commands and assert on the store.
2. **Browser tests** (Playwright, Chrome's fake devices) on a harness page
   with stubbed Foundry globals: the media pipeline, effects, the dock.
3. **Full Foundry end-to-end** in the local WSL world (or a self-hosted CI
   runner): the `AVMaster` contract, Foundry's dock fallback, real services.

Contract suites in `@modular-av/testing`:

- **Service contract**, against each real server in Docker: connect with a
  relayed token, publish, subscribe, mute in every state, `setSubscription`,
  speaking, a 20 s outage and recovery (one reconnect, not two), token
  expiry, duplicate identity, blocked publisher, leaving on purpose.
- **UI contract**, with the mock service: every required state visible,
  every command reachable by mouse and keyboard, a sample plugin's
  contributions rendered, the Picture-in-Picture window working.
- **Effects**: output runs, CPU budget, fail closed, exclusive groups.
- **Themes**: screenshot baselines for the dock's default theme only; other
  themes get automated checks (indicators visible, contrast, faces not
  covered), since per-theme baselines for every layout × anchor × state
  churn too much.
- Browsers: GPU Chrome first, but also Firefox, Safari and Foundry's
  desktop app (Electron) for what they support (insertable streams, Document
  Picture-in-Picture and screen share differ or are missing there; degrade
  plainly).

## 4. Local environment (WSL)

- **Foundry VTT** (Node.js build) running in WSL2, a test world with a GM
  (and a second GM, to test the token relay with either) and several
  passwordless players (e.g. `Player1`–`Player4`). Install each
  module under development by symlinking its `dist/` into
  `Data/modules/<id>`.
- **Browsers**: a GPU-accelerated Chrome matters (camera effects, Document
  Picture-in-Picture, real frame rates). Driving Windows Chrome over its
  remote debugging port from Playwright in WSL is usually easier than GPU
  Chrome inside WSL:

  ```
  chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\chrome-test\player1
  ```

  Use one browser profile per test user. Chrome's fake media flags help
  automation:

  ```
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
  --use-file-for-fake-video-capture=person.y4m
  --use-file-for-fake-audio-capture=speech.wav
  ```

  A still photo gives an identical mask every frame; add noise and slight
  motion (ffmpeg `noise=alls=10:allf=t` and an oscillating `crop`) to test
  segmentation stability.

- **Servers** (Docker):
  - LiveKit: `livekit-server --dev` (keys `devkey` / `secret`) or the Docker
    image; add `--bind 0.0.0.0` for other machines.
  - Jitsi: the official `docker-jitsi-meet` compose setup.
  - TURN: `coturn`, to test restrictive networks.
- **Network impairment** to test reconnecting: Linux `tc netem` (loss, delay,
  outages) in WSL or Docker networks, or Chrome DevTools' network
  conditions/offline via CDP. Test: a 20 s outage, flapping Wi-Fi, a frozen
  main thread (a busy loop in the page), a second tab with the same user,
  the GM going offline (no token relay) and coming back.
- **Test harness**: Playwright scripts that log in N users, wait for
  `game.ready`, drive the UI, take screenshots, read state through the core's
  API, and measure (CDP `Performance.getMetrics`, process memory via
  `/proc/<pid>/smaps_rollup` PSS, long tasks via a `longtask`
  `PerformanceObserver`). Keep it in the repository, not in a scratchpad.

## 5. Architecture of the core

```
  UI modules (dock, tokens…) · themes · plugin contributions
        │ state (subscribe)   ▲ commands   ▲ media.attach
┌───────▼─────────────────────┴────────────┴───────────────────┐
│ Extension points: registries, state store, meters, commands, │
│  media attachment, PiP window manager, surfaces, settings,   │
│  socket, plain status (when no UI module)                    │
├──────────────────────────────────────────────────────────────┤
│ Foundry integration                                          │
│  A/V client class + camera dock host (CONFIG.ui.webrtc),     │
│  AVSettings/AVMaster contract, keybindings,                  │
│  control plane (socket, User permissions, activity)          │
├──────────────────────────────────────────────────────────────┤
│ Credentials and identity                                     │
│  GM token relay / token server / dev mode; user id identity; │
│  GM blocks (token rights, moderation, receiver refusal)      │
├──────────────────────────────────────────────────────────────┤
│ Session (service-independent)                                │
│  Connection state machine (waiting for token, connecting,    │
│  connected, resuming, lost, retrying, left), participants ↔  │
│  Foundry users, mute/deafen/volume, speaking, stats,         │
│  reconnect policy                                            │
├──────────────────────────────────────────────────────────────┤
│ Local media pipeline + audio playback (service-independent)  │
│  mic → denoise → voice → post → gate → final track → service │
│  camera → video effect (watchdog) → final track → service    │
│  remote audio → elements (Web Audio only above 100%) → sink  │
└──────────────────────────────────────────────────────────────┘
```

Principles:

- **The session owns the truth.** UI modules show the state store
  (including "reconnecting", "blur starting", "open mic") and change it
  only through commands; they never assume a state or reach the service.
- **Small and stable API over features**: add to the core only what a
  second module would otherwise duplicate; everything else starts in a
  plugin and moves down only when that is proven.
- **The media pipeline produces plain `MediaStreamTrack`s** (insertable
  streams, AudioWorklets), so any service can publish the result. Keep
  **one capture `AudioContext`** at 48 kHz (RNNoise needs it) for local
  processing, suspended when unused. Play remote audio through media
  elements (Chrome needs remote WebRTC audio attached to an element); a
  separate playback context only while someone is boosted above 100%.
- **Fail closed for privacy.** If a video effect isn't running yet, stalls
  or failed, don't publish raw video (keep the camera off and say so). If
  the voice gate can't run in voice activity mode, show "open mic" plainly.
  Mute is applied to the core's own final track, in every connection state.
- **Never expose secrets to players**: a service's secret lives only on the
  GM's device or a token server.
- **Swap effects atomically** (start the new one, then replace), never
  stop-then-start with raw media in between.
- **Reconnect like Discord**: retry forever with backoff (1, 3, 5, 10, 20,
  then every 30 s) and at once on the browser's `online` event, unless the
  reason is final (left on purpose, joined elsewhere, removed, room closed).
  Start only when the service reports `lost`, not while it is `resuming`.
  Fetch a fresh token and re-apply mute state on every (re)connect.
- **Everything heavy is lazy and opt-in**, and keeps its state across camera
  restarts.

## 6. Lessons learnt

### Foundry VTT v14

- `CONFIG.ui.webrtc` is read in `initializeUI` after `init`: replace the
  camera dock class there. Foundry's `CameraViews._onRender` moves the dock
  element next to `#interface` on **every render** and sets `element.hidden`;
  a custom dock must live with that (or keep its content in a child it can
  move, e.g. to a Picture-in-Picture window).
- ApplicationV2: `window: { positioned: false }` stops Foundry's positioning;
  don't name members `position`/`setPosition` (they collide). Hook names come
  from constructor names, which the bundle minifies.
- Foundry's CSS uses cascade layers: unlayered module CSS wins; use `:where()`
  for zero-specificity resets of Foundry's button styles; Foundry styles
  `.active` buttons, so use your own state classes.
- Tooltips: `data-tooltip` (Foundry renders it as HTML — only put trusted,
  localized text there); `data-tooltip-class` styles them. They only work in
  Foundry's own window.
- AVMaster quirks: `broadcast()` calls `setUserIsSpeaking` on the dock with
  the _intent_ to broadcast, not actual speech; AVMaster toggles audio/video
  when `client.users.<self>.hidden/muted` change; `AVSettings.set` updates
  memory at once and saves with a debounce; a change of `world.turn` makes
  every client reconnect.
- Foundry has a deprecated global `Module` (alias of `foundry.packages.Module`)
  with a setter that stores overrides. Libraries built with Emscripten that
  read a global `Module` (MediaPipe!) break; hide it while they start and
  restore it afterwards.
- The language file must not have a key that is both a string and a parent
  (`a.b` and `a.b.c`): Foundry drops the whole file. Validate at build time.
- Settings scopes: `world` (stored on the server, readable by **every**
  client — never put secrets there; only GMs can write), `user` (new in v14:
  per player, follows them across devices), `client` (this browser only:
  device ids, the GM's secret). A setting's `onChange` already re-renders:
  don't render twice.
- Foundry's server authenticates the sender of socket messages (the user id
  arrives with each message); a GM's client can trust it when deciding who
  gets a token.
- Foundry's `CameraViews` buttons write `AVSettings` and set the `<video>`
  element's volume directly; "block" writes the user's
  `BROADCAST_AUDIO/BROADCAST_VIDEO` permissions. See §3 "Contract with
  Foundry's own A/V code".

### LiveKit (livekit-client 2.19)

- `TrackProcessor`: `init/restart/destroy/processedTrack`. When a processor is
  attached, `LocalTrack.mediaStreamTrack` returns the processed track; the raw
  one is `track.mediaStream.getAudioTracks()[0]`. `setProcessor` initializes
  the new processor before stopping the old (atomic); `stopProcessor()` hands
  the sender the raw track.
- Muting a camera stops the device; unmuting restarts it and calls
  `processor.restart` (destroy + init) — expensive for MediaPipe unless you
  keep its state.
- Code that skips muting unless the room is `Connected` leaves the mic live
  during reconnects. Mute the track in any state and re-apply after
  reconnecting.
- Adaptive stream pauses videos it thinks are hidden; it knows about video
  elements in a **Document Picture-in-Picture** window (keeps them), but not
  about elements in a plain `window.open` pop-up (would pause them).
- LiveKit's own reconnect gives up after about a minute; then
  `RoomEvent.Disconnected(reason)` — nothing reconnects unless you do it. The
  server's `CONNECTION_TIMEOUT` means it stopped hearing the client: a network
  drop, or a main thread frozen for longer than the ping timeout. A player
  with the heavy background model kept timing out like this and had to reload.
- Krisp: only on LiveKit Cloud; it fires `enable-lk-krisp-noise-filter` on its
  processed track and comes back disabled after a restart (re-enable it). Its
  package is 6 MB: import it only when chosen.
- Defaults that work: VP8, simulcast layers h180/h360 with a 4:3 h720 capture,
  the `speech` audio preset, DTX on (a gate that sends digital silence lets
  DTX save bandwidth).

### Audio

- Noise models via `@sapphi-red/web-noise-suppressor` (RNNoise, Speex, GTCRN)
  as AudioWorklets with WASM. GTCRN runs the whole model once per 768-sample
  hop inside one render quantum: bursty, may glitch on weak CPUs; RNNoise is
  the safer default for low-end tables. Turn off the browser's own noise
  suppression while a model runs (they fight each other).
- The voice gate (`public/worklets/voice-activity-gate.js`): automatic floor
  with calibration and quietest-segment tracking, manual threshold, 300 ms
  hold, ramps. Post only open/close transitions to the main thread, and
  periodic levels only while a meter is shown (the fork posts 62.5/s always).
- Measure the meter from the raw mic, not the processed (possibly muted)
  track. Per-user volume above 100% needs Web Audio (a playback context
  separate from the capture one): suspend it when no one is boosted.
- `HTMLMediaElement.setSinkId("")` selects the default output ("default" maps
  to "").

### Camera background (MediaPipe via @livekit/track-processors 0.8.1)

- Segmentation (`segmentForVideo`) and drawing are **synchronous on the main
  thread**, every frame, with no frame cap on Chrome: tens of ms per frame on
  weak GPUs. The 16 MB float32 multiclass model ("High") is much cleaner
  (hair, around the head) but several times heavier; the selfie model
  ("Standard", 250 KB) is the sane default.
- Do better than the fork: segment in a worker (OffscreenCanvas) or at about
  15 fps reusing the last mask; capture at 640×480 when an effect is on; keep
  the segmenter across camera restarts; ask for one confidence mask; scale a
  background image to the frame once (the library re-uploads it every frame).
- Steady the mask: use confidence masks (not the yes/no category mask) and
  blend over time (exponential moving average, about 100 ms time constant, so
  it is frame-rate independent). See `src/MaskSmoother.ts` (it saves and
  restores the shared WebGL state it touches).
- Publish the camera only once the effect runs (privacy); on failure keep it
  off and tell the user.
- Bundle the WASM and models with the module (no CDN at runtime); pin model
  versions (`float16/1/selfie_segmenter.tflite`,
  `float32/1/selfie_multiclass_256x256.tflite`).

### UI/UX

- Build DOM with a tiny `el()` helper (textContent/setAttribute only, no
  innerHTML) — this kept the fork free of XSS.
- Popovers and menus must open in the **document of the element they belong
  to** (the dock may be in a Picture-in-Picture window) and size to that
  window.
- Document Picture-in-Picture (Chrome/Edge, secure contexts only): copy
  Foundry's style sheets (link the same hrefs, copy inline rules, copy the
  `<html>`/`<body>` classes), move the content (videos keep playing), forward
  only the push-to-talk key to Foundry, use native tooltips there.
- Grid tiles: choose the column count that maximizes 16:9 tile size for the
  count and space; only scroll below a minimum tile size. Focus layout: the
  focused tile is the largest 16:9 that fits, shown with `object-fit:
contain`.
- Consistency rules the owner asked for: one name per thing ("Voice & Video
  Settings" window, "Voice & video settings" popover, "Noise cancellation",
  "players" not "users"), sentence case, the same control for the same
  setting everywhere, positive wording ("Show other players' video").
- Keep the voice panel in the dock optional; a horizontal dock's panel is a
  column using the height.

## 7. Review findings to carry over (don't repeat these)

From the security and performance reviews of the fork, and the design review
of this document (a correctness review of the fork's code is pending):

- **Credentials**: the LiveKit key and secret sit in a world setting every
  player can read, and each player signs their own token, so players can
  mint any token for that project; the signed token is logged at debug level
  (`src/utils/auth.ts`). See §3 "Credentials and identity".
- **Privacy**: mute ignored while reconnecting (UI says muted, mic live);
  camera published raw before the blur starts, and raw on failure; Voice
  Activity without a running gate (music mode, no WASM, gate failure) is an
  open mic while the meter pretends to gate; processor swaps
  (stop-then-start) send raw audio briefly; "Block audio/video" by the GM
  isn't enforced on receivers; "deafened" is self-reported.
- **Performance**: per-frame MediaPipe on the main thread; MediaPipe rebuilt
  on every camera restart; background image re-uploaded every frame; Krisp
  loaded on every Cloud connect (fixed in krisp.14); gate reports 62.5/s;
  every voice-state change re-syncs the whole dock and forces layout; the
  voice panel polls `getStats` every 2 s even when hidden (the connection
  popover twice per tick); AudioContexts never suspended; meters animate
  `width`.
- Sound already: no XSS (no innerHTML), GM checks on socket commands, no
  runtime CDN loads, tiles reused across renders, hidden tiles let adaptive
  stream pause video, asset URLs resolved through Foundry's route prefix.

## 8. What to carry over

Only Affid's own code (see §2), as starting points to adapt to the new
structure:

- Pure UI helpers → `kit`: `src/ui/dom.ts`, popover/menu positioning from
  `Popover.ts` and `Menu.ts`, `LevelMeter.ts` drawing, the grid fitting,
  drag/resize and on-screen clamping from `src/ui/dock/*`.
- Page-wide services → `core`: `src/ui/dock/DockWindow.ts` (the
  Picture-in-Picture window and style copying) becomes `api.windows.pip`;
  the popover layer.
- Look → `dock`: `src/ui/buttons.ts`, `controls.ts`, `Avatar.ts`, the
  dock (`src/ui/dock/*`: focus/compact layouts,
  docked/floating/collapsed/Picture-in-Picture, tile windows), voice panel,
  connection details, user menu, player list decorations
  (`src/ui/VoicePanel.ts`, `ConnectionPopover.ts`, `UserMenu.ts`,
  `PlayersListDecorator.ts`), our design tokens and CSS rules.
- Voice gate → `core`: `public/worklets/voice-activity-gate.js`,
  `src/VoiceActivityGate.ts`.
- Per-user volume and mute/deafen → `core`: `src/UserAudioMixer.ts`,
  `src/VoiceControls.ts`.
- Krisp → `livekit-krisp`: `src/KrispNoiseFilter.ts`, as an effect in the
  core's chain (`exclusiveGroup: "noise-suppression"`).
- Background effect → `cam-background`: `src/VideoBackground.ts`,
  `src/MaskSmoother.ts`; its controls (`src/ui/videoBackgroundControl.ts`)
  become declared contributions that the dock renders.
- The settings window's design (sections, groups, wording) — rebuilt in
  the dock from scratch, since `src/LiveKitAVConfig.ts` is
  upstream-derived.
- Not the token signing (`src/utils/auth.ts` is upstream code and the
  wrong model): write the GM relay fresh.

Not worth carrying: the classic-UI paths (Foundry's own dock decorated), the
`useExternalAV` web client, Tavern Patreon server support (unless wanted).

## 9. Milestones

Real constraints first (Foundry's A/V code, a real service, tokens, real
tracks), then a second, very different service to prove the abstraction,
and only then the UI on top, so the API isn't reshaped under a finished UI.

1. Repository: pnpm workspace, MIT `LICENSE`, `THIRD-PARTY-NOTICES.md`,
   Vite + TypeScript strict + ESLint + Prettier per package, language-file
   validation, the fake Foundry and mock service, CI (unit and browser
   tiers), per-module manifest publishing, the local Foundry world.
2. **Vertical slice** with Foundry's own dock: `api` + `core` (the
   `AVSettings`/`AVMaster` contract, session, store and commands, camera
   dock host, plain status, registries) + a minimal `modular-av-livekit`:
   join with a **GM-relayed token**, hear and see each other, mute in every
   state, reconnect (once), duplicate identity, GM block, against
   `livekit-server --dev` and then LiveKit Cloud. Settle the voice-activity
   question (§3 contract) here.
3. Media pipeline in `core`: devices, capture context, gate, stages and
   exclusive groups, atomic swaps, the camera watchdog, fail-closed rules,
   "speaking while muted".
4. `modular-av-p2p` (plain WebRTC over the core's socket, Foundry's TURN
   settings) — proves the service API with a very different service before
   it is frozen.
5. `kit` + `modular-av-dock` (dock, voice panel, settings window, player
   list, Picture-in-Picture via `api.windows.pip`) on the public API only,
   and the UI contract suite. If the dock needs something the API lacks,
   add it to the API rather than working around it.
6. `modular-av-mic-denoise` (RNNoise default, Speex, GTCRN) and
   `modular-av-livekit-krisp`, lazy, with their controls as contributions.
7. `modular-av-cam-background`: segmentation in a worker or at capped fps,
   lazy, fail-closed, with measured budgets. **First release** (lockstep
   versions), with a migration note and settings import for players of the
   old module.
8. `modular-av-jitsi` (check first whether lib-jitsi-meet accepts outside
   tracks; otherwise `mediaOwnership: "service"`).
9. The scattered layout, then `modular-av-dock-vines` (tile frames) as the
   first theme, to prove the layout and theming API; then
   `modular-av-tokens` and the external call mode if still wanted.

Performance budgets to hold (measure in the harness, GPU Chrome): no long task
over 50 ms from the modules with effects off; service SDKs and effect code
not loaded until used (bundle-size check per module); a camera effect at its default
quality ≤ 15% of the main thread; no memory growth over a 2-hour session; an
idle connected session runs no timers more often than once a second while the
tab is hidden.

## 10. Findings from milestone 2

Verified while building and testing the vertical slice (core +
`modular-av-livekit`, Foundry 14.369, livekit-client 2.22.4,
livekit-server 1.13.8):

- **Foundry's SimplePeer client never re-enables the mic after an unmute in
  "always" mode** (`toggleAudio` only acts while already broadcasting). The
  core computes what it sends from the sources of truth (`AVSettings` mute,
  deafen, permissions, world mode, broadcast intent) instead of trusting
  the toggle calls.
- **`AVMaster.onSettingsChanged` checks `keys.includes("world.turn")` on
  fully flattened keys**, so a TURN change never reconnects. A world-mode
  change makes Foundry ask every client to reload.
- **Foundry's `user.active` lags right after a page loads** (a second tab
  of a user shows as inactive on the GM's side; a fresh page may see no GM
  online). The token relay asks every GM user and signs for any known
  user: the server names the sender, who needs a live socket anyway.
- **A GM's page is busy for seconds after `ready`** (compendium indexing),
  so token replies can arrive late. Players keep listening for every
  request they sent while they wait.
- **LiveKit writes `track.enabled` in `mute()`/`unmute()`** on the track it
  was given (the core's own). The service calls them only in the direction
  the core already applied, and the core applies its own state again after
  each sync. `stopLocalTrackOnUnpublish: false` and `disconnect(false)`
  keep LiveKit from stopping the core's tracks; refused media is paused
  (`setEnabled(false)`), not unsubscribed, so it can come back.
- **`livekit-client` ships pre-bundled** (its dist inlines
  `@livekit/protocol`, protobuf, `webrtc-adapter`…): the build follows
  runtime dependencies to list every bundled package in a module's notices,
  and fails on licences outside MIT/ISC/0BSD/BSD/Apache-2.0.
- **API changes**: `ServiceConnection.unpublish()`; services register their
  own Foundry settings, so `ServiceDefinition` lost `settings`/`secrets` and
  gained `canSignTokens()`, and `signToken(request)` takes no secrets;
  `ServiceContext` is just the participant. `AVState.local` reports device
  errors (`microphoneError`, `cameraError`).
- **Not done yet**: rooms are named after the world id (two installs sharing
  a LiveKit project with the same world id would share a room); server-side
  moderation (a modified client keeps its publish rights until it
  reconnects, though every receiver refuses its media); the token server and
  the insecure dev mode (§3 auth modes 2 and 3).

## 11. Findings from milestone 3

Verified while building and testing the media pipeline (core only,
Foundry 14.369, Chromium from Playwright 1.64, livekit-server 1.13.8):

- **The pipeline as built**: microphone → capture context (one 48 kHz
  `AudioContext`, suspended without a microphone) → effects by stage →
  voice gate worklet → one output track, the same for the whole session
  whatever devices and effects do, so the service never gets
  `replaceTrack` for audio. Swaps connect the new path before cutting the
  old one; a new effect replaces the running one of its group only once it
  runs, and if it fails the old one stays. Camera → effect → watchdog: while
  an effect is wanted, only its frames go out, and only once the watchdog
  saw them flow; starting, stalled (no frame for 1 s), failed or
  unsupported, the camera is held, never raw. The capture code, the
  microphone chain and the camera chain are lazy chunks.
- **The gate silences the pauses itself** in voice activity mode; the
  track stays enabled, so the service isn't told "muted" at every breath and
  DTX saves the bandwidth. It runs in every mode ("detect" outside voice
  activity) for the speaking indicator and "speaking while muted" (700 ms of
  speech while muted or deafened; local only, the others aren't told).
- **Foundry doesn't re-initialize `AVMaster` on a voice mode change** (no
  `broadcast()`): the core tells Foundry what the gate hears whenever the
  gate starts or stops driving, and its own `broadcast()` echoes must not
  count as the push to talk key (they would leave the mic on after a
  switch to push to talk).
- **Others' Foundry activity (mute, hide, speaking) never refreshed the
  core's state** in milestone 2; a test passed only because something else
  kept refreshing. The core now listens to the `userActivity` socket event
  (A/V activity only, not cursors) and rebuilds the state in a microtask,
  since its listener runs before Foundry's. Foundry calls those handlers
  with `(userId, activity)`; the fake socket passes `(data, senderId)`.
- **LiveKit's active-speaker detection doesn't fire on Chrome's default fake
  microphone** (short beeps at about -42 dB), while the gate does. Remote
  speaking still prefers the service's detection when it has one; whether to
  prefer the sender's gate (it hears quiet microphones) is open.
- **Autoplay**: in Chromium, the capture context runs without a gesture,
  after joining (the "Join Game" click) and after a reload, even without
  `--autoplay-policy=no-user-gesture-required`. Not checked in Firefox,
  Safari or Foundry's Electron app. `resume()` is never awaited, since it
  waits for a gesture where one is needed.
- **The watchdog reads a clone with `MediaStreamTrackProcessor`**, which
  keeps going in a hidden tab (unlike `requestVideoFrameCallback`); it is
  Chromium only, so video effects are unsupported elsewhere. An effect
  driven by `requestAnimationFrame` stops in a hidden tab, so its camera is
  held until frames return.
- **Foundry's `voice.activityThreshold` is the loudest FFT bin in dB**, not
  a level, and v14 has no control for it: the core keeps its own input
  sensitivity (auto, or a fixed level in dBFS) as a client setting.
- **Devices**: the camera runs only while video can go out (in a call,
  allowed, not hidden), so its light means something; the microphone stays
  while muted and is freed once the player left. A device that goes away is
  captured again, else the system default runs and the core returns to the
  player's choice on `devicechange`. The browser's noise suppression is off
  while a "noise-suppression" effect runs (a new capture; the sent track
  stays).
- **Test tooling**: under WSL's mirrored networking a connection to an
  unused port on 127.0.0.1 times out after about two minutes instead of
  being refused, which stalled Playwright's "server already running?" check
  on every browser-tier run (it now takes seconds, on `::1`). Three Foundry
  pages without a GPU take about 100 s to load and relay tokens (the same on
  main), so the Foundry suite allows 180 s per test. Chrome's fake
  microphone plays a generated WAV there (1.5 s tone, 1.5 s silence), long
  enough for sustained speech. The browser tier runs the real pipeline with
  the mock service and two test effects (`?service=mock&effects=test`).
- **Bundles**: the core's entry budget is 72 KB; JSDoc comments are dropped
  from module bundles (about 8 KB of the core's entry), licence comments
  and annotations kept.
- **API changes**: `api.effects` (`Registry<EffectDefinition>`, split by
  kind, `EffectContext` with `signal` and `fail`); `AVState.devices`;
  `LocalState.openMic`, `speakingWhileMuted`, `effects`,
  `inputSensitivity`, `cameraHold`; commands `setEffectEnabled`,
  `setInputSensitivity`, `setDevice`, error codes `unknown-effect` and
  `unsupported`. `@modular-av/testing` has fake capture contexts, fake
  effects, frame watching, unplugging and ended tracks.
- **Not done yet**: push to mute (the push to talk key in "always" and
  voice activity modes) is ignored, as in milestone 2; `api.meters`
  (milestone 5; the worklet already reports levels on request); a capture
  context at 48 kHz fed by a 44.1 kHz microphone may fail in Firefox
  (mixed sample rates), unchecked.

## 12. Findings from milestone 4

Verified while building and testing `modular-av-p2p` (core and P2P,
Foundry 14.369, Chromium from Playwright 1.64, coturn 4.7.0):

- **The mesh as built**: one `RTCPeerConnection` per other player, the W3C
  "perfect negotiation" pattern (the smaller user id is polite), each side
  sending on its own two lines (microphone, camera). It announces which
  media id is for which source, and which of them carry a track, with
  each description (so they apply together) and on its own when a track
  comes or goes, which needs no renegotiation. `replaceTrack` changes no
  line; `unpublish` sends nothing on the line and says so; `setMuted` does
  nothing (the core's disabled track already sends silence or black). A
  side receives only on lines the other announced and it accepts: every
  other line, and every line `setSubscription(false)`
  refused (GM blocks, a player's own mute or hide), is negotiated
  inactive, so that media never arrives at all, which is the enforcement a
  mesh has. Offers may carry 8 audio or video lines at most and no data
  channel. The camera's share of the upload (2.4 Mbps across the links,
  150 to 800 kbps each, half size past 4 links) is applied after each
  negotiation. The connection code is a lazy chunk; the entry is about 5
  KB.
- **Signalling** goes over the core's socket (channel `p2p`): `hello` to
  everyone, `welcome` back, then descriptions, candidates and source lists
  to one session, `bye` on leaving. Every message names a session (one per
  connection) and, for a link, an epoch; the sender must be a user of the
  world, and each user may send 200 messages per 10 s (counted in fixed
  windows, so a flood costs a constant amount per message). No token and
  no GM:
  Foundry's server names every sender and the rights are Foundry's
  permissions, so `ServiceDefinition.needsToken()` is false.
- **"Connected" for a mesh**: `connect()` resolves after listening for a
  second (being alone counts); a participant joins once the link to them
  is up. The service reports `resuming` while links are down and none is
  up (most likely the player's own network) and `lost` after 30 s of that.
  A single broken link shows as that participant's quality "lost"; its
  impolite side starts a new link (the next epoch) after 15 s, and after
  45 s the player is dropped (they left, and no longer hold a cap slot)
  and sent a hello, which brings them back if they are still there: a
  known hello while the link is down starts it afresh. The other side may
  make this side rebuild a link once per 5 s at most. A GM's change to a
  player's rights doesn't rebuild the call (the core rejoins only for
  services with tokens).
- **Cap**: `maxParticipants` (default 6, 2 to 10) counts everyone; GMs are
  always let in. Everyone ranks the call the same way (GMs first, then the
  earliest join, then the user id) and a player past the cap leaves with
  `full` (final), also when a GM's arrival pushes them out. The join time
  is the sender's own clock and kept across reconnects of a page; a
  modified client could claim an early place (the trust model accepts it).
- **The same player in two tabs**: the newer session wins; the older one
  sees its hello and ends with `duplicate`. Foundry delivers a message
  with `recipients` to every tab of those users, the sender's own tabs
  too, and one without them to every other tab, so tabs of one user hear
  each other.
- **Foundry's socket**: a disconnect of more than 5 s reloads the page
  when the socket comes back, and its client gives up after 10 tries;
  the server notices a vanished client only after its ping timeout (10
  minutes), but a closed tab at once (`userConnected` false). So a
  signalling outage is either short or ends the page; the outage that
  matters to a mesh is the media path, which ICE handles.
- **A page that just loaded handles socket messages late**: without a
  GPU, a Foundry page is busy for tens of seconds after `ready`, and
  messages sent to it in that time reach its handlers 30 to 45 s late, in
  one burst. So a joining player's second of listening ends before it has
  read any welcome; it joins, then counts the others (and leaves if past
  the cap) once it reads them. Messages are really lost when Foundry's
  socket reconnects (the server doesn't keep what it sends meanwhile), so
  a joining player says hello again after 2, 6 and 15 s (a known hello
  brings a new welcome), a link that hasn't connected 15 s after it was
  made counts as down and is started afresh, and when Foundry's socket
  connects again every link says its sources again and withdraws an offer
  still waiting for its answer (`setLocalDescription({ type: "rollback"
  })`, after which the browser asks for a new one). Foundry also replays the
  socket events it buffered before `ready` to every listener, so the
  core's channel handler (registered at `init`) can see such a message
  twice; P2P isn't listening before its session starts, so it doesn't
  matter there, but a channel used before `ready` must expect repeats.
- **TURN**: Foundry's `world.turn` is `server` (no relay of the GM's own:
  Foundry's SimplePeer client then uses SimplePeer's public STUN servers,
  which are P2P's default too) or `custom` (one TURN URL with a user name
  and password). P2P follows a change of it, and of its own STUN and relay
  settings, with `setConfiguration` and an ICE restart on every link.
  Foundry keeps the TURN password in a world setting every player can
  read, so anyone at the table can use that relay for anything: the same
  class of problem as the LiveKit secret (§7). A later option: the GM's
  device holds coturn's `static-auth-secret` and the relay signs
  short-lived TURN credentials per player (`needsToken()` is a function so
  that mode can switch it on).
- **Chrome leaves loopback out of a page's ICE candidates once the page
  may use the camera or microphone**, so a TURN server on 127.0.0.1 is
  unreachable from Foundry pages (it worked from a blank page). The test
  configs pass `--allow-loopback-in-peer-connection`. Docker Desktop's
  container addresses aren't reachable from WSL, and publishing coturn on
  the LAN address would open the relay to the network.
- **coturn in Docker** relays between its own allocations when its relay
  sockets bind to 127.0.0.1 inside the container (`--relay-ip=127.0.0.1
  --allow-loopback-peers`), so with everything relayed only port 3478 is
  published. It answers STUN a while after its log says it started: the
  test setup waits for a binding response.
- **Test tooling**: `@modular-av/testing` has a fake `RTCPeerConnection`
  (signalling states with implicit rollback, media ids unique across both
  sides, `negotiationneeded` and candidates as tasks, as in browsers) and
  the harness's Vite server relays signalling between pages the way
  Foundry's socket does. Under Vitest's fake timers a zero timeout set
  inside a timer is due a millisecond later. The P2P contract runs in the
  browser tier with direct links (no server), and relayed through coturn
  in `pnpm test:services`, where pausing coturn is the 20 s outage. In
  the Foundry suite four pages at once don't load within a minute without
  a GPU: a test closes a page it no longer needs before opening another.
- **API changes**: `ServiceDefinition.needsToken()`; `connect(room, token:
  string | null, signal)`; `ParticipantState.quality` from the service's
  `quality` event; what `participantJoined` means, in the `ServiceEvents`
  docs. The service contract takes `auth: "none"`, has a three-player
  test, and its harness page can publish a track again. The core rejoins
  on a rights change only when the service needs tokens. The plain status
  for `full` now says to rejoin when someone leaves.
- **Not done yet**: screen share in P2P (`publish` refuses it: it needs a
  line per source added by renegotiation); `maxQuality` is ignored (the
  core doesn't send it yet); `getStats` per participant (milestone 5's
  connection details); GM-signed TURN credentials; the event emitter is
  copied in the mock, LiveKit and P2P (a shared runtime helper would break
  "`api` is types only"). The reviews' remaining notes: a malicious
  player's candidates can make others probe any address (inherent to
  WebRTC), hello and bye tell every user in the world who joins, and a
  player past the cap may show briefly to the others before leaving.

## 13. Findings from milestone 5

Verified while building `kit`, `modular-av-dock` and the UI contract
(Foundry 14.369, Chromium from Playwright 1.64, livekit-server 1.13.8,
coturn 4.7.0):

- **The UI as built**: the dock fills the core's three surfaces
  (cameras, settings, players) on the public API only. The core hosts
  them: its camera dock host renders none of Foundry's parts and hands
  its element to the cameras surface once (Foundry still places it by
  `#interface` on every render; `hidden`, `isVertical` and `isHorizontal`
  follow where the surface says it is, so the hotbar makes room), and its
  "Voice & Video Settings" window replaces Foundry's A/V settings in the
  settings menu and as `game.webrtc.config`, with a way back to Foundry's
  own (the world's mode, the relay server). A surface that throws gets
  Foundry's dock or window instead. The world picks the cameras and
  settings UI, a player may pick their own cameras UI (`user` scope), all
  on reload. With a cameras surface mounted the plain status is quiet; a
  players surface replaces the core's badges.
- **Foundry discovers modules only when its server starts**: a module
  linked into `Data/modules` later is invisible (`game.modules` lacks it)
  until Foundry restarts, whatever the world's module settings say.
- **Every player looked muted and hidden to the others** until they
  changed an A/V setting (since milestone 2): Foundry broadcasts a
  player's own `{ muted, hidden }` when its settings load or change,
  computed as "set, or nothing sent" (`isAudioEnabled()`), and at load the
  core has captured nothing yet. The core now broadcasts it again whenever
  it changes. The fake Foundry broadcasts it as Foundry does.
- **`canBroadcast` can't tell a GM's block from the world's mode**; UIs
  need `AVState.worldMode` (what the mode allows) to show "blocked" only
  where the mode allows the kind.
- **Hidden videos stop downloading**: the core watches attached elements
  with one intersection and one resize observer per document, made in that
  document's window (an element in the Picture-in-Picture window is seen
  against that window), and follows elements moved between documents (the
  removal watcher too). A video shown nowhere pauses after 3 s (a P2P
  mesh renegotiates on each pause) and resumes at once; `maxQuality`
  follows the tallest element showing it, in device pixels. LiveKit's
  adaptive stream is off: it only sees elements LiveKit attached. UIs must
  keep attached videos laid out (`visibility: hidden`, never
  `display: none`).
- **Meters**: the local level comes from the voice gate's reports (on only
  while someone listens), others' from an analyser in a meter context of
  its own, sampled in the element's window (the opener's timers slow
  down in a hidden tab while a Picture-in-Picture window shows). A meter
  runs only while its element is on screen in a visible document.
- **Document Picture-in-Picture** works in headless Chromium from a click
  (Playwright's `evaluate` counts as a gesture, so a refusal can't be
  tested that way). The core mirrors the page's style sheets into the
  window and keeps them in step (sheets added or removed, `<html>` and
  `<body>` classes), shows native tooltips there from Foundry's
  attributes (parsed as text) and forwards the push to talk key. Moving
  the dock into the window keeps its videos playing.
- **Moving a playing `<video>` pauses it** unless the browser has
  `moveBefore` (Chrome 133+): kit's `placeInOrder` moves only what is out
  of place and resumes what was playing otherwise.
- **Popovers** are kit's, on the native Popover API (`popover="manual"`,
  the top layer) with their own closing rules: an `auto` popover closes on
  the press of its own anchor and reopens on its click. One is open per
  document; one opened from inside another doesn't close it.
- **LiveKit's receiver stats leave the audio's packet counts out**: the
  service reads each receiver's `getStats()` itself, counting loss since
  its last reading.
- **Test tooling**: the browser harness runs the other players as cores in
  the same page on the same mock service (`?players=`), loads every
  module's language file, registers a sample plugin (`?sample=1`) and a
  failing test effect, and refuses the voice gate to a page opened with
  `?gate=broken` (open mic). happy-dom tests never load what pages link
  to. A fake `ModularAV` (`createFakeApi`) tests UI modules without the
  core. Players need the Trusted role to send audio and video.
- **Bundles**: the core's entry is 101.3 of 110 KB (the budget was raised
  from 72 KB in this milestone); the dock's is about 52 of 80 KB, its CSS
  about 14 of 40 KB (now checked too, `styleBudgetBytes`).
- **Reviews** (code and security, no CRITICAL or HIGH left in the code):
  fixed a Picture-in-Picture document kept alive by its observers, a
  meter timer left in a closed window, the grid and countdown staying
  with the main window while the dock was in Picture-in-Picture, the
  push to talk key forwarded while typing there, secrets of other types
  shown, `crypto.randomUUID()` failing on plain HTTP, and more (see the
  `fix(core)` and `fix(dock)` commits). `happy-dom` (tests only) moved to
  21.0.4 for an advisory.
- **API changes**: `api.surfaces`, `api.contributions` (control,
  participant action, indicator, status row, settings section with
  `secrets`), `api.meters`, `api.windows.pip`, `api.stats` with the
  optional `ServiceConnection.getParticipantStats` and `ConnectionStats`
  `jitterMs`/`relayed`; commands `setVoiceMode`, `setReceiveVideo`,
  `setHiddenByMe`; `AVState.worldMode`, `LocalState.receiveVideo` and
  `chosenDevices`, `ParticipantState.hiddenByMe`. All additive for
  services.

## 14. Findings from milestone 6

Verified while building `modular-av-mic-denoise` and
`modular-av-livekit-krisp` (Foundry 14.369, Chromium from Playwright 1.64
and Windows Chrome 155 with a GPU, livekit-server 1.13.8, LiveKit Cloud,
`@sapphi-red/web-noise-suppressor` 0.4.1, `@livekit/krisp-noise-filter`
0.4.5):

- **The noise models as built**: three effects of the "noise-suppression"
  group in the denoise stage (RNNoise first and recommended, Speex,
  GTCRN), each one worklet node in the capture context. The library's
  worklets and WASM are copied from the npm package at build time
  (`modularAV.assets` in package.json, also served by the test harness)
  and fetched through `api.assetUrl` only for the model turned on. The
  entry is 1.6 KB, the lazy chunk with the library 4.8 KB, the files
  about 650 KB. No setting of its own: the core's effect choice is the
  model choice, which the dock's effects section shows (a settings
  section of the module's would have shown the same choice twice).
- **The library's worklets compile their model after the node is made,
  send silence until then, and never say when they are ready**; a model
  that fails to load is an unhandled rejection inside the worklet, not a
  `processorerror`, and its loaders don't check the HTTP status. The
  module loads a small worklet of its own first (`worklets/ready.js`) that
  wraps the library's processors and posts once its model runs;
  `create()` resolves only then, or fails with `TimeoutError` after 10 s.
  Model files are checked to be WebAssembly (`CompileError` otherwise).
  Without this, a swap was silent for a moment and offline rendering
  measured nothing.
- **Costs** (rendered offline, 10 s at 48 kHz, best of three, share of
  one core): RNNoise 1.8%, Speex 0.6%, GTCRN 4.8% in Windows Chrome with a
  GPU on a Ryzen 7 5800X3D; 1.6%, 0.5% and 4.3% in headless Chromium on
  the same machine. Labelled light, light, medium. GTCRN runs its whole
  model once per 768-sample hop (16 ms), about 0.8 ms of work there: with
  Windows' 10 ms audio callbacks it crackles only on a CPU about 10 times
  slower, with 128-frame callbacks (some macOS setups) from about 3.5
  times slower. The dock warns that a medium or heavy model may crackle.
  Chrome's AudioWorkletGlobalScope has no `performance.now`, so per
  quantum timings inside a worklet are only good to 1 ms.
- **Steady tones are noise to the models**: GTCRN removes a 440 Hz tone
  by about 49 dB, Krisp removes it too; RNNoise and Speex keep it. A
  voice-like sound (harmonics of 140 Hz, swelling) passes all of them
  within 0.5 dB. The Foundry suite's fake microphone is now that sound
  (1.5 s on, 1.5 s silence, as before).
- **Stalled models**: the core takes a denoise effect out (`StalledError`)
  when it sends exact digital silence for 1.5 s while the raw microphone
  hears sound (peak at or above about -60 dBFS); quiet pauses don't count
  and any sound from the effect starts over. The taps (analysers) exist
  only while such an effect runs. An effect that may gate noise to
  digital silence says so (`silencesNoise`, Krisp) and isn't watched.
  RNNoise, Speex and GTCRN send quiet, never zero, over noise.
- **Browsers throw `InvalidAccessError` when told to disconnect a node
  from one it isn't connected to**: a recapture (turning the browser's
  noise suppression off) cut the old source off everything, and removing
  the watchdog's tap then stopped the new microphone. The fake audio graph
  now throws the same way.
- **Krisp** is a 6.4 MB obfuscated file (2.0 MB gzipped; 5.3 MB of it the
  engine as an inline string) that bundles its own parts of
  livekit-client and imports nothing. It needs a real LiveKit `Room`:
  `onPublish(room)` checks the project through the room's server and
  token and reports usage there (room name and id, participant identity,
  durations); without a published room it refuses to turn on. Its models
  come from `integrations.livekit.io`. `init` calls `applyConstraints` on
  the track it gets (noise suppression off, the context's rate), which a
  generated track refuses with `OverconstrainedError`; the bridge's track
  accepts them, since the core already turns the browser's noise
  suppression off. `onPublish` doesn't wait for its own `setEnabled`.
  Krisp only takes and gives tracks: the bridge turns the chain's node
  into a track and Krisp's output back into a node in the capture
  context. Checked on LiveKit Cloud: the server reports the Cloud
  edition, Krisp turns on and the others hear the player.
- **Krisp is not redistributed**: LiveKit's terms (§3.1) allow passing on
  only plugins LiveKit names as redistributable, and none names Krisp. The
  browser downloads the pinned file from jsDelivr (the same bytes as the
  npm tarball, CORS `*`, cached a year) with a SHA-384 integrity check and
  imports that copy from a blob URL; Krisp's own later downloads aren't
  pinned. This is the one exception to "no runtime CDN loads" (§7). The
  module is held back from releases (`modularAV.releaseHold`) until
  LiveKit answers a note about it. LiveKit's pricing lists enhanced noise
  cancellation on every Cloud plan; background voice cancellation may
  count as voice isolation minutes, so it stays off.
- **Test tooling**: a second browser project, "effects"
  (`*.effects.spec.ts`), plays a voice over steady noise that never goes
  quiet, so a gap shows as a run of exact zeros (a swap between models
  leaves at most about 650 samples, the new model's own delay). The
  pipeline harness records what the service was given, has a denoise test
  effect that sends silence, and fails module files under
  `?broken=<path>`; the harness loads several modules
  (`?module=dock,mic-denoise`). `effectContract()` in
  `@modular-av/testing` checks an audio effect module: it runs and the
  player is heard, it renders within the budget of its cost and outputs
  sound, it leaves the chain when off, its group swaps without a gap, and
  it fails closed without its files. The service contract checks the
  features a server reports.
- **The Foundry suite on a quiet machine** (load under 1 before the run):
  main failed the first test of `av`, `media` and `p2p` twice in a row,
  the same three, and passed every dock test; the load (10 to 12) came
  from the suite itself, headless Chrome drawing three Foundry canvases
  in software (its GPU process at about 800% CPU), and LiveKit's server
  saw the page miss ICE consent checks. The failing specs are the ones
  using Foundry's own camera dock. **Fixed after the milestone**: the
  test pages turn Foundry's canvas off (its "noCanvas" client setting,
  `core.noCanvas` in `localStorage`, set before the page loads). The
  whole suite then passed, 24 of 24 in 6.5 minutes instead of 16, each
  test in about 10 s instead of one to two minutes.
- **API changes** (all additive for services): `ServiceCapabilities.features`,
  `EffectDefinition.requires`, `AudioEffectDefinition.silencesNoise`,
  `EffectStatus` "unavailable" (UIs hide such effects). The core keeps
  the features a connection last reported while the call reconnects, so
  Krisp doesn't restart each time, and forgets them once the session is
  left. `modular-av-livekit` has its own module API with the joined room.
- **Bundles**: mic-denoise's entry 1.6 of 8 KB, livekit-krisp's 3.6 of
  10 KB.

## 15. Findings from milestone 7

Verified while building `modular-av-cam-background` and preparing the
first release (Foundry 14.369, Chromium from Playwright 1.64 and Windows
Chrome 155 with an AMD RX 6950 XT, `@mediapipe/tasks-vision` 1.1.1,
livekit-server 1.13.8):

- **The effect as built**: two video effects of one exclusive group,
  `background-blur` and `background-replace` (the dock shows them as one
  choice, "Camera background"), on MediaPipe's selfie segmenter, the
  multiclass model as "High". The page creates a
  `MediaStreamTrackProcessor` on the camera and a
  `MediaStreamTrackGenerator`, and transfers their streams to a module
  worker (`worker.js`, built as a second entry from `modularAV.workers`,
  started through `api.assetUrl`): the page does nothing per frame. The
  worker segments at up to 15 per second, less when frames are slow (a
  segmentation's GPU work shows when its frame is read back, so the whole
  frame's time counts), steadies the confidence mask over time (100 ms
  time constant), blurs only the background (weighted by it, so the
  person doesn't halo) or replaces it with an image scaled once per frame
  size, and never sends a frame without a mask (or image). MediaPipe
  shares the worker's OffscreenCanvas, so its masks are textures of the
  compositor's context; every pass restores the bindings it touches.
- **Measured** (blur, 640×480 at 30 fps, `pnpm bench:camera`): in GPU
  Chrome the worker takes no measurable main thread (0.3% baseline), no
  long tasks, 30 fps, 1.9 ms per segmentation (High 2.5), 0.35 ms per
  frame drawn. The same pipeline on the page's thread took 3 to 5% and a
  226 to 439 ms long task while starting. In headless Chromium (WebGL in
  software) the worker takes 0.4% and sends about 12 fps; the page's
  thread variant took 99.7%. What limits software WebGL is reading frames
  back (about 70 ms a frame, `new VideoFrame(canvas)`,
  `transferToImageBitmap` and `readPixels` alike), not the drawing (about
  5 ms); High runs there at 0.5 fps, so the worker uses Standard where the
  renderer is SwiftShader, llvmpipe or similar. On a GPU High costs
  barely more than Standard and is much cleaner around hair.
- **MediaPipe in a worker**: its loader uses `importScripts` in classic
  workers and `import()` otherwise; the module-worker build
  (`vision_wasm_module_internal.*`, SIMD only) sets
  `globalThis.ModuleFactory`, so a module worker works in the harness
  (served from source) and in Foundry alike, and Foundry's global `Module`
  is no concern there. On the page's thread the module build loads with
  `import()` and an empty `wasmLoaderPath`. The models aren't on npm: they
  are downloaded at build time from Google's versioned URLs and checked
  against pinned SHA-256 hashes (`modularAV.downloads`). The WebAssembly
  statically links TensorFlow Lite, Abseil, Protocol Buffers, XNNPACK,
  FP16 and **Eigen (MPL-2.0)**; the module's notices list them.
- **Fail closed, by the core's watchdog**: starting, stalled (a worker
  busy for 3 s), failed (its files, a lost GPU context, a crash) or
  unsupported, the camera is held. A worker that closes itself or hangs
  sends nothing, so the page pings it every 2 s and fails the effect after
  three pings in a row go unanswered (counted in pings, so throttled
  timers in a hidden tab don't fail a live worker). In software WebGL a
  swap between blur and replace holds the camera about 2.5 s: the new
  worker starting starves the old one on the one GPU thread.
- **The generated fake camera** (`scripts/foundry/fake-camera.ts`, a
  drawn person before a bookshelf, swaying, with noise) is what the camera
  browser project and the Foundry suite use. The selfie model finds the
  person (confidence 1.0 on him, 0.0 around); the multiclass model doesn't
  take a drawing (it does on photos), so High is only checked for running,
  cost and failing closed. Tests compare fine detail (luma gradients) on
  the shelf and the face: blur takes the shelf from 12.6 to 1.1 in the
  harness and from 6.5 to 2.7 in the video the GM receives over LiveKit,
  and keeps the face.
- **Memory**: the soak (`camera-soak.bench.ts`) samples the PSS of the
  browser's whole process tree (only the browser process names the
  profile) and the page's heap; in software WebGL the GPU's memory is
  process memory. Two hours of blur: the page's heap flat, the processes
  at 840 ± 5 MB from the 30th minute on (the second hour's slope -0.009 MB
  a minute); the first half hour dipped twice to about 716 MB as the
  browser released memory, which a straight line over the whole run reads
  as 0.28 MB a minute.
- **Foundry v14 hands world setting values over parsed**
  (`storage.get("world").getItem` returns the object, not the JSON string
  its documentation describes); client settings are JSON strings in
  `localStorage` under `<module>.<key>`. A world can hold several Setting
  documents with one key.
- **The first release**: every package at 0.1.0 (Changesets "fixed"
  group); `modular-av-livekit-krisp` stays held back. The core recommends
  the dock and LiveKit. Players of LiveKit AVClient get their choices once
  (each module brings its own: sensitivity, noise model, dock layout,
  camera background); a GM is offered the old server once, and the
  removal of the old world setting with the readable secret. See
  `docs/MIGRATING.md`.
- **Test tooling**: Windows Chrome can't reach WSL's `[::1]`, so the
  bench has a harness of its own on 127.0.0.1:5175. A worker's requests
  carry the worker's URL as referer, so the harness also fails files named
  in a cookie (`mav-broken`). The size check counts an entry with the
  chunks it imports when it loads (it counted the entry file alone) and
  checks workers (`modularAV.workerBudgetBytes`). `videoEffectContract()`
  in `@modular-av/testing` checks a video effect module.
- **API changes** (additive): `ChoiceOption.image`, a picture of the
  option; the dock shows such a choice as thumbnails and reads its
  options again when its value is one not shown.
- **Bundles**: cam-background's entry 10.6 of 11 KB (the contribution
  declarations and settings; everything that runs is lazy), its worker
  229 of 240 KB (58 KB gzipped; unminified, as every module), MediaPipe's
  runtime 13.8 MB and the models 0.25 and 16.4 MB.

## 16. Findings from milestone 8

Verified while building and testing `modular-av-jitsi` (Foundry 14.369,
Chromium from Playwright 1.64, lib-jitsi-meet v2205.0.0+7d14f385,
docker-jitsi-meet `stable-11248-2`):

- **The service as built**: the core's own tracks, a GM-relayed HS256
  token per player (one room, the Foundry user id in `context.user.id`,
  no name, `moderator: "false"`), every call through the bridge (Jitsi's
  own peer-to-peer mode off). The entry is 4.7 KB plus a 3.2 KB token
  chunk (budget 10 KB); the connection code is a 13 KB lazy chunk; the
  SDK a separate 1.14 MB file loaded only for a call.
- **lib-jitsi-meet takes outside tracks**
  (`createLocalTracksFromMediaStreams`), with three catches. Its video
  `mute()` removes the stream, stops the track and asks `getUserMedia`
  for a new one on unmute: video is never muted through it (the core's
  disabled track sends black). Its `dispose()` stops the stream it was
  given: each track goes in a `MediaStream` the module owns, emptied
  before disposing. It sizes simulcast layers from `getSettings().height`
  and falls back to its own capture constraints, which a track it didn't
  capture lacks, and a `MediaStreamTrackGenerator` (an effect's output)
  reports no size: the module passes the track's size, or 640×480. Audio
  `mute()` writes `enabled`, in the direction the core already set.
- **It isn't on npm** (the `lib-jitsi-meet` package there is from 2022):
  Jitsi publishes each build as a `.tgz` on GitHub releases. pnpm 12
  refuses it as a dependency by default (`blockExoticSubdeps`: it pulls
  its strophe.js fork from a URL), so the build downloads the pinned
  archive, checks its SHA-256 and takes out the official minified file
  and its licence (`modularAV.downloads` with `extract`, a small tar
  reader in `tools/assets/tar.ts`). It loads with a `<script>` tag and
  sets `window.JitsiMeetJS`; the module types the parts it uses. Its
  logs go through the module (redacted, as warnings), not to the
  console, and its analytics, rtcstats and watchRTC stay off; a test
  checks the page talks only to the Jitsi server.
- **Identity needs Prosody's `presence_identity` on the main
  VirtualHost** (docker: `XMPP_MODULES`, not `XMPP_MUC_MODULES`; it hooks
  the sender's presence, which runs on the sender's host). It replaces
  any identity a client sends with the token's `context.user`. None of
  Jitsi's default setups load it. The module never takes a participant's
  word: without an identity from the server they are ignored, and the
  console says why.
- **A Jitsi server with tokens makes every participant a moderator**:
  Jicofo grants ownership to everyone it sees authenticated, whatever the
  token's `moderator` claim says, so a modified client could mute or
  remove others. Prosody's `token_affiliation` on the conference
  component, `ENABLE_AUTO_OWNER=0` and `JICOFO_ENABLE_AUTH=0` (Prosody
  still checks every token) leave players without it; the module warns
  when it finds itself a moderator.
- **Reconnecting**: `CONNECTION_INTERRUPTED`/`RESTORED` (the media path
  to the bridge) are `resuming`/`connected`; a dropped XMPP connection, a
  failed conference or a failure after joining are `lost` (kicked, a full
  or closed room and a refused token are final). A 20 s pause of all
  four containers recovers by itself. lib-jitsi-meet checks the token
  when its XMPP session resumes; if it ran out (after ten minutes), it
  cancels the resume and waits for `refreshToken`: the module reports
  `resuming` and `tokenExpiring`, the core fetches a token through the
  relay and calls `updateToken`, and without one within 30 s (no GM) the
  connection is `lost`. `connect()` resolves once in the room; the media
  path to the bridge comes up a moment later (Jicofo starts the bridge
  session only for two or more), so an outage before it is up shows as
  the XMPP link failing (`lost`), not `resuming`. Measured with the call
  up: `resuming` 6 s into the outage. The outage tests start from an
  established call (the other side hears the microphone).
- **The same player twice**: the newer tab wins, on both sides. A tab
  closed without leaving (a reload) stays in the room while Prosody keeps
  its session for resumption. For the player's own new tab, that older
  endpoint and its late tracks are ignored. For everyone else, a newer
  endpoint of someone present replaces the older one: they are reported
  as left and joined again, so Foundry's dock redraws them (otherwise
  the old endpoint's join, seen before the reloaded page was online in
  Foundry, left them without a tile). Both found by the Foundry suite.
- **Receiving**: refused media isn't sent at all: video by receiver
  constraints (height 0, or 180/360/720 for the core's quality), audio
  by the bridge's audio subscription (an exclusion list). Jitsi's tokens
  carry no publish rights, so a GM's block is enforced by receivers, as
  with P2P (`publishRights: "receivers"` in the service contract).
  Speaking comes from the senders' gates over Foundry
  (`speakingDetection: false`; Jitsi names one dominant speaker only).
  Quality maps Jitsi's connection quality (0–100); connection details
  come from its stats events (every 5 s), a participant's from their own
  report of their link to the bridge.
- **meet.jit.si can't be a service**: its sign-in page (Firebase, Google
  or GitHub) gives the token only to an opener on meet.jit.si itself or
  redirects to `meet.jit.si/<room>#jwt=…`, the token is a Firebase ID
  token (about an hour), players would be anonymous guests, and its
  terms ask for 8x8's branding for 15 s and cap free use at 25 active
  endpoints a month. A foreign origin can open its XMPP WebSocket. It
  fits the external call mode (an iframe) instead. JaaS's terms for a
  module where each table brings its own key weren't reachable.
- **Tokens in URLs**: lib-jitsi-meet puts the token in the WebSocket's
  query (as livekit-client does), so it shows in that browser's console
  when the socket fails and in the server's access logs, for its ten
  minutes.
- **Test tooling**: `scripts/services/jitsi/compose.yml` (images pinned
  by tag and digest, about 2 GB on disk, 470 MB of RAM idle and 790 MB in
  the contract run, ready in about 5 s; ready means the web container
  answers and Jicofo has logged its bridge, since its health endpoint is
  404 and on the container's loopback). The service contract gained a
  test with the core's kind of tracks (a Web Audio microphone, a
  generated camera) and checks that tracks stay live after mute and
  unpublish; LiveKit and P2P pass both. The mock service has
  `updateToken` (`updatesTokens: false` leaves it out).
- **Reviews** (code and security): no critical or high findings. Fixed:
  a player with two tabs counted once, subscriptions pruned (and keyed by
  endpoint as well as source name), a drop or a leave during the join
  settling `connect()`, leaving once, a failed refresh reported, wrappers
  of overlapping publishes released, lib-jitsi-meet's
  `disableThirdPartyRequests` and `analytics.disabled` set, the tar
  reader refusing corrupt sizes and capping decompression. Left as they
  are: see "From milestone 8" in §18.
- **API changes** (additive): `ServiceConnection.updateToken?()`; the
  core answers `tokenExpiring`, one request at a time, for the live
  connection only.
- **Not done yet**: JaaS (RS256 with the app's private key) until its
  terms are checked; screen share; server-side moderation; a server
  without tokens (an "insecure" mode like LiveKit's dev mode); versions
  other than stable 11248 aren't tested.

## 17. Findings from milestone 9

Verified while building the scattered layout, themes and
`modular-av-dock-vines` (Foundry 14.369, Chromium from Playwright 1.64):

- **The scattered layout is a placement**, beside docked, floating and a
  window of its own (`data-placement="scattered"`; the host is `free`):
  grid and focus fit tiles in the dock's box, and scattered has none.
  Each tile is placed on its own as an anchor (a corner or edge of the
  window) and an offset (`kit`'s `placeAnchored`/`anchorOf`), so it stays
  against its corner when the window is resized; `avoid()` then moves it
  the shortest way out of Foundry's controls, its frame included. The
  dock's header (status, count, tools) joins the voice panel, which is
  placed like a tile, bottom-left by default. Tiles move by dragging (or
  their move handle with the arrow keys) and resize by their handle
  (width only: tiles stay 16:9). Arrangements are a `user` setting;
  broken values give the defaults. The layout's code (11 KB) loads only
  when a player picks it, and a dock unmounted or moved elsewhere while it
  loads drops it.
- **Foundry v14's controls, as the scattered layout sees them**: the
  containers are tall and mostly empty, with `pointer-events: none`
  (`#scene-navigation` and `#chat-notifications` run the whole height of
  the window, `#scene-controls` most of it), so the visible parts are
  measured: their list items, the chat log, input and controls, the
  hotbar. The players list's names overflow `#players`' own 72 px box.
  Collapsing the sidebar slides `#sidebar-content` off to the right with
  a negative margin (250 ms) while `#sidebar` keeps its box, so neither
  its size nor a resize observer notices: the dock watches the
  containers for changes (a mutation observer) and places again when a
  transition ends. The test world starts with the sidebar collapsed.
- **Foundry's `Hotbar#_onResize` throws before the hotbar renders** (it
  reads its element). The core called it from `setPlacement`, so a dock
  that started floating or scattered after a reload failed to place
  itself (since milestone 5, unseen until a saved scattered dock). The
  core now asks only once the hotbar has rendered, and the dock follows
  its placement even if the host fails.
- **Scenes**: with `core.noCanvas` (the Foundry suite) no scene is viewed
  and `game.scenes.current` is null; the dock uses `viewed ?? active`. A
  GM's layout for a scene is a scene flag holding JSON text: an object
  flag would be merged with the old one by Foundry's update, keeping
  tiles that were removed. Players see it until they move a tile there;
  then their own copy for that scene wins, with "Back to the scene's
  layout". The voice panel is always the player's own.
- **Themes** register through the dock's API (`api.themes.register`,
  inside the `modularAVDock.register` hook during `setup`; also
  `game.modules.get("modular-av-dock").api`). The chosen theme's
  stylesheet is one `<link>` loaded from Foundry's root and `<html>` gets
  `mav-theme-<id>`: a class rather than the plan's `data-mav-theme`,
  since the core mirrors `<html>` classes and the page's stylesheets into
  the Picture-in-Picture window (checked there). A theme's stylesheet must
  not be in its `module.json` `styles`. Frames declare only their reach
  (fractions of the tile's width); the frame layer is sized to it, the
  grid fits tiles with room for it (`fitGrid({ reach })`) and tiles no
  longer clip what reaches past them (the media clips the video). How
  much of the face a frame covers is checked on screen, not declared.
  `suggestedLayout` is offered in the placement menu, never applied.
- **The theme contract** (`@modular-av/testing/contract/theme`) runs in
  each layout a theme names. Faces: inside 15% of each side of the video
  the frame draws nothing, compared by screenshots with and without the
  frame (identical PNG bytes), retried until the tile holds still (the
  docked grid refits as the status line changes). Indicators: their
  background is translucent, so a frame may draw under them; the check is
  that they aren't faded and the frame paints below them. Checked against
  a deliberately bad theme (a frame over the face and above the
  indicators fails both).
- **Font Awesome**: Foundry 14.369 ships Font Awesome Pro 7.2.0; the
  harness loads Free 7.2.0 (dev only). Every icon the dock uses is in
  Free; the core's plain status uses `fa-headphones-slash` (Pro only).
  With icons, the baselines showed that a button's `display` beat the
  `hidden` attribute (the move button while docked, reconnect while
  connected, an empty Effects section): fixed.
- **Smaller fixes**: roving focus moved on after a move handle's arrow
  key; the GM's block switch showed "blocked" for a kind the world's mode
  leaves out (now `ParticipantState.blockedAudio`/`blockedVideo`);
  settings selects kept an option's old text when only its label
  changed; the harness served stylesheets without `text/css`.
- **Bundles**: the dock's entry with what it imports at once is 83.1 KB
  (unminified; the theme registry and scene and frame code load at
  setup): its budget went from 80 to 90 KB. dock-vines: entry 0.6 of 2 KB,
  stylesheet 2.3 of 8 KB (the size check now covers a theme's own
  stylesheet).
- **Reviews** (code and security): no critical or high findings. Fixed:
  a scattered layout loading after the dock was unmounted, a dock left
  half scattered if setting it up threw, own-property lookups of tile
  ids, saved records capped before they're read (the newest kept), the
  scene layout parsed once per text, the panel and re-rendered controls
  watched. Left as they are: see "From milestone 9" in §18.
- **API changes** (additive): `ParticipantState.blockedAudio` and
  `blockedVideo`. The dock's own API: `themes.register`, `list`, `get`.

## 18. Open items

Left open after milestone 10. None of them is part of a milestone unless
it is picked up explicitly.

- **The core's entry is nearly full**: 109.2 of 110 KB after milestone
  10 (the modules window, the news check and the no-service notice load
  only when needed). The next core feature needs lazy loading or a
  budget decision.
- **The modules window and other GMs**: it reads the installed modules
  when it opens; another GM applying meanwhile isn't seen until it is
  opened again (Apply reloads everyone, so only a window left open across
  that).
- **A UI module's surfaces by convention**: Apply makes a UI module's
  `<id>.cameras` and `<id>.settings` the world's choices; a UI module
  naming its surfaces otherwise keeps the old choice until the GM picks
  it in the settings.
- **Over-full single sockets**: a world running two services (or two UI
  modules) shows both in the one socket; the board doesn't pick one, and
  adding another service swaps them all out.

- **Browser-tier flake**: "two players who join at the same moment link
  once and hear each other" (`packages/p2p/test/browser/mesh.spec.ts`)
  failed twice inside `pnpm verify`, with level 0 at the listener. It
  didn't fail in over 300 runs alone, under load, or with verify's steps
  in a loop. The cause is unknown.
- **Functions over 50 lines** in the code from milestones 2 and 3 (the
  P2P package has none): mostly factories, the longest
  `createLocalMedia` (257), `createSession` (208), `createEffectRunner`
  (191), `createRemoteMedia` (147), `createMicrophone` (145) and
  `createCamera` (124), plus helpers in `packages/testing`. List them with
  ESLint's `max-lines-per-function` at 50.
- **Fail-closed option for the open mic**: when the voice gate can't run
  in voice activity mode, the microphone goes out ungated and shows "open
  mic" (§5). The reviews suggested an option to mute instead; the rule was
  kept and the option left open.
- **Coalescing state refreshes**: several changes in one task each
  refresh the state; they could be merged into one.
- **Firefox 48 kHz capture**: see §11.
- **From milestone 4**: see "Not done yet" in §12.
- **From milestone 5**:
  - Firefox, Safari and Foundry's desktop app aren't tested: Document
    Picture-in-Picture is feature-detected (the dock says why "own
    window" isn't offered) and element Picture-in-Picture per tile isn't
    built.
  - The compact tile layout (avatars and names only) wasn't built in
    milestone 9 either.
  - Visibility pauses renegotiate a P2P link each time (after the 3 s
    grace): measure with a real table before tuning.
  - `MountedSurface.unmount` isn't called by the core.
- **From milestone 6**:
  - Krisp: the note to LiveKit (does a Foundry module that loads
    `@livekit/krisp-noise-filter` from npm for each table's own Cloud
    project fit their terms?) was sent to support@livekit.io on
    2026-10-26. `modular-av-livekit-krisp` stays held
    (`modularAV.releaseHold`) until they answer in writing.
  - Krisp gets no LiveKit `LocalAudioTrack`, so it can't pause its usage
    reports while the player is muted, and LiveKit isn't told the track
    has enhanced noise cancellation (its `AudioTrackFeature`). Its quality
    setting applies the next time it starts.
  - GTCRN on a slow machine isn't measured (the crackle estimate in §14
    is from a fast one), and nothing switches to a lighter model by
    itself when one can't keep up.
  - The noise models and Krisp aren't tried in Firefox, Safari or
    Foundry's desktop app (the 48 kHz capture context, §11).
- **From milestone 7**:
  - Swapping blur and replace starts a second worker beside the first;
    in software WebGL that holds the camera about 2.5 s. One worker shared
    by both (one segmenter) would make it seamless. Not measured in GPU
    Chrome.
  - High quality is checked only for running and cost: the drawn camera
    has no person the multiclass model recognises.
  - Video effects need `MediaStreamTrackProcessor`: Firefox and Safari
    get no camera background.
  - Where WebGL runs in software, High silently runs as Standard; only
    the setting's hint says so.
  - Closing Foundry's file browser without picking leaves "Choose an
    image…" waiting until the next pick.
  - LiveKit AVClient settings older than its own world setting (kept in
    Foundry's `rtcWorldSettings`) aren't imported.
  - MediaPipe's WebAssembly includes Eigen under the MPL-2.0 (weak
    copyleft, file-level): redistributable with the notice and a pointer
    to its source, which the notices give.
- **From milestone 8**:
  - JaaS (8x8's Jitsi as a Service): RS256 tokens signed with the app's
    private key would work from the GM's browser; its terms for a module
    where each table brings its own account weren't reachable.
  - Screen share over Jitsi, and Jitsi servers without tokens (an
    "insecure" mode for local servers, like LiveKit's dev mode).
  - Only Jitsi stable 11248 is tested; Jitsi publishes no rule for which
    client and server versions work together.
  - lib-jitsi-meet logs an error of its own when the server offers no
    TURN credentials (a TypeError parsing the refusal); the module turns
    it into a warning.
  - A participant without an identity from the server is ignored with a
    console error, not ended on: a hard failure would end everyone's call
    whenever a gateway or recorder joins. On a server without
    `presence_identity` a modified client could claim another player's
    identity (the README makes the module a requirement).
  - Another tab of the same player that joins while this one is still
    joining counts as older: both stay (a small window).
  - Plain `ws://` is accepted for `*.local` names, as for LiveKit.
- **From milestone 9**:
  - `dock.layouts.register` isn't public: the layouts are the dock's own
    behind an internal interface, until a module needs to add one.
  - Scattered tiles keep clear of Foundry's controls, not of each other:
    a tile dragged onto another stays there. Tiles that were never placed
    take the free corners in the dock's order, so one can change corner
    when someone joins (until the player moves it).
  - A player's own arrangements for scenes are never pruned (deleted
    scenes included); the newest 200 are kept.
  - The chat log counts as one of Foundry's controls: tiles near the
    bottom right move away while new messages show there, and back.
  - A theme's `preview` is checked but not shown anywhere yet (the
    settings window lists themes by name).
  - Only Foundry v14's controls are measured, by their v14 ids and
    structure.
  - The scattered layout and themes are tested in Chromium only, and the
    whole Foundry suite wasn't run for milestone 9 (the dock and
    scattered specs were).

## 19. The road to 1.0

1.0 is a promise: the core's API (`@modular-av/api`, versioned as the
core) and the dock's theme API (`api.themes`, the documented classes,
attributes and tokens in `docs/dock-theming.md`) change only with a new
major version, and modules stop releasing in lockstep (§3 "Releases and
versions"). Written down after milestone 9 (2026-10-27); 1.0 is released
when every item below is checked or explicitly dropped by the owner.

**Used by real tables**

- [ ] Two or three real sessions per service (LiveKit, P2P, Jitsi) with
      real players, cameras and microphones, over ordinary home
      connections: joining, speaking, muting, reconnecting after a drop,
      a GM's block, the dock in every placement. Findings fixed or listed.
- [ ] CPU and memory on a modest laptop with effects on (noise
      cancellation, camera background) during a real session.
- [ ] The P2P visibility pauses measured with a real table and tuned if
      needed (§18, from milestone 5).

**Browsers**

- [ ] A smoke pass in Firefox and Safari (join, hear, see, mute, the
      dock, the settings window) and in Foundry's desktop app; what
      degrades is said in the READMEs (camera effects need Chrome or
      Edge; a window of its own needs Document Picture-in-Picture).

**The API, reviewed before it is frozen**

- [ ] The public surface of `@modular-av/api` read through once with "can
      we keep this for a major version?": names, optional members, error
      codes, what the core guarantees. In particular
      `MountedSurface.unmount` (the core never calls it) and anything
      marked as a sketch.
- [ ] The open-mic decision settled: keep "open mic" when the voice gate
      can't run, or add the fail-closed option (§18).
- [ ] The dock's theme API reviewed the same way, with
      `dock.layouts.register` kept internal or published.
- [ ] Each plugin's `relationships.requires` carries
      `compatibility.minimum` for the core (and the dock) features it
      needs, ready for independent versions.

**Finding and installing the modules**

- [x] Every relationship carries its stable `manifest` URL (milestone 10,
      generated by the build; §20).
- [ ] Installing one module on a fresh Foundry data directory offers what
      it needs: Foundry's source says it will (§20); to try by hand once a
      release carries the URLs.
- [x] A GM can find the whole family from inside Foundry: a modules menu
      in the core, a notice naming the services when none is enabled, and
      READMEs that list every module (milestone 10).
- [ ] Decided whether to list the modules on foundryvtt.com's package
      registry.

**Process**

- [ ] CI runs the unit and browser tiers on every push (once the GitHub
      Actions quota allows), and releases don't depend on one machine.
- [ ] The release steps for independent versions written down and tried
      once (changesets without the `fixed` group; how a change to
      `@modular-av/api` bumps its dependents).

**Not blocking 1.0**: the Krisp module (released on its own once LiveKit
answers), the long functions and the flake in §18, JaaS, screen share,
`modular-av-tokens` and the external call mode.

## 20. Findings from milestone 10

Verified while building the modules window, the catalog and the notices
(Foundry 14.369, Chromium from Playwright 1.64):

- **Foundry's install dialog** (`Game#checkDependencies`, client side):
  a relationship with a `manifest` is fetched through Foundry's server
  (`getPackageFromRemoteManifest`) and offered for automatic install
  although the package is unlisted; the check recurses into each
  dependency's own `requires` and `recommends`; recommended packages are
  offered ticked (`templates/setup/install-dependencies.html`), required
  ones ticked and locked; each is then installed with `dependencies:
  false`. So installing `modular-av-dock-vines` offers the dock and the
  core, and everything the core recommends. The core therefore
  recommends only the dock: recommended services would all be installed
  with any module (owner's decision, 2026-10-27). The build generates
  every family relationship's `manifest` (and a lockstep
  `compatibility.minimum` on `requires`); a source `module.json` setting
  either is refused.
- **The catalog**: `catalog.json` on the manifests branch lists released
  modules (title, description, kind, version, family requirements,
  manifest URL) and held ones as coming soon. Each publish regenerates it
  from the `module.json` files on the branch and checks it with the
  core's own reader; the core's build ships its release's copy
  (`modularAV.catalog`). The reader refuses the whole catalog for any
  bad field, drops unknown ones, and accepts a manifest URL only if it is
  exactly the module's own on the manifests branch.
- **The second runtime fetch**: a GM's browser asks for the catalog when
  the modules window opens and at most once a day at `ready` (a client
  timestamp), with no credentials, no referrer, a five-second timeout and
  a 256 KB cap; the world setting `checkGitHub` (on by default) turns it
  off, and `pnpm foundry:setup` turns it off for the test world. Any
  failure shows the shipped catalog. Daily news is told once per change
  (a client setting keeps the last).
- **Settings menus**: `game.settings.registerMenu` refuses a type that
  isn't an ApplicationV2 (or FormApplication) subclass, so the core's
  "Plan your modules" type is a tiny ApplicationV2 subclass whose
  `render` loads the window's chunk and opens it.
- **Applying a plan as Foundry does**: `ModuleManagement`'s submit sets
  `core.moduleConfiguration`, then `SettingsConfig.reloadConfirm({world:
  true})` emits the `reload` socket event and calls
  `foundry.utils.debouncedReload()`; the board does the same after its
  own confirmation. Settings registered with `type: String` aren't
  checked against their `choices` when set, so Apply can make a UI
  module's surfaces the world's before that module runs.
- **Return to Setup**: `game.shutDown()` is GM-only and asks again when
  other users are connected (Foundry's own confirmation, after the
  board's).
- **A window filled after it opens** is placed by Foundry while empty:
  the board calls `setPosition({top: undefined, left: undefined})` once
  its content is in, as the settings window does (§17).
- **Drag and drop** in a Foundry window works with HTML5 drag events; a
  drop target scrolled out of view can't be reached by Playwright's
  `dragTo` (the spec drags to a socket in view).
