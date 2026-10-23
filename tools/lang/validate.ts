/**
 * Checks for Foundry language files. Foundry expands dotted keys into
 * nested objects; a key that ends up both a string and a parent makes it
 * drop the whole file, so these checks run on every build.
 */

export interface LangIssue {
  /** Dotted key path, "" for the file itself. */
  readonly path: string;
  readonly message: string;
}

interface Walk {
  readonly leaves: readonly string[];
  readonly issues: readonly LangIssue[];
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeName(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function walk(node: Readonly<Record<string, unknown>>, prefix: string): Walk {
  return Object.entries(node).reduce<Walk>(
    (acc, [key, value]) => {
      if (key.split(".").some((segment) => segment === "")) {
        const issue = {
          path: prefix,
          message: `key "${key}" has an empty segment`,
        };
        return { ...acc, issues: [...acc.issues, issue] };
      }
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string")
        return { ...acc, leaves: [...acc.leaves, path] };
      if (isObject(value)) {
        const inner = walk(value, path);
        return {
          leaves: [...acc.leaves, ...inner.leaves],
          issues: [...acc.issues, ...inner.issues],
        };
      }
      const issue = {
        path,
        message: `must be a string or an object, not ${typeName(value)}`,
      };
      return { ...acc, issues: [...acc.issues, issue] };
    },
    { leaves: [], issues: [] },
  );
}

function structureIssues(leaves: readonly string[]): readonly LangIssue[] {
  const unique = [...new Set(leaves)];
  const duplicates = unique
    .filter((leaf) => leaves.indexOf(leaf) !== leaves.lastIndexOf(leaf))
    .map((path) => ({ path, message: "is defined more than once" }));
  const clashes = unique.flatMap((leaf) => {
    const child = unique.find((other) => other.startsWith(`${leaf}.`));
    return child
      ? [
          {
            path: leaf,
            message: `is both a string and a parent of "${child}"; Foundry would drop the whole file`,
          },
        ]
      : [];
  });
  return [...duplicates, ...clashes];
}

export function validateLanguageData(
  data: unknown,
  moduleId: string,
): readonly LangIssue[] {
  if (!isObject(data)) return [{ path: "", message: "must be a JSON object" }];

  const rootIssues: LangIssue[] = [
    ...(moduleId in data
      ? []
      : [{ path: "", message: `missing root key "${moduleId}"` }]),
    ...Object.keys(data)
      .filter((key) => key !== moduleId)
      .map((key) => ({
        path: "",
        message: `unexpected root key "${key}": every key must sit under "${moduleId}"`,
      })),
  ];
  const { leaves, issues } = walk(data, "");
  return [...rootIssues, ...issues, ...structureIssues(leaves)];
}

/** Keys in `data` that the reference language (English) does not have. */
export function compareWithReference(
  data: unknown,
  reference: unknown,
): readonly LangIssue[] {
  if (!isObject(data) || !isObject(reference)) return [];
  const known = new Set(walk(reference, "").leaves);
  return walk(data, "")
    .leaves.filter((leaf) => !known.has(leaf))
    .map((path) => ({
      path,
      message: "is not in the reference language file",
    }));
}
