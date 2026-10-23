/** Small, non-HTML dialogue markup. Offsets and reveal counts use Unicode code points. */
export type DialogueExpression =
  "neutral" | "happy" | "sad" | "angry" | "surprised" | "blush";
export type DialogueColor =
  "gold" | "green" | "red" | "blue" | "cream" | "muted";
export type DialogueToken =
  | { type: "text"; text: string; offset: number }
  | { type: "expression"; expression: DialogueExpression; offset: number }
  | { type: "pause"; milliseconds: number; offset: number }
  | { type: "speed"; milliseconds: number; offset: number }
  | { type: "color"; color: DialogueColor; offset: number }
  | { type: "endColor"; offset: number }
  | { type: "item"; id: string; text: string; offset: number };
export interface ParsedDialogueText {
  tokens: DialogueToken[];
  plainText: string;
  visibleLength: number;
}
export interface DialogueTextOptions {
  playerName?: string;
  /** Return the localized item label; undefined leaves an unknown tag literal. */
  itemName?: (id: string) => string | undefined;
}
const expressions = new Set<string>([
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "blush",
]);
const colors = new Set<string>([
  "gold",
  "green",
  "red",
  "blue",
  "cream",
  "muted",
]);

/** Unknown and malformed tags remain visible, allowing authored errors to be noticed. */
export function parseDialogueText(
  source: string,
  options: DialogueTextOptions = {},
): ParsedDialogueText {
  const tokens: DialogueToken[] = [];
  const visible: string[] = [];
  let offset = 0;
  let colorDepth = 0;
  const append = (input: string): void => {
    if (!input) return;
    // Substitution happens after markup recognition: player names can never inject commands.
    const text =
      options.playerName === undefined
        ? input
        : input.replace(/\{player\}/g, () => options.playerName ?? "");
    const previous = tokens.at(-1);
    if (previous?.type === "text") previous.text += text;
    else tokens.push({ type: "text", text, offset });
    visible.push(text);
    offset += Array.from(text).length;
  };
  let cursor = 0;
  for (const match of source.matchAll(/\[[^\[\]\r\n]*\]/g)) {
    const start = match.index;
    append(source.slice(cursor, start));
    const literal = match[0];
    const inner = literal.slice(1, -1);
    const separator = inner.indexOf(":");
    const kind = separator < 0 ? inner : inner.slice(0, separator);
    const value = separator < 0 ? "" : inner.slice(separator + 1);
    if (kind === "expression" && expressions.has(value)) {
      tokens.push({
        type: "expression",
        expression: value as DialogueExpression,
        offset,
      });
    } else if (
      (kind === "pause" || kind === "speed") &&
      /^\d{1,5}$/.test(value)
    ) {
      const milliseconds = Math.min(
        kind === "pause" ? 10000 : 500,
        Math.max(kind === "pause" ? 0 : 1, Number(value)),
      );
      tokens.push({ type: kind, milliseconds, offset });
    } else if (kind === "color" && colors.has(value)) {
      tokens.push({ type: "color", color: value as DialogueColor, offset });
      colorDepth++;
    } else if (inner === "/color" && colorDepth > 0) {
      tokens.push({ type: "endColor", offset });
      colorDepth--;
    } else if (kind === "item" && /^[a-z][a-z0-9_]{0,63}$/.test(value)) {
      const label = options.itemName ? options.itemName(value) : value;
      if (label !== undefined && label.length > 0) {
        tokens.push({ type: "item", id: value, text: label, offset });
        visible.push(label);
        offset += Array.from(label).length;
      } else append(literal);
    } else append(literal);
    cursor = start + literal.length;
  }
  append(source.slice(cursor));
  return { tokens, plainText: visible.join(""), visibleLength: offset };
}

export function escapeDialogueHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Returns only escaped text and fixed, balanced span markup; timing tags emit no HTML. */
export function renderDialogueText(
  parsed: ParsedDialogueText,
  revealedCount = Infinity,
): string {
  const limit = Number.isNaN(revealedCount)
    ? 0
    : Math.max(0, Math.floor(revealedCount));
  if (limit === 0) return "";
  const html: string[] = [];
  let openColors = 0;
  for (const token of parsed.tokens) {
    if (token.offset >= limit) break;
    if (token.type === "text" || token.type === "item") {
      const fragment = Array.from(token.text)
        .slice(0, limit - token.offset)
        .join("");
      const escaped = escapeDialogueHTML(fragment);
      if (token.type === "item" && /^[a-z][a-z0-9_]{0,63}$/.test(token.id)) {
        html.push(
          `<span class="dialogue-item" data-item="${token.id}">${escaped}</span>`,
        );
      } else html.push(escaped);
    } else if (token.type === "color" && colors.has(token.color)) {
      html.push(`<span class="dialogue-color dialogue-color-${token.color}">`);
      openColors++;
    } else if (token.type === "endColor" && openColors > 0) {
      html.push("</span>");
      openColors--;
    }
  }
  while (openColors-- > 0) html.push("</span>");
  return html.join("");
}
