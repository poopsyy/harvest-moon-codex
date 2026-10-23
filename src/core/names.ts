/** Conservative player-name filtering; original NPC and item names never pass through this path. */
export function safeAnimalName(value: string): string {
  const clean = value
    .replace(/[^a-zA-Z '-]/g, "")
    .trim()
    .slice(0, 16);
  const normalized = value
    .toLowerCase()
    .replace(
      /[013457@!$]/g,
      (c) =>
        ({
          "0": "o",
          "1": "i",
          "3": "e",
          "4": "a",
          "5": "s",
          "7": "t",
          "@": "a",
          "!": "i",
          $: "s",
        })[c] ?? c,
    )
    .replace(/[^a-z]/g, "");
  return !clean || /fuck|shit|bitch|cunt|asshole|motherfucker/.test(normalized)
    ? "Clover"
    : clean;
}
