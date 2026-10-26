# Moving from LiveKit AVClient

Modular A/V replaces LiveKit AVClient (`avclient-livekit`, both
bekriebel's module and the Discord-like fork of it). The two can't run
together: disable LiveKit AVClient, then install and enable Modular A/V.
Most of what you set up comes along by itself.

## What to install

| You used                                                   | Install                                                |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| LiveKit AVClient with your LiveKit server or LiveKit Cloud | `modular-av`, `modular-av-livekit`, `modular-av-dock`  |
| Its noise cancellation (RNNoise, Speex, GTCRN)             | also `modular-av-mic-denoise`                          |
| Its camera background (blur, an image)                     | also `modular-av-cam-background`                       |
| Tavern's Patreon server                                    | not supported: set up LiveKit, or use `modular-av-p2p` |

`modular-av-p2p` connects players directly, with no server at all, for
small tables. Krisp (LiveKit Cloud's noise filter) will come as
`modular-av-livekit-krisp`; it isn't released yet.

## What comes along

**The server (GMs).** The first time a GM opens the world, Modular A/V
offers to use LiveKit AVClient's server: the address goes to the world's
settings, the API key and secret only to that GM's browser. It then offers
to remove the old setting from the world. Do: LiveKit AVClient kept the
secret where every player's browser could read it.

**Replace your LiveKit key.** Because every player could read the old
secret, create a new API key and secret in your LiveKit project, enter
them in Modular A/V: LiveKit's settings, and delete the old key there.
Modular A/V keeps the secret only in the GM's browser and gives players
short-lived tokens signed for them alone. Enter the key and secret in
each browser a GM uses to run the game.

**Each player's choices.** When a player first loads the world in a
browser where they used LiveKit AVClient, Modular A/V brings over what
they had saved there, once:

| LiveKit AVClient                          | Modular A/V                                                      |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Input sensitivity (automatic, or a level) | The same, in voice and video settings                            |
| Noise cancellation model                  | The same model, turned on (if noise cancellation was on)         |
| Dock layout (grid, focus, compact)        | Grid or focus; compact becomes grid                              |
| Floating dock                             | Floating dock                                                    |
| Camera background (blur or an image)      | Blur or replace background, with its strength, quality and image |

Mute, hide and volume settings were Foundry's own and stay as they were.

## What doesn't

- Tavern's Patreon server.
- Breakout rooms, the external A/V client and music mode.
- Krisp, until its module is released.
- Volumes above 100% and players muted only for you: set them again in the
  dock.

## Differences you'll notice

- Video effects (camera background) need Chrome, Edge or another Chromium
  browser; Firefox and Safari don't offer what they need. Without them the
  camera works without the effect.
- When a camera background can't run (it is starting, its files can't
  load, the browser stops it), your camera is kept off rather than sent
  without it, and the dock says why.
- Noise cancellation is off until a player turns a model on; RNNoise is
  the lightest.
