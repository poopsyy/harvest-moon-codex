import locale from "./strings/en.json";
const data = locale.sunroots;
import type { GameState } from "../state/game";
export const sunrootDiscoveries = data;
export function canDiscoverSunroot(
  s: GameState,
  discovery: (typeof data)[number],
): boolean {
  if (s.flags[discovery.id]) return false;
  switch (discovery.gate) {
    case "orchard":
      return (
        !!s.flags.orchard_stump_cleared && !!s.flags.orchard_boulder_cleared
      );
    case "trees":
      return s.trees.length >= discovery.threshold;
    case "fish":
      return Object.keys(s.fishRecords).length >= discovery.threshold;
    case "crops":
      return s.stats.cropsShipped >= discovery.threshold;
    case "festivals":
      return s.stats.festivals >= discovery.threshold;
    case "boat":
      return !!s.flags.boat_repaired;
    case "bloom":
      return !!s.flags.bloom;
    case "floor":
      return s.mine.floor === discovery.threshold;
    default:
      return false;
  }
}
