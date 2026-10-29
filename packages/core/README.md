# Modular A/V — voice & video

The core of Modular A/V: it replaces Foundry's A/V client and runs the
call, whichever service carries it and whichever module shows it. On its
own it works with Foundry's camera dock; add a service module and, for
the Discord-like dock, `modular-av-dock`.

- **Services**: `modular-av-livekit` (a LiveKit server or LiveKit Cloud),
  `modular-av-p2p` (no server, small tables) or `modular-av-jitsi` (your
  own Jitsi Meet server). The GM picks one per world.
- **Plan your modules** (GMs, in the module settings and the Voice &
  Video Settings window): the call as a chain of stages (effects, the
  service, the cameras and the dock's theme), with what the world runs
  now on air beside your next setup. Build it stage by stage or start
  from a ready-made build; the window gives the links to install on
  Foundry's Setup screen (to copy, save as a file or whisper to
  yourself), then turns modules on and off for the world, keeping a
  service on so calls keep working. With no service enabled, a GM is
  told which exist.
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
- **Check GitHub for module updates** (world, on): see below.

Foundry's own A/V settings (mode, devices, push to talk, relay server)
still apply. Coming from LiveKit AVClient: see
[MIGRATING.md](../../docs/MIGRATING.md).

## Privacy: the one request to GitHub

When a GM opens "Plan your modules", and at most once a day when a GM
loads the world, the GM's browser asks GitHub
(`raw.githubusercontent.com`) for the list of Modular A/V modules, to
tell of updates and new ones, as Foundry's own update checks do. GitHub
sees that browser's address; no cookies or page address go with it.
Players never ask. Turn **Check GitHub for module updates** off and the
window shows the modules this version knows.

## Licence

MIT. It conflicts with LiveKit AVClient (`avclient-livekit`): enable only
one.
