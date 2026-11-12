# @modular-av/api

The types of Modular A/V's plugin API: what the core
(`game.modules.get("modular-av").api`) offers service, effect and UI
modules, and what it expects of them. The package has no code; the core
implements it.

## Versions

The API's version is the core's module version. From 1.0 on, a module
written against core 1.x keeps working with every later 1.x:

- **Patch versions** fix the core. The API doesn't change.
- **Minor versions** may add to the API: new optional members of what a
  module implements (a definition, a connection), new members of what the
  core gives (state, commands, registries), and new values of the open
  unions below.
- **Major versions** may rename, remove or change anything, and add
  required members.

A module that uses something added in a minor version requires that
core: the release build writes the core version it was built with into
`relationships.requires[].compatibility.minimum`, and Foundry checks it.

## A module's settings

A module keeps its settings through the core, so every module follows the
same rule about what goes with the player:

```ts
Hooks.once("modularAV.register", (api: ModularAV) => {
  api.settings.register("my-effect", "drive", {
    storage: "player", // follows the player's login: a choice or a taste
    type: Number,
    default: 0.5,
    onChange: (value) => apply(value),
  });
  api.settings.register("my-effect", "quality", {
    storage: "device", // depends on the machine: its CPU, microphone, camera
    type: String,
    default: "standard",
  });
});
```

- `"player"` is Foundry's `user` scope: stored on the server, so it comes
  back on another browser, device or address (a LAN address and a public
  one are different sites to a browser, with storage of their own).
- `"device"` is Foundry's `client` scope: this browser only.
- Read and save with `api.settings.get` and `api.settings.set`. Saves of
  one setting run one at a time; a player setting saves once the game is
  ready. Foundry's own `game.settings.get` reads them too.
- A setting that moves from `"device"` to `"player"` keeps its key: the
  core moves this browser's value to the player once, when the game is
  ready, unless the player saved one already. Nobody loses their setup to
  the change.
- Choose `"device"` for what one machine can do and another can't, and
  `"player"` for the rest. A module's settings don't show in Foundry's
  settings window; the module shows them in its own UI or as
  contributions.

`ModuleSetting` may gain optional members in a minor version (such as who
may change where a setting is kept).

### Unions that may gain values

UIs must cope with a value they don't know (show it plainly, or ignore
it), as a minor version may add one:

- `SessionStatus`, `SessionEndReason`
- `EffectStatus`, `CameraHold`, `MicrophoneHold`
- `CommandErrorCode`, `ConnectionQuality`
- `SettingsTab`, `SettingsWindowTab` (a section naming an unknown tab
  goes under More)
- `ContributionKind` (a UI ignores contributions of a kind it doesn't
  render) and `ModuleKind`
- `SettingStorage` (a module that declares a value the core doesn't know
  is refused, so declare only the values of the core you require)

A service copes the same way with what the core passes it: it treats a
`disconnect` reason it doesn't know like `"user"`, and rejects `publish`
of a `TrackSource` it can't send. A service that carries screen shares
says so in `capabilities.screenShare` (with `audio` for their sound);
the core publishes `"screen"` and `"screen-audio"` only to one that does.
`ScreenShareRule` may gain values too. Every other union changes only in
a major version.

### What the core guarantees

These hold whichever UI or service runs, and stay in every 1.x:

- Mute, deafen and the GM's blocks hold in every state of the call.
  Nothing said after a player mutes goes out. A tail of what they said
  before may ring on for up to 3 s, unless they chose `audioCutTails`; a GM's
  block ends it at once.
- The camera is never sent raw while a chosen video effect isn't
  running (`cameraHold`).
- In voice activity mode, a microphone whose voice gate can't run either
  goes out shown as `openMic`, or is held (`microphoneHold`), as the
  player chose (`gateFallback`).
- Names, colours and avatars come from Foundry's users, never from a
  service.
- Registration happens only inside the `modularAV.register` hook.

`MountedSurface.unmount` isn't called yet (a cameras surface lives as
long as Foundry's page), but a later minor version may call it: a
surface's `unmount` must undo its mount completely.

## Inside this package

About 1,400 lines of TypeScript types in 16 files, one per part of the
API (`service.ts`, `effects.ts`, `surfaces.ts`, `contributions.ts`,
`commands.ts`, `state.ts` and so on). Nothing here runs: no module ships
it, and it has no Foundry id. How the parts fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
