/** Parse a multi-line or comma-separated list of cities. */
export function parseCityList(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const city of parts) {
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(city);
  }
  return result;
}
