// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { MountedBoard } from "../src/modules/board/board.ts";
import type { BoardHost } from "../src/modules/host.ts";
import { fill } from "../src/modules/window.ts";

function deferredMount() {
  let finish: (board: MountedBoard) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const mount = () =>
    new Promise<MountedBoard>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  return {
    mount,
    finish: (board: MountedBoard) => {
      finish(board);
    },
    fail: (error: unknown) => {
      fail(error);
    },
  };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

describe("filling the modules window", () => {
  const errors: unknown[] = [];
  const host = {
    t: (key: string) => key,
    onError: (error: unknown) => errors.push(error),
  } as unknown as BoardHost;

  it("drops a board that loaded after the window closed", async () => {
    const pending = deferredMount();
    let live = true;
    let disposed = 0;
    const mounted: MountedBoard[] = [];
    const content = document.createElement("div");
    fill(
      host,
      content,
      { live: () => live, mounted: (b) => mounted.push(b) },
      pending.mount,
    );

    live = false;
    pending.finish({
      dispose: () => {
        disposed += 1;
      },
    });
    await settle();

    expect(mounted).toEqual([]);
    expect(disposed).toBe(1);
  });

  it("says it failed in a window still open, and only there", async () => {
    const open = deferredMount();
    const closed = deferredMount();
    const shown = document.createElement("div");
    const gone = document.createElement("div");
    const window = (live: boolean) => ({
      live: () => live,
      mounted: () => undefined,
    });
    fill(host, shown, window(true), open.mount);
    fill(host, gone, window(false), closed.mount);

    open.fail(new Error("unreadable"));
    closed.fail(new Error("unreadable"));
    await settle();

    expect(shown.textContent).toBe("modular-av.modules.failed");
    expect(gone.textContent).toBe("");
    expect(errors).toHaveLength(2);
  });
});
