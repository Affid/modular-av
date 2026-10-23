export type Translations = Readonly<{ [key: string]: string | Translations }>;

export interface FakeI18n {
  readonly lang: string;
  has(key: string): boolean;
  localize(key: string): string;
  format(key: string, data: Readonly<Record<string, string | number>>): string;
}

function lookup(translations: Translations, key: string): string | undefined {
  let node: string | Translations | undefined = translations;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Nested translations, looked up by dotted key like Foundry's `game.i18n`. */
export function createI18n(translations: Translations, lang = "en"): FakeI18n {
  return {
    lang,
    has: (key) => lookup(translations, key) !== undefined,
    localize: (key) => lookup(translations, key) ?? key,
    format: (key, data) =>
      (lookup(translations, key) ?? key).replace(
        /\{(\w+)\}/g,
        (match, name: string) => (name in data ? String(data[name]) : match),
      ),
  };
}
