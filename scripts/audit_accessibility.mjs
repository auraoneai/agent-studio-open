import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.AGENT_STUDIO_A11Y_PORT ?? 4328);
const baseUrl = `http://127.0.0.1:${port}`;
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const scenarios = [
  "connect",
  "traces",
  "replay",
  "compare",
  "ship",
  "settings",
];
const viewports = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
  { id: "tablet", width: 768, height: 1024 },
];
const colorModes = [
  { id: "light", forcedColors: "none" },
  { id: "forced-colors", forcedColors: "active" },
];

const server = spawn(
  "pnpm",
  [
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: appRoot,
    env: {
      ...process.env,
      NO_COLOR: "1",
      VITE_AGENT_STUDIO_DEMO_MODE: "true",
      VITE_AGENT_STUDIO_BROWSER_URL: baseUrl,
      VITE_AGENT_STUDIO_SOURCE_COMMIT: "a11y-local",
      VITE_AGENT_STUDIO_SOURCE_DIGEST: "a11y-local",
      VITE_AGENT_STUDIO_SOURCE_STATE: "dirty-uncommitted",
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

try {
  await waitForServer();
  const browser = await chromium.launch();
  try {
    const audits = [];
    for (const viewport of viewports) {
      for (const colorMode of colorModes) {
        const context = await browser.newContext({
          viewport,
          colorScheme: "light",
          forcedColors: colorMode.forcedColors,
          reducedMotion: "reduce",
          locale: "en-US",
          acceptDownloads: true,
        });
        try {
          for (const scenario of scenarios) {
            const page = await openDemoPage(context);
            try {
              await navigateToSurface(page, scenario, viewport.width);
              await prepareCapturedState(page, scenario);
              audits.push(
                await auditPage(
                  page,
                  `${scenario}/${viewport.id}/${colorMode.id}`,
                ),
              );
            } finally {
              await page.close();
            }
          }

          const commandPage = await openDemoPage(context);
          try {
            await openCommandPalette(commandPage, viewport.width);
            audits.push(
              await auditPage(
                commandPage,
                `command-palette/${viewport.id}/${colorMode.id}`,
              ),
            );
          } finally {
            await commandPage.close();
          }

          const exportPage = await openDemoPage(context);
          try {
            await navigateToSurface(exportPage, "traces", viewport.width);
            await exportPage
              .locator(".surface-actions button", {
                hasText: "Export trace card",
              })
              .evaluate((button) => button.click());
            const dialog = exportPage.getByRole("dialog");
            await dialog.waitFor({ state: "visible" });
            await triggerDownload(
              exportPage,
              dialog.getByRole("button", { name: "Export trace card" }),
            );
            await dialog
              .getByText("Downloaded trace-card.json")
              .waitFor({ state: "visible" });
            audits.push(
              await auditPage(
                exportPage,
                `trace-card-success/${viewport.id}/${colorMode.id}`,
              ),
            );
          } finally {
            await exportPage.close();
          }
        } finally {
          await context.close();
        }
      }
    }

    const violations = audits.flatMap((audit) =>
      audit.violations.map((violation) => ({
        state: audit.state,
        ...violation,
      })),
    );
    const payload = {
      checked:
        "axe-core WCAG 2.2 A/AA applicable rules across Connect, Traces, Replay, Compare, Ship, Settings, bundle/per-card success, command palette, and trace-card success states at desktop/mobile/tablet in light and forced colors",
      audited_states: audits.length,
      total_violations: violations.length,
      violations,
      passed: violations.length === 0,
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exitCode = payload.passed ? 0 : 1;
  } finally {
    await browser.close();
  }
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${serverLog}`,
  );
} finally {
  server.kill("SIGTERM");
}

async function openDemoPage(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?preview=1`, { waitUntil: "networkidle" });
  await page.addScriptTag({ content: axeSource });
  await page.waitForFunction(
    () => document.documentElement.dataset.demo === "true",
  );
  return page;
}

async function navigateToSurface(page, surface, width) {
  if (width <= 760) {
    const mobileControl = page.locator(
      `nav[aria-label="Agent Studio mobile navigation"] button[data-surface="${surface}"]`,
    );
    if ((await mobileControl.count()) > 0) {
      await mobileControl.click();
    } else {
      await openCommandPalette(page, width);
      await page
        .getByRole("dialog", { name: "Workspace commands" })
        .locator(`button[data-surface="${surface}"]`)
        .click();
    }
  } else {
    await page
      .locator(
        `aside[aria-label="Agent Studio Open navigation"] button[data-surface="${surface}"]`,
      )
      .click();
  }
  await page.waitForFunction(
    (target) =>
      document
        .querySelector(`[data-surface="${target}"][aria-current="page"]`),
    surface,
  );
}

async function openCommandPalette(page, width) {
  const selector =
    width <= 760
      ? '.mobile-appbar button[aria-label="Search commands"]'
      : ".sidebar-footer .ghost-button";
  await page.locator(selector).click();
  await page
    .getByRole("dialog", { name: "Workspace commands" })
    .waitFor({ state: "visible" });
}

async function prepareCapturedState(page, scenario) {
  if (scenario === "replay" || scenario === "compare") {
    const label = scenario === "replay" ? "Run replay" : "Run matrix";
    await page.getByRole("button", { name: label }).click();
    await page
      .locator(".operation-banner")
      .waitFor({ state: "visible", timeout: 5_000 });
    await page
      .locator(".operation-banner")
      .waitFor({ state: "hidden", timeout: 5_000 });
    await page
      .locator(
        scenario === "replay"
          ? '[data-testid="replay-evidence"]'
          : '[data-testid="comparison-evidence"]',
      )
      .waitFor({ state: "visible" });
  }
  if (scenario === "ship") {
    await triggerDownload(
      page,
      page.getByRole("button", { name: "Export bundle" }),
    );
    await page
      .getByText("Downloaded agentstudio-export-bundle.zip")
      .waitFor({ state: "visible" });
    for (const [title, filename] of [
      ["GitHub Action", "agentstudio-github-action.zip"],
      ["JUnit", "junit.xml"],
      ["PR comment", "agentstudio-pr-comment.md"],
      ["AuraOne intake", "agentstudio-intake.zip"],
    ]) {
      await triggerDownload(
        page,
        page.getByRole("button", { name: `Export ${title}` }),
      );
      await page
        .getByText(`Downloaded ${filename}`)
        .waitFor({ state: "visible" });
    }
  }
}

async function triggerDownload(page, control) {
  const downloadPromise = page.waitForEvent("download");
  await control.click();
  const download = await downloadPromise;
  await download.cancel().catch(() => {});
}

async function auditPage(page, state) {
  const violations = await page.evaluate(async () => {
    const axeResult = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: [
          "wcag2a",
          "wcag2aa",
          "wcag21a",
          "wcag21aa",
          "wcag22aa",
        ],
      },
    });
    return axeResult.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));
  });
  return { state, violations };
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before serving ${baseUrl}`);
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
