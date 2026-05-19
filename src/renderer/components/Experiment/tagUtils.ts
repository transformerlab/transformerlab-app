export function parseTagInput(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}
