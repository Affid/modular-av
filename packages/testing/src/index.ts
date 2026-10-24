export { FakeApplicationV2, FakeAVConfig } from "./foundry/application.ts";
export type {
  ApplicationOptions,
  RenderOptions,
} from "./foundry/application.ts";
export {
  FakeAVClient,
  FakeCameraViews,
  FakeDefaultAVClient,
} from "./foundry/av-classes.ts";
export type { CameraRender } from "./foundry/av-classes.ts";
export { FakeAVMaster } from "./foundry/av-master.ts";
export type { AVClientClass } from "./foundry/av-master.ts";
export { AV_MODES } from "./foundry/av-settings.ts";
export type {
  AVActivity,
  AVClientSettings,
  AVSettingsDiff,
  AVUserEntry,
  AVUserSettings,
  AVWorldSettings,
  FakeAVSettings,
} from "./foundry/av-settings.ts";
export { createHooks } from "./foundry/hooks.ts";
export type { FakeHooks, HookError } from "./foundry/hooks.ts";
export { createFakeWorld } from "./foundry/world.ts";
export type {
  ConnectOptions,
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
  FakeSettingMenu,
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
  UserFlags,
  UserRole,
  UserUpdate,
} from "./foundry/users.ts";

export {
  createFakeTrack,
  endFakeTrack,
  fakeTrackInfo,
} from "./service/fake-track.ts";
export type { FakeTrackInfo } from "./service/fake-track.ts";
export { createMockServiceHub, MockServiceFailure } from "./service/hub.ts";
export type { MockServiceHub, MockServiceOptions } from "./service/hub.ts";

export {
  createFakeMediaEnv,
  createFakeVideoElement,
  FAKE_DEVICES,
} from "./media/fake-media-env.ts";
export type {
  FakeAudioCapture,
  FakeAudioOutput,
  FakeAudioOutputState,
  FakeMediaEnv,
  FakeLevelMeter,
  FakeMediaEnvOptions,
  FakeOnScreen,
} from "./media/fake-media-env.ts";
export {
  createFakeAudioGraph,
  createFakeCaptureContext,
} from "./media/fake-audio.ts";
export type {
  FakeAudioGraph,
  FakeCaptureContext,
  FakeGateConfig,
  FakeGateLevel,
  FakeVoiceGate,
} from "./media/fake-audio.ts";
export {
  createFakeAudioEffect,
  createFakeVideoEffect,
} from "./media/fake-effects.ts";
export type {
  FakeAudioEffect,
  FakeAudioEffectInstance,
  FakeEffectOptions,
  FakeVideoEffect,
  FakeVideoEffectInstance,
} from "./media/fake-effects.ts";
export {
  FakePeerConnection,
  FakeSender,
  FakeTransceiver,
} from "./rtc/fake-peer-connection.ts";
export type { FakeDescription, FakeStats } from "./rtc/fake-peer-connection.ts";
export { createFakeDocumentPip } from "./windows/fake-pip.ts";
export type { FakeDocumentPip, FakePipOptions } from "./windows/fake-pip.ts";
export {
  avState,
  localState,
  participantState,
  sessionState,
} from "./state/fixtures.ts";
export { createFakeApi } from "./api/fake-api.ts";
export type {
  Attachment,
  CommandCall,
  FakeApi,
  FakeApiOptions,
  MeterSubscription,
} from "./api/fake-api.ts";
