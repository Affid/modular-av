# Plan: the Voice & Video Settings window, redesigned

Asked for by the owner on 2026-10-28 after trying the 0.4.0 window; the
mock-up the owner approved (round 3, with the camera preview leading the Video
tab) is https://claude.ai/artifact/9t3CxEJnBDRTeyz3pShpu3 (private).

## Why

- The window was 560 px wide, one long form; its sections grew in the
  order features arrived. Turning calls on for the world (Foundry's world
  A/V mode) meant scrolling to the bottom and opening Foundry's own
  window.
- The quick controls showed the camera background twice: the core's
  effect choice (a dropdown per group) and the camera-background
  module's own Blur and Replace switches.
- The camera preview and the level meter only work in a call with video
  allowed: the core runs the camera only while video can go out.

## What it becomes

1. **A wider window (760 px) with tabs**: Call, Voice, Video, Appearance,
   and More for other modules' sections that name no tab.
   - **Call** (GMs): voice and video for the world (Off, Voice, Video,
     Voice and video: Foundry's world mode), the service, the relay
     server (Foundry's TURN settings), "Plan your modules". Players see
     whether calls are on and who carries them.
   - **Voice**: microphone, speakers, input mode, push to talk's key set
     in place (Foundry's own keybinding, `game.keybindings.set`), the
     sensitivity bar (voice activity only), noise cancellation.
   - **Video**: the camera preview leading, the camera and the
     background beside it, others' video.
   - **Appearance**: theme, cameras shown by (the player's own, and the
     world's for GMs), the settings window (GMs).
2. **Save and Reset**: the window's own fields wait for Save, which
   says whether it reloads everyone (world mode, service, the world's
   cameras or settings window) or only this page (the player's own
   cameras). Tabs with unsaved changes are marked. Settings that other
   modules contribute (a blur's strength, a background image) apply at
   once, as they do today. The voice panel's quick controls apply at
   once.
3. **Previews outside the call** (`api.preview`, new in the API): while
   the Video tab is shown, the window opens the chosen camera with the
   chosen background effect for the preview alone; while the Voice tab
   is shown, the chosen microphone's level for the sensitivity bar.
   Nothing is sent; both stop when the tab or the window closes. A
   refused permission says how to allow it.
4. **One control per effect group**: a control a module contributes can
   name the effect it belongs to (`effect`); it then shows under that
   effect's choice, only while the effect is chosen. The
   camera-background module's strength and images attach to blur and
   replace; its Blur and Replace switches go. Groups of up to three
   choices show as buttons (Off, Blur, Replace), larger ones as a
   dropdown; the "On · Medium" line shows only while starting or failed.
   Settings sections can name their tab (`tab`).

## API additions (minor)

- `api.preview.camera(element, { device, effect, onFailed })` and
  `api.preview.microphone(element, { device, listener })`, each giving a
  handle with `stop()`.
- `effect?: string` on contributed controls; `tab?` on settings
  sections.

## Steps

1. API and core: `api.preview`, with tests on the fake media env.
2. API: `effect` and `tab`; the camera-background module moves to them.
3. Dock: the effect control shared by the quick controls and the tabs.
4. Dock: the tabbed window with Save and Reset, the Call tab's Foundry
   settings, the push to talk key, the previews; the core's window
   720+ px wide.
5. Theme contract, screenshots, Foundry specs, docs (dock-theming,
   HANDOFF), changesets, reviews.
