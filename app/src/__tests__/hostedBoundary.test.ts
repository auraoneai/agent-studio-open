import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("hosted browser boundary", () => {
  it("loads official typography without bundling licensed font files", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(html).toContain('href="/fonts/proofline-brand.css"');
    expect(vercel.rewrites[0]).toEqual({
      source: "/fonts/:path*",
      destination: "https://www.auraone.ai/fonts/:path*",
    });
  });
});
