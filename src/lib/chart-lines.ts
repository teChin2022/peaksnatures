// Categorical, fixed order, never cycled: validated with the dataviz skill's
// validate_palette.js (light, all checks pass; 3 slots under 3:1 on white, so a
// legend or list must carry identity). Brand Forest failed the chroma floor.
export const LINE_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];
export const OTHER_LINE_COLOR = "#8d7560"; // earth-500
export const OTHER_ALIAS = "rOther";

/**
 * One line per name in the order given (most important first). Names past the
 * palette share one neutral "other" line instead of reusing a colour.
 */
export function assignLines(names: string[]): { aliasOf: Map<string, string>; colorOf: Record<string, string> } {
  const aliasOf = new Map<string, string>();
  const colorOf: Record<string, string> = {};
  names.forEach((name, i) => {
    const alias = i < LINE_PALETTE.length ? `r${i}` : OTHER_ALIAS;
    aliasOf.set(name, alias);
    colorOf[alias] = alias === OTHER_ALIAS ? OTHER_LINE_COLOR : LINE_PALETTE[i];
  });
  return { aliasOf, colorOf };
}
