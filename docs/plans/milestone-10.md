# Milestone 10 plan: finding and installing the modules

Drafted on 2026-10-27 after milestone 9, from the discussion of how a GM
finds the Modular A/V family, and from HANDOFF §19 ("Finding and
installing the modules"). **Approved on 2026-10-27** with every recommendation
(see "Decisions").

## Where things stand

- Every plugin `requires` what it extends (the core, or the dock for
  dock-vines; Krisp also LiveKit). The core `recommends` only
  `modular-av-dock` and `modular-av-livekit`. No relationship carries a
  `manifest` URL, and no module is listed on foundryvtt.com (its package
  pages answer 404), so Foundry can't install a dependency by itself: its
  install dialog falls back to "Install Dependency Manually" (inferred
  from Foundry's texts and schema, not tried).
- Foundry v14 does offer recommended dependencies at install time ("These
  dependencies are optional, but may enhance the functionality of the
  package if installed", with automatic install), and a relationship may
  carry `manifest`, `compatibility` and `reason`. In a world, its
  dependency dialog lists recommended modules only if they are installed,
  ticked by default.
- Inside Foundry the core names no other module: the service, cameras
  and settings-window choices list only enabled modules, and "No voice and
  video service module is enabled in this world" names none. The core's
  README lists LiveKit and P2P, not Jitsi.
- Releases are manual (`tools/release/cli.ts`, `docs/RELEASING.md`): each
  module's `module.json` goes to the `manifests` branch, served from
  `https://raw.githubusercontent.com/Affid/modular-av/manifests/<id>/module.json`.
- What other families do: libWrapper's shim (a GM-only dialog naming the
  missing module, with links and "Don't remind me again"), Token Action
  HUD (a notice for one optional module; its system modules only in its
  README), theripper93 (a one-time welcome chat card linking his website's
  catalog; his hub fetches update data from his server). None lists
  modules that aren't installed from inside Foundry.

## Before the menu: bugs in 0.3.0

Reported by the owner on 2026-10-27, fixed first (each with a failing
test first, released as a patch if the owner wants):

- Scattered: moving a camera flickers and sometimes loses its new
  position.
- The dock docked on the right hides under the collapsed sidebar.
- The core's Voice & Video Settings window: not scrollable, oddly
  placed, sometimes can't be moved.
- Connection details: hidden in a participant's menu and too big for its
  popover; moved Discord-style (the player's own connection in the voice
  panel's status line, a readable details panel) after a mock-up.

## What milestone 10 builds

### 1. Dependencies that install themselves

- Every `relationships.requires` and `recommends` entry gets its stable
  `manifest` URL (and a `reason` where it helps), generated or checked by
  the build so the URLs can't drift from `docs/RELEASING.md`'s pattern.
- First, check on a fresh Foundry data directory what Foundry's install
  dialog does with recommended packages (offered? ticked?) and with an
  unlisted required one that has a `manifest`. The result decides what
  the core recommends (question 3).

### 2. A catalog of the family

- The release publishes `catalog.json` on the `manifests` branch beside
  the manifests, generated from every released module's `module.json`:
  id, title, description, role (`flags["modular-av"].kind`), version,
  what it requires, manifest URL. Held modules (`modularAV.releaseHold`)
  are left out.
- The core's build bundles the catalog of its own release (the same
  generator), so the menu works offline and before the first fetch.

### 3. The assembly board, in the core (GM only)

Designed with clickable prototypes and two UX reviews (2026-10-27); the
approved one is round 3 of the assembly board
(https://claude.ai/artifact/MdJv41sUvnmaAvk48Tj6GX, private to the
owner). Opened from a button in the core's module settings, from the
"Voice & Video Settings" window (GMs) and from the notice in 5. Loaded
only when opened (the core's entry is 105 of 110 KB).

- **The board**: the core in the middle, a socket for each kind: Service
  (required, one), Cameras (optional, one; empty means Foundry's own
  dock), Effects (any number). A piece can open sockets of its own (the
  Dock a Theme socket). Kinds have colours, always with a label too; the
  knob faces the core.
- **Pieces** show one status (Running, Installed off, Not installed),
  plus what the plan does with them (Will install, Will turn on, Will
  turn off), "Update available", "New" and "Needs Modular A/V x.y".
  Planned pieces are drawn as ghosts. A tray holds the rest, a column per
  kind; Krisp is listed as coming soon.
- **Changing the plan**: each piece's button ("Add to Effects", "Use
  instead of LiveKit", "Remove Dock"), or drag and drop (no redraw during
  a drag). Removing a piece removes what hangs off it, and says so. Undo
  in the status bar, in the toast, and Ctrl+Z.
- **"Help me choose"** beside the Service heading: "Where should calls
  go?" (players' browsers / LiveKit Cloud or my own LiveKit / my own
  Jitsi Meet) with one line why, and "Use X (instead of Y)".
- **Status**: "This world runs LiveKit and Dock" when the plan matches;
  otherwise "Your plan: 2 to install, 1 to turn off. Nothing has changed
  yet". Updates are a separate notice. A line under the title says what
  to do first.
- **The round trip**, as steps by place:
  1. _On Foundry's Setup screen_ (whoever runs the server; on a hosted
     server, the host's install page): updates (Update All) and the
     fewest links to paste (a piece another planned piece requires comes
     with it, since relationships carry manifests). "Copy all links" (one
     text block with instructions), "Save as a file"
     (`saveDataToFile`), "Send to my chat, for whoever runs your server"
     (a whisper; chat isn't readable on Setup), then "Return to Setup…"
     with an inline confirmation (connected players, have the links?).
     The plan is a world setting, and the list to install is frozen when
     leaving.
  2. _In this world_: back from Setup, "Installed: X. Still missing: Y".
     "Apply…" turns modules on and off (`core.moduleConfiguration`) and
     sets Modular A/V's service and cameras, after an inline confirmation
     (players' pages reload; "After the session" keeps the plan). Apply
     never leaves the world worse off: a piece turns on only when it and
     what it needs are installed, and the running service turns off only
     once its replacement can take over.
  3. _Check these settings_: service keys, the theme, telling players
     about effects.
- Focus moves to the next action or the status after every action; the
  status is announced; buttons meet 3:1 against their background.

### 4. Newer versions and new modules, from GitHub

- The menu fetches `catalog.json` from the `manifests` branch when a GM
  opens it, and, if a setting allows, at most once a day when a GM loads
  the world; a newer version or a module the world doesn't have gets a
  quiet notice for GMs. Players never fetch.
- The reply is untrusted: a strict schema, shown as text only, manifest
  URLs kept only under the `manifests` branch prefix, a short timeout,
  the bundled catalog on any failure.
- This is the second exception to "no runtime fetch" (after Krisp): the
  GM's browser contacts raw.githubusercontent.com, which sees its
  address, as Foundry's own manifest checks do. Recorded in HANDOFF and
  in the core's README (question 1).

### 5. Naming what's missing

- No service enabled: a GM-only dialog (libWrapper's pattern) naming
  LiveKit, P2P and Jitsi, what each needs, and the modules menu, with
  "Don't remind me again" (a world setting).
- The settings window's Effects section, when no effect module is
  enabled, says that noise cancellation and camera background exist as
  modules (GMs see the menu link).

### 6. Docs

The core's README (every module, Jitsi included, and the menu), the root
README's "which modules do I need?", `docs/RELEASING.md` (the catalog),
HANDOFF findings (§20, open items after it) and §19's checkboxes, a
changeset.

## Tests

- **Unit**: the catalog generator (from manifests, held modules left
  out), the catalog's schema check (broken, hostile and foreign URLs),
  status per module (enabled, installed, missing, newer), the once-a-day
  check, the missing-service notice and its "don't remind me".
- **Browser harness**: the board (keyboard, axe, drag and drop), the
  plan and its undo, the steps for each mix of states, Apply never
  leaving the world without a service, with a stubbed catalog URL:
  newer versions and new modules shown, a failed or slow fetch falling
  back to the bundled catalog.
- **Foundry suite**: the menu from the settings, the notice with no
  service, and (by hand, recorded) installing one module on a fresh data
  directory pulling in its chain.

## Decisions (2026-10-27)

1. Fetching from GitHub is allowed as a recorded exception: when a GM
   opens the menu, and at most once a day when a GM loads the world (a
   world setting, on by default). Players never fetch.
2. The "which service?" helper is in ("Where should calls go?").
3. The menu is the assembly board above, prototype round 3 (approved
   2026-10-27).
4. The core recommends the dock and the three services, each with its
   manifest URL; revisited after the install-dialog check.
5. Listing on foundryvtt.com is decided separately, outside this
   milestone.

## Questions for the owner (answered above)

1. **Fetching from GitHub.** Recommended: allowed as a recorded
   exception, on when a GM opens the menu, and the daily startup check a
   world setting, **on** by default (a GM can turn it off). Alternative:
   the startup check off by default.
2. **The "which service?" helper.** Recommended: in, as two or three
   questions (own server? LiveKit Cloud? how many players?) that
   highlight one service. Alternative: only the per-module "when to pick
   it" lines.
3. **What the core recommends.** Recommended: the dock and the three
   services, each with its manifest (the GM picks one service); effects
   and themes only in the menu. To revisit after the install-dialog check
   in step 1.
4. **foundryvtt.com.** Listing the modules on Foundry's package registry
   would make them searchable in Setup and installable as dependencies by
   id. Recommended: decide separately (it's an account and a submission
   per module); this milestone works without it.

Out of scope unless the owner says so: independent versions (§19
"Process"), the other §19 items, `modular-av-tokens`, the external call
mode.

## Working rules (as in earlier milestones)

A branch (`m10-modules`), test first, small conventional commits,
`pnpm verify` green before each commit (exit code read in its own step),
code and security reviews before merging (the fetch especially),
`pnpm test:foundry` for the menu and the notice. Ask before pushing,
releasing, adding dependencies, or starting Docker servers not run
before.
