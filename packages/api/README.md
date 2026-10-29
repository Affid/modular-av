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

A service copes the same way with what the core passes it: it treats a
`disconnect` reason it doesn't know like `"user"`, and rejects `publish`
of a `TrackSource` it can't send (screen share may come in a minor
version; P2P and Jitsi reject it today). Every other union changes only
in a major version.

### What the core guarantees

These hold whichever UI or service runs, and stay in every 1.x:

- Mute, deafen and the GM's blocks hold in every state of the call.
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
