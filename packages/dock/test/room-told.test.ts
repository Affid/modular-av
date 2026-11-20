// @vitest-environment happy-dom
import { NO_INSETS } from "@modular-av/kit";
import { afterEach, describe, expect, it } from "vitest";
import { createRoomTeller, type Laid } from "../src/cameras/room-told.ts";

afterEach(() => {
  document.body.replaceChildren();
});

function setUp(count: number) {
  const list = document.createElement("ol");
  const tiles = Array.from({ length: count }, () =>
    document.createElement("li"),
  );
  list.append(...tiles);
  document.body.append(list);
  return { list, tiles, tell: createRoomTeller(list) };
}

/** One column of tiles 160 wide (rows 90 high) in a list 400 high. */
const column: Laid = {
  fit: { columns: 1, width: 160, focusWidth: 160 },
  space: { width: 200, height: 400, gap: 0 },
  focus: false,
};
const room = (tile: HTMLElement): string =>
  tile.style.getPropertyValue("--mav-dock-tile-room");
const spare = (list: HTMLElement): string =>
  list.style.getPropertyValue("--mav-dock-spare");

describe("createRoomTeller", () => {
  it("tells the list the height left under the grid, and the last tile its room in tile widths", () => {
    const { list, tiles, tell } = setUp(3);

    tell({ tiles, large: -1, laid: column, reach: NO_INSETS });

    // Three rows of 90 in 400: 130 left, 130 / 160 of a tile's width.
    expect(spare(list)).toBe("130");
    expect(tiles.map(room)).toEqual(["0", "0", "0.813"]);
  });

  it("counts the room a theme keeps over and under each tile", () => {
    const { list, tiles, tell } = setUp(2);
    const reach = { top: 0.05, right: 0, bottom: 0.1, left: 0 };

    tell({ tiles, large: -1, laid: column, reach });

    // Each row is 90 + 0.15 * 160 = 114 high: 400 - 228.
    expect(spare(list)).toBe("172");
  });

  it("tells tiles again when they change places, though nothing else changed", () => {
    const { tiles, tell } = setUp(3);
    const [a, b, c] = tiles;
    if (!a || !b || !c) throw new Error("No tiles");
    tell({ tiles, large: -1, laid: column, reach: NO_INSETS });

    tell({ tiles: [c, a, b], large: -1, laid: column, reach: NO_INSETS });

    expect([c, a, b].map(room)).toEqual(["0", "0", "0.813"]);
  });

  it("tells a tile that took another's place", () => {
    const { list, tiles, tell } = setUp(2);
    tell({ tiles, large: -1, laid: column, reach: NO_INSETS });
    const [first] = tiles;
    const joined = document.createElement("li");
    list.append(joined);
    if (!first) throw new Error("No tiles");

    tell({ tiles: [first, joined], large: -1, laid: column, reach: NO_INSETS });

    expect(room(joined)).toBe("1.375");
  });

  it("measures under the thumbnails when one tile is large", () => {
    const { list, tiles, tell } = setUp(3);
    const laid: Laid = {
      fit: { columns: 2, width: 80, focusWidth: 160 },
      space: { width: 200, height: 400, gap: 0 },
      focus: true,
    };

    tell({ tiles, large: 0, laid, reach: NO_INSETS });

    // The large tile is 90 high, the row of two under it 45: 265 left.
    expect(spare(list)).toBe("265");
    expect(tiles.map(room)).toEqual(["0", "3.313", "3.313"]);
  });

  it("tells of no room where there is no grid to measure", () => {
    const { list, tiles, tell } = setUp(2);
    tell({ tiles, large: -1, laid: column, reach: NO_INSETS });

    tell({ tiles, large: -1, laid: null, reach: NO_INSETS });

    expect(spare(list)).toBe("0");
    expect(tiles.map(room)).toEqual(["0", "0"]);
  });

  it("writes nothing when nothing changed", () => {
    const { list, tiles, tell } = setUp(2);
    tell({ tiles, large: -1, laid: column, reach: NO_INSETS });
    list.style.setProperty("--mav-dock-spare", "marked");

    tell({
      tiles: [...tiles],
      large: -1,
      laid: { ...column },
      reach: NO_INSETS,
    });

    expect(spare(list)).toBe("marked");
  });
});
