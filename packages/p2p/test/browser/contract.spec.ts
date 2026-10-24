// The service contract for P2P with direct links on this machine: no
// server at all, so it runs in the browser tier (pnpm test:browser).
import { serviceContract } from "@modular-av/testing/contract";

serviceContract({ service: "p2p", params: {}, secrets: {}, auth: "none" });
