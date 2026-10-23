/** Foundry's `CONST.USER_ROLES`. */
export const USER_ROLES = {
  NONE: 0,
  PLAYER: 1,
  TRUSTED: 2,
  ASSISTANT: 3,
  GAMEMASTER: 4,
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

interface PermissionRule {
  /** Roles at or above this hold the permission unless overridden. */
  readonly defaultRole: UserRole;
  /** Roles that always hold it; an override cannot revoke it. */
  readonly requiredRoles: readonly UserRole[];
}

/** As in Foundry v14 (common/constants.mjs USER_PERMISSIONS). */
const PERMISSIONS: Readonly<Record<string, PermissionRule>> = {
  BROADCAST_AUDIO: { defaultRole: USER_ROLES.TRUSTED, requiredRoles: [] },
  BROADCAST_VIDEO: { defaultRole: USER_ROLES.TRUSTED, requiredRoles: [] },
  SETTINGS_MODIFY: {
    defaultRole: USER_ROLES.ASSISTANT,
    requiredRoles: [USER_ROLES.GAMEMASTER],
  },
};

export interface FakeUserData {
  readonly id: string;
  readonly name: string;
  readonly role: number;
  readonly color?: string;
  readonly avatar?: string;
  readonly permissions?: Readonly<Record<string, boolean>>;
}

export interface FakeUser extends FakeUserData {
  readonly active: boolean;
  /** Includes assistant GMs, as in Foundry. */
  readonly isGM: boolean;
  hasPermission(permission: string): boolean;
}

export function createUser(data: FakeUserData, active: boolean): FakeUser {
  return Object.freeze({
    ...data,
    active,
    isGM: data.role >= USER_ROLES.ASSISTANT,
    /** Same order of checks as Foundry's `User#hasPermission`. */
    hasPermission(permission: string): boolean {
      const rule = PERMISSIONS[permission];
      if (!rule) throw new Error(`Unknown permission "${permission}"`);
      if (data.role === USER_ROLES.NONE) return false;
      if ((rule.requiredRoles as readonly number[]).includes(data.role))
        return true;
      const override = data.permissions?.[permission];
      if (override !== undefined) return override;
      return data.role >= rule.defaultRole;
    },
  });
}

export interface FakeUsers {
  get(id: string): FakeUser | undefined;
  getName(name: string): FakeUser | undefined;
  readonly contents: readonly FakeUser[];
  /** The active GM with the highest role, then the lowest id; else null. */
  readonly activeGM: FakeUser | null;
}

export function createUsersView(read: () => readonly FakeUser[]): FakeUsers {
  return {
    get: (id) => read().find((user) => user.id === id),
    getName: (name) => read().find((user) => user.name === name),
    get contents() {
      return read();
    },
    get activeGM() {
      const [designated] = read()
        .filter((user) => user.active && user.isGM)
        .sort((a, b) => b.role - a.role || a.id.localeCompare(b.id));
      return designated ?? null;
    },
  };
}
