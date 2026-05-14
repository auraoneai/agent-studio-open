import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appRoot = new URL("..", import.meta.url);
const port = Number(process.env.AGENT_STUDIO_SHOTS_PORT ?? 4329);
const url = `http://127.0.0.1:${port}`;
const outputDir = fileURLToPath(new URL("../dist/screenshots/", import.meta.url));

const surfaces = [
  { id: "connect", label: "Connect", shortcut: "1" },
  { id: "compose", label: "Compose", shortcut: "2" },
  { id: "traces", label: "Traces", shortcut: "3" },
  { id: "replay", label: "Replay", shortcut: "4" },
  { id: "a2a", label: "A2A", shortcut: "5" },
  { id: "observe", label: "Observe", shortcut: "6" },
  { id: "compare", label: "Compare", shortcut: "7" },
  { id: "ship", label: "Ship", shortcut: "8" },
  { id: "settings", label: "Settings", shortcut: "," },
];

const viewports = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

await mkdir(outputDir, { recursive: true });

const server = spawn(
  "pnpm",
  [
    "--dir",
    new URL(".", appRoot).pathname,
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

try {
  await waitForServer(url);
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Start" }).click();
      await delay(150);

      for (const surface of surfaces) {
        await page.keyboard.down("Meta");
        await page.keyboard.press(surface.shortcut);
        await page.keyboard.up("Meta");
        await delay(220);
        await page.evaluate(() => window.scrollTo(0, 0));
        const path = `${outputDir}${surface.id}.${viewport.id}.png`;
        await page.screenshot({ path, fullPage: true });
        console.log(`captured ${path}`);
      }
      await context.close();
    }
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
