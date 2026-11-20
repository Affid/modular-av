import { describe, expect, it } from "vitest";
import { roomUnder } from "../src/cameras/room-under.ts";

describe("roomUnder", () => {
  it("gives the last tile of one column the height left under the grid", () => {
    const room = roomUnder({
      count: 3,
      columns: 1,
      rowHeight: 100,
      height: 500,
      gap: 0,
    });

    expect(room).toEqual({ spare: 200, under: [0, 0, 200] });
  });

  it("gives a column that ends a row early that row's height too", () => {
    const room = roomUnder({
      count: 9,
      columns: 2,
      rowHeight: 80,
      height: 600,
      gap: 0,
    });

    expect(room.spare).toBe(200);
    expect(room.under).toEqual([0, 0, 0, 0, 0, 0, 0, 280, 200]);
  });

  it("counts the gaps between rows", () => {
    const room = roomUnder({
      count: 4,
      columns: 2,
      rowHeight: 100,
      height: 300,
      gap: 10,
    });

    expect(room).toEqual({ spare: 90, under: [0, 0, 90, 90] });
  });

  it("has no room in a grid that fills its space or scrolls", () => {
    const room = roomUnder({
      count: 5,
      columns: 1,
      rowHeight: 100,
      height: 400,
      gap: 0,
    });

    expect(room).toEqual({ spare: 0, under: [0, 0, 0, 0, 0] });
  });

  it("with one tile large, measures under the rows of the others", () => {
    const room = roomUnder({
      count: 5,
      columns: 2,
      rowHeight: 80,
      height: 600,
      gap: 0,
      large: { index: 1, rowHeight: 200 },
    });

    expect(room.spare).toBe(240);
    expect(room.under).toEqual([0, 0, 0, 240, 240]);
  });

  it("gives a large tile on its own all the room under it", () => {
    const room = roomUnder({
      count: 1,
      columns: 1,
      rowHeight: 300,
      height: 500,
      gap: 6,
      large: { index: 0, rowHeight: 300 },
    });

    expect(room).toEqual({ spare: 200, under: [200] });
  });

  it("puts a gap between the large tile and the rows under it", () => {
    const room = roomUnder({
      count: 3,
      columns: 2,
      rowHeight: 50,
      height: 400,
      gap: 10,
      large: { index: 0, rowHeight: 200 },
    });

    expect(room).toEqual({ spare: 140, under: [0, 140, 140] });
  });

  it("is the whole height with no tiles", () => {
    expect(
      roomUnder({ count: 0, columns: 1, rowHeight: 100, height: 320, gap: 0 }),
    ).toEqual({ spare: 320, under: [] });
  });
});
