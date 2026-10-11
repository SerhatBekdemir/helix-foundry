import { it, expect } from "vitest";
import { mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { config } from "../apps/api/src/config.js";
import { discover, importSource } from "../apps/api/src/connectors.js";
import {
  sourceSyncDefaults,
  scheduledRefresh,
} from "../apps/api/src/source-sync.js";
import { resource } from "../apps/api/src/store.js";

it("imports verified Genesis snapshots, including empty tables, and rejects corrupt or escaping exports", async () => {
  const bundle = "check-" + randomUUID(),
    scope = "check-" + randomUUID();
  const dir = resolve(config.dataDir, "genesis", bundle);
  const outside = resolve(config.dataDir, "genesis", bundle + "-outside.jsonl");
  const descriptor = {
    name: "hr_people",
    app: "hr",
    file: "people.jsonl",
    rows: 1,
    schema: [{ name: "id", type: "text" }],
    sourceUrl: "https://hr.apps.tmrw-cdn.com/directory",
    description: "Permitted directory",
    coverage: "Directory only",
  };
  const body = '{"id":"hr:prod:1"}\n';
  const manifest = {
    version: 1,
    environment: "prod",
    capturedAt: "2026-10-11T08:00:00.000Z",
    datasets: [
      {
        ...descriptor,
        sha256: createHash("sha256").update(body).digest("hex"),
      },
    ],
  };
  const save = () =>
    writeFile(resolve(dir, "manifest.json"), JSON.stringify(manifest));
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(resolve(dir, descriptor.file), body);
    await save();
    const c = { bundle, table: "hr_people" };
    expect((await discover("genesis", c)).tables).toHaveLength(1);
    expect((await importSource(scope, "genesis", c)).provenance).toMatchObject({
      app: "hr",
      environment: "prod",
      coverage: "Directory only",
    });
    manifest.datasets[0].sha256 = "0".repeat(64);
    await save();
    await expect(importSource(scope, "genesis", c)).rejects.toThrow("checksum");
    manifest.datasets[0].rows = 0;
    manifest.datasets[0].sha256 = createHash("sha256").update("").digest("hex");
    await writeFile(resolve(dir, descriptor.file), "");
    await save();
    expect((await importSource(scope, "genesis", c)).schema).toEqual(
      descriptor.schema,
    );
    await expect(discover("genesis", { bundle: "../escape" })).rejects.toThrow(
      "bundle name",
    );
    await rm(resolve(dir, descriptor.file));
    await writeFile(outside, body);
    await symlink(outside, resolve(dir, descriptor.file));
    await expect(importSource(scope, "genesis", c)).rejects.toThrow("escapes");
    const defaults = sourceSyncDefaults("genesis");
    expect(defaults.nextRun).toBeNull();
    expect(
      scheduledRefresh(
        resource(scope, "source", "Genesis", { kind: "genesis", ...defaults }),
      ),
    ).toBe(false);
  } finally {
    await rm(outside, { force: true });
    await rm(dir, { recursive: true, force: true });
    await rm(resolve(config.dataDir, "incoming", scope), {
      recursive: true,
      force: true,
    });
  }
});
