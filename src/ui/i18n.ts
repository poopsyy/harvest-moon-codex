import strings from "../data/strings/en.json";
export function t(
  key: string,
  values: Record<string, string | number> = {},
): string {
  const text: unknown = (strings as Record<string, unknown>)[key];
  if (typeof text !== "string") {
    if (import.meta.env.DEV) console.warn(`Missing locale key: ${key}`);
    return key;
  }
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}
export function esc(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
}
export function button(
  label: string,
  action: string,
  data: Record<string, string | number> = {},
  className = "",
): string {
  return `<button type="button" class="${className}" data-action="${action}" ${Object.entries(
    data,
  )
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(" ")}>${label}</button>`;
}
export function money(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}
export const seasons = ["spring", "summer", "autumn", "winter"] as const;
export function dateParts(day: number) {
  return {
    year: Math.floor(day / 120) + 1,
    season: seasons[Math.floor((day % 120) / 30)]!,
    day: (day % 30) + 1,
  };
}
export function dateLabel(day: number): string {
  const d = dateParts(day);
  return t("hud.day", { ...d, season: t(`hud.season.${d.season}`) });
}
