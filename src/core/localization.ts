import locale from "../data/strings/en.json";
const messages = locale.system;

/** Format an engine message without state, browser APIs, or recursive substitution. */
export function systemText(
  key: keyof typeof messages,
  values: Readonly<Record<string, unknown>> = {},
): string {
  return messages[key].replace(
    /\{(value\d+)\}/g,
    (placeholder, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name)
        ? String(values[name])
        : placeholder,
  );
}
