import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * Foundry's socket for the service harness (test-only): pages open an
 * event stream as a user in a space (one per contract test), and the
 * relay names the sender of every message it passes on, as Foundry's
 * server does. Without `recipients` a message reaches every other page in
 * the space; with them, every page of those users, the sender's included.
 */
interface Endpoint {
  readonly user: string;
  readonly space: string;
  readonly response: ServerResponse;
}

const MAX_BODY_BYTES = 1_000_000;
const NAME = /^[\w-]{1,64}$/;

let endpoints = new Map<number, Endpoint>();
let nextEndpoint = 1;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

function open(url: URL, res: ServerResponse): void {
  const user = url.searchParams.get("user") ?? "";
  const space = url.searchParams.get("space") ?? "";
  if (!NAME.test(user) || !NAME.test(space)) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const id = nextEndpoint++;
  endpoints = new Map(endpoints).set(id, { user, space, response: res });
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write(`event: endpoint\ndata: ${String(id)}\n\n`);
  res.on("close", () => {
    const rest = new Map(endpoints);
    rest.delete(id);
    endpoints = rest;
  });
}

interface Sent {
  readonly endpoint: number;
  readonly data: unknown;
  readonly recipients?: readonly string[];
}

function deliver({ endpoint, data, recipients }: Sent): boolean {
  const sender = endpoints.get(endpoint);
  if (!sender) return false;
  const line = `data: ${JSON.stringify({ sender: sender.user, data })}\n\n`;
  for (const [id, target] of endpoints) {
    if (target.space !== sender.space) continue;
    const reaches = recipients
      ? recipients.includes(target.user)
      : id !== endpoint;
    if (reaches) target.response.write(line);
  }
  return true;
}

async function send(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sent = JSON.parse(await readBody(req)) as Sent;
  res.statusCode = deliver(sent) ? 204 : 404;
  res.end();
}

/** `/signal/events?user=&space=` (a stream) and `/signal/send` (a POST). */
export function signalRelay(): Plugin {
  return {
    name: "modular-av:signal-relay",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://harness");
        if (url.pathname === "/signal/events" && req.method === "GET") {
          open(url, res);
        } else if (url.pathname === "/signal/send" && req.method === "POST") {
          send(req, res).catch(() => {
            res.statusCode = 400;
            res.end();
          });
        } else {
          next();
        }
      });
    },
  };
}
