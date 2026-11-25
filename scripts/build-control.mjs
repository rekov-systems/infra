import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  throw new Error("Usage: node scripts/build-control.mjs SOURCE_DIR OUTPUT_DIR");
}

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!supabaseUrl || !publishableKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required");
}

const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
await mkdir(output, { recursive: true });
for (const file of ["index.html", "app.js", "styles.css", "brand"]) {
  await cp(path.join(source, file), path.join(output, file), { recursive: true });
}
await writeFile(path.join(output, "config.js"), `window.RMS_CONTROL_CONFIG = ${JSON.stringify({
  supabaseUrl: supabaseUrl.replace(/\/$/, ""),
  publishableKey,
})};\n`, { mode: 0o644 });

const example = await readFile(path.join(source, "config.js.example"), "utf8");
if (!example.includes("__SUPABASE_URL__") || !example.includes("__SUPABASE_PUBLISHABLE_KEY__")) {
  throw new Error("Control panel config template is missing expected placeholders");
}
