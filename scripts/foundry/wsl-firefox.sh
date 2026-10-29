#!/usr/bin/env bash
# Runs the Windows Firefox for Playwright from WSL (tests/foundry/
# firefox-installed.spec.ts): Playwright prepares the profile under Linux,
# which a Windows Firefox can't open, so this copies it to Windows' temp
# folder, passes that instead and removes it when Firefox quits. Set
# MAV_WINDOWS_FIREFOX if Firefox isn't in its usual place.
set -euo pipefail
FIREFOX="${MAV_WINDOWS_FIREFOX:-/mnt/c/Program Files/Mozilla Firefox/firefox.exe}"
WIN_TMP="$(wslpath -u "$(cmd.exe /d /c echo %TEMP% 2>/dev/null | tr -d '\r')")"
args=()
profile=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--profile" || "$1" == "-profile" ]]; then
    profile="$WIN_TMP/modular-av-$(basename "$2")"
    mkdir -p "$profile"
    cp -r "$2"/. "$profile"/
    args+=("--profile" "$(wslpath -w "$profile")")
    shift 2
  else
    args+=("$1")
    shift
  fi
done
status=0
"$FIREFOX" --no-remote "${args[@]}" || status=$?
if [[ -n "$profile" ]]; then rm -r -- "$profile"; fi
exit "$status"
