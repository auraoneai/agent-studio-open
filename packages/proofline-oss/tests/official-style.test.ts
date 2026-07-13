import { afterEach, describe, expect, it } from "vitest";

import { installOfficialStyleSheet } from "../src/official-style";

afterEach(() => {
  document.head
    .querySelectorAll("link[data-auraone-official-style]")
    .forEach((node) => node.remove());
  delete document.documentElement.dataset.auraoneOfficialStyle;
});

describe("official style boundary", () => {
  it("does nothing when no approved stylesheet URL is supplied", () => {
    expect(installOfficialStyleSheet(undefined)).toBeNull();
    expect(
      document.head.querySelector("link[data-auraone-official-style]"),
    ).toBeNull();
  });

  it("installs one cross-origin stylesheet and exposes load state", () => {
    const link = installOfficialStyleSheet(
      "https://assets.example.test/proofline.css",
    );
    expect(link?.rel).toBe("stylesheet");
    expect(link?.crossOrigin).toBe("anonymous");
    expect(link?.getAttribute("data-auraone-official-style")).toBe("pending");

    const duplicate = installOfficialStyleSheet(
      "https://assets.example.test/second.css",
    );
    expect(duplicate).toBe(link);
    expect(
      document.head.querySelectorAll("link[data-auraone-official-style]"),
    ).toHaveLength(1);

    link?.dispatchEvent(new Event("load"));
    expect(link?.getAttribute("data-auraone-official-style")).toBe("loaded");
    expect(document.documentElement.dataset.auraoneOfficialStyle).toBe(
      "loaded",
    );
  });

  it("retains the OSS fallback when the optional stylesheet fails", () => {
    const link = installOfficialStyleSheet(
      "https://assets.example.test/missing.css",
    );
    link?.dispatchEvent(new Event("error"));
    expect(link?.getAttribute("data-auraone-official-style")).toBe("failed");
    expect(document.documentElement.dataset.auraoneOfficialStyle).toBe(
      "failed",
    );
  });
});
