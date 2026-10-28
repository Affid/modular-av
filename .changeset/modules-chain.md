---
"@modular-av/core": minor
"@modular-av/api": minor
"@modular-av/dock": patch
"@modular-av/livekit": patch
"@modular-av/p2p": patch
"@modular-av/jitsi": patch
"@modular-av/mic-denoise": patch
"@modular-av/cam-background": patch
"@modular-av/dock-vines": patch
"@modular-av/livekit-krisp": patch
---

"Plan your modules" is now a signal chain of cards. On air shows what
the world runs; Next is the setup you build, in the order a call flows:
effects, the service, the cameras and the Dock's theme. Open a stage to
see its modules as tiles, each with what it is for and one action; a
world with no service starts from three common builds. Load in, Go live
and Soundcheck walk you to Foundry's Setup screen and back, and
Soundcheck opens each module's settings where they live.

For module authors: the Voice & Video Settings window can open on a tab
(`SettingsHost.tab`, a `SettingsWindowTab`; while it is open,
`SettingsHost.onTabRequest` tells the surface, which keeps what is
drafted), its code loads when it first opens, and each module's manifest
can give its card an icon and a few facts (`flags["modular-av"].icon`
and `.facts`).
