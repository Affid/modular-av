/** Helpers like `foundry.utils`, without mutating their inputs. */

type Tree = Readonly<Record<string, unknown>>;

const isTree = (value: unknown): value is Tree =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `{ "a.b": 1 }` → `{ a: { b: 1 } }`, as `foundry.utils.expandObject`. */
export function expandObject(flat: Tree): Tree {
  return Object.entries(flat).reduce<Tree>(
    (tree, [path, value]) => setProperty(tree, path, value),
    {},
  );
}

/**
 * A copy of `tree` with `value` at the dotted `path`. The result keeps the
 * input's type: callers vouch that the path and value fit it.
 */
export function setProperty<T extends object>(
  tree: T,
  path: string,
  value: unknown,
): T {
  const [head, ...rest] = path.split(".");
  if (head === undefined || head === "") throw new Error("Empty path");
  const source = tree as Tree;
  if (rest.length === 0) return { ...source, [head]: value } as T;
  const child = source[head];
  return {
    ...source,
    [head]: setProperty(isTree(child) ? child : {}, rest.join("."), value),
  } as T;
}

export function getProperty(tree: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) => (isTree(node) ? node[key] : undefined),
      tree,
    );
}

/** Deep merge of plain objects; `b` wins. The result keeps `a`'s type. */
export function mergeObject<T extends object>(a: T, b: object): T {
  return Object.entries(b).reduce<T>(
    (merged, [key, value]: [string, unknown]) => {
      const current = (merged as Tree)[key];
      return {
        ...merged,
        [key]:
          isTree(current) && isTree(value)
            ? mergeObject(current, value)
            : value,
      };
    },
    a,
  );
}

/** The dotted paths of every leaf, as `Object.keys(flattenObject(tree))`. */
export function flattenKeys(tree: Tree, prefix = ""): readonly string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    isTree(value) && Object.keys(value).length > 0
      ? flattenKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}
