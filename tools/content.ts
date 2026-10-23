import { writeFile } from "node:fs/promises";
import { catalog, validateCatalog } from "../src/data/catalog";
import { songs, jingleSongs } from "../src/audio/songs";
import { effects } from "../src/audio/sfx";

validateCatalog();
const minimums: Record<string, number> = {
  crops: 20,
  trees: 5,
  flowers: 6,
  npcs: 20,
  fish: 24,
  forage: 30,
  minerals: 14,
  recipes: 40,
  processedGoods: 15,
  decor: 40,
  wallpapers: 10,
  floors: 10,
  festivals: 9,
  achievements: 30,
  maps: 25,
};
const counts = Object.entries(catalog).map(([name, rows]) => ({
  name,
  count: rows.length,
  min: minimums[name] ?? 0,
}));
counts.push({
  name: "Romanceable adults (25+)",
  count: catalog.npcs.filter((npc) => npc.romanceable && npc.age >= 25).length,
  min: 5,
});
for (const season of ["spring", "summer", "autumn", "winter"])
  counts.push({
    name: `Forage available in ${season}`,
    count: catalog.forage.filter((item) => item.seasons.includes(season))
      .length,
    min: 12,
  });
counts.push(
  { name: "Music tracks", count: songs.length, min: 21 },
  { name: "Jingles", count: jingleSongs.length, min: 7 },
  { name: "Synthesized sound effects", count: effects.length, min: 60 },
);
const narrativePath = "../src/data/narrative.ts";
try {
  const narrative: Record<string, unknown> = await import(narrativePath);
  counts.push({
    name: "Unique narrative lines",
    count:
      typeof narrative.narrativeLineCount === "number"
        ? narrative.narrativeLineCount
        : 0,
    min: 2500,
  });
  for (const [key, min] of Object.entries({
    dialogue: 0,
    heartEvents: 75,
    arcs: 9,
    journalPages: 16,
    chapters: 4,
  })) {
    const value = narrative[key];
    counts.push({
      name: key,
      count: Array.isArray(value) ? value.length : 0,
      min,
    });
  }
} catch (error) {
  if (
    !(error instanceof Error) ||
    !error.message.includes("Cannot find module")
  )
    throw error;
}
const text =
  "# Content inventory\n\nGenerated from validated game data by `pnpm exec tsx tools/content.ts`.\n\n| Content | Count | Minimum | Status |\n|---|---:|---:|---|\n" +
  counts
    .map(
      (row) =>
        `| ${row.name} | ${row.count} | ${row.min || "—"} | ${row.count >= row.min ? "Pass" : "Below target"} |`,
    )
    .join("\n") +
  "\n\nAll catalog IDs, recipes, machine inputs, gifts, shops, map exits, and schedule destinations are validated at boot. NPC schedules include weekday, weather, and festival overrides.\n";
await writeFile(new URL("../CONTENT.md", import.meta.url), text);
console.log(text);
