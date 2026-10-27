# @modular-av/core

## 0.3.1

### Patch Changes

- The Voice & Video Settings window fits the screen, scrolls when its
  sections are taller, and can always be moved.
- @modular-av/api@0.3.1

## 0.3.0

### Minor Changes

- 8e37fee: `ParticipantState.blockedAudio` and `blockedVideo`: a GM took away a kind
  the world's mode allows. UIs no longer work it out from `worldMode` and
  `canBroadcast`.

### Patch Changes

- 17d2efd: A cameras UI that starts floating or scattered after a reload places
  itself again: the core asked Foundry's hotbar to make room before the
  hotbar had rendered, and Foundry threw.
- Updated dependencies [8e37fee]
  - @modular-av/api@0.3.0

## 0.2.0

### Minor Changes

- A service can ask for a fresh token while connected
  (`ServiceConnection.updateToken`, answered through the GM relay), so a
  long call over Jitsi stays up after its first token runs out.

## 0.1.0

### Minor Changes

- First release. Replaces Foundry's A/V client and runs the call over the
  service module the GM picks (LiveKit or P2P), shown by Foundry's camera
  dock or a module's. Mute applies to what is sent in every state of the
  connection, GM blocks are enforced by every browser, camera effects fail
  closed, and it reconnects by itself. Its own voice gate drives voice
  activity, push to talk uses Foundry's key, and it warns when you speak
  while muted. A player's input sensitivity from LiveKit AVClient comes
  along once.

### Patch Changes

- Updated dependencies
  - @modular-av/api@0.1.0
