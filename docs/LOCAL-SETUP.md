# Local setup

Three test tiers (handoff §3 "Testing per module"): unit tests and browser
tests run anywhere with `pnpm ci`; the third tier runs against a real Foundry
in WSL, which needs a licence and so never runs in public CI.

## Settings

Copy `.env.example` to `.env.local` (untracked) and fill it in. Never commit
it. `FOUNDRY_ADMIN_PASSWORD` is the local server's administrator password.

## Foundry VTT

1. Download the **Node.js** build of Foundry v14 from your foundryvtt.com
   account and unpack it to `~/foundry/vtt`:
   `python3 -m zipfile -e FoundryVTT-Node-14.*.zip ~/foundry/vtt`
2. `pnpm foundry:start` runs it with data in `~/foundry/data` on port 30000.
   On the first start, enter the licence key at http://localhost:30000.
3. `pnpm build && pnpm foundry:link` links each module's `dist/` into
   `Data/modules/<id>`. Rebuild (`pnpm --filter @modular-av/core dev` keeps
   building) and reload Foundry to pick up changes.
4. `pnpm foundry:setup` sets everything else up, and is safe to repeat:
   the administrator password from `.env.local` (on the very first run it
   sets it and asks you to restart Foundry), the `dnd5e` system, the
   `modular-av-test` world, the users, and the workspace's modules enabled.
5. `pnpm foundry:check` joins as Gamemaster and Player1, checks each module
   is active with its API and that nothing logs errors, and saves
   screenshots to `test-results/foundry/`.

Users, all without passwords: `Gamemaster`, `Gamemaster2` (to test the token
relay with either GM), `Player1`-`Player3` (Trusted: may broadcast) and
`Player4` (Player: may not broadcast, by Foundry's default permissions).

## Windows Chrome over CDP

Headless Chromium has no GPU. For camera effects, Picture-in-Picture and
real frame rates, drive Windows Chrome from WSL. Start it from PowerShell
with its own profile folder (Chrome refuses the debugging port on the
default profile):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="C:\chrome-test\modular-av" `
  --no-first-run http://localhost:30000
```

WSL's mirrored networking makes it reachable at `localhost:9222`.
`pnpm foundry:check --chrome` runs the check there, one isolated context per
user. Anything on the machine can control a browser with that port open:
never sign that profile into anything, and close it when done.

## HTTPS

Browsers treat `http://localhost` as a secure context, so camera,
microphone, AudioWorklets and Document Picture-in-Picture work locally
without certificates, for every test user in that one Chrome. Another
device (`http://<lan-ip>:30000`) is not a secure context and gets no
camera or microphone. For multi-device tests, put Foundry and LiveKit
(`wss://`) behind a local HTTPS proxy (Caddy or mkcert, which needs the
local CA trusted on each device), or start test Chrome profiles with
`--unsafely-treat-insecure-origin-as-secure=http://<lan-ip>:30000`. Before a
release, test once on a real hosted server with HTTPS and players on
different networks (TURN, NAT).
