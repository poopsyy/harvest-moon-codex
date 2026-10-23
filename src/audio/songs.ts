export type Channel = "pulseA" | "pulseB" | "triangle" | "noise" | "wave";
export interface Note {
  pitch: number;
  step: number;
  length: number;
  velocity: number;
  slide?: number;
  vibrato?: number;
  arpeggio?: number[];
}
export interface Pattern {
  channels: Record<Channel, Note[]>;
}
export interface Song {
  id: string;
  title: string;
  tempo: number;
  swing: number;
  patterns: Pattern[];
  order: number[];
  duration: number;
  jingle: boolean;
  duty: number;
  wave: number;
}
// These twenty-one melodic cells were composed for this project. Each has its own
// contour, rhythm, harmonic itinerary and orchestration; later phrases answer it.
const compositions: [string, string, number, number[], number[], number[]][] = [
  [
    "title",
    "A Window Full of Morning",
    100,
    [0, 4, 7, 9, 7, 4, 2, 0, 2, 5, 9, 7, 4, 2, 0, -1],
    [0, 5, 3, 4, 0, 2, 5, 4],
    [0, 2, 4, 6, 7, 8, 10, 12, 14],
  ],
  [
    "spring",
    "Little Green Promises",
    112,
    [7, 9, 7, 4, 2, 4, 0, 2, 4, 7, 11, 9, 7, 4, 2, 0],
    [0, 2, 5, 0, 3, 5, 4, 4],
    [0, 1, 3, 4, 6, 8, 9, 11, 12, 14],
  ],
  [
    "summer",
    "Sun Across the Washing Line",
    124,
    [0, 7, 12, 11, 9, 7, 4, 7, 2, 9, 14, 12, 11, 9, 7, 4],
    [0, 4, 5, 3, 2, 4, 0, 4],
    [0, 2, 3, 5, 6, 8, 10, 11, 13, 14],
  ],
  [
    "autumn",
    "Copper Leaves Returning",
    96,
    [4, 2, 0, -3, 0, 2, 4, 7, 5, 4, 2, -1, 2, 0, -3, -5],
    [3, 0, 5, 2, 3, 5, 0, 4],
    [0, 3, 4, 6, 8, 11, 12, 14],
  ],
  [
    "winter",
    "The Softest Footprints",
    84,
    [12, 7, 4, 2, 7, 4, 0, 2, 9, 7, 5, 2, 4, 2, 0, -5],
    [0, 5, 2, 3, 0, 2, 5, 0],
    [0, 4, 7, 8, 12, 15],
  ],
  [
    "night",
    "After the Last Lamp",
    72,
    [7, 4, 0, 2, 4, 2, -1, 2, 5, 2, -2, 0, 2, 0, -3, 0],
    [0, 3, 5, 2, 0, 5, 3, 4],
    [0, 3, 6, 8, 11, 14],
  ],
  [
    "rain",
    "Rain in the Watering Can",
    80,
    [2, 5, 7, 5, 2, 0, 2, 4, 0, 4, 5, 4, 0, -1, 0, 2],
    [2, 5, 0, 3, 2, 4, 5, 0],
    [0, 2, 5, 7, 8, 10, 13, 15],
  ],
  [
    "village",
    "Every Door Has a Story",
    108,
    [0, 2, 4, 7, 4, 9, 7, 4, 5, 7, 9, 12, 9, 7, 5, 2],
    [0, 5, 0, 4, 3, 2, 5, 4],
    [0, 2, 4, 5, 7, 8, 10, 12, 13, 15],
  ],
  [
    "shop",
    "Ribbon and Copper",
    116,
    [7, 4, 7, 12, 11, 7, 9, 4, 5, 2, 5, 9, 7, 5, 4, 2],
    [0, 4, 2, 5, 0, 3, 5, 4],
    [0, 1, 4, 6, 8, 9, 12, 14],
  ],
  [
    "inn",
    "One More Cup",
    90,
    [4, 7, 9, 7, 4, 0, 2, 4, 2, 5, 7, 5, 2, -2, 0, 2],
    [0, 3, 2, 5, 0, 5, 4, 0],
    [0, 3, 5, 8, 11, 13],
  ],
  [
    "mine",
    "The Stone Remembers",
    100,
    [0, 3, 7, 3, 0, -2, 3, 5, 7, 10, 7, 5, 3, 0, -2, -5],
    [0, 3, 5, 1, 0, 5, 3, 4],
    [0, 2, 4, 7, 8, 10, 12, 15],
  ],
  [
    "deep_mine",
    "Under the Quiet Mountain",
    104,
    [0, 1, 7, 8, 7, 3, 1, -2, 0, 6, 7, 10, 8, 6, 3, 1],
    [0, 1, 3, 4, 0, 5, 1, 4],
    [0, 1, 4, 5, 8, 9, 12, 14],
  ],
  [
    "festival",
    "Bunting Above the Square",
    130,
    [0, 4, 7, 12, 9, 12, 7, 9, 5, 9, 12, 14, 12, 9, 7, 4],
    [0, 5, 3, 4, 2, 5, 0, 4],
    [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15],
  ],
  [
    "contest",
    "A Basket and a Brave Heart",
    140,
    [0, 0, 7, 4, 9, 7, 12, 9, 5, 5, 12, 9, 14, 12, 9, 7],
    [0, 3, 5, 4, 0, 2, 5, 4],
    [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14],
  ],
  [
    "heart",
    "The Words We Kept",
    76,
    [4, 5, 9, 7, 4, 2, 0, 4, 7, 9, 12, 11, 9, 7, 4, 2],
    [0, 5, 3, 2, 0, 3, 5, 4],
    [0, 3, 6, 8, 10, 14],
  ],
  [
    "sad",
    "An Empty Chair at Supper",
    68,
    [3, 2, 0, -2, 0, 3, 5, 3, 2, 0, -4, -2, 0, 2, 3, 0],
    [0, 5, 3, 2, 0, 3, 1, 4],
    [0, 4, 6, 8, 12, 14],
  ],
  [
    "halverd",
    "A Carefully Folded Letter",
    94,
    [0, 4, 3, 7, 6, 4, 2, 1, 5, 9, 8, 5, 3, 2, -1, 0],
    [0, 1, 4, 3, 0, 5, 1, 4],
    [0, 2, 5, 6, 8, 10, 13, 14],
  ],
  [
    "bloom",
    "A Thousand Small Lanterns",
    88,
    [0, 7, 9, 12, 14, 12, 9, 7, 5, 12, 14, 16, 14, 12, 9, 7],
    [0, 5, 3, 4, 0, 2, 5, 0],
    [0, 3, 4, 7, 8, 11, 12, 15],
  ],
  [
    "wedding",
    "Two Ribbons One Gate",
    110,
    [7, 7, 9, 12, 11, 9, 7, 4, 5, 5, 7, 9, 7, 5, 4, 0],
    [0, 4, 5, 0, 3, 5, 4, 0],
    [0, 2, 3, 6, 8, 10, 11, 14],
  ],
  [
    "ending",
    "What We Grew Together",
    92,
    [0, 4, 2, 7, 5, 9, 7, 12, 11, 9, 7, 4, 5, 2, 0, -5],
    [0, 3, 5, 4, 2, 5, 0, 0],
    [0, 2, 4, 6, 8, 10, 12, 14],
  ],
  [
    "credits",
    "The Path Beyond the Gate",
    104,
    [12, 9, 7, 4, 7, 5, 2, 0, 4, 7, 9, 11, 12, 7, 4, 0],
    [0, 5, 2, 4, 3, 5, 0, 4],
    [0, 1, 4, 6, 8, 9, 12, 14],
  ],
];
const empty = (): Record<Channel, Note[]> => ({
  pulseA: [],
  pulseB: [],
  triangle: [],
  noise: [],
  wave: [],
});
function compose(row: (typeof compositions)[number], index: number): Song {
  const [id, title, tempo, motif, chords, rhythm] = row;
  const patterns: Pattern[] = [];
  for (let bar = 0; bar < 40; bar++) {
    const section = Math.floor(bar / 8),
      root = 48 + chords[bar % 8]!,
      channels = empty(),
      minor = ["mine", "deep_mine", "sad", "halverd"].includes(id),
      third = minor ? 3 : 4;
    rhythm.forEach((step, j) => {
      const m = motif[(j + bar * 3) % motif.length]!;
      const answer = section === 2 ? (j % 2 ? 2 : -2) : section === 3 ? 5 : 0;
      channels.pulseA.push({
        pitch: 60 + m + answer,
        step,
        length: Math.min(4, (rhythm[j + 1] ?? 16) - step) * 0.85,
        velocity: section === 0 ? 0.48 : 0.6,
        vibrato: j % 4 === 0 ? 3 : 0,
        slide: j === rhythm.length - 1 ? -1 : 0,
      });
    });
    if (section !== 0 || bar % 2 === 0)
      for (let step = 0; step < 16; step += 2)
        channels.pulseB.push({
          pitch: root + 12 + [0, third, 7, third][(step / 2 + bar) % 4]!,
          step: step + 0.15,
          length: 1.3,
          velocity: 0.24,
          arpeggio: bar % 4 === 3 ? [0, 7] : undefined,
        });
    for (let step = 0; step < 16; step += 4)
      channels.triangle.push({
        pitch: root - 12 + (step === 8 ? 7 : 0),
        step,
        length: 3.6,
        velocity: 0.6,
      });
    if (!["winter", "night", "sad", "heart"].includes(id) || section === 3)
      for (let step = 0; step < 16; step += 2)
        channels.noise.push({
          pitch: step % 4 ? 76 : 42,
          step,
          length: step % 4 ? 0.2 : 0.65,
          velocity: step % 4 ? 0.08 : 0.15,
        });
    for (let j = 0; j < 3; j++)
      channels.wave.push({
        pitch: root + [0, third, 7][j]!,
        step: j * 0.03,
        length: 15.4,
        velocity: 0.1,
        vibrato: 2,
      });
    patterns.push({ channels });
  }
  return {
    id,
    title,
    tempo,
    swing: [0.04, 0.08, 0, 0.06][index % 4]!,
    patterns,
    order: patterns.map((_, i) => i),
    duration: (40 * 4 * 60) / tempo,
    jingle: false,
    duty: [0.125, 0.25, 0.5, 0.75][index % 4]!,
    wave: index % 3,
  };
}
export const songs: Song[] = compositions.map(compose);
const jingles: [string, number[]][] = [
  ["new_day", [0, 4, 7, 12, 9, 7, 12]],
  ["upgrade", [0, 3, 7, 10, 12, 15, 19]],
  ["item_get", [7, 12, 16]],
  ["rare_item", [0, 7, 12, 16, 19, 24]],
  ["heart_up", [4, 7, 9, 12, 16, 12]],
  ["festival_win", [0, 4, 7, 7, 12, 16, 19, 24]],
  ["achievement", [0, 5, 9, 12, 17, 16, 19]],
];
export const jingleSongs: Song[] = jingles.map(([id, melody], i) => {
  const channels = empty();
  melody.forEach((n, j) => {
    channels.pulseA.push({
      pitch: 60 + n,
      step: j * 1.5,
      length: j === melody.length - 1 ? 4 : 1.1,
      velocity: 0.7,
    });
    channels.triangle.push({
      pitch: 48 + (n % 12),
      step: j * 1.5,
      length: 1.3,
      velocity: 0.5,
    });
  });
  return {
    id,
    title: id.replaceAll("_", " "),
    tempo: 112 + i * 4,
    swing: 0,
    patterns: [{ channels }],
    order: [0],
    duration: (4 * 60) / (112 + i * 4),
    jingle: true,
    duty: 0.25,
    wave: 0,
  };
});
export const songById = new Map(
  [...songs, ...jingleSongs].map((s) => [s.id, s]),
);
