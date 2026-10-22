const LEFT_TO_RIGHT_ISOLATE = '\u2066';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

/** Keep booking references, links and phone numbers readable inside RTL messages. Storage stays untouched. */
export function chatMessageDisplayText(body: string): string {
  if (!/[\u0590-\u08ff]/u.test(body)) return body;
  return body.replace(
    /(?:https?:\/\/|www\.)[^\s\u0590-\u08ff]+|\+?\d[\d ().-]*\d|[#@]?[A-Za-z0-9][A-Za-z0-9._@:/?&=%+#-]*/gu,
    (leftToRight) => `${LEFT_TO_RIGHT_ISOLATE}${leftToRight}${POP_DIRECTIONAL_ISOLATE}`,
  );
}
