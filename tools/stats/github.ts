// The GitHub API calls the snapshot makes. Release downloads are public, so
// a token there only raises the rate limit; traffic needs a token with read
// access to the repository's Administration (STATS_TOKEN in the workflow).
import { REPOSITORY } from "../release/manifest.ts";

const API = `https://api.github.com/repos/${REPOSITORY}`;
const PAGE_SIZE = 100;

export type Get = (path: string) => Promise<unknown>;
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** A GET on this repository's API that fails loudly on any error answer. */
export function apiGetter(token: string, fetchFn: FetchFn = fetch): Get {
  return async (path) => {
    const response = await fetchFn(`${API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub answered ${response.status} for ${path}`);
    }
    return response.json() as Promise<unknown>;
  };
}

/** Every release, a page of 100 at a time. */
export async function allReleases(get: Get): Promise<unknown[]> {
  const releases: unknown[] = [];
  for (let page = 1; ; page++) {
    const batch = await get(`/releases?per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(batch)) {
      throw new Error(`Expected a list of releases: ${JSON.stringify(batch)}`);
    }
    releases.push(...(batch as unknown[]));
    if (batch.length < PAGE_SIZE) return releases;
  }
}

export interface TrafficAnswers {
  readonly views: unknown;
  readonly clones: unknown;
}

/** GitHub's last 14 days of views and clones. Referrers are never asked for. */
export async function trafficAnswers(get: Get): Promise<TrafficAnswers> {
  const [views, clones] = await Promise.all([
    get("/traffic/views"),
    get("/traffic/clones"),
  ]);
  return { views, clones };
}
