import { gunzipSync } from "node:zlib";

const BLOCK = 512;

/** More than any file a module ships: a larger archive is refused. */
const MAX_TAR_BYTES = 256 * 1024 * 1024;
const decoder = new TextDecoder();

/** A NUL-terminated header field. */
function field(header: Uint8Array, start: number, length: number): string {
  const bytes = header.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end));
}

const isEnd = (header: Uint8Array): boolean => header.every((b) => b === 0);

/** Regular files: "0", or NUL in old archives. */
const isFile = (type: string): boolean => type === "0" || type === "";

/**
 * One file out of a gzipped tar (an npm-style `.tgz`), by its path in the
 * archive. The caller checks the archive's hash first; this only reads.
 */
export function extractFromTarGz(tgz: Uint8Array, path: string): Uint8Array {
  const tar = gunzipSync(tgz, { maxOutputLength: MAX_TAR_BYTES });
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (isEnd(header)) break;
    const name = field(header, 0, 100);
    const prefix = field(header, 345, 155);
    const sizeField = field(header, 124, 12).trim() || "0";
    const size = /^[0-7]+$/.test(sizeField)
      ? Number.parseInt(sizeField, 8)
      : NaN;
    if (!Number.isSafeInteger(size))
      throw new Error(`The archive has a corrupt header (${name})`);
    const start = offset + BLOCK;
    if (start + size > tar.length)
      throw new Error(`The archive is cut off inside ${name}`);
    const full = prefix ? `${prefix}/${name}` : name;
    if (full === path && isFile(field(header, 156, 1)))
      return tar.subarray(start, start + size);
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error(`${path} is not in the archive`);
}
