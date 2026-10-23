import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

export interface FoundryEnv {
  readonly appDir: string;
  readonly dataDir: string;
  readonly url: string;
  readonly adminPassword: string;
  readonly chromeCdpUrl: string;
}

function readEnvFile(): Readonly<Record<string, string>> {
  let text = "";
  try {
    text = readFileSync(join(ROOT, ".env.local"), "utf8");
  } catch {
    // No .env.local: defaults and the process environment apply.
  }
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]);
  return Object.fromEntries(entries) as Record<string, string>;
}

const expandHome = (path: string): string =>
  path.replace(/^~(?=$|\/)/, homedir());

/** Local Foundry settings from `.env.local`, then the environment, then defaults. */
export function loadFoundryEnv(): FoundryEnv {
  const file = readEnvFile();
  const get = (key: string, fallback = ""): string =>
    process.env[key] ?? file[key] ?? fallback;
  return {
    appDir: expandHome(get("FOUNDRY_APP_DIR", "~/foundry/vtt")),
    dataDir: expandHome(get("FOUNDRY_DATA_DIR", "~/foundry/data")),
    url: `http://localhost:${get("FOUNDRY_PORT", "30000")}`,
    adminPassword: get("FOUNDRY_ADMIN_PASSWORD"),
    chromeCdpUrl: get("CHROME_CDP_URL", "http://localhost:9222"),
  };
}
