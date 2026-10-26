# Modular A/V — voice & video

The core of Modular A/V: it replaces Foundry's A/V client and runs the
call, whichever service carries it and whichever module shows it. On its
own it works with Foundry's camera dock; add a service module and, for
the Discord-like dock, `modular-av-dock`.

- **Services**: `modular-av-livekit` (a LiveKit server or LiveKit Cloud)
  or `modular-av-p2p` (no server, small tables). The GM picks one per
  world.
- **What it guarantees**, whatever the other modules do: mute applies to
  what is sent, in every state of the connection; a GM's block is
  enforced by every player's browser; a camera effect that isn't running
  keeps the camera off; it reconnects by itself, with a fresh token each
  time.
- **Your microphone**: its own voice gate for voice activity (automatic,
  or a level you set), push to talk with Foundry's key, a warning when
  you speak while muted.

## Settings

- **Voice and video service** (world): the service module for this world.
- **Cameras shown by** (world, and per player): Foundry's camera dock or a
  module's, such as the dock.
- **Voice and video settings window** (world): Foundry's or a module's.

Foundry's own A/V settings (mode, devices, push to talk, relay server)
still apply. Coming from LiveKit AVClient: see
[MIGRATING.md](../../docs/MIGRATING.md).

## Licence

MIT. It conflicts with LiveKit AVClient (`avclient-livekit`): enable only
one.
