import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cutHand,
  HAND_BONES,
  HAND_MESH,
  type Weights,
  writeHandMesh,
} from "./handmesh.ts";

// A body of five vertices: 0 to 2 belong wholly to the hand's two bones,
// 3 half to the shoulder, 4 wholly to the shoulder; and a helper group
// whose face is never part of the body.
const OBJ = [
  "# a made-up body",
  "v 0 0 0",
  "v 1 0 0",
  "v 0 1 0",
  "v 1 1 0",
  "v 2 2 0",
  "g body",
  "f 1/1 2/2 3/3",
  "f 2 4 3",
  "f 4 5 3",
  "g helper-tongue",
  "f 1 2 3",
].join("\n");

const SKELETON = {
  joints: { a: [0], b: [1, 2], c: [2], d: [3, 4] },
  bones: {
    arm: { parent: null, head: "a", tail: "b" },
    hand: { parent: "arm", head: "b", tail: "c" },
    shoulder: { parent: null, head: "d", tail: "a" },
  },
};

const WEIGHTS: Weights = {
  weights: {
    arm: [
      [0, 1],
      [1, 0.25],
    ],
    hand: [
      [1, 0.75],
      [2, 1],
      [3, 0.5],
    ],
    shoulder: [
      [3, 0.5],
      [4, 1],
    ],
  },
};

describe("the hand cut out of MakeHuman's body", () => {
  it("keeps the vertices that only the hand's bones move, and the body's faces made of them alone", () => {
    const hand = cutHand(OBJ, SKELETON, WEIGHTS, ["arm", "hand"]);

    expect(hand.verts).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    // The helper's face is left out though its vertices are kept.
    expect(hand.faces).toEqual([[0, 1, 2]]);
  });

  it("gives each bone its parent and its joints, each joint the middle of its vertices", () => {
    const hand = cutHand(OBJ, SKELETON, WEIGHTS, ["arm", "hand"]);

    expect(hand.bones).toEqual([
      { name: "arm", parent: null, head: [0, 0, 0], tail: [0.5, 0.5, 0] },
      { name: "hand", parent: "arm", head: [0.5, 0.5, 0], tail: [0, 1, 0] },
    ]);
  });

  it("weighs each kept vertex by the hand's bones, by their place in the list", () => {
    const hand = cutHand(OBJ, SKELETON, WEIGHTS, ["arm", "hand"]);

    expect(hand.weights).toEqual([
      [[0, 1]],
      [
        [0, 0.25],
        [1, 0.75],
      ],
      [[1, 1]],
    ]);
  });

  it("is the left forearm and hand: two forearm bones, the wrist, four palm bones and three to each finger", () => {
    expect(HAND_BONES).toHaveLength(3 + 4 + 15);
    expect(HAND_BONES.slice(0, 3)).toEqual([
      "lowerarm01.L",
      "lowerarm02.L",
      "wrist.L",
    ]);
    expect(HAND_BONES.every((name) => name.endsWith(".L"))).toBe(true);
  });

  it("is written beside the scenes' pictures, from the fetched files, for the scenes to read", async () => {
    const from = await mkdtemp(join(tmpdir(), "mirrors-makehuman-"));
    const out = await mkdtemp(join(tmpdir(), "mirrors-render-"));
    await writeFile(join(from, "base.obj"), OBJ);
    await writeFile(join(from, "default.mhskel"), JSON.stringify(SKELETON));
    await writeFile(join(from, "default_weights.mhw"), JSON.stringify(WEIGHTS));

    await writeHandMesh(from, out, ["arm", "hand"]);
    const written: unknown = JSON.parse(
      await readFile(join(out, HAND_MESH), "utf8"),
    );

    expect(HAND_MESH).toBe("mhhand.json");
    expect(written).toEqual(cutHand(OBJ, SKELETON, WEIGHTS, ["arm", "hand"]));
  });

  it("finds a joint's middle as Python sums floats, to the last bit (the scenes were tuned on that hand)", () => {
    const obj = [
      "v 0.1 0 0",
      "v 0.2 0 0",
      "v 0.3 0 0",
      "g body",
      "f 1 2 3",
    ].join("\n");
    const hand = cutHand(
      obj,
      {
        joints: { a: [0, 1, 2], b: [0] },
        bones: { only: { parent: null, head: "a", tail: "b" } },
      },
      {
        weights: {
          only: [
            [0, 1],
            [1, 1],
            [2, 1],
          ],
        },
      },
      ["only"],
    );

    // 0.1 + 0.2 + 0.3 added one by one is 0.6000000000000001; compensated, 0.6.
    expect(hand.bones[0]?.head[0]).toBe(0.6 / 3);
  });

  it("refuses a joint with no vertices, and a face that names a vertex the file lacks", () => {
    const empty = {
      ...SKELETON,
      joints: { ...SKELETON.joints, c: [] },
    };
    expect(() => cutHand(OBJ, empty, WEIGHTS, ["arm", "hand"])).toThrow(
      /joint c/,
    );
    expect(() =>
      cutHand(`${OBJ}\ng body\nf 1 2 9`, SKELETON, WEIGHTS, ["arm", "hand"]),
    ).toThrow(/vertex 9/);
  });

  it("refuses a skeleton that lacks one of the hand's bones", () => {
    expect(() => cutHand(OBJ, SKELETON, WEIGHTS, ["arm", "thumb"])).toThrow(
      /thumb/,
    );
  });
});
