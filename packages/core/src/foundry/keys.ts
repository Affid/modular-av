const isTree = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The dotted paths of every leaf, as `Object.keys(flattenObject(tree))`. */
export function flattenKeys(tree: object, prefix = ""): readonly string[] {
  return Object.entries(tree).flatMap(([key, value]: [string, unknown]) =>
    isTree(value) && Object.keys(value).length > 0
      ? flattenKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}
