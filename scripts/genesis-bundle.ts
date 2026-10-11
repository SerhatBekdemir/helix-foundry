// Package authorized app exports; credentials and remote database access are not needed.
import { readFile, mkdir, writeFile, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { GenesisManifest } from "../apps/api/src/genesis.js";

const [input, destination] = process.argv.slice(2);
if (!input || !destination)
  throw new Error(
    "Usage: node --import tsx scripts/genesis-bundle.ts input.json OUTPUT_DIRECTORY",
  );
if ((await stat(resolve(input))).size > 256 * 1024 * 1024)
  throw new Error("Genesis input exceeds 256 MB");
const source = z
  .object({
    environment: z.enum(["dev", "prod"]),
    capturedAt: z.iso.datetime(),
    datasets: z.array(
      z.object({
        name: z.string(),
        app: z.string(),
        sourceUrl: z.string(),
        description: z.string(),
        coverage: z.string(),
        schema: z.array(z.object({ name: z.string(), type: z.string() })),
        rows: z.array(z.record(z.string(), z.unknown())),
      }),
    ),
  })
  .parse(JSON.parse(await readFile(resolve(input), "utf8")));
const files = source.datasets.map((d) => {
  const body = d.rows.map((r) => JSON.stringify(r) + "\n").join("");
  const sha256 = createHash("sha256").update(body).digest("hex");
  return {
    body,
    descriptor: { ...d, rows: d.rows.length, sha256, file: sha256 + ".jsonl" },
  };
});
const manifest = GenesisManifest.parse({
  ...source,
  version: 1,
  datasets: files.map((f) => f.descriptor),
});
await mkdir(resolve(destination), { recursive: true, mode: 0o700 });
for (const f of files)
  await writeFile(resolve(destination, f.descriptor.file), f.body, {
    mode: 0o600,
  });
// Content-addressed files are complete before the manifest is installed.
await writeFile(
  resolve(destination, "manifest.json.pending"),
  JSON.stringify(manifest, null, 2) + "\n",
  { mode: 0o600 },
);
await rename(
  resolve(destination, "manifest.json.pending"),
  resolve(destination, "manifest.json"),
);
console.log(
  JSON.stringify(
    {
      environment: manifest.environment,
      datasets: manifest.datasets.map((d) => ({
        name: d.name,
        rows: d.rows,
        coverage: d.coverage,
      })),
    },
    null,
    2,
  ),
);
