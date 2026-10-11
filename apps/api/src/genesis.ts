// Authorized exports live under DATA_DIR/genesis; app credentials never enter Foundry.
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { config } from "./config.js";
import { assert } from "./security.js";

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,99}$/);
export const GenesisManifest = z
  .object({
    version: z.literal(1),
    environment: z.enum(["dev", "prod"]),
    capturedAt: z.iso.datetime(),
    datasets: z
      .array(
        z.object({
          name: identifier,
          app: z.enum([
            "os",
            "patents",
            "hr",
            "finance",
            "academy",
            "policyweb",
          ]),
          file: z.string().regex(/^[a-z0-9_-]+\.jsonl$/),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          rows: z.number().int().min(0).max(2_000_000),
          schema: z
            .array(
              z.object({
                name: identifier,
                type: z.enum(["text", "integer", "double", "boolean", "date"]),
              }),
            )
            .min(1)
            .max(200),
          sourceUrl: z.url().refine((v) => {
            const u = new URL(v);
            return (
              u.protocol === "https:" &&
              !u.username &&
              !u.password &&
              /^(os|patents|hr|finance|academy|policyweb)(-dev)?\.(apps\.tmrw-cdn\.com|internal\.tmrw\.com)$/.test(
                u.hostname,
              )
            );
          }, "Use a Genesis HTTPS source link without credentials"),
          description: z.string().min(1).max(4000),
          coverage: z.string().min(1).max(1000),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((m, ctx) => {
    if (new Set(m.datasets.map((d) => d.name)).size !== m.datasets.length)
      ctx.addIssue({ code: "custom", message: "Dataset names must be unique" });
    for (const d of m.datasets) {
      if (!d.name.startsWith(d.app + "_"))
        ctx.addIssue({
          code: "custom",
          message: "Dataset names must start with their app name",
        });
      if (new Set(d.schema.map((c) => c.name)).size !== d.schema.length)
        ctx.addIssue({
          code: "custom",
          message: "Column names must be unique",
        });
    }
  });
async function confined(root: string, file: string) {
  const parent = await realpath(root),
    path = await realpath(resolve(root, file));
  assert(
    path.startsWith(parent + sep),
    "Genesis export path escapes its bundle",
  );
  return path;
}
export async function genesisManifest(c: Record<string, any>) {
  assert(
    typeof c.bundle === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(c.bundle),
    "Use a Genesis bundle name",
  );
  const directory = await confined(
    resolve(config.dataDir, "genesis"),
    c.bundle,
  );
  const path = await confined(directory, "manifest.json");
  assert((await stat(path)).size <= 1_000_000, "Genesis manifest exceeds 1 MB");
  const manifest = GenesisManifest.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  return { directory, manifest };
}
export async function discoverGenesis(c: Record<string, any>) {
  const { manifest } = await genesisManifest(c);
  assert(
    !c.table || manifest.datasets.some((d) => d.name === c.table),
    "Choose a dataset from the Genesis bundle",
  );
  return {
    tables: manifest.datasets.map((d) => ({
      name: d.name,
      estimatedRows: d.rows,
      app: d.app,
      coverage: d.coverage,
    })),
    columns: manifest.datasets.flatMap((d) =>
      d.schema.map((col) => ({ table_name: d.name, ...col })),
    ),
    environment: manifest.environment,
    capturedAt: manifest.capturedAt,
    sample: [],
  };
}
export async function importGenesis(
  c: Record<string, any>,
  write: (row: any) => Promise<void>,
) {
  const { manifest, directory } = await genesisManifest(c);
  const dataset = manifest.datasets.find((d) => d.name === c.table);
  assert(dataset, "Choose a dataset from the Genesis bundle");
  const file = await confined(directory, dataset.file);
  assert(
    (await stat(file)).size <= 256 * 1024 * 1024,
    "Genesis dataset exceeds 256 MB",
  );
  const stream = createReadStream(file),
    hash = createHash("sha256");
  stream.on("data", (chunk) => hash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  try {
    for await (const line of lines) {
      assert(line.length > 0, "Genesis JSONL contains a blank record");
      const row = JSON.parse(line);
      assert(
        row && typeof row === "object" && !Array.isArray(row),
        "Genesis records must be objects",
      );
      assert(
        Object.keys(row).length === dataset.schema.length &&
          dataset.schema.every((col) => Object.hasOwn(row, col.name)),
        "Genesis record does not match its declared schema",
      );
      for (const col of dataset.schema) {
        const v = row[col.name];
        assert(
          v === null ||
            (col.type === "integer"
              ? Number.isSafeInteger(v)
              : col.type === "double"
                ? typeof v === "number" && Number.isFinite(v)
                : col.type === "boolean"
                  ? typeof v === "boolean"
                  : typeof v === "string"),
          "Genesis column has an invalid value: " + col.name,
        );
      }
      assert(
        ++count <= dataset.rows,
        "Genesis export exceeds its declared row count",
      );
      await write(row);
    }
    assert(
      count === dataset.rows,
      "Genesis export row count does not match its manifest",
    );
    assert(
      hash.digest("hex") === dataset.sha256,
      "Genesis export checksum failed",
    );
    return {
      schema: dataset.schema,
      provenance: {
        app: dataset.app,
        environment: manifest.environment,
        capturedAt: manifest.capturedAt,
        sourceUrl: dataset.sourceUrl,
        coverage: dataset.coverage,
        description: dataset.description,
        sha256: dataset.sha256,
      },
    };
  } finally {
    lines.close();
    stream.destroy();
  }
}
