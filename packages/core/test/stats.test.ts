import type { ServiceDefinition } from "@modular-av/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATS_FRESH_MS } from "../src/session/stats.ts";
import { createTable } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** The mock service, counting how often it is asked. */
function counted(definition: ServiceDefinition, reads: string[]) {
  return {
    ...definition,
    canSignTokens: () => true,
    async create(context: Parameters<ServiceDefinition["create"]>[0]) {
      const connection = await definition.create(context);
      return {
        ...connection,
        capabilities: connection.capabilities,
        getStats() {
          reads.push("self");
          return connection.getStats();
        },
        getParticipantStats(participant: string) {
          reads.push(participant);
          const stats = connection.getParticipantStats?.(participant);
          if (!stats) throw new Error("the mock has participant stats");
          return stats;
        },
      };
    },
  };
}

describe("connection details", () => {
  it("tell this client's connection and the media from each participant", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();

    // Act
    const own = await p1.api.stats.get(null);
    const gm = await p1.api.stats.get("gm");

    // Assert
    expect(own).toEqual({ roundTripMs: 20, packetLoss: 0 });
    expect(gm).toEqual({ roundTripMs: 30, packetLoss: 0, jitterMs: 5 });
  });

  it("ask the service at most once a second, however often asked", async () => {
    const table = createTable();
    const reads: string[] = [];
    table.join("gm", { secret: true });
    const p1 = table.join("p1", {
      service: counted(table.hub.definition(), reads),
    });
    await table.settle();

    await p1.api.stats.get("gm");
    await p1.api.stats.get("gm");
    await p1.api.stats.get(null);
    vi.advanceTimersByTime(STATS_FRESH_MS);
    await p1.api.stats.get("gm");

    expect(reads).toEqual(["gm", "self", "gm"]);
  });

  it("explain why there are none", async () => {
    const table = createTable();
    const p1 = table.join("p1", { noService: true });
    await table.settle();

    await expect(p1.api.stats.get(null)).rejects.toMatchObject({
      code: "not-ready",
    });
  });

  it("know nobody outside the call", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();

    await expect(p1.api.stats.get("p4")).rejects.toMatchObject({
      code: "unknown-participant",
    });
  });

  it("say so when the service can't tell per participant", async () => {
    const table = createTable();
    const definition = table.hub.definition();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", {
      service: {
        ...definition,
        canSignTokens: () => false,
        async create(context) {
          const copy = { ...(await definition.create(context)) };
          Reflect.deleteProperty(copy, "getParticipantStats");
          return copy;
        },
      },
    });
    await table.settle();

    await expect(p1.api.stats.get("gm")).rejects.toMatchObject({
      code: "unsupported",
    });
  });
});
