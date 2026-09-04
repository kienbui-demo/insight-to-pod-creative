import { existsSync, readFileSync } from "node:fs";

const envPath = new URL("../../.env.local", import.meta.url);

if (existsSync(envPath)) {
  const contents = readFileSync(envPath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }

    const separator = trimmedLine.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separator).trim();
    let value = trimmedLine.slice(separator + 1).trim();
    if (key.length === 0 || process.env[key] !== undefined) {
      continue;
    }

    const quote = value[0];
    if (
      value.length >= 2 &&
      (quote === '"' || quote === "'") &&
      value.at(-1) === quote
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
