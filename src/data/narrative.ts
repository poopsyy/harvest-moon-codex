import locale from "./strings/en.json";
const raw = locale.narrative;
const supplemental = locale.supplemental;
import { z } from "zod";
import { npcs, festivals, maps } from "./catalog";

export const dialogueSchema = z.object({
  id: z.string().min(1),
  npc: z.string().min(1),
  text: z.string().min(3),
  season: z.enum(["spring", "summer", "autumn", "winter"]).optional(),
  weather: z.string().optional(),
  minFriendship: z.number().min(0).max(1000).optional(),
  married: z.boolean().optional(),
  festival: z.string().optional(),
  priority: z.number().optional(),
});
export const storyEventSchema = z.object({
  id: z.string(),
  npc: z.string(),
  title: z.string(),
  hearts: z.number().min(0).max(10),
  location: z.string(),
  lines: z.array(z.string().min(3)).min(1),
  choices: z
    .array(z.object({ label: z.string(), flag: z.string() }))
    .optional(),
  flag: z.string(),
});
export const arcSchema = z.object({
  id: z.string(),
  name: z.string(),
  npcs: z.array(z.string()).min(1),
  events: z.array(z.string()).min(4).max(5),
  epilogue: z.string(),
});
export const chapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string(),
  flag: z.string(),
  lines: z.array(z.string()).min(1),
});
export const journalPageSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  hint: z.string(),
  source: z.string(),
});
export const letterSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  from: z.string(),
});
export const broadcastSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  channel: z.enum(["weather", "cooking", "news", "lore"]),
});
export const endingSchema = z.object({
  id: z.string(),
  title: z.string(),
  lines: z.array(z.string()).min(1),
});
export type Dialogue = z.infer<typeof dialogueSchema>;
export type StoryEvent = z.infer<typeof storyEventSchema>;
export type Arc = z.infer<typeof arcSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type JournalPage = z.infer<typeof journalPageSchema>;
export type Letter = z.infer<typeof letterSchema>;
export type Broadcast = z.infer<typeof broadcastSchema>;
export type Ending = z.infer<typeof endingSchema>;
export const dialogue: Dialogue[] = z
  .array(dialogueSchema)
  .parse([...raw.dialogue, ...supplemental]);
export const heartEvents: StoryEvent[] = raw.heartEvents;
export const arcEvents: StoryEvent[] = raw.arcEvents;
export const marriageEvents: StoryEvent[] = raw.marriageEvents;
export const arcs: Arc[] = raw.arcs;
export const chapters: Chapter[] = raw.chapters;
export const journalPages: JournalPage[] = raw.journalPages;
export const letters: Letter[] = raw.letters;
export const tv: Broadcast[] = z.array(broadcastSchema).parse(raw.tv);
export const intro: string[] = raw.intro;
export const endings: Ending[] = raw.endings;
export const bloom: StoryEvent = raw.bloom;
export const vote: StoryEvent = raw.vote;
export const proposals: Record<string, string[]> = raw.proposals;
export const weddings: Record<string, string[]> = raw.weddings;

/** Every displayed narrative sentence is held in one of the two localized JSON catalogs. */
export function narrativeTexts(): string[] {
  return [
    ...dialogue.map((x) => x.text),
    ...[
      ...heartEvents,
      ...arcEvents,
      ...marriageEvents,
      ...chapters,
      ...endings,
      bloom,
      vote,
    ].flatMap((x) => x.lines),
    ...journalPages.map((x) => x.text),
    ...letters.map((x) => x.text),
    ...tv.map((x) => x.text),
    ...intro,
    ...Object.values(proposals).flat(),
    ...Object.values(weddings).flat(),
    ...arcs.map((x) => x.epilogue),
  ];
}
/** Repeated ceremonial wishes count once, regardless of how many spouse scripts contain them. */
export const narrativeLineCount = new Set(narrativeTexts()).size;

export function validateNarrative(): boolean {
  z.array(dialogueSchema).parse(dialogue);
  z.array(storyEventSchema).parse([
    ...heartEvents,
    ...arcEvents,
    ...marriageEvents,
    bloom,
    vote,
  ]);
  z.array(arcSchema).parse(arcs);
  z.array(chapterSchema).parse(chapters);
  z.array(journalPageSchema).parse(journalPages);
  z.array(letterSchema).parse(letters);
  z.array(broadcastSchema).parse(tv);
  z.array(endingSchema).parse(endings);
  z.record(z.string(), z.array(z.string().min(3)).min(1)).parse(proposals);
  z.record(z.string(), z.array(z.string().min(3)).min(1)).parse(weddings);
  const npcIds = new Set(npcs.map((n) => n.id));
  const festivalIds = new Set(festivals.map((f) => f.id));
  const mapIds = new Set(maps.map((m) => m.id));
  const eventIds = new Set(arcEvents.map((e) => e.id));
  const identifiers = [
    ...dialogue,
    ...heartEvents,
    ...arcEvents,
    ...marriageEvents,
    ...journalPages,
    ...letters,
    ...tv,
  ].map((row) => row.id);
  if (new Set(identifiers).size !== identifiers.length)
    throw new Error("Narrative identifiers must be unique.");
  for (const row of dialogue) {
    if (!npcIds.has(row.npc))
      throw new Error(`Unknown dialogue speaker: ${row.npc}`);
    if (row.festival && !festivalIds.has(row.festival))
      throw new Error(`Unknown narrative festival: ${row.festival}`);
    if (row.married && !npcs.find((n) => n.id === row.npc)?.romanceable)
      throw new Error(
        `Marriage dialogue for non-romanceable speaker: ${row.npc}`,
      );
  }
  for (const row of [
    ...heartEvents,
    ...arcEvents,
    ...marriageEvents,
    bloom,
    vote,
  ]) {
    if (!npcIds.has(row.npc) || !mapIds.has(row.location))
      throw new Error(`Unknown event speaker or location: ${row.id}`);
  }
  for (const arc of arcs) {
    if (
      arc.events.some((id) => !eventIds.has(id)) ||
      arc.npcs.some((id) => !npcIds.has(id))
    )
      throw new Error(`Broken arc references: ${arc.id}`);
  }
  for (const page of journalPages) {
    const words = page.text.trim().split(/\s+/).length;
    if (words < 80 || words > 150)
      throw new Error(`Journal page outside 80–150 words: ${page.id}`);
  }
  if (narrativeLineCount < 2500)
    throw new Error(
      `Narrative contains only ${narrativeLineCount} distinct lines.`,
    );
  return true;
}
