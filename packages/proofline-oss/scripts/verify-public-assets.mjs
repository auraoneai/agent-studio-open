import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const root = new URL("..", import.meta.url);
const forbiddenNames = /aeonik|whitney|sectra/i;
const forbiddenSource =
  /fonts\.googleapis|backdrop-filter|linear-gradient|radial-gradient/i;
const forbiddenFontDeclaration =
  /font-family\s*:[^;]*(aeonik|whitney|gt sectra|ibm plex|inter(?:\s|,|"))/i;
const fontExtensions = new Set([".otf", ".ttf", ".woff", ".woff2"]);
const failures = [];

function inspect(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      inspect(path);
      continue;
    }
    if (fontExtensions.has(extname(entry)) || forbiddenNames.test(entry)) {
      failures.push(`Unapproved font asset: ${path}`);
    }
    if (
      /\.(css|ts|tsx|md)$/.test(entry) &&
      !path.includes("/tests/") &&
      !path.includes("/scripts/")
    ) {
      const source = readFileSync(path, "utf8");
      if (forbiddenSource.test(source) || forbiddenFontDeclaration.test(source)) {
        failures.push(`Forbidden public styling dependency: ${path}`);
      }
    }
  }
}

inspect(root.pathname);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Proofline public asset boundary verified.");
