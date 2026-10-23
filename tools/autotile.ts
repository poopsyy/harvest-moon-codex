/** Clockwise cardinal bits N/E/S/W=1/2/4/8; NE/SE/SW/NW=16/32/64/128.
 * A corner connects only if both adjoining cardinal tiles connect (47 states).
 */
export type BlobTerrain =
  "grass" | "dirt" | "tilled" | "water" | "sand" | "snow" | "watered";
export const blobTerrains: readonly BlobTerrain[] = [
  "grass",
  "dirt",
  "tilled",
  "water",
  "sand",
  "snow",
  "watered",
];
export function normalizeBlobMask(raw: number): number {
  let mask = raw & 255;
  if ((mask & 3) !== 3) mask &= ~16;
  if ((mask & 6) !== 6) mask &= ~32;
  if ((mask & 12) !== 12) mask &= ~64;
  if ((mask & 9) !== 9) mask &= ~128;
  return mask;
}
export const blobMasks: readonly number[] = Array.from(
  { length: 256 },
  (_, i) => i,
).filter((i) => normalizeBlobMask(i) === i);
export function blobMask(
  same: (x: number, y: number) => boolean,
  x: number,
  y: number,
): number {
  const points: [[number, number], number][] = [
    [[0, -1], 1],
    [[1, 0], 2],
    [[0, 1], 4],
    [[-1, 0], 8],
    [[1, -1], 16],
    [[1, 1], 32],
    [[-1, 1], 64],
    [[-1, -1], 128],
  ];
  return normalizeBlobMask(
    points.reduce(
      (mask, [[dx, dy], bit]) => (same(x + dx, y + dy) ? mask | bit : mask),
      0,
    ),
  );
}
export function blobFrame(
  kind: BlobTerrain,
  mask: number,
  animation = 0,
): string {
  return `blob_${kind}_${normalizeBlobMask(mask)}${kind === "water" ? `_${((Math.floor(animation) % 4) + 4) % 4}` : ""}`;
}
