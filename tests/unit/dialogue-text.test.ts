import { describe, expect, it } from "vitest";
import {
  escapeDialogueHTML,
  parseDialogueText,
  renderDialogueText,
} from "../../src/ui/dialogue-text";

describe("safe inline dialogue markup", () => {
  it("parses expression, pause, speed, color and a localized item in one authored line", () => {
    const result = parseDialogueText(
      "[expression:happy]Hello, {player}.[pause:300] [speed:40]Bring [color:gold]one [item:turnip][/color].",
      {
        playerName: "Rowan",
        itemName: (id) => (id === "turnip" ? "Turnip" : undefined),
      },
    );
    expect(result.plainText).toBe("Hello, Rowan. Bring one Turnip.");
    expect(result.visibleLength).toBe(result.plainText.length);
    expect(result.tokens).toContainEqual({
      type: "expression",
      expression: "happy",
      offset: 0,
    });
    expect(result.tokens).toContainEqual({
      type: "pause",
      milliseconds: 300,
      offset: 13,
    });
    expect(result.tokens).toContainEqual({
      type: "speed",
      milliseconds: 40,
      offset: 14,
    });
    expect(result.tokens).toContainEqual({
      type: "item",
      id: "turnip",
      text: "Turnip",
      offset: 24,
    });
    expect(renderDialogueText(result)).toBe(
      'Hello, Rowan. Bring <span class="dialogue-color dialogue-color-gold">one <span class="dialogue-item" data-item="turnip">Turnip</span></span>.',
    );
  });
  it("keeps partial reveals balanced, including nested colors and Unicode", () => {
    const parsed = parseDialogueText(
      "[color:gold]A🌱[color:green]B[/color]C[/color]D",
    );
    expect(parsed.visibleLength).toBe(5);
    expect(renderDialogueText(parsed, 0)).toBe("");
    expect(renderDialogueText(parsed, 2)).toBe(
      '<span class="dialogue-color dialogue-color-gold">A🌱</span>',
    );
    expect(renderDialogueText(parsed, 3)).toBe(
      '<span class="dialogue-color dialogue-color-gold">A🌱<span class="dialogue-color dialogue-color-green">B</span></span>',
    );
    expect(renderDialogueText(parsed, 5)).toBe(
      '<span class="dialogue-color dialogue-color-gold">A🌱<span class="dialogue-color dialogue-color-green">B</span>C</span>D',
    );
    expect(parseDialogueText("🌱[pause:12]x").tokens[1]).toEqual({
      type: "pause",
      milliseconds: 12,
      offset: 1,
    });
  });
  it("never interprets HTML or command-looking player names and item labels", () => {
    const parsed = parseDialogueText(
      "<img src=x onerror=alert(1)> {player} [item:turnip]",
      {
        playerName: "[pause:999]<script>alert(1)</script>",
        itemName: () => '<svg onload="alert(2)">&',
      },
    );
    const html = renderDialogueText(parsed);
    expect(parsed.tokens.some((token) => token.type === "pause")).toBe(false);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;svg onload=&quot;alert(2)&quot;&gt;&amp;");
    expect(escapeDialogueHTML(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
  it("leaves malformed, unsupported and unresolved commands visible", () => {
    const text =
      "[/color][color:red;url(x)][expression:evil][pause:-4][speed:fast][item:../../x][item:unknown][unfinished";
    const parsed = parseDialogueText(text, { itemName: () => undefined });
    expect(parsed.plainText).toBe(text);
    expect(parsed.tokens).toEqual([{ type: "text", text, offset: 0 }]);
    expect(renderDialogueText(parsed)).toBe(text);
  });
  it("bounds timing values, supports standalone item IDs and escapes incomplete colors", () => {
    const parsed = parseDialogueText(
      "[pause:99999][speed:0][speed:99999][color:blue][item:turnip]",
    );
    expect(parsed.tokens.slice(0, 3)).toEqual([
      { type: "pause", milliseconds: 10000, offset: 0 },
      { type: "speed", milliseconds: 1, offset: 0 },
      { type: "speed", milliseconds: 500, offset: 0 },
    ]);
    expect(parsed.plainText).toBe("turnip");
    expect(renderDialogueText(parsed, 3)).toBe(
      '<span class="dialogue-color dialogue-color-blue"><span class="dialogue-item" data-item="turnip">tur</span></span>',
    );
    expect(renderDialogueText(parsed, NaN)).toBe("");
    expect(renderDialogueText(parsed, -9)).toBe("");
    expect(renderDialogueText(parseDialogueText(""))).toBe("");
  });
  it("defends HTML boundaries even when callers construct tokens directly", () => {
    const html = renderDialogueText({
      plainText: "<b>",
      visibleLength: 3,
      tokens: [{ type: "item", id: '" onclick="x', text: "<b>", offset: 0 }],
    });
    expect(html).toBe("&lt;b&gt;");
  });
});
