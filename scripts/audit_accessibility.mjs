import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const appRoot = new URL("..", import.meta.url);
const port = Number(process.env.AGENT_STUDIO_A11Y_PORT ?? 4328);
const url = `http://127.0.0.1:${port}`;
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");

const server = spawn(
  "pnpm",
  ["--dir", new URL(".", appRoot).pathname, "exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);

try {
  await waitForServer(url);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.addScriptTag({ content: axeSource });
    await page.getByRole("button", { name: "Start" }).click();

    const result = await page.evaluate(async () => {
      const axeResult = await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      });
      return axeResult.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target),
      }));
    });

    const blocking = result.filter((violation) => ["critical", "serious"].includes(violation.impact));
    const payload = {
      checked: "axe-core wcag2a/wcag2aa/wcag21a/wcag21aa",
      serious_or_critical_violations: blocking.length,
      total_violations: result.length,
      violations: result,
      passed: blocking.length === 0,
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exitCode = payload.passed ? 0 : 1;
  } finally {
    await browser.close();
  }
} finally {
  server.kill("SIGTERM");
}

async function waitForServer(targetUrl) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before serving ${targetUrl}`);
    }
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}
