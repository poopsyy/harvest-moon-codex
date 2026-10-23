import { describe, expect, it } from "vitest";
import { npcs, festivals } from "../../src/data/catalog";
import {
  dialogue,
  heartEvents,
  arcEvents,
  marriageEvents,
  arcs,
  chapters,
  journalPages,
  letters,
  tv,
  intro,
  endings,
  bloom,
  vote,
  proposals,
  weddings,
  narrativeLineCount,
  narrativeTexts,
  validateNarrative,
  dialogueSchema,
  storyEventSchema,
} from "../../src/data/narrative";
import locale from "../../src/data/strings/en.json";
const raw = locale.narrative;
const supplemental = locale.supplemental;

describe("authored Willowmere narrative", () => {
  it("validates every schema, speaker, map, festival, arc and page length", () => {
    expect(validateNarrative()).toBe(true);
    expect(narrativeLineCount).toBeGreaterThanOrEqual(2500);
    expect(narrativeLineCount).toBe(new Set(narrativeTexts()).size);
  });
  it("gives every villager an everyday voice and two unique responses to every festival", () => {
    for (const npc of npcs) {
      const rows = dialogue.filter((d) => d.npc === npc.id);
      expect(
        rows.filter((d) => !d.festival && !d.married).length,
        npc.id,
      ).toBeGreaterThanOrEqual(40);
      for (const festival of festivals) {
        const responses = rows.filter((d) => d.festival === festival.id);
        expect(
          responses.length,
          `${npc.id}/${festival.id}`,
        ).toBeGreaterThanOrEqual(2);
        expect(new Set(responses.map((d) => d.text)).size).toBe(
          responses.length,
        );
      }
      expect(
        heartEvents.filter((e) => e.npc === npc.id).length,
      ).toBeGreaterThanOrEqual(npc.romanceable ? 6 : 3);
      if (npc.romanceable) {
        expect(npc.age).toBeGreaterThanOrEqual(25);
        expect(rows.filter((d) => d.married).length).toBeGreaterThanOrEqual(60);
        expect(marriageEvents.filter((e) => e.npc === npc.id)).toHaveLength(4);
        expect(proposals[npc.id]?.length).toBeGreaterThanOrEqual(4);
        expect(weddings[npc.id]?.length).toBeGreaterThanOrEqual(25);
      } else {
        expect(rows.some((d) => d.married)).toBe(false);
      }
    }
  });
  it("keeps all displayed dialogue in the localized authored catalogs", () => {
    const localized = new Map(
      [...raw.dialogue, ...supplemental].map((row) => [row.id, row.text]),
    );
    for (const row of dialogue) expect(localized.get(row.id)).toBe(row.text);
    expect(new Set(dialogue.map((row) => row.text)).size).toBe(dialogue.length);
  });
  it("has complete five-scene arcs with consequential choices and written epilogues", () => {
    expect(arcs).toHaveLength(9);
    expect(arcEvents).toHaveLength(45);
    for (const arc of arcs) {
      const events = arc.events.map((id) => arcEvents.find((e) => e.id === id));
      expect(events).toHaveLength(5);
      expect(events.every((e) => e && e.lines.length >= 5)).toBe(true);
      expect(events.some((e) => (e?.choices?.length ?? 0) >= 2)).toBe(true);
      expect(arc.epilogue.length).toBeGreaterThan(100);
      expect(new Set(events.map((e) => e?.flag)).size).toBe(5);
    }
  });
  it("covers the full main story, sixteen substantial pages, and all TV channels", () => {
    expect(chapters.map((c) => c.id)).toEqual([
      "spring",
      "summer",
      "autumn",
      "winter",
    ]);
    expect(chapters.map((c) => c.flag)).toEqual([
      "spring_stone",
      "summer_stone",
      "autumn_stone",
      "winter_stone",
    ]);
    expect(journalPages).toHaveLength(16);
    expect(new Set(journalPages.map((p) => p.source)).size).toBe(16);
    expect(intro.length).toBeGreaterThan(10);
    expect(bloom.lines.length).toBeGreaterThan(10);
    expect(vote.lines.length).toBeGreaterThan(20);
    expect(endings.map((e) => e.id)).toEqual([
      "thriving",
      "steady",
      "uncertain",
    ]);
    expect(letters.length).toBeGreaterThanOrEqual(20);
    expect(new Set(tv.map((p) => p.channel))).toEqual(
      new Set(["weather", "cooking", "news", "lore"]),
    );
  });
  it("rejects malformed conditions and scenes instead of silently accepting unusable content", () => {
    expect(
      dialogueSchema.safeParse({
        id: "bad",
        npc: "ivy",
        text: "x",
        season: "monsoon",
      }).success,
    ).toBe(false);
    expect(
      dialogueSchema.safeParse({
        id: "bad",
        npc: "ivy",
        text: "A complete thought.",
        minFriendship: -1,
      }).success,
    ).toBe(false);
    expect(
      storyEventSchema.safeParse({
        id: "bad",
        npc: "ivy",
        title: "Empty",
        hearts: 11,
        location: "store",
        lines: [],
        flag: "bad",
      }).success,
    ).toBe(false);
  });
});
