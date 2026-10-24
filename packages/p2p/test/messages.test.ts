import { describe, expect, it } from "vitest";
import {
  MAX_CANDIDATE_LENGTH,
  MAX_SDP_LENGTH,
  parseSignal,
} from "../src/messages.ts";

const base = { v: 1, room: "world-1", from: "s-alice" } as const;

describe("parseSignal", () => {
  it("accepts every message type in its documented shape", () => {
    const messages = [
      { ...base, type: "hello", joinedAt: 1000 },
      { ...base, type: "welcome", to: "s-bob", joinedAt: 1000 },
      {
        ...base,
        type: "description",
        to: "s-bob",
        epoch: 0,
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      {
        ...base,
        type: "candidate",
        to: "s-bob",
        epoch: 2,
        candidate: {
          candidate: "candidate:1 1 udp 1 192.0.2.1 5000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
          usernameFragment: "abcd",
        },
      },
      { ...base, type: "candidate", to: "s-bob", epoch: 0, candidate: null },
      {
        ...base,
        type: "sources",
        to: "s-bob",
        epoch: 1,
        sources: { "0": "microphone", "1": "camera" },
      },
      { ...base, type: "bye" },
      { ...base, type: "bye", to: "s-bob" },
    ];

    expect(messages.map((m) => parseSignal(m))).toEqual(messages);
  });

  it("keeps only the fields it knows", () => {
    const parsed = parseSignal({
      ...base,
      type: "hello",
      joinedAt: 5,
      isGM: true,
    });

    expect(parsed).toEqual({ ...base, type: "hello", joinedAt: 5 });
  });

  it.each([
    ["not an object", "hello"],
    ["null", null],
    ["another protocol version", { ...base, v: 2, type: "bye" }],
    ["an unknown type", { ...base, type: "kick" }],
    ["a missing room", { v: 1, from: "s-a", type: "bye" }],
    ["a session id with odd characters", { ...base, from: "a b", type: "bye" }],
    ["a session id too long", { ...base, from: "x".repeat(65), type: "bye" }],
    [
      "a join time that is no number",
      { ...base, type: "hello", joinedAt: "1" },
    ],
    ["an infinite join time", { ...base, type: "hello", joinedAt: Infinity }],
    ["a welcome without recipient", { ...base, type: "welcome", joinedAt: 1 }],
    [
      "a negative epoch",
      { ...base, type: "candidate", to: "s-b", epoch: -1, candidate: null },
    ],
    [
      "a fractional epoch",
      { ...base, type: "candidate", to: "s-b", epoch: 1.5, candidate: null },
    ],
    [
      "a description of an odd type",
      {
        ...base,
        type: "description",
        to: "s-b",
        epoch: 0,
        description: { type: "rollback", sdp: "" },
      },
    ],
    [
      "an SDP over the limit",
      {
        ...base,
        type: "description",
        to: "s-b",
        epoch: 0,
        description: { type: "offer", sdp: "x".repeat(MAX_SDP_LENGTH + 1) },
      },
    ],
    [
      "a candidate over the limit",
      {
        ...base,
        type: "candidate",
        to: "s-b",
        epoch: 0,
        candidate: {
          candidate: "x".repeat(MAX_CANDIDATE_LENGTH + 1),
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      },
    ],
    [
      "a candidate with an odd line index",
      {
        ...base,
        type: "candidate",
        to: "s-b",
        epoch: 0,
        candidate: { candidate: "c", sdpMid: null, sdpMLineIndex: 99 },
      },
    ],
    [
      "an unknown source",
      {
        ...base,
        type: "sources",
        to: "s-b",
        epoch: 0,
        sources: { "0": "telepathy" },
      },
    ],
    [
      "the same source twice",
      {
        ...base,
        type: "sources",
        to: "s-b",
        epoch: 0,
        sources: { "0": "camera", "1": "camera" },
      },
    ],
    [
      "too many sources",
      {
        ...base,
        type: "sources",
        to: "s-b",
        epoch: 0,
        sources: {
          a: "microphone",
          b: "camera",
          c: "screen",
          d: "screen-audio",
          e: "camera",
        },
      },
    ],
    [
      "an odd media id",
      {
        ...base,
        type: "sources",
        to: "s-b",
        epoch: 0,
        sources: { "a b": "camera" },
      },
    ],
    ["a bye to an odd session", { ...base, type: "bye", to: "a b" }],
    [
      "a welcome with no join time",
      { ...base, type: "welcome", to: "s-b", joinedAt: null },
    ],
    [
      "a description that is no object",
      { ...base, type: "description", to: "s-b", epoch: 0, description: "x" },
    ],
    [
      "a candidate that is no object",
      { ...base, type: "candidate", to: "s-b", epoch: 0, candidate: "x" },
    ],
    [
      "a candidate with an odd media id",
      {
        ...base,
        type: "candidate",
        to: "s-b",
        epoch: 0,
        candidate: { candidate: "c", sdpMid: "a b", sdpMLineIndex: 0 },
      },
    ],
    [
      "a candidate with an odd username fragment",
      {
        ...base,
        type: "candidate",
        to: "s-b",
        epoch: 0,
        candidate: {
          candidate: "c",
          sdpMid: "0",
          sdpMLineIndex: 0,
          usernameFragment: 5,
        },
      },
    ],
    [
      "sources that are no object",
      { ...base, type: "sources", to: "s-b", epoch: 0, sources: ["camera"] },
    ],
    ["an empty room", { ...base, room: "", type: "bye" }],
  ])("refuses %s", (_label, value) => {
    expect(parseSignal(value)).toBeNull();
  });
});
