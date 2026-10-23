// Foundry's server administration endpoints, as its own setup screen uses them.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type APIRequestContext, request } from "@playwright/test";

const POLL_MS = 1000;

export interface PackageListing {
  readonly id: string;
  readonly manifest: string;
}

/** Foundry rejects POSTs without a same-origin Origin header (CSRF check). */
export function createAdminClient(url: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: url,
    extraHTTPHeaders: { Origin: url },
  });
}

interface SetupRequest {
  readonly action: string;
  readonly [field: string]: unknown;
}

/** Errors name the action only: request bodies may hold the admin password. */
async function post(
  api: APIRequestContext,
  path: string,
  data: SetupRequest,
): Promise<unknown> {
  const response = await api.post(path, { data, maxRedirects: 0 });
  const body: unknown = await response.json().catch(() => ({}));
  const error = (body as { error?: unknown }).error;
  if (!response.ok() || typeof error === "string") {
    const reason =
      typeof error === "string" ? error : `HTTP ${String(response.status())}`;
    throw new Error(`Foundry ${path} "${data.action}" failed: ${reason}`);
  }
  return body;
}

export async function waitFor(
  label: string,
  timeoutMs: number,
  check: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await sleep(POLL_MS);
  }
}

/** The world Foundry is running, if any (setup redirects to /join then). */
export async function hasActiveWorld(api: APIRequestContext): Promise<boolean> {
  const response = await api.get("/setup", { maxRedirects: 0 });
  return /\/(join|game)$/.test(response.headers().location ?? "");
}

async function login(
  api: APIRequestContext,
  password: string,
): Promise<boolean> {
  const response = await api.post("/auth", {
    form: { action: "adminAuth", adminPassword: password },
    maxRedirects: 0,
  });
  return (response.headers().location ?? "").endsWith("/setup");
}

export type AdminLogin = "logged-in" | "password-set-restart-needed";

/**
 * Logs in as administrator. If Foundry has no password yet, sets it and
 * reports that a restart is needed: Foundry reads it only at startup.
 */
export async function loginAsAdmin(
  api: APIRequestContext,
  password: string,
  configDir: string,
): Promise<AdminLogin> {
  if (!password) throw new Error("Set FOUNDRY_ADMIN_PASSWORD in .env.local");
  if (!existsSync(join(configDir, "admin.txt"))) {
    await post(api, "/setup", {
      action: "adminConfigure",
      config: { adminPassword: password },
    });
    return "password-set-restart-needed";
  }
  if (!(await login(api, password))) {
    throw new Error(
      "Foundry refused the administrator password from .env.local",
    );
  }
  return "logged-in";
}

/** Looks a package up in Foundry's online package list. */
export async function findPackage(
  api: APIRequestContext,
  type: "system" | "module",
  id: string,
): Promise<PackageListing> {
  const body = await post(api, "/setup", { action: "getPackages", type });
  const listing = Array.isArray(body)
    ? (body as readonly PackageListing[]).find((p) => p.id === id)
    : undefined;
  if (!listing)
    throw new Error(`Foundry's package list has no ${type} "${id}"`);
  return listing;
}

export async function installPackage(
  api: APIRequestContext,
  listing: PackageListing,
  type: "system" | "module",
  installedFile: string,
): Promise<void> {
  await post(api, "/setup", {
    action: "installPackage",
    type,
    id: listing.id,
    manifest: listing.manifest,
  });
  await waitFor(`${type} ${listing.id} to install`, 5 * 60_000, () =>
    Promise.resolve(existsSync(installedFile)),
  );
}

export async function createWorld(
  api: APIRequestContext,
  world: {
    readonly id: string;
    readonly title: string;
    readonly system: string;
  },
  worldFile: string,
): Promise<void> {
  // A system that just installed is registered a moment after its files land.
  await waitFor(`system ${world.system} to be registered`, 60_000, async () => {
    try {
      await post(api, "/create", { action: "createWorld", ...world });
      return true;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.includes("does not seem to exist")
      )
        return false;
      throw error;
    }
  });
  await waitFor(`world ${world.id} to be created`, 60_000, () =>
    Promise.resolve(existsSync(worldFile)),
  );
}

export async function launchWorld(
  api: APIRequestContext,
  id: string,
): Promise<void> {
  await post(api, "/setup", { action: "launchWorld", world: id });
  await waitFor(`world ${id} to launch`, 2 * 60_000, () => hasActiveWorld(api));
}
