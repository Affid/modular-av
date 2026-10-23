/** Foundry's `CONST.USER_ROLES`. */
export const USER_ROLES = {
  NONE: 0,
  PLAYER: 1,
  TRUSTED: 2,
  ASSISTANT: 3,
  GAMEMASTER: 4,
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/**
 * The lowest role that holds a permission when the user has no override.
 * Values follow Foundry's defaults; checked again against v14 in milestone 2.
 */
const DEFAULT_PERMISSION_ROLES: Readonly<Record<string, UserRole>> = {
  BROADCAST_AUDIO: USER_ROLES.TRUSTED,
  BROADCAST_VIDEO: USER_ROLES.TRUSTED,
  SETTINGS_MODIFY: USER_ROLES.ASSISTANT,
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
    hasPermission(permission: string): boolean {
      const override = data.permissions?.[permission];
      if (override !== undefined) return override;
      const minimum = DEFAULT_PERMISSION_ROLES[permission];
      return minimum !== undefined && data.role >= minimum;
    },
  });
}

export interface FakeUsers {
  get(id: string): FakeUser | undefined;
  getName(name: string): FakeUser | undefined;
  readonly contents: readonly FakeUser[];
  /** The active GM with the lowest id, as Foundry designates it. */
  readonly activeGM: FakeUser | undefined;
}

export function createUsersView(read: () => readonly FakeUser[]): FakeUsers {
  return {
    get: (id) => read().find((user) => user.id === id),
    getName: (name) => read().find((user) => user.name === name),
    get contents() {
      return read();
    },
    get activeGM() {
      return read()
        .filter((user) => user.active && user.isGM)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    },
  };
}
