/** A sign-in token as JWTs start, whole. */
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g;
const TOKEN_PARAM = /((?:access_)?token|jwt)=[^&\s"']+/gi;
const ROOM_PARAM = /([?&]room=)[^&\s"']+/gi;
/** The name before "@" in an XMPP address: a room, or someone's id. */
const XMPP_NAME = /[^\s@"'<>/:]+@(?=[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;

/**
 * A log line without what could let someone in: a token (SDK errors can
 * carry one in a URL), and an open server's room, which is all that keeps
 * it private, as lib-jitsi-meet writes it in a WebSocket address
 * (`?room=`) or an XMPP one (`room@muc.example.com`).
 */
export const redact = (text: string): string =>
  text
    .replace(JWT, "[token]")
    .replace(TOKEN_PARAM, "$1=[token]")
    .replace(ROOM_PARAM, "$1[room]")
    .replace(XMPP_NAME, "[name]@");
