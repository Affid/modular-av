/**
 * What a kernel may be sent, so a processing server can be sent it too:
 * objects, arrays, strings, numbers (any, NaN included), booleans, null and
 * raw bytes (`ArrayBuffer` and views of one). Not functions, class instances,
 * `Map`, `Set`, a compiled `WebAssembly.Module` or shared memory.
 */

const isBytes = (value: object): boolean =>
  value instanceof ArrayBuffer ||
  (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer);

const isPlainObject = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const kindOf = (value: object): string =>
  (value as { constructor?: { name?: string } }).constructor?.name ??
  "class instance";

function firstNotPlain(
  entries: readonly (readonly [string, unknown])[],
  ancestors: ReadonlySet<object>,
): string | null {
  for (const [path, item] of entries) {
    const found = notPlainAt(item, path, ancestors);
    if (found) return found;
  }
  return null;
}

/** Says where `value` holds what isn't plain data, or null if nothing does. */
function notPlainAt(
  value: unknown,
  path: string,
  ancestors: ReadonlySet<object>,
): string | null {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return null;
  if (typeof value !== "object") return `${path} is a ${type}`;
  if (ancestors.has(value)) return `${path} refers to itself`;
  if (isBytes(value)) return null;
  const inside = new Set([...ancestors, value]);
  if (Array.isArray(value)) {
    const items = value.map((item, i) => [`${path}[${i}]`, item] as const);
    return firstNotPlain(items, inside);
  }
  if (!isPlainObject(value)) return `${path} is a ${kindOf(value)}`;
  const fields = Object.entries(value).map(
    ([key, item]) => [`${path}.${key}`, item] as const,
  );
  return firstNotPlain(fields, inside);
}

export const notPlainData = (value: unknown, path: string): string | null =>
  notPlainAt(value, path, new Set());
