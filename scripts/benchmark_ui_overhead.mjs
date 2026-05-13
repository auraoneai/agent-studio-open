import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const appRoot = new URL("..", import.meta.url);
const port = Number(process.env.AGENT_STUDIO_BENCH_PORT ?? 4327);
const limitMs = Number(process.env.AGENT_STUDIO_UI_OVERHEAD_LIMIT_MS ?? 50);
const runs = Number(process.env.AGENT_STUDIO_UI_OVERHEAD_RUNS ?? 5);
const url = `http://127.0.0.1:${port}`;

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
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Compose" }).click();

    const samples = [];
    for (let index = 0; index < runs; index += 1) {
      samples.push(await measureSendOverhead(page));
    }

    const result = {
      runs,
      limit_ms: limitMs,
      overhead_ms_min: round(Math.min(...samples)),
      overhead_ms_avg: round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
      overhead_ms_max: round(Math.max(...samples)),
    };
    result.passed = result.overhead_ms_max <= limitMs;
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
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

async function measureSendOverhead(page) {
  return page.evaluate(async () => {
    const send = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Send");
    if (!send) {
      throw new Error("Send button not found");
    }
    const started = performance.now();
    send.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!document.body.textContent?.includes('"ok": true')) {
      throw new Error("Send response did not render");
    }
    return performance.now() - started;
  });
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
