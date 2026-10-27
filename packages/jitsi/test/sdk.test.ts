// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

const URL_ = "/modules/modular-av-jitsi/vendor/lib-jitsi-meet.min.js";

const LOGS = {
  addGlobalLogTransport: vi.fn(),
  removeGlobalLogTransport: vi.fn(),
  setGlobalLogOptions: vi.fn(),
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.head.replaceChildren();
});

describe("loading lib-jitsi-meet", () => {
  it("adds its script once and initializes it without analytics or storage", async () => {
    // Arrange
    const init = vi.fn();
    const setLogLevel = vi.fn();
    vi.stubGlobal("JitsiMeetJS", {
      ...LOGS,
      init,
      setLogLevel,
      logLevels: { ERROR: "error" },
    });
    const { loadJitsi } = await import("../src/sdk.ts");

    // Act
    const quiet = (): void => undefined;
    const loading = Promise.all([
      loadJitsi(URL_, quiet),
      loadJitsi(URL_, quiet),
    ]);
    document.head.querySelector("script")?.dispatchEvent(new Event("load"));
    await loading;

    // Assert
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    expect(init).toHaveBeenCalledTimes(1);
    const [options] = init.mock.calls[0] as [Record<string, unknown>];
    expect(options).toMatchObject({
      enableAnalyticsLogging: false,
      analytics: { rtcstatsEnabled: false, watchRTCEnabled: false },
    });
    const storage = options.externalStorage as Storage;
    storage.setItem("jitsiMeetId", "x");
    expect(storage.getItem("jitsiMeetId")).toBe("x");
    storage.removeItem("jitsiMeetId");
    expect(storage.getItem("jitsiMeetId")).toBeNull();
    expect(setLogLevel).toHaveBeenCalledWith("error");
  });

  it("fails plainly when the file sets nothing up, and tries again next time", async () => {
    // Arrange: the test DOM reports every script as loaded.
    const { loadJitsi } = await import("../src/sdk.ts");

    // Act
    const first = loadJitsi(URL_, () => undefined).catch(
      (error: unknown) => error,
    );
    const failure = await first;
    vi.stubGlobal("JitsiMeetJS", {
      ...LOGS,
      init: vi.fn(),
      setLogLevel: vi.fn(),
      logLevels: {},
    });
    const second = await loadJitsi(URL_, () => undefined);

    // Assert
    expect(String(failure)).toMatch(/without JitsiMeetJS/);
    expect(second).toBe(globalThis.JitsiMeetJS);
    expect(document.head.querySelectorAll("script")).toHaveLength(2);
  });

  it("logs only through the module, one line per message, never to the console itself", async () => {
    // Arrange
    let transport: Record<string, (...args: unknown[]) => void> = {};
    const lines: string[] = [];
    vi.stubGlobal("JitsiMeetJS", {
      addGlobalLogTransport: (t: typeof transport) => {
        transport = t;
      },
      removeGlobalLogTransport: LOGS.removeGlobalLogTransport,
      setGlobalLogOptions: vi.fn(),
      init: vi.fn(),
      setLogLevel: vi.fn(),
      logLevels: {},
    });
    const { loadJitsi } = await import("../src/sdk.ts");

    // Act
    await loadJitsi(URL_, (line) => lines.push(line));
    transport.error?.("[ERROR]", "Strophe error:", {
      reason: "service-unavailable",
    });
    transport.warn?.("[WARN]", new Error("ICE failed"));

    // Assert
    expect(LOGS.removeGlobalLogTransport).toHaveBeenCalledWith(console);
    expect(lines).toEqual([
      'lib-jitsi-meet: [ERROR] Strophe error: {"reason":"service-unavailable"}',
      "lib-jitsi-meet: [WARN] ICE failed",
    ]);
  });
});
