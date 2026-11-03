import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTable, RENEW_MS, STOP_AFTER_MS } from "../src/table/table.ts";
import { COALESCE_MS, parseReport } from "../src/table/report.ts";
import { effect, testMixer } from "./context.ts";

interface Sent {
  readonly data: unknown;
  readonly recipients: readonly string[] | undefined;
}

function setup(options: { selfIsGM?: boolean } = {}) {
  const mixer = testMixer({
    effects: [effect("reverb", "send", { tail: 3 })],
    local: { chosenEffects: ["reverb"], audioEffectMix: { reverb: 0.3 } },
  });
  const sent: Sent[] = [];
  const table = createTable({
    api: mixer.api,
    channel: {
      send: (data, opts) => {
        sent.push({ data, recipients: opts?.recipients });
      },
    },
    isGM: (id) => id === "gm" || id === "gm2",
    selfIsGM: options.selfIsGM ?? false,
    automationRate: true,
    layerStates: () => [],
    onError: (error) => mixer.errors.push(error),
  });
  return { ...mixer, sent, table };
}

const reportsIn = (sent: readonly Sent[]) =>
  sent.filter((s) => (s.data as { type?: string }).type === "report");

const report = (mixes: number) => ({
  type: "report",
  snapshot: {
    effects: { reverb: { on: true, place: "send", mix: mixes } },
    order: { send: ["reverb"] },
    channelLevel: 1,
  },
  status: { reverb: "running" },
  warnings: [],
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a player's reports", () => {
  it("go only to a GM who asked", async () => {
    // Arrange
    const { sent, table } = setup();

    // Act
    table.receive({ type: "watch" }, "gm");
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    // Assert
    const [first] = reportsIn(sent);
    expect(first?.recipients).toEqual(["gm"]);
    expect(first?.data).toMatchObject({
      snapshot: { effects: { reverb: { on: true, place: "send", mix: 0.3 } } },
    });
  });

  it("carry only audio effects", async () => {
    // Arrange
    const { sent, table, setLocal } = setup();
    await setLocal({
      effects: {
        reverb: { status: "running", error: null },
        blur: { status: "running", error: null },
      },
    });

    // Act
    table.receive({ type: "watch" }, "gm");
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    // Assert
    expect(reportsIn(sent)[0]?.data).toMatchObject({
      status: { reverb: "running" },
    });
    expect(JSON.stringify(sent)).not.toContain("blur");
  });

  it("carry no device names", async () => {
    // Arrange
    const { sent, table, setLocal } = setup();
    await setLocal({
      chosenDevices: {
        audioInput: "secret-mic",
        audioOutput: "secret-speakers",
        videoInput: "secret-camera",
      },
    });

    // Act
    table.receive({ type: "watch" }, "gm");
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    // Assert
    expect(JSON.stringify(sent)).not.toContain("secret");
  });

  it("ignore a player asking", async () => {
    const { sent, table } = setup();

    table.receive({ type: "watch" }, "p2");
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    expect(sent).toEqual([]);
  });

  it("are coalesced: a burst of changes is one report", async () => {
    // Arrange
    const { sent, table, setLocal } = setup();
    table.receive({ type: "watch" }, "gm");
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    const before = reportsIn(sent).length;

    // Act
    await setLocal({ audioChannelLevel: 0.9 });
    await setLocal({ audioChannelLevel: 0.8 });
    await setLocal({ audioChannelLevel: 0.7 });
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    // Assert
    expect(reportsIn(sent).length).toBe(before + 1);
  });

  it("stop once a GM stops renewing, so a closed window costs nothing", async () => {
    // Arrange
    const { sent, table, setLocal } = setup();
    table.receive({ type: "watch" }, "gm");
    await vi.advanceTimersByTimeAsync(STOP_AFTER_MS + COALESCE_MS);
    const before = reportsIn(sent).length;

    // Act
    await setLocal({ audioChannelLevel: 0.5 });
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    // Assert
    expect(reportsIn(sent).length).toBe(before);
  });

  it("go on while a GM renews, to every GM still asking", async () => {
    // Arrange
    const { sent, table, setLocal } = setup();
    table.receive({ type: "watch" }, "gm");
    table.receive({ type: "watch" }, "gm2");
    await vi.advanceTimersByTimeAsync(STOP_AFTER_MS - 1_000);
    table.receive({ type: "watch" }, "gm");
    await vi.advanceTimersByTimeAsync(2_000);

    // Act
    await setLocal({ audioChannelLevel: 0.5 });
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    // Assert
    expect(reportsIn(sent).at(-1)?.recipients).toEqual(["gm"]);
  });
});

describe("a GM's view", () => {
  it("asks every 10 s while open, and stops when closed", async () => {
    // Arrange
    const { sent, table } = setup({ selfIsGM: true });

    // Act
    const stop = table.watch();
    await vi.advanceTimersByTimeAsync(RENEW_MS * 2);
    stop();
    await vi.advanceTimersByTimeAsync(RENEW_MS * 2);

    // Assert
    expect(
      sent.filter((s) => (s.data as { type: string }).type === "watch"),
    ).toHaveLength(3);
  });

  it("reads a report only as the sender's own", () => {
    // Arrange
    const { table } = setup({ selfIsGM: true });
    const listener = vi.fn();
    table.subscribe(listener);

    // Act
    table.receive(report(0.5), "p1");
    table.receive(report(0.9), "p2");

    // Assert
    expect(table.reportOf("p1")?.snapshot.effects.reverb?.mix).toBe(0.5);
    expect(table.reportOf("p2")?.snapshot.effects.reverb?.mix).toBe(0.9);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores a report on a player's client", () => {
    const { table } = setup();

    table.receive(report(0.5), "p1");

    expect(table.reportOf("p1")).toBeUndefined();
  });

  it("ignores a report that doesn't read as one", () => {
    const { table } = setup({ selfIsGM: true });

    table.receive({ type: "report", snapshot: "nope" }, "p1");

    expect(table.reportOf("p1")).toBeUndefined();
  });

  it("forgets everything when asked to stop listening", () => {
    const { table } = setup({ selfIsGM: true });
    const listener = vi.fn();
    const off = table.subscribe(listener);

    off();
    table.receive(report(0.5), "p1");

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores what isn't a message at all", () => {
    const { table } = setup({ selfIsGM: true });

    expect(() => {
      table.receive(null, "p1");
      table.receive("watch", "gm");
      table.receive({ type: "other" }, "gm");
    }).not.toThrow();
  });
});

describe("reading a report", () => {
  it.each([
    ["an unknown status", { ...report(1), status: { reverb: "great" } }],
    [
      "too many statuses",
      {
        ...report(1),
        status: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`e${String(i)}`, "off"]),
        ),
      },
    ],
    ["a status list that isn't one", { ...report(1), status: "running" }],
    ["warnings that aren't a list", { ...report(1), warnings: "bad" }],
    [
      "a warning naming too long an id",
      {
        ...report(1),
        warnings: [{ key: "doubled-voice", effect: "x".repeat(300) }],
      },
    ],
    ["an unknown warning", { ...report(1), warnings: [{ key: "nope" }] }],
    ["a warning that isn't one", { ...report(1), warnings: ["nope"] }],
    [
      "a warning about an odd effect",
      { ...report(1), warnings: [{ key: "doubled-voice", effect: 3 }] },
    ],
  ])("refuses %s", (_, bad) => {
    expect(parseReport(bad)).toBeNull();
  });

  it("takes a good one", () => {
    const good = {
      ...report(0.5),
      warnings: [
        { key: "doubled-voice", effect: "reverb" },
        { key: "channel-without-send" },
      ],
    };

    expect(parseReport(good)?.warnings).toHaveLength(2);
  });
});
