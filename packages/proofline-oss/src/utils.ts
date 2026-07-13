export function classes(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
