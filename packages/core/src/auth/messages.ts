/** Messages on the core's "auth" channel. Every field is checked on receipt. */
export interface TokenRequestMessage {
  readonly type: "request";
  readonly id: string;
}

export interface TokenReplyMessage {
  readonly type: "token";
  readonly id: string;
  readonly token: string;
}

const MAX_ID_LENGTH = 64;
/** Far above a real JWT; anything bigger is not a token. */
const MAX_TOKEN_LENGTH = 8192;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const isId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH;

export function isTokenRequest(value: unknown): value is TokenRequestMessage {
  return isRecord(value) && value.type === "request" && isId(value.id);
}

export function isTokenReply(value: unknown): value is TokenReplyMessage {
  return (
    isRecord(value) &&
    value.type === "token" &&
    isId(value.id) &&
    typeof value.token === "string" &&
    value.token.length > 0 &&
    value.token.length <= MAX_TOKEN_LENGTH
  );
}
