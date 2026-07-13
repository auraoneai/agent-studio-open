import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  currentGitSourceState,
  digestDeclaredInputs,
} from "./capture_provenance.mjs";
import { startOfficialStyleBoundary } from "../tools/official-style-boundary.mjs";

const CAPTURE_DATE = "2026-07-13";
const PRODUCT_ID = "agent-studio-open";
const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = appRoot;
const websiteRoot = resolve(
  process.env.AURAONE_WEBSITE_ROOT ?? resolve(appRoot, "../auraone-website"),
);
const outputRoot = resolve(appRoot, "docs/captures/0.2.0");
const evidencePath = resolve(outputRoot, "capture-evidence.json");
const port = Number(process.env.AGENT_STUDIO_SHOTS_PORT ?? 4329);
const baseUrl = `http://127.0.0.1:${port}`;
const verifyOnly = process.argv.includes("--verify");
const officialStyleAssetRoot = resolve(
  process.env.AURAONE_OFFICIAL_STYLE_ASSET_ROOT ??
    resolve(appRoot, "../auraone-website/public/fonts"),
);
const officialStyleSource = "auraone-website/public/fonts";
const officialStylePackagePolicy =
  "No private font binary is copied into OSS source or distributable packages.";

const scenarios = [
  {
    id: "connect",
    label: "Connect",
    filename: "connect-endpoint",
    alt: "Agent Studio Open connection workbench showing endpoint, transport, manifest, and privacy controls.",
  },
  {
    id: "traces",
    label: "Traces",
    filename: "inspect-tool-trace",
    alt: "Agent Studio Open trace inspector showing tool calls, timing, and run evidence.",
  },
  {
    id: "replay",
    label: "Replay",
    filename: "replay-run",
    alt: "Agent Studio Open deterministic replay workspace with replay controls and diff evidence.",
  },
  {
    id: "compare",
    label: "Compare",
    filename: "compare-behavior",
    alt: "Agent Studio Open comparison workspace showing model behavior differences against one replay case.",
  },
  {
    id: "ship",
    label: "Ship",
    filename: "export-ci",
    alt: "Agent Studio Open export workspace showing CI and regression artifacts.",
  },
];

const viewports = [
  { id: "desktop", width: 1440, height: 900, deviceScaleFactor: 2 },
  { id: "mobile", width: 390, height: 844, deviceScaleFactor: 2 },
];

const geometryViewports = [
  { id: "mobile-320", width: 320, height: 800 },
  { id: "mobile-390", width: 390, height: 844 },
  { id: "mobile-landscape-568", width: 568, height: 320 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-1020", width: 1020, height: 900 },
  { id: "desktop-1440", width: 1440, height: 900 },
];

const sourceInputs = [
  "index.html",
  "app/src",
  "public",
  "cli/src",
  "cli/pyproject.toml",
  "desktop/src-tauri/src",
  "desktop/src-tauri/build.rs",
  "desktop/src-tauri/Cargo.toml",
  "desktop/src-tauri/Cargo.lock",
  "desktop/src-tauri/tauri.conf.json",
  "desktop/src-tauri/capabilities",
  "desktop/src-tauri/icons",
  "vscode/src",
  "vscode/package.json",
  "vscode/tsconfig.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "scripts/capture_screenshots.mjs",
  "scripts/capture_provenance.mjs",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "tools/official-style-boundary.mjs",
  "packages/platform-contracts",
  "packages/aura-ide-kit",
  "packages/proofline-oss",
  "vendor/tool-call-replay/src",
  "vendor/tool-call-replay/pyproject.toml",
  "vendor/agent-trace-card/src",
  "vendor/agent-trace-card/pyproject.toml",
  "vendor/a2a-contract-test/src",
  "vendor/a2a-contract-test/pyproject.toml",
  "vendor/mcp-risk-linter/src",
  "vendor/mcp-risk-linter/pyproject.toml",
  "vendor/otel-eval-bridge/src",
  "vendor/otel-eval-bridge/pyproject.toml",
];
const fixtureInputs = ["app/src/data.ts"];
const appRelative = relative(repoRoot, appRoot);
const sourceStatePathspecs = [
  "app",
  "cli",
  "desktop",
  "public",
  "scripts",
  "tools",
  "vscode",
  "vendor",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "packages",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
];
const sourceStateExcludes = ["docs/captures"];
const captureMethod =
  "Playwright Chromium against the local Vite demo application; approved official stylesheet delivered through a temporary loopback private render boundary with no private font binaries in OSS source or packages; replay, compare, and export actions executed before capture; viewport-only screenshot from shell origin; six-width responsive geometry audit; reduced motion; animations and caret disabled; external network blocked; deterministic lossless WebP conversion.";
const syntheticProvenance =
  "Repository-owned synthetic MCP manifest, tool payloads, trace sessions, replay outcomes, A2A checks, spans, model comparisons, and export fixtures from app/src/data.ts. No customer, worker, personal, credential, endpoint secret, or sensitive source data.";

if (verifyOnly) {
  await verifyEvidence();
} else {
  await captureEvidence();
}

async function captureEvidence() {
  const packageJson = JSON.parse(await readFile(resolve(appRoot, "package.json"), "utf8"));
  if (packageJson.version !== "0.2.0") {
    throw new Error(`Expected ${PRODUCT_ID} 0.2.0, received ${packageJson.version}`);
  }

  const sourceState = await currentSourceState();
  const sourceContentSha256 = await digestInputs(sourceInputs);
  const syntheticFixtureSha256 = await digestInputs(fixtureInputs);
  const officialStyleBoundary = await officialStyleBoundaryEvidence();
  const captureSpecSha256 = captureSpecDigest(
    packageJson.version,
    officialStyleBoundary,
  );

  await mkdir(outputRoot, { recursive: true });
  const officialStyleServer = await startOfficialStyleBoundary({
    assetRoot: officialStyleAssetRoot,
  });
  const server = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        NO_COLOR: "1",
        VITE_AGENT_STUDIO_DEMO_MODE: "true",
        VITE_AGENT_STUDIO_BROWSER_URL: baseUrl,
        VITE_AGENT_STUDIO_SOURCE_COMMIT: sourceState.baseSourceCommit,
        VITE_AGENT_STUDIO_SOURCE_DIGEST: sourceContentSha256,
        VITE_AGENT_STUDIO_SOURCE_STATE: sourceState.state,
        VITE_AURAONE_OFFICIAL_STYLE_URL:
          officialStyleServer.stylesheetUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverLog = "";
  server.stdout.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverLog += chunk;
  });

  const records = [];
  try {
    await waitForServer(server);
    const browser = await chromium.launch();
    try {
      await assertResponsiveGeometry(browser);
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: viewport.deviceScaleFactor,
          colorScheme: "light",
          reducedMotion: "reduce",
          locale: "en-US",
          timezoneId: "UTC",
        });
        await context.addInitScript(() => {
          window.localStorage.clear();
          window.sessionStorage.clear();
        });
        await context.route("**/*", async (route) => {
          const requestUrl = new URL(route.request().url());
          if (
            requestUrl.protocol === "data:" ||
            requestUrl.protocol === "blob:" ||
            requestUrl.hostname === "127.0.0.1" ||
            requestUrl.hostname === "localhost"
          ) {
            await route.continue();
          } else {
            await route.abort("blockedbyclient");
          }
        });
        for (const scenario of scenarios) {
          const page = await context.newPage();
          try {
            await openDemoPage(page);
            await navigateToScenario(page, scenario.id, viewport.width);
            await prepareScenario(page, scenario.id);
            await assertCaptureLayout(page, scenario.id, viewport);
            await delay(200);

            const suffix = viewport.id === "mobile" ? ".mobile" : "";
            const localPng = resolve(
              outputRoot,
              `${scenario.filename}.${viewport.id}.png`,
            );
            const localWebp = resolve(
              outputRoot,
              `${scenario.filename}.${viewport.id}.webp`,
            );
            const websiteOutput = resolve(
              websiteRoot,
              `public/open/${PRODUCT_ID}/screenshots/${scenario.filename}${suffix}.webp`,
            );

            await Promise.all([
              rm(localPng, { force: true }),
              rm(localWebp, { force: true }),
              rm(websiteOutput, { force: true }),
            ]);
            await page.screenshot({
              path: localPng,
              animations: "disabled",
              caret: "hide",
              fullPage: false,
              omitBackground: false,
            });
            await assertCapturePixels(localPng, scenario.id, viewport.id, "png");
            await convertToWebp(localPng, localWebp);
            await assertCapturePixels(localWebp, scenario.id, viewport.id, "webp");
            await mkdir(dirname(websiteOutput), { recursive: true });
            await copyFile(localWebp, websiteOutput);

            const pngBytes = await readFile(localPng);
            const webpBytes = await readFile(localWebp);
            const dimensions = readPngDimensions(pngBytes);
            records.push({
              id: `${PRODUCT_ID}-${scenario.id}-${viewport.id}`,
              scenario: scenario.id,
              variant: viewport.id,
              altOrCaption: scenario.alt,
              localPngOutput: relative(repoRoot, localPng),
              localWebpOutput: relative(repoRoot, localWebp),
              websiteOutput: relative(repoRoot, websiteOutput),
              viewport: {
                width: viewport.width,
                height: viewport.height,
                deviceScaleFactor: viewport.deviceScaleFactor,
              },
              dimensions,
              sourcePngSha256: sha256(pngBytes),
              sha256: sha256(webpBytes),
              fileSize: webpBytes.byteLength,
              format: "webp",
              captureMethod,
              syntheticProvenance,
            });
          } finally {
            await page.close();
          }
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${serverLog}`);
  } finally {
    server.kill("SIGTERM");
    await Promise.race([onceExit(server), delay(3_000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
    await officialStyleServer.close();
  }

  const evidence = {
    schemaVersion: "auraone.local-product-capture.v3",
    productId: PRODUCT_ID,
    productVersion: packageJson.version,
    capturedAt: CAPTURE_DATE,
    captureEvidenceState: "verified-local",
    releaseState: "stale",
    releaseStateReason:
      "The captures verify the current local 0.2.0 source UI only. They do not verify a committed source snapshot, signed binary, installer, package-manager release, or updater artifact.",
    baseSourceCommit: sourceState.baseSourceCommit,
    sourceState: sourceState.state,
    sourceChangeCount: sourceState.changeCount,
    sourceChangeDigest: sourceState.changeDigest,
    sourceContentSha256,
    sourceInputPaths: sourceInputs,
    sourceStatePaths: sourceStatePathspecs,
    syntheticFixtureSha256,
    officialStyleBoundary,
    captureSpecSha256,
    captureMethod,
    syntheticProvenance,
    records,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  await verifyEvidence();
  console.log(`Captured and verified ${records.length} ${PRODUCT_ID} assets.`);
}

async function assertResponsiveGeometry(browser) {
  for (const viewport of geometryViewports) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "UTC",
      acceptDownloads: true,
    });
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await context.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (
        requestUrl.protocol === "data:" ||
        requestUrl.protocol === "blob:" ||
        requestUrl.hostname === "127.0.0.1" ||
        requestUrl.hostname === "localhost"
      ) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });

    try {
      for (const scenario of scenarios) {
        const page = await context.newPage();
        try {
          await openDemoPage(page);
          await navigateToScenario(page, scenario.id, viewport.width);
          await prepareScenario(page, scenario.id);
          await assertCaptureLayout(page, scenario.id, viewport);
        } finally {
          await page.close();
        }
      }

      if (isMobileViewport(viewport.width)) {
        const morePage = await context.newPage();
        try {
          await openDemoPage(morePage);
          await assertMobileMoreNavigation(morePage, viewport);
        } finally {
          await morePage.close();
        }
      }
    } finally {
      await context.close();
    }
  }
}

async function openDemoPage(page) {
  await page.goto(`${baseUrl}/?preview=1`, { waitUntil: "networkidle" });
  await waitForOfficialStyle(page);
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}",
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.demo === "true",
  );
}

async function navigateToScenario(page, scenarioId, viewportWidth) {
  const mobile = isMobileViewport(viewportWidth);
  const selector = mobile
    ? `nav[aria-label="Agent Studio mobile navigation"] button[data-surface="${scenarioId}"]`
    : `aside[aria-label="Agent Studio Open navigation"] button[data-surface="${scenarioId}"]`;
  await page.locator(selector).click();
  await page.waitForFunction(
    ({ id, mobileLayout }) => {
      const activeSelector = mobileLayout
        ? `nav[aria-label="Agent Studio mobile navigation"] button[data-surface="${id}"]`
        : `aside[aria-label="Agent Studio Open navigation"] button[data-surface="${id}"]`;
      return (
        document.querySelector(activeSelector)?.getAttribute("aria-current") ===
        "page"
      );
    },
    { id: scenarioId, mobileLayout: mobile },
  );
  if (scenarioId === "traces") {
    await page
      .locator(".trace-session-row")
      .first()
      .waitFor({ state: "visible", timeout: 5_000 });
  }
}

async function prepareScenario(page, scenarioId) {
  if (scenarioId === "replay" || scenarioId === "compare") {
    const actionLabel = scenarioId === "replay" ? "Run replay" : "Run matrix";
    await page.getByRole("button", { name: actionLabel }).click();
    await page
      .locator(".operation-banner")
      .waitFor({ state: "visible", timeout: 5_000 });
    await page
      .locator(".operation-banner")
      .waitFor({ state: "hidden", timeout: 5_000 });
    const evidenceSelector =
      scenarioId === "replay"
        ? '[data-testid="replay-evidence"]'
        : '[data-testid="comparison-evidence"]';
    await page.locator(evidenceSelector).waitFor({ state: "visible" });
  }

  if (scenarioId === "ship") {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export bundle" }).click();
    const download = await downloadPromise;
    await download.cancel().catch(() => {});
    await page
      .locator(".export-operation-success")
      .first()
      .waitFor({ state: "visible", timeout: 5_000 });
  }
}

async function assertMobileMoreNavigation(page, viewport) {
  const more = page.getByRole("button", { name: "More workspace tools" });
  const before = await more.boundingBox();
  await more.click();
  const dialog = page.getByRole("dialog", { name: "Workspace commands" });
  await dialog.waitFor({ state: "visible" });
  const result = await page.evaluate(({ width, height }) => {
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const dialogElement = document.querySelector('[role="dialog"]');
    const nav = document.querySelector(
      'nav[aria-label="Agent Studio mobile navigation"]',
    );
    const command = (surface) =>
      document.querySelector(
        `[role="dialog"] button[data-surface="${surface}"]`,
      );
    return {
      dialog: dialogElement ? bounds(dialogElement) : null,
      nav: nav ? bounds(nav) : null,
      a2a: command("a2a") ? bounds(command("a2a")) : null,
      observe: command("observe") ? bounds(command("observe")) : null,
      activeElementSurface:
        document.activeElement?.getAttribute("data-surface") ?? null,
      width,
      height,
    };
  }, viewport);
  assert(result.dialog, `${viewport.id} More dialog did not open`);
  assert(
    result.dialog.left >= 0 &&
      result.dialog.right <= viewport.width &&
      result.dialog.top >= 0 &&
      result.dialog.bottom <= viewport.height,
    `${viewport.id} More dialog escapes the viewport`,
  );
  assert(
    result.a2a?.height >= 44 && result.observe?.height >= 44,
    `${viewport.id} More menu does not expose 44px A2A and Data Network targets`,
  );
  assert(
    Math.abs(result.nav?.bottom - viewport.height) <= 1,
    `${viewport.id} More menu moves the bottom navigation`,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "More workspace tools",
  );
  const after = await more.boundingBox();
  assert(
    before &&
      after &&
      Math.abs(before.x - after.x) <= 0.5 &&
      Math.abs(
        before.y + before.height - (after.y + after.height),
      ) <= 0.5,
    `${viewport.id} More workflow changes bottom navigation geometry: ${JSON.stringify({ before, after })}`,
  );
}

function isMobileViewport(width) {
  return width <= 760;
}

async function assertCapturePixels(path, scenarioId, viewportId, format) {
  const magick = process.env.MAGICK_BIN ?? "magick";
  const sampleMean = async (operations) =>
    Number(
      (
        await run(
          magick,
          [path, ...operations, "-colorspace", "gray", "-format", "%[fx:mean]", "info:"],
          appRoot,
        )
      ).trim(),
    );
  const [overall, topLeft, topStrip, leftStrip] = await Promise.all([
    sampleMean([]),
    sampleMean(["-crop", "32x32+0+0"]),
    sampleMean(["-gravity", "North", "-crop", "x2+0+0"]),
    sampleMean(["-gravity", "West", "-crop", "2x+0+0"]),
  ]);
  assert(
    [overall, topLeft, topStrip, leftStrip].every(Number.isFinite),
    `${scenarioId}/${viewportId} ${format} pixel audit did not return numeric samples`,
  );
  assert(overall > 0.72, `${scenarioId}/${viewportId} ${format} is unexpectedly dark`);
  assert(topLeft > 0.9, `${scenarioId}/${viewportId} ${format} has a dark top-left block`);
  assert(topStrip > 0.88, `${scenarioId}/${viewportId} ${format} has a dark top band`);
  assert(leftStrip > 0.82, `${scenarioId}/${viewportId} ${format} has a dark left band`);
}

async function assertCaptureLayout(page, scenarioId, viewport) {
  const result = await page.evaluate(
    ({ scenarioId, viewportId, viewportWidth, viewportHeight }) => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const rect = (element) => {
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return {
          top: bounds.top,
          left: bounds.left,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const within = (inner, outer, tolerance = 0.5) =>
        inner.left >= outer.left - tolerance &&
        inner.right <= outer.right + tolerance &&
        inner.top >= outer.top - tolerance &&
        inner.bottom <= outer.bottom + tolerance;
      const contentClipped = (element) =>
        element.scrollWidth - element.clientWidth > 1 ||
        element.scrollHeight - element.clientHeight > 1;
      const parseRgb = (value) => {
        const match = value.match(
          /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/,
        );
        return match
          ? {
              r: Number(match[1]),
              g: Number(match[2]),
              b: Number(match[3]),
              a: match[4] === undefined ? 1 : Number(match[4]),
            }
          : null;
      };
      const effectiveBackground = (element) => {
        let current = element;
        while (current) {
          const parsed = parseRgb(getComputedStyle(current).backgroundColor);
          if (parsed && parsed.a > 0.99) return parsed;
          current = current.parentElement;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      };
      const luminance = ({ r, g, b }) => {
        const channel = (value) => {
          const normalized = value / 255;
          return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        return (
          0.2126 * channel(r) +
          0.7152 * channel(g) +
          0.0722 * channel(b)
        );
      };
      const contrast = (foreground, background) => {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      };

      const clipped = [
        ...document.querySelectorAll(
          ".panel-caption, .timeline-head time, .mobile-nav span",
        ),
      ]
        .filter(visible)
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.left < -0.5 ||
            bounds.right > viewportWidth + 0.5 ||
            contentClipped(element)
          );
        })
        .map((element) => element.textContent?.trim() ?? element.className);
      const sessionRowElements = [
        ...document.querySelectorAll(".trace-session-row"),
      ].filter(visible);
      const sessionRows = sessionRowElements.map((element) =>
        element.getBoundingClientRect(),
      );
      const firstSessionWidth = sessionRows[0]?.width ?? 0;
      const sessionWidthDrift = sessionRows.some(
        (bounds) => Math.abs(bounds.width - firstSessionWidth) > 1,
      );
      const appbar = document.querySelector(".mobile-appbar");
      const bottomNav = document.querySelector(".mobile-nav");
      const codeFrames = [
        ...document.querySelectorAll(".code-frame, .diff-pair > div"),
      ]
        .filter(visible)
        .map((element) => element.getBoundingClientRect())
        .filter(
          (bounds) =>
            bounds.left < -0.5 || bounds.right > viewportWidth + 0.5,
        );
      const shell = document.querySelector(".studio-shell");
      const sidebar = document.querySelector(".sidebar");
      const workbench = document.querySelector(".workbench");
      const activeSurface = document.querySelector(".surface");
      const activeTitle = document.querySelector(".surface-header h1");
      const primaryAction = document.querySelector(".surface-actions .primary-button");
      const previewText = document.querySelector(".preview-status-text");
      const panels = [...document.querySelectorAll(".surface .panel")]
        .filter(visible)
        .map((element) => element.getBoundingClientRect());
      const textClipping = [activeTitle, primaryAction]
        .filter((element) => element && visible(element))
        .filter((element) => element.scrollWidth - element.clientWidth > 1)
        .map((element) => element.textContent?.trim() ?? element.className);
      const transformed = [shell, workbench, activeSurface]
        .filter(Boolean)
        .filter((element) => getComputedStyle(element).transform !== "none")
        .map((element) => element.className);
      const visibleMobileControls = [
        ...document.querySelectorAll(
          ".mobile-appbar button, .mobile-nav button, .surface button, .surface input:not([type='checkbox']):not([type='radio']), .surface select, .surface textarea",
        ),
      ].filter(visible);
      const undersizedMobileControls = visibleMobileControls
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width < 44 || bounds.height < 44;
        })
        .map((element) => ({
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim() ??
            element.tagName,
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        }));
      const traceMetricLabels = [
        ...document.querySelectorAll(
          ".trace-session-metric > span, .trace-session-status-label",
        ),
      ]
        .filter(visible)
        .map((element) => element.textContent?.trim());
      const traceRowDescendantOverflow = sessionRowElements.flatMap((row) => {
        const rowBounds = row.getBoundingClientRect();
        return [
          ...row.querySelectorAll(
            ".trace-session-main > *, .trace-session-metric > *, .trace-session-status > *",
          ),
        ]
          .filter(visible)
          .filter((element) => {
            const bounds = element.getBoundingClientRect();
            return !within(bounds, rowBounds) || contentClipped(element);
          })
          .map((element) => element.textContent?.trim() ?? element.className);
      });
      const traceRowsOutsideViewport = sessionRows.filter(
        (bounds) =>
          bounds.left < -0.5 || bounds.right > viewportWidth + 0.5,
      ).length;
      const traceDetailOverflow = [
        ...document.querySelectorAll(
          ".trace-detail-summary span, .trace-detail-summary strong, .trace-detail-summary code",
        ),
      ]
        .filter(visible)
        .filter((element) => {
          const parentBounds = element.parentElement?.getBoundingClientRect();
          return (
            contentClipped(element) ||
            (parentBounds &&
              !within(element.getBoundingClientRect(), parentBounds))
          );
        })
        .map((element) => element.textContent?.trim() ?? element.className);
      const replayCodes = [
        ...document.querySelectorAll(".replay-evidence .diff-pair code"),
      ].filter(visible);
      const operationalValueOverflow = [
        ...document.querySelectorAll(
          ".stats-row .stat strong, .evidence-summary code, .evidence-summary strong",
        ),
      ]
        .filter(visible)
        .filter(contentClipped)
        .map((element) => element.textContent?.trim() ?? element.className);
      const replayCodeFailures = replayCodes.flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        const parentBounds = element.parentElement?.getBoundingClientRect();
        const foreground = parseRgb(getComputedStyle(element).color);
        const background = effectiveBackground(element);
        const failures = [];
        if (element.tabIndex !== 0) failures.push("not keyboard focusable");
        if (Number.parseFloat(getComputedStyle(element).fontSize) < 13) {
          failures.push("font below 13px");
        }
        if (
          bounds.left < -0.5 ||
          bounds.right > viewportWidth + 0.5 ||
          (parentBounds && !within(bounds, parentBounds))
        ) {
          failures.push("escapes evidence container");
        }
        if (!["auto", "scroll"].includes(getComputedStyle(element).overflowX)) {
          failures.push("lacks horizontal scroll containment");
        }
        if (!foreground || contrast(foreground, background) < 4.5) {
          failures.push("contrast below 4.5:1");
        }
        return failures.map(
          (failure) => `${element.getAttribute("aria-label")}: ${failure}`,
        );
      });
      const visibleCodeBelowMinimum = [
        ...document.querySelectorAll("code, pre.code-block"),
      ]
        .filter(visible)
        .filter(
          (element) =>
            Number.parseFloat(getComputedStyle(element).fontSize) < 13,
        )
        .map(
          (element) =>
            element.getAttribute("aria-label") ??
            element.textContent?.trim().slice(0, 40) ??
            element.className,
        );
      const mobileTraceProof = document.querySelector(
        '[data-testid="mobile-trace-proof"]',
      );
      const mobileShipProof = document.querySelector(
        '[data-testid="mobile-ship-proof"]',
      );
      const proofVisibleInViewport = (element) => {
        if (!element || !visible(element)) return false;
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= -0.5 &&
          bounds.right <= viewportWidth + 0.5 &&
          bounds.top >= 0 &&
          bounds.bottom <= viewportHeight + 0.5
        );
      };

      return {
        documentOverflow: document.documentElement.scrollWidth - viewportWidth,
        windowScrollX: window.scrollX,
        windowScrollY: window.scrollY,
        workbenchScrollTop: workbench?.scrollTop ?? 0,
        clipped,
        codeFrameOverflow: codeFrames.length,
        panelOverflow: panels.filter(
          (panel) => panel.left < -0.5 || panel.right > viewportWidth + 0.5,
        ).length,
        textClipping,
        transformed,
        sessionWidthDrift,
        traceMetricLabels,
        traceRowDescendantOverflow,
        traceRowsOutsideViewport,
        traceDetailOverflow,
        replayCodeFailures,
        replayCodeCount: replayCodes.length,
        operationalValueOverflow,
        visibleCodeBelowMinimum,
        bodyFontSize: Number.parseFloat(getComputedStyle(document.body).fontSize),
        undersizedMobileControls,
        replayPopulated: Boolean(document.querySelector('[data-testid="replay-evidence"]')),
        comparePopulated: Boolean(document.querySelector('[data-testid="comparison-evidence"]')),
        mobileComparisonStacked:
          Boolean(document.querySelector(".comparison-mobile-cards")) &&
          document.querySelector(".comparison-mobile-cards") &&
          visible(document.querySelector(".comparison-mobile-cards")),
        previewEllipsis:
          !previewText ||
          previewText.scrollWidth <= previewText.clientWidth + 1 ||
          (getComputedStyle(previewText).textOverflow === "ellipsis" &&
            getComputedStyle(previewText).overflow === "hidden"),
        mobileTraceProofVisible: proofVisibleInViewport(mobileTraceProof),
        mobileShipProofVisible: proofVisibleInViewport(mobileShipProof),
        shell: rect(shell),
        sidebar: rect(sidebar),
        workbench: rect(workbench),
        activeSurface: rect(activeSurface),
        activeTitle: rect(activeTitle),
        primaryAction: rect(primaryAction),
        mobileAppbarHeight: appbar && visible(appbar) ? appbar.getBoundingClientRect().height : 0,
        mobileNavHeight: bottomNav && visible(bottomNav) ? bottomNav.getBoundingClientRect().height : 0,
        mobileAppbar: rect(appbar),
        mobileNav: rect(bottomNav),
        desktopSidebarVisible:
          Boolean(document.querySelector(".sidebar") && visible(document.querySelector(".sidebar"))),
        scenarioId,
        viewportId,
      };
    },
    {
      scenarioId,
      viewportId: viewport.id,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    },
  );

  assert(result.documentOverflow <= 1, `${scenarioId}/${viewport.id} document overflows by ${result.documentOverflow}px`);
  assert(result.windowScrollX === 0 && result.windowScrollY === 0, `${scenarioId}/${viewport.id} window is not at origin`);
  assert(result.workbenchScrollTop === 0, `${scenarioId}/${viewport.id} capture is not at workspace origin`);
  assert(result.clipped.length === 0, `${scenarioId}/${viewport.id} clips metadata: ${result.clipped.join(", ")}`);
  assert(result.codeFrameOverflow === 0, `${scenarioId}/${viewport.id} code frame escapes the viewport`);
  assert(result.panelOverflow === 0, `${scenarioId}/${viewport.id} panel escapes the viewport`);
  assert(result.textClipping.length === 0, `${scenarioId}/${viewport.id} clips title/action text: ${result.textClipping.join(", ")}`);
  assert(result.transformed.length === 0, `${scenarioId}/${viewport.id} uses transformed shell geometry: ${result.transformed.join(", ")}`);
  assert(result.previewEllipsis, `${scenarioId}/${viewport.id} preview status clips without ellipsis`);
  assert(result.bodyFontSize >= 14, `${scenarioId}/${viewport.id} body typography is below 14px`);
  assert(
    result.visibleCodeBelowMinimum.length === 0,
    `${scenarioId}/${viewport.id} code is below 13px: ${result.visibleCodeBelowMinimum.join(", ")}`,
  );
  assert(
    result.operationalValueOverflow.length === 0,
    `${scenarioId}/${viewport.id} clips operational values: ${result.operationalValueOverflow.join(", ")}`,
  );
  assert(
    result.shell?.top === 0 &&
      result.shell?.left === 0 &&
      Math.abs(result.shell.width - viewport.width) <= 1 &&
      Math.abs(result.shell.height - viewport.height) <= 1,
    `${scenarioId}/${viewport.id} shell does not fill the viewport from origin`,
  );
  assert(
    result.activeSurface?.left >= -0.5 &&
      result.activeSurface?.right <= viewport.width + 0.5 &&
      result.activeTitle?.left >= -0.5 &&
      result.activeTitle?.right <= viewport.width + 0.5,
    `${scenarioId}/${viewport.id} active workspace is offset or clipped`,
  );
  if (scenarioId === "traces") {
    assert(!result.sessionWidthDrift, `${scenarioId}/${viewport.id} session rows have inconsistent widths`);
    assert(
      result.traceRowsOutsideViewport === 0,
      `${scenarioId}/${viewport.id} trace rows escape the viewport`,
    );
    assert(
      result.traceRowDescendantOverflow.length === 0,
      `${scenarioId}/${viewport.id} trace row descendants clip: ${result.traceRowDescendantOverflow.join(", ")}`,
    );
    assert(
      result.traceDetailOverflow.length === 0,
      `${scenarioId}/${viewport.id} trace detail values clip: ${result.traceDetailOverflow.join(", ")}`,
    );
    if (!isMobileViewport(viewport.width)) {
      for (const label of ["Time", "Duration", "Cost", "Status"]) {
        assert(
          result.traceMetricLabels.includes(label),
          `${scenarioId}/${viewport.id} is missing visible ${label} metadata`,
        );
      }
    }
  }
  if (scenarioId === "replay") {
    assert(result.replayPopulated, `${scenarioId}/${viewport.id} replay evidence is empty`);
    assert(result.replayCodeCount > 0, `${scenarioId}/${viewport.id} replay code evidence is missing`);
    assert(
      result.replayCodeFailures.length === 0,
      `${scenarioId}/${viewport.id} replay code accessibility failed: ${result.replayCodeFailures.join(", ")}`,
    );
  }
  if (scenarioId === "compare") {
    assert(result.comparePopulated, `${scenarioId}/${viewport.id} comparison evidence is empty`);
    if (viewport.id === "mobile") {
      assert(result.mobileComparisonStacked, `${scenarioId}/mobile comparison is not stacked`);
    }
  }
  if (isMobileViewport(viewport.width)) {
    assert(result.mobileAppbarHeight === 52, `${scenarioId}/mobile app bar must be 52px`);
    assert(result.mobileNavHeight >= 52, `${scenarioId}/mobile bottom navigation is too short`);
    assert(!result.desktopSidebarVisible, `${scenarioId}/mobile serialized desktop sidebar is visible`);
    assert(
      result.undersizedMobileControls.length === 0,
      `${scenarioId}/${viewport.id} has controls below 44px: ${JSON.stringify(result.undersizedMobileControls)}`,
    );
    assert(
      Math.abs(result.mobileAppbar?.top ?? Number.POSITIVE_INFINITY) <= 0.5 &&
        Math.abs(result.mobileAppbar?.left ?? Number.POSITIVE_INFINITY) <= 0.5 &&
        Math.abs(result.mobileAppbar.width - viewport.width) <= 1,
      `${scenarioId}/${viewport.id} mobile app bar is offset: ${JSON.stringify(result.mobileAppbar)}`,
    );
    assert(
      Math.abs(result.mobileNav?.bottom - viewport.height) <= 1 &&
        Math.abs(result.mobileNav?.left ?? Number.POSITIVE_INFINITY) <= 0.5 &&
        Math.abs(result.mobileNav.width - viewport.width) <= 1,
      `${scenarioId}/${viewport.id} mobile navigation is offset: ${JSON.stringify(result.mobileNav)}`,
    );
    if (viewport.height >= 800 && scenarioId === "traces") {
      assert(
        result.mobileTraceProofVisible,
        `${scenarioId}/${viewport.id} does not visibly prove trace detail at origin`,
      );
    }
    if (viewport.height >= 800 && scenarioId === "ship") {
      assert(
        result.mobileShipProofVisible,
        `${scenarioId}/${viewport.id} does not visibly prove export artifacts at origin`,
      );
    }
  } else {
    assert(
      result.sidebar?.top === 0 &&
        result.sidebar?.left === 0 &&
        Math.abs(result.sidebar.height - viewport.height) <= 1,
      `${scenarioId}/desktop sidebar is offset`,
    );
    assert(
      result.workbench?.top === 0 &&
        result.workbench?.left >= 0 &&
        result.workbench?.right <= viewport.width + 0.5,
      `${scenarioId}/desktop workbench is offset or clipped`,
    );
    assert(
      Math.abs(result.workbench.left - result.sidebar.right) <= 1,
      `${scenarioId}/${viewport.id} has a gutter between navigation and workbench`,
    );
    if (viewport.width <= 1180) {
      assert(
        Math.abs(result.sidebar.width - 68) <= 1,
        `${scenarioId}/${viewport.id} tablet navigation is not the 68px compact rail`,
      );
    }
  }
}

async function verifyEvidence() {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const packageJson = JSON.parse(
    await readFile(resolve(appRoot, "package.json"), "utf8"),
  );
  const sourceState = await currentSourceState();
  const officialStyleBoundary = await officialStyleBoundaryEvidence();
  assert(evidence.schemaVersion === "auraone.local-product-capture.v3", "Unexpected capture schema");
  assert(evidence.productId === PRODUCT_ID, "Unexpected product id");
  assert(evidence.productVersion === packageJson.version, "Unexpected product version");
  assert(evidence.capturedAt === CAPTURE_DATE, "Unexpected capture date");
  assert(evidence.captureEvidenceState === "verified-local", "Capture must be verified-local");
  assert(evidence.releaseState === "stale", "Release state must remain stale");
  assert(
    await isAncestorCommit(
      evidence.baseSourceCommit,
      sourceState.baseSourceCommit,
    ),
    "Capture base commit is not an ancestor of current HEAD",
  );
  assert(evidence.sourceState === sourceState.state, "Recorded source state no longer matches");
  assert(
    evidence.sourceChangeCount === sourceState.changeCount,
    "Recorded source change count no longer matches",
  );
  assert(
    evidence.sourceChangeDigest === sourceState.changeDigest,
    "Recorded source change digest no longer matches",
  );
  assert(
    evidence.sourceContentSha256 === (await digestInputs(sourceInputs)),
    "Source content digest is stale",
  );
  assert(
    JSON.stringify(evidence.sourceInputPaths) === JSON.stringify(sourceInputs),
    "Declared source input paths changed",
  );
  assert(
    JSON.stringify(evidence.sourceStatePaths) ===
      JSON.stringify(sourceStatePathspecs),
    "Declared source-state paths changed",
  );
  assert(
    evidence.syntheticFixtureSha256 === (await digestInputs(fixtureInputs)),
    "Synthetic fixture digest is stale",
  );
  assert(
    JSON.stringify(evidence.officialStyleBoundary) ===
      JSON.stringify(officialStyleBoundary),
    "Official style boundary digest or policy drifted",
  );
  assert(
    evidence.captureSpecSha256 ===
      captureSpecDigest(packageJson.version, officialStyleBoundary),
    "Capture specification digest is stale",
  );
  assert(evidence.records.length === scenarios.length * viewports.length, "Unexpected record count");

  const expectedRecordIds = new Set(
    viewports.flatMap((viewport) =>
      scenarios.map(
        (scenario) => `${PRODUCT_ID}-${scenario.id}-${viewport.id}`,
      ),
    ),
  );
  for (const record of evidence.records) {
    assert(expectedRecordIds.delete(record.id), `${record.id} is unexpected or duplicated`);
    assert(record.captureMethod === captureMethod, `${record.id} capture method mismatch`);
    assert(
      record.syntheticProvenance === syntheticProvenance,
      `${record.id} synthetic provenance mismatch`,
    );
    const pngPath = resolve(repoRoot, record.localPngOutput);
    const webpPath = resolve(repoRoot, record.localWebpOutput);
    const websitePath = resolve(repoRoot, record.websiteOutput);
    const pngBytes = await readFile(pngPath);
    const webpBytes = await readFile(webpPath);
    const websiteBytes = await readFile(websitePath);
    assert(sha256(pngBytes) === record.sourcePngSha256, `${record.id} PNG hash mismatch`);
    assert(sha256(webpBytes) === record.sha256, `${record.id} WebP hash mismatch`);
    assert(sha256(websiteBytes) === record.sha256, `${record.id} website hash mismatch`);
    assert(
      JSON.stringify(readPngDimensions(pngBytes)) === JSON.stringify(record.dimensions),
      `${record.id} PNG dimensions mismatch`,
    );
    assert(
      JSON.stringify(readWebpDimensions(webpBytes)) === JSON.stringify(record.dimensions),
      `${record.id} WebP dimensions mismatch`,
    );
    assert(webpBytes.byteLength === record.fileSize, `${record.id} file size mismatch`);
    await assertCapturePixels(
      pngPath,
      record.scenario,
      record.variant,
      "png",
    );
    await assertCapturePixels(
      webpPath,
      record.scenario,
      record.variant,
      "webp",
    );
  }
  assert(expectedRecordIds.size === 0, "Capture evidence is missing expected records");
  console.log(`Verified ${evidence.records.length} ${PRODUCT_ID} capture records.`);
}

async function currentSourceState() {
  return currentGitSourceState({
    repositoryRoot: repoRoot,
    pathspecs: sourceStatePathspecs,
    excludePathspecs: sourceStateExcludes,
  });
}

async function isAncestorCommit(baseCommit, headCommit) {
  try {
    await run(
      "git",
      ["merge-base", "--is-ancestor", baseCommit, headCommit],
      repoRoot,
    );
    return true;
  } catch {
    return false;
  }
}

async function digestInputs(inputs) {
  return digestDeclaredInputs({
    baseDir: appRoot,
    repositoryRoot: repoRoot,
    inputs,
  });
}

function captureSpecDigest(productVersion, officialStyleBoundary) {
  return sha256(
    JSON.stringify({
      productId: PRODUCT_ID,
      productVersion,
      scenarios,
      viewports,
      geometryViewports,
      sourceInputs,
      fixtureInputs,
      officialStyleBoundary,
      captureMethod,
      syntheticProvenance,
    }),
  );
}

async function officialStyleBoundaryEvidence() {
  return {
    source: officialStyleSource,
    sha256: await digestInputs([officialStyleAssetRoot]),
    delivery: "temporary loopback server",
    packagePolicy: officialStylePackagePolicy,
  };
}

async function convertToWebp(input, output) {
  await run(
    process.env.CWEBP_BIN ?? "cwebp",
    ["-quiet", "-lossless", "-z", "6", "-metadata", "none", input, "-o", output],
    appRoot,
  );
}

async function waitForServer(server) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server has not bound its port yet.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function waitForOfficialStyle(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.auraoneOfficialStyle === "loaded",
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--pl-official-font-ui")
        .trim().length > 0,
  );
  await page.evaluate(() => document.fonts.ready);
}

function readPngDimensions(bytes) {
  assert(bytes.toString("ascii", 1, 4) === "PNG", "Invalid PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readWebpDimensions(bytes) {
  assert(bytes.toString("ascii", 0, 4) === "RIFF", "Invalid WebP RIFF");
  assert(bytes.toString("ascii", 8, 12) === "WEBP", "Invalid WebP signature");
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  throw new Error(`Unsupported WebP chunk ${chunk}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(command, args, cwd) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${stdout}${stderr}`));
    });
  });
}

function onceExit(child) {
  return new Promise((resolvePromise) => child.once("exit", resolvePromise));
}
