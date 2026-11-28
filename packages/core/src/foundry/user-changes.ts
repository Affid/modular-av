import { MODULE_ID } from "../constants.ts";

/**
 * What the core reads of a user (see `state/project.ts` and
 * `foundry/av-facts.ts`): `isGM` comes from the role, `can()` from the role
 * and the permissions. A new field read there belongs here too.
 */
const READ_FIELDS: readonly string[] = [
  "name",
  "color",
  "avatar",
  "role",
  "permissions",
  "active",
];

/** The core's flags, set, changed or removed as a whole. */
const OWN_FLAGS: readonly string[] = [MODULE_ID, `-=${MODULE_ID}`];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/**
 * Whether a user's update (the changes Foundry passes to `updateUser`)
 * changes anything the core reads. Other modules write their own flags on
 * users, some every few seconds, and each write reaches every browser.
 */
export function affectsCore(changes: unknown): boolean {
  if (!isRecord(changes)) return true;
  if (READ_FIELDS.some((field) => field in changes)) return true;
  const { flags } = changes;
  return isRecord(flags) && OWN_FLAGS.some((scope) => scope in flags);
}
