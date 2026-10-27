# @modular-av/api

## 0.2.0

### Minor Changes

- A service can ask for a fresh token while connected
  (`ServiceConnection.updateToken`, answered through the GM relay), so a
  long call over Jitsi stays up after its first token runs out.

## 0.1.0

### Minor Changes

- First release of the shared API types, UI helpers and test tooling
  (fake Foundry, mock service, service, UI and effects contracts).
