import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { en } from "./en";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") ? [full] : [];
  });
}

describe("English strings", () => {
  it("has every key the portal uses literally", () => {
    const used = new Set<string>();
    for (const file of sources(SRC)) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/\bt\("([a-z_0-9.]+)"/g)) used.add(match[1]!);
    }
    const missing = [...used].filter((key) => !(key in en));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(100);
  });

  it.each(["owner", "manager", "office_staff", "support"])("has a label for role %s", (role) => {
    expect(en[`role.${role}`]).toBeTruthy();
  });

  it.each([0, 1, 2, 3, 4, 5, 6])("has a label for weekday %s", (day) => {
    expect(en[`weekday.${day}`]).toBeTruthy();
  });
});
