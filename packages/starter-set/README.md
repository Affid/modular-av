# Modular A/V: Starter set

Voice and video for Foundry VTT in one install. The starter set holds no
code: it brings in the Modular A/V modules most tables start with.

| Module                      | In the set                                            |
| --------------------------- | ----------------------------------------------------- |
| `modular-av`                | Required: the core every module builds on             |
| `modular-av-dock`           | Required: the camera dock and the voice panel         |
| `modular-av-livekit`        | Required: calls through a LiveKit server              |
| `modular-av-mic-denoise`    | Required: noise cancellation for your microphone      |
| `modular-av-cam-background` | Offered: blur your background or replace it, optional |

## Install

In Foundry's Setup screen, **Add-on Modules**, **Install Module**, paste
this manifest URL and install:

```
https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-starter-set/module.json
```

Foundry installs the required modules with it and offers the camera
background. Enable **Modular A/V: Starter set** in your world: Foundry
turns the required modules on with it, the camera background ticked but
yours to leave out.

LiveKit needs a server: the GM enters its address, key and secret in the
voice and video settings (see the [LiveKit module](../livekit/README.md)).

## Later

Every module in the set is a module of its own: turn any of them off, or
add others (another service, a theme), as with any Foundry module. The
GM's **Plan your modules** board in the core's settings plans them one by
one; the starter set isn't listed there, as it only installs others.
