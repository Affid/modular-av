// The hands' shape: the left forearm and hand cut out of MakeHuman's base
// mesh (CC0), with its default rig's joints and weights, written as one
// small file that the hand scenes read (render/realhand.py). It is made
// from the fetched files before every render (textures.ts pins them), so
// nothing of MakeHuman's is kept in the repository.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The file the scenes read, beside their pictures. */
export const HAND_MESH = "mhhand.json";

/** The bones of the left forearm and hand, parents before their children. */
export const HAND_BONES: readonly string[] = [
  "lowerarm01.L",
  "lowerarm02.L",
  "wrist.L",
  ...[1, 2, 3, 4].map((i) => `metacarpal${String(i)}.L`),
  ...[1, 2, 3, 4, 5].flatMap((f) =>
    [1, 2, 3].map((j) => `finger${String(f)}-${String(j)}.L`),
  ),
];

type Point = readonly [number, number, number];

/** What MakeHuman's skeleton file says that is read here. */
export interface Skeleton {
  /** Each joint: the vertices whose middle it is. */
  readonly joints: Readonly<Record<string, readonly number[]>>;
  readonly bones: Readonly<
    Record<
      string,
      {
        readonly parent: string | null;
        readonly head: string;
        readonly tail: string;
      }
    >
  >;
}

/** The rig's weights file: for each bone, its vertices and their weights. */
export interface Weights {
  readonly weights: Readonly<
    Record<string, readonly (readonly [number, number])[]>
  >;
}

export interface HandMesh {
  readonly verts: readonly Point[];
  readonly faces: readonly (readonly number[])[];
  readonly bones: readonly {
    readonly name: string;
    readonly parent: string | null;
    readonly head: Point;
    readonly tail: Point;
  }[];
  /** For each vertex, its bones (by their place in `bones`) and weights. */
  readonly weights: readonly (readonly (readonly [number, number])[])[];
}

/** The vertices of an OBJ, and the faces of its group `body` (MakeHuman's helpers are other groups). */
function parseObj(text: string): {
  verts: Point[];
  faces: number[][];
} {
  const verts: Point[] = [];
  const faces: number[][] = [];
  let group: string | undefined;
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "v") {
      const [x = 0, y = 0, z = 0] = parts.slice(1, 4).map(Number);
      verts.push([x, y, z]);
    } else if (parts[0] === "g") group = parts[1];
    else if (parts[0] === "f" && group === "body")
      faces.push(parts.slice(1).map((t) => Number(t.split("/")[0]) - 1));
  }
  for (const face of faces)
    for (const v of face)
      if (!Number.isInteger(v) || v < 0 || v >= verts.length)
        throw new Error(
          `A face names vertex ${String(v + 1)}, which the mesh lacks`,
        );
  return { verts, faces };
}

/** Each vertex's weights by bone, in the order the weights file lists the bones. */
function byVertex(weights: Weights): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const [bone, pairs] of Object.entries(weights.weights))
    for (const [vertex, weight] of pairs) {
      const own = out.get(vertex) ?? new Map<string, number>();
      own.set(bone, weight);
      out.set(vertex, own);
    }
  return out;
}

/**
 * A sum with Neumaier's compensation, as Python's own `sum` of floats
 * makes it: the joints come out as the mock's hand file had them, to the
 * last bit.
 */
function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let lost = 0;
  for (const value of values) {
    const next = sum + value;
    lost +=
      Math.abs(sum) >= Math.abs(value)
        ? sum - next + value
        : value - next + sum;
    sum = next;
  }
  return sum + lost;
}

/** The share of a vertex's weight its hand bones carry must be all of it. */
const WHOLLY = 0.999;

/**
 * Cuts out what only `bones` move: the vertices whose weight is wholly
 * theirs, the body's faces made of such vertices alone, and each bone's
 * joints (a joint is the middle of its vertices).
 */
export function cutHand(
  obj: string,
  skeleton: Skeleton,
  weights: Weights,
  bones: readonly string[] = HAND_BONES,
): HandMesh {
  const missing = bones.filter((bone) => !(bone in skeleton.bones));
  if (missing.length > 0)
    throw new Error(`The skeleton has no ${missing.join(", ")}`);
  const { verts, faces } = parseObj(obj);
  const weighted = byVertex(weights);
  const kept = new Set<number>();
  for (const [vertex, own] of weighted) {
    let total = 0;
    let mine = 0;
    for (const [bone, weight] of own) {
      total += weight;
      if (bones.includes(bone)) mine += weight;
    }
    if (total > 0 && mine / total > WHOLLY) kept.add(vertex);
  }
  const keptFaces = faces.filter((face) => face.every((v) => kept.has(v)));
  const used = [...new Set(keptFaces.flat())].sort((a, b) => a - b);
  const remap = new Map(used.map((v, k) => [v, k]));
  const joint = (name: string): Point => {
    const members = skeleton.joints[name] ?? [];
    if (members.length === 0)
      throw new Error(`The skeleton's joint ${name} has no vertices`);
    const mean = (axis: 0 | 1 | 2): number =>
      compensatedSum(members.map((v) => verts[v]?.[axis] ?? 0)) /
      members.length;
    return [mean(0), mean(1), mean(2)];
  };
  return {
    verts: used.map((v) => verts[v] ?? [0, 0, 0]),
    faces: keptFaces.map((face) => face.map((v) => remap.get(v) ?? -1)),
    bones: bones.map((name) => {
      const bone = skeleton.bones[name];
      if (!bone) throw new Error(`The skeleton has no ${name}`);
      return {
        name,
        parent: bone.parent,
        head: joint(bone.head),
        tail: joint(bone.tail),
      };
    }),
    weights: used.map((v) =>
      [...(weighted.get(v) ?? new Map<string, number>())]
        .filter(([bone]) => bones.includes(bone))
        .map(([bone, weight]) => [bones.indexOf(bone), weight] as const),
    ),
  };
}

/** Cuts the hand out of MakeHuman's files in `from` and writes it into `out`, for the scenes. */
export async function writeHandMesh(
  from: string,
  out: string,
  bones: readonly string[] = HAND_BONES,
): Promise<void> {
  const [obj, skeleton, weights] = await Promise.all([
    readFile(join(from, "base.obj"), "utf8"),
    readFile(join(from, "default.mhskel"), "utf8"),
    readFile(join(from, "default_weights.mhw"), "utf8"),
  ]);
  const hand = cutHand(
    obj,
    JSON.parse(skeleton) as Skeleton,
    JSON.parse(weights) as Weights,
    bones,
  );
  await writeFile(join(out, HAND_MESH), JSON.stringify(hand));
}
