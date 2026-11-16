// Numbers, dates and text as the stats show them.

const DAY_MS = 86_400_000;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

export const escapeXml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const formatCount = (n: number): string => n.toLocaleString("en-US");

export const dayNumber = (date: string): number =>
  Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

export const dateOfDay = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

/** "Nov 13", or "Nov 13, 2026" when the year should be said. */
export function formatDate(date: string, withYear = false): string {
  const [year, month, day] = date.split("-");
  const label = `${MONTHS[Number(month) - 1] ?? "?"} ${Number(day)}`;
  return withYear ? `${label}, ${year ?? ""}` : label;
}
