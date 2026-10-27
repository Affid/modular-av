import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractFromTarGz } from "./tar.ts";

const encoder = new TextEncoder();

/** One ustar entry: a 512-byte header, then the data padded to 512. */
function entry(name: string, data: string, type = "0", prefix = ""): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, "ascii");
  const body = Buffer.from(encoder.encode(data));
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write(type, 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write(prefix, 345, 155, "utf8");
  const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  body.copy(padded);
  return Buffer.concat([header, padded]);
}

const archive = (...entries: Buffer[]): Uint8Array =>
  gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("taking one file out of a .tgz", () => {
  it("finds a file by its path in the archive", () => {
    const tgz = archive(
      entry("package/README.md", "read me"),
      entry("package/dist/lib.min.js", "console.log(1)"),
    );

    expect(text(extractFromTarGz(tgz, "package/dist/lib.min.js"))).toBe(
      "console.log(1)",
    );
  });

  it("reads past entries longer than one block", () => {
    const tgz = archive(
      entry("package/big.js", "x".repeat(1300)),
      entry("package/LICENSE", "Apache License"),
    );

    expect(text(extractFromTarGz(tgz, "package/LICENSE"))).toBe(
      "Apache License",
    );
  });

  it("joins a ustar prefix to the name", () => {
    const tgz = archive(entry("lib.min.js", "ok", "0", "package/dist/umd"));

    expect(text(extractFromTarGz(tgz, "package/dist/umd/lib.min.js"))).toBe(
      "ok",
    );
  });

  it("takes only regular files", () => {
    const tgz = archive(entry("package/dist", "", "5"));

    expect(() => extractFromTarGz(tgz, "package/dist")).toThrow(/not in/);
  });

  it("fails plainly for a path the archive doesn't have", () => {
    const tgz = archive(entry("package/a.js", "a"));

    expect(() => extractFromTarGz(tgz, "package/b.js")).toThrow(
      "package/b.js is not in the archive",
    );
  });

  it("refuses an archive cut off inside an entry", () => {
    const whole = entry("package/a.js", "y".repeat(2000));
    const tgz = gzipSync(whole.subarray(0, 1024));

    expect(() => extractFromTarGz(tgz, "package/a.js")).toThrow(/cut off/);
  });

  it.each([["-0001000"], ["9zz"]])(
    "refuses a header whose size is %j rather than looping or guessing",
    (size) => {
      const bad = entry("package/a.js", "a");
      bad.write(`${size}\0`.padEnd(12, "\0"), 124, "ascii");

      expect(() => extractFromTarGz(archive(bad), "package/a.js")).toThrow(
        /corrupt/,
      );
    },
  );
});
