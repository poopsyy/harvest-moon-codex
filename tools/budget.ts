import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";
import { z } from "zod";
const root = resolve("dist");
const chunkSchema = z.object({
  file: z.string(),
  isEntry: z.boolean().optional(),
  imports: z.array(z.string()).optional(),
  dynamicImports: z.array(z.string()).optional(),
  css: z.array(z.string()).optional(),
  assets: z.array(z.string()).optional(),
});
const manifest = z
  .record(z.string(), chunkSchema)
  .parse(JSON.parse(await readFile(join(root, ".vite/manifest.json"), "utf8")));
const initial = new Set<string>();
function visit(key: string): void {
  if (initial.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing build manifest chunk: ${key}`);
  initial.add(key);
  for (const imported of chunk.imports ?? []) visit(imported);
}
const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
if (!entries.length)
  throw new Error(
    "Build manifest has no entry; cannot measure initial payload.",
  );
for (const [entry] of entries) visit(entry);
const scripts = await Promise.all(
  [...initial].map(async (key) => {
    const file = manifest[key]!.file;
    const data = await readFile(join(root, file));
    return {
      file,
      bytes: data.byteLength,
      gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    };
  }),
);
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(join(directory, entry.name))
          : Promise.resolve([join(directory, entry.name)]),
      ),
    )
  ).flat();
}
const all = await files(root);
const totalBytes = (await Promise.all(all.map((file) => stat(file)))).reduce(
  (sum, file) => sum + file.size,
  0,
);
const initialGzipBytes = scripts.reduce(
  (sum, script) => sum + script.gzipBytes,
  0,
);
const report = {
  measuredAt: new Date().toISOString(),
  initialScripts: scripts,
  initialGzipBytes,
  initialLimitBytes: 600 * 1024,
  totalBytes,
  totalLimitBytes: 15 * 1024 * 1024,
  fileCount: all.length,
  passed: initialGzipBytes < 600 * 1024 && totalBytes < 15 * 1024 * 1024,
};
await writeFile("BUNDLE_METRICS.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!report.passed)
  throw new Error(
    `Bundle budget exceeded: initial ${initialGzipBytes} bytes gzip; total ${totalBytes} bytes.`,
  );
