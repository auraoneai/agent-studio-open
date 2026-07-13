import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(resolve(process.cwd(), "src/tokens.css"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Proofline token contract", () => {
  it.each([
    "--pl-canvas",
    "--pl-surface",
    "--pl-text-primary",
    "--pl-brand",
    "--pl-focus",
    "--pl-success",
    "--pl-danger",
    "--pl-state-review",
    "--pl-chart-1",
    "--pl-chart-8",
    "--pl-radius-control",
    "--pl-radius-surface",
    "--pl-shadow-1",
    "--pl-shadow-3",
    "--pl-control-height",
    "--pl-control-height-mobile",
  ])("exports %s", (token) => {
    expect(tokens).toContain(token);
  });

  it("does not use glass, gradients, remote fonts, or private font families", () => {
    expect(`${tokens}\n${styles}`).not.toMatch(
      /backdrop-filter|linear-gradient|radial-gradient|fonts\.googleapis|Aeonik|Whitney|GT Sectra|IBM Plex|Inter,/i,
    );
  });

  it("keeps canonical radii at eight pixels or less", () => {
    const radii = [...tokens.matchAll(/--pl-radius-[^:]+:\s*(\d+)px/g)].map(
      (match) => Number(match[1]),
    );
    expect(radii.length).toBeGreaterThan(0);
    expect(Math.max(...radii)).toBeLessThanOrEqual(8);
  });
});
