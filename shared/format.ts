/**
 * Number and size formatting shared by every tool, so 12 000 000 is not written
 * three different ways on three pages.
 */

/** Grouped with a non-breaking thin space: 12 400 000. */
export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "—";

  const fixed = value.toFixed(fractionDigits);
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return fraction ? `${grouped},${fraction}` : grouped;
}

/**
 * Short form for headline numbers: 1,2 mln. Below 10 000 the exact number is
 * clearer than a rounded one, so it is left alone.
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);

  if (abs >= 1e9) return `${trim(value / 1e9)} mlrd`;
  if (abs >= 1e6) return `${trim(value / 1e6)} mln`;
  if (abs >= 1e4) return `${trim(value / 1e3)} min`;

  return formatNumber(value, abs < 10 && !Number.isInteger(value) ? 2 : 0);
}

/** Binary units — the ones a disk quota is actually written in. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${formatNumber(bytes)} B`;

  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${trim(value)} ${units[unit]}`;
}

/** One decimal below 100, none above — 9,4 GiB but 340 GiB. */
function trim(value: number): string {
  const digits = Math.abs(value) < 100 ? 1 : 0;
  return formatNumber(value, digits).replace(/,0$/, "");
}
