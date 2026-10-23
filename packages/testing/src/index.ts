export { createHooks } from "./foundry/hooks.ts";
export type { FakeHooks, HookError } from "./foundry/hooks.ts";
export { createFakeWorld } from "./foundry/world.ts";
export type {
  FakeWorld,
  FakeWorldOptions,
  UserChanges,
} from "./foundry/world.ts";
export type {
  FakeClient,
  FakeConfig,
  FakeGame,
  FakeModule,
  FakeModuleData,
  FakeUi,
  Notification,
} from "./foundry/client.ts";
export type {
  FakeSettingConfig,
  FakeSettings,
  SettingScope,
} from "./foundry/settings.ts";
export type { FakeSocket, SocketHandler } from "./foundry/socket.ts";
export type { Translations } from "./foundry/i18n.ts";
export { USER_ROLES } from "./foundry/users.ts";
export type {
  FakeUser,
  FakeUserData,
  FakeUsers,
  UserRole,
} from "./foundry/users.ts";

export { createFakeTrack, fakeTrackInfo } from "./service/fake-track.ts";
export type { FakeTrackInfo } from "./service/fake-track.ts";
export { createMockServiceHub, MockServiceFailure } from "./service/hub.ts";
export type { MockServiceHub, MockServiceOptions } from "./service/hub.ts";
