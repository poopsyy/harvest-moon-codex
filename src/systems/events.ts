import type { GameState, GameEvent } from "../state/game";
import { addItem, takeItem } from "./engine";
export type EventCondition = {
  map?: string;
  startMinute?: number;
  endMinute?: number;
  flags?: string[];
  absentFlags?: string[];
  friendship?: { npc: string; points: number };
  day?: number;
};
export type ScriptStep =
  | { type: "dialogue"; speaker: string; text: string; expression?: string }
  | { type: "flag"; flag: string; value: boolean }
  | { type: "give" | "take"; item: string; quantity: number }
  | { type: "friendship"; npc: string; points: number }
  | { type: "warp"; map: string; x: number; y: number }
  | { type: "choice"; choices: { label: string; flag: string }[] }
  | {
      type:
        | "move"
        | "face"
        | "emote"
        | "animation"
        | "camera"
        | "fade"
        | "music"
        | "sound"
        | "wait";
      target?: string;
      value: string | number;
    };
export type ScriptEvent = {
  id: string;
  conditions: EventCondition;
  steps: ScriptStep[];
  repeat?: boolean;
};
export function eventMatches(s: GameState, condition: EventCondition): boolean {
  return (
    (!condition.map || s.player.map === condition.map) &&
    (condition.startMinute === undefined ||
      s.minute >= condition.startMinute) &&
    (condition.endMinute === undefined || s.minute <= condition.endMinute) &&
    (condition.day === undefined || s.day >= condition.day) &&
    (!condition.flags || condition.flags.every((f) => s.flags[f])) &&
    (!condition.absentFlags ||
      condition.absentFlags.every((f) => !s.flags[f])) &&
    (!condition.friendship ||
      (s.friendship[condition.friendship.npc] ?? 0) >=
        condition.friendship.points)
  );
}
export function runEvent(
  s: GameState,
  event: ScriptEvent,
  skip = false,
): GameEvent[] {
  const seen = !!s.flags[`event_${event.id}`];
  if (
    !eventMatches(s, event.conditions) ||
    (seen && !event.repeat) ||
    (skip && !seen)
  )
    return [];
  const result: GameEvent[] = [];
  for (const step of event.steps) {
    switch (step.type) {
      case "dialogue":
        if (!skip)
          result.push({
            type: "Dialogue",
            id: step.speaker,
            message: step.text.replaceAll("{player}", s.player.name),
          });
        break;
      case "flag":
        s.flags[step.flag] = step.value;
        result.push({ type: "FlagSet", id: step.flag });
        break;
      case "give":
        addItem(s, step.item, step.quantity);
        break;
      case "take":
        takeItem(s, step.item, step.quantity);
        break;
      case "friendship":
        s.friendship[step.npc] = Math.max(
          0,
          Math.min(1000, (s.friendship[step.npc] ?? 0) + step.points),
        );
        break;
      case "warp":
        s.player.map = step.map;
        s.player.x = step.x;
        s.player.y = step.y;
        break;
      case "choice":
        s.pendingChoices = step.choices.map((c) => c.flag);
        result.push({
          type: "Choice",
          message: step.choices.map((c) => c.label).join(" / "),
        });
        break;
      default:
        if (!skip)
          result.push({
            type: step.type,
            id: step.target,
            message: String(step.value),
          });
    }
  }
  s.flags[`event_${event.id}`] = true;
  if (!s.journal.includes(event.id)) s.journal.push(event.id);
  return result;
}
